// Kiosk carousel: flies the camera over each live event in turn on a random, smooth path
// (wide establishing shot, low swoops along the edge of the changed ground, pull out), fading the
// before -> after change in as it goes. Every pose is checked so the frame always holds some changed
// and some unchanged ground. Touching it hands over the controls; 30 s idle resumes.
//
// Smoothness: the next event downloads during the current flyover, but is only built (decode, GPU
// upload, shader compile) in the black gap between events, so nothing heavy runs mid-flight.
import * as THREE from "three";
import { createViewer, prefetch } from "./viewer.js";

const EVENT_S = 40, FADE_S = 2, IDLE_S = 30, LEG_S = 13;
const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (x * 6 - 15) + 10); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(r));

const slugs = await fetch("events/index.json").then((r) => r.json());
// ?e=<slug> starts on that event; ?at=<seconds> starts each event part-way through (for checking shots).
const qs = new URLSearchParams(location.search), AT = +qs.get("at") || 0;
// ?stats logs frame-interval percentiles every 5 s.
const STATS = qs.has("stats"), stats = [];
if (STATS) setInterval(() => {
  const s = stats.splice(0).sort((a, b) => a - b), q = (x) => s[Math.floor(s.length * x)]?.toFixed(1);
  console.log(`frames ${s.length} p50 ${q(0.5)} p95 ${q(0.95)} p99 ${q(0.99)} max ${s.at(-1)?.toFixed(1)} ms`);
}, 5000);
let order = slugs.includes(qs.get("e")) ? [qs.get("e")] : [];
function nextSlug(prev) {
  if (!order.length) {
    order = [...slugs].sort(() => Math.random() - 0.5);
    if (order[0] === prev && order.length > 1) order.push(order.shift());
  }
  return order.shift();
}

// Network only: meta, stories and the layer downloads.
async function fetchEvent(slug) {
  const base = `events/${slug}/`;
  const meta = await (await fetch(base + "meta.json")).json();
  await prefetch(base, meta);
  return { slug, base, meta };
}

// The heavy part, run while the screen is black.
async function build({ slug, base, meta }) {
  const el = document.createElement("div");
  el.className = "stage";
  document.body.prepend(el);
  const v = await createViewer(el, base, meta, { segments: 640, pixelRatio: 1.5, autoStart: false });
  v.controls.enabled = false;
  const still = meta.still || ["landslide", "flood", "fire"].includes(meta.kind);
  const ev = { slug, meta, el, v, still };
  // Judge framing with the change fully grown in, as it is for most of the flyover.
  v.setT(1);
  ev.field = v.changeField(32);
  const { B, cls } = ev.field;
  // Edge blocks: changed ground with unchanged ground within 3 blocks, or the reverse.
  ev.edges = [];
  const changed = [];
  for (let i = 0; i < B; i++) for (let j = 0; j < B; j++) {
    const c = cls[i * B + j];
    if (c === 1) changed.push([(j + 0.5) / B, (i + 0.5) / B]);
    if (c > 1) continue;
    let near = false;
    for (let di = -3; di <= 3 && !near; di++) for (let dj = -3; dj <= 3 && !near; dj++) {
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && jj >= 0 && ii < B && jj < B && cls[ii * B + jj] === 1 - c) near = true;
    }
    if (near) ev.edges.push([(j + 0.5) / B, (i + 0.5) / B]);
  }
  ev.centroid = changed.length ? [0, 1].map((k) => changed.reduce((s, p) => s + p[k], 0) / changed.length) : [0.5, 0.5];
  return ev;
}

// ---------- camera ----------
// Pose: look-at point on the ground (u, v), azimuth, elevation above the horizon, log distance.
const tgt = new THREE.Vector3(), probe = new THREE.PerspectiveCamera(40, 1, 0.001, 20), pt = new THREE.Vector3();
function place(ev, p, cam) {
  const { v } = ev;
  const u = Math.min(1, Math.max(0, p.u)), w = Math.min(1, Math.max(0, p.v));
  tgt.set(u - 0.5, v.smoothHeightAt(u, w), (w - 0.5) * v.aspect);
  const r = Math.exp(p.lr), el = Math.max(0.24, p.el);
  cam.position.set(tgt.x + r * Math.cos(el) * Math.sin(p.az), tgt.y + r * Math.sin(el), tgt.z + r * Math.cos(el) * Math.cos(p.az));
  // Stay above the highest ground under the camera (smooth grid, so no sudden hops).
  const cu = cam.position.x + 0.5, cv = cam.position.z / v.aspect + 0.5;
  if (cu > -0.05 && cu < 1.05 && cv > -0.05 && cv < 1.05) cam.position.y = Math.max(cam.position.y, v.ceilingAt(cu, cv) + 0.05);
  cam.lookAt(tgt);
}

// How a pose frames the change: share of on-screen ground (weighted by apparent size) that changed.
// ok when both changed and unchanged ground take a real share of the frame.
function judge(ev, p) {
  const { v } = ev, { B, cls } = ev.field;
  probe.aspect = innerWidth / innerHeight;
  probe.updateProjectionMatrix();
  place(ev, p, probe);
  probe.updateMatrixWorld();
  let wc = 0, wu = 0, n = 0;
  for (let i = 0; i < B; i++) for (let j = 0; j < B; j++) {
    const c = cls[i * B + j], pu = (j + 0.5) / B, pv = (i + 0.5) / B;
    pt.set(pu - 0.5, v.smoothHeightAt(pu, pv), (pv - 0.5) * v.aspect);
    const d2 = pt.distanceToSquared(probe.position), gx = pt.x, gy = pt.y, gz = pt.z;
    pt.project(probe);
    if (pt.z > 1 || Math.abs(pt.x) > 1 || Math.abs(pt.y) > 1) continue;
    // Hidden behind a ridge? March the sight line over the smoothed terrain.
    let hidden = false;
    for (let s = 0.15; s < 0.95 && !hidden; s += 0.1) {
      const x = gx + (probe.position.x - gx) * s, y = gy + (probe.position.y - gy) * s, z = gz + (probe.position.z - gz) * s;
      const su = x + 0.5, sv = z / v.aspect + 0.5;
      if (su > 0 && su < 1 && sv > 0 && sv < 1 && v.smoothHeightAt(su, sv) > y + 0.002) hidden = true;
    }
    if (hidden) continue;
    n++;
    if (c === 1) wc += 1 / d2; else if (c === 0) wu += 1 / d2;
  }
  // Screen rays below the horizon line that miss the terrain (would show the black void off its edge).
  const h0 = v.smoothHeightAt(0.5, 0.5);
  let miss = 0, rays = 0;
  for (const sy of [-0.9, -0.5, -0.1, 0.3]) for (const sx of [-0.9, -0.45, 0, 0.45, 0.9]) {
    pt.set(sx, sy, 0.5).unproject(probe).sub(probe.position);
    rays++;
    if (pt.y >= 0) { if (sy < 0) miss++; continue; } // sky is fine only in the upper part of the frame
    const t = (h0 - probe.position.y) / pt.y;
    const gu = probe.position.x + pt.x * t + 0.5, gv = (probe.position.z + pt.z * t) / v.aspect + 0.5;
    if (gu < 0 || gu > 1 || gv < 0 || gv > 1) miss++;
  }
  const f = wc + wu > 0 ? wc / (wc + wu) : 0, off = miss / rays;
  return { f, ok: n >= 12 && f >= 0.18 && f <= 0.75 && off <= 0.1,
    cost: (n < 12 ? 9 : Math.abs(f - 0.45)) + Math.max(0, off - 0.05) * 4 };
}

const lerpPose = (a, b, t) => ({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t, az: a.az + (b.az - a.az) * t, el: a.el + (b.el - a.el) * t, lr: a.lr + (b.lr - a.lr) * t });

// Best of many random candidates for one keyframe, checking the leg from the previous one too.
function keyframe(ev, prev, wide, dir) {
  const span = Math.max(1, ev.v.aspect);
  let best = null;
  for (let tries = 0; tries < 50; tries++) {
    const at = wide ? ev.centroid.map((c) => 0.5 + (c - 0.5) * rand(0.3, 0.8) + rand(-0.06, 0.06))
      : (ev.edges.length ? pick(ev.edges) : [rand(0.3, 0.7), rand(0.3, 0.7)]).map((x) => x + rand(-0.04, 0.04));
    const k = { u: at[0], v: at[1], az: prev ? prev.az + dir * rand(0.35, 1.2) : rand(-Math.PI, Math.PI),
      el: wide ? rand(0.7, 1.0) : rand(0.32, 0.62), lr: Math.log((wide ? rand(0.9, 1.25) : rand(0.3, 0.6)) * span) };
    let cost = judge(ev, k).cost;
    if (prev) for (const t of [0.33, 0.66]) cost = Math.max(cost, judge(ev, lerpPose(prev, k, t)).cost);
    if (!best || cost < best.cost) best = { k, cost };
    if (best.cost < 0.12) break;
  }
  return best.k;
}

// Catmull-Rom through the keyframes, so the motion never stops between them.
function makePath(ev, start, secs) {
  const n = Math.max(2, Math.round(secs / LEG_S)), dir = Math.random() < 0.5 ? -1 : 1;
  const ks = [start ?? keyframe(ev, null, true, dir)];
  for (let i = 1; i <= n; i++) ks.push(keyframe(ev, ks[i - 1], !start && i === n, dir));
  ks.unshift(ks[0]); ks.push(ks.at(-1));
  return (t) => {
    const x = Math.min(0.9999, Math.max(0, t)) * (ks.length - 3);
    const i = Math.floor(x) + 1, f = x - Math.floor(x);
    const cr = (p) => { const [a, b, c, d] = [ks[i - 1][p], ks[i][p], ks[i + 1][p], ks[i + 2][p]];
      return 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f); };
    return { u: cr("u"), v: cr("v"), az: cr("az"), el: cr("el"), lr: cr("lr") };
  };
}

// Current pose from the camera, so the autopilot can pick up where a visitor left it.
function poseNow(ev) {
  const { camera, controls } = ev.v;
  const d = camera.position.clone().sub(controls.target), r = d.length();
  return { u: controls.target.x + 0.5, v: controls.target.z / ev.v.aspect + 0.5,
    az: Math.atan2(d.x, d.z), el: Math.asin(d.y / r), lr: Math.log(r) };
}

// Small key: what the artificial colour means for this event.
const RAINBOW = "linear-gradient(90deg,#f33,#fd3,#3f6,#3df,#36f,#f3f,#f33)";
function keyFor(meta, still) {
  const [bg, text] = still ? ({ flood: ["#00e5ff", "new open water"], fire: ["#ff3d00", "burn scar"] }[meta.kind]
    ?? ["#ff2bd6", "ground buried or torn up"])
    : meta.kind === "subsidence" ? ["#ff26a6", "sinking ground (line every 5 cm)"]
    : [RAINBOW, "ground motion: one cycle = 10 cm"];
  return `<i style="background:${bg}"></i>${text}`;
}

// ---------- kiosk: manual takeover, idle cursor, fullscreen ----------
let manualUntil = 0, cur = null;
const label = $("#label"), nameEl = $("#name"), key = $("#key"), hint = $("#hint");
setTimeout(() => hint.classList.add("off"), 6000);
// A tap or drag anywhere (except Next) stops the tour and hands over the multitouch orbit controls:
// one finger orbits, pinch zooms, two fingers pan. The event's clock is frozen meanwhile.
let skip = false;
// Capture phase, so the controls are already enabled when the canvas sees this same first touch.
const takeOver = (e) => {
  if (e?.target?.closest?.("#next")) return;
  manualUntil = performance.now() + IDLE_S * 1000;
  if (cur) cur.v.controls.enabled = true;
};
addEventListener("pointerdown", takeOver, { capture: true });
addEventListener("pointermove", (e) => { if (e.buttons || e.pointerType === "touch") takeOver(e); });
$("#next").addEventListener("click", () => { skip = true; manualUntil = 0; });
addEventListener("contextmenu", (e) => e.preventDefault()); // long-press menu on touch panels
addEventListener("wheel", takeOver, { passive: true, capture: true });
let idleTimer;
addEventListener("pointermove", () => {
  document.body.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add("idle"), 2500);
});
addEventListener("keydown", (e) => {
  if (e.key === "f" || e.key === "F") document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  else if (e.key === "Escape" && !document.fullscreenElement) location.href = "./";
});

// ---------- main loop ----------
let pre = fetchEvent(nextSlug());
for (;;) {
  let ev;
  try {
    const data = await pre;
    if (cur) { // fade the old event to black and free its GPU context first
      cur.el.classList.remove("on"); label.classList.remove("on"); key.classList.remove("on");
      await sleep(FADE_S * 1000);
      cur.v.dispose(); cur.el.remove(); cur = null;
    }
    const t0 = performance.now();
    ev = await build(data);
    if (STATS) console.log(`${ev.slug}: build ${(performance.now() - t0).toFixed(0)} ms`);
  } catch (e) {
    console.error(e); await sleep(1000); pre = fetchEvent(nextSlug()); continue;
  }
  pre = fetchEvent(nextSlug(ev.slug)); pre.catch(() => {});

  const t1 = performance.now();
  let path = makePath(ev, null, EVENT_S), pathT0 = 0, pathLen = EVENT_S;
  let clock = AT, last = 0, wasManual = false;
  if (STATS) console.log(`${ev.slug}: path ${(performance.now() - t1).toFixed(0)} ms, ${ev.edges.length} edge blocks`);
  const grow = () => ev.v.setT(smooth((clock - 3) / (ev.still ? 12 : 16)));
  grow();
  place(ev, path(clock / pathLen), ev.v.camera);
  ev.v.onFrame(() => {
    const now = performance.now(), dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    if (STATS && last) stats.push(now - last);
    last = now;
    const manual = now < manualUntil;
    ev.v.controls.enabled = manual;
    if (manual) { wasManual = true; return; }
    if (wasManual) { // visitor let go: fly on from where they left it
      wasManual = false;
      pathT0 = clock; pathLen = Math.max(15, EVENT_S - clock);
      path = makePath(ev, poseNow(ev), pathLen);
    }
    clock += dt;
    grow();
    place(ev, path((clock - pathT0) / pathLen), ev.v.camera);
    ev.v.controls.target.copy(tgt);
  });
  ev.v.start();
  // Let the first frames (texture upload, shader compile) happen while still invisible.
  for (let i = 0; i < 3; i++) await frame();
  last = 0;
  cur = ev;
  ev.el.classList.add("on");
  nameEl.innerHTML = `${ev.meta.name.replace(/[&<>]/g, "")}<small>${ev.meta.date ?? ""}</small>`;
  label.classList.add("on");
  key.innerHTML = keyFor(ev.meta, ev.still);
  key.classList.add("on");
  // Wait out the event's time on the autopilot clock (paused while a visitor drives).
  skip = false;
  await new Promise((res) => { const iv = setInterval(() => { if (skip || clock >= EVENT_S - FADE_S) { clearInterval(iv); res(); } }, 100); });
  skip = false;
}
