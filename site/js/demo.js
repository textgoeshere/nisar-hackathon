// Kiosk carousel: flies the camera over each live event in turn on a random, smooth path
// (wide establishing shot, low swoops over the strongest signal, pull out), fading the
// before -> after change in as it goes. Touching it hands over the controls; 30 s idle resumes.
import * as THREE from "three";
import { createViewer } from "./viewer.js";

const EVENT_S = 40, FADE_S = 2, IDLE_S = 30;
const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (x * 6 - 15) + 10); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const slugs = await fetch("events/index.json").then((r) => r.json());
// ?e=<slug> starts on that event; ?at=<seconds> starts each event part-way through (for checking shots).
const qs = new URLSearchParams(location.search), AT = +qs.get("at") || 0;
let order = slugs.includes(qs.get("e")) ? [qs.get("e")] : [];
function nextSlug(prev) {
  if (!order.length) {
    order = [...slugs].sort(() => Math.random() - 0.5);
    if (order[0] === prev && order.length > 1) order.push(order.shift());
  }
  return order.shift();
}

async function load(slug) {
  const base = `events/${slug}/`;
  const meta = await (await fetch(base + "meta.json")).json();
  const stories = await fetch(base + "stories.json").then((r) => (r.ok ? r.json() : null), () => null);
  const el = document.createElement("div");
  el.className = "stage";
  document.body.prepend(el);
  const v = await createViewer(el, base, meta);
  v.controls.enabled = false;
  const pins = (stories?.items ?? []).filter((i) => i.status !== "rejected" && i.nisar?.inside !== false && i.nisar?.u != null)
    .map((i) => [i.nisar.u, i.nisar.v]);
  return { slug, meta, el, v, targets: [...v.hotspots(3), ...pins] };
}

// Camera pose: look-at point on the ground (u, v), azimuth, elevation above the horizon, distance.
// Paths are Catmull-Rom through random keyframes, so the motion never stops between them.
function key(ev, uv, az, el, r) { return { u: uv[0], v: uv[1], az, el, lr: Math.log(r) }; }
function makePath(ev, start, secs) {
  const n = Math.max(2, Math.round(secs / 13)); // ~13 s per leg
  const dir = Math.random() < 0.5 ? -1 : 1;
  const span = Math.max(1, ev.v.aspect);
  const wide = () => key(ev, [rand(0.4, 0.6), rand(0.4, 0.6)], 0, rand(0.75, 1.05), rand(1.0, 1.35) * span);
  const close = () => key(ev, ev.targets.length ? pick(ev.targets).map((x) => x + rand(-0.05, 0.05)) : [rand(0.3, 0.7), rand(0.3, 0.7)],
    0, rand(0.3, 0.6), rand(0.28, 0.55) * span);
  const ks = [start ?? wide()];
  for (let i = 1; i < n; i++) ks.push(close());
  ks.push(start ? close() : wide());
  // Azimuth keeps turning one way, a random amount per leg.
  for (let i = 1; i < ks.length; i++) ks[i].az = ks[i - 1].az + dir * rand(0.5, 1.3);
  ks.unshift(ks[0]); ks.push(ks.at(-1));
  return (t) => { // t in [0, 1]
    const x = Math.min(0.9999, Math.max(0, t)) * (ks.length - 3);
    const i = Math.floor(x) + 1, f = x - Math.floor(x);
    const cr = (p) => { const [a, b, c, d] = [ks[i - 1][p], ks[i][p], ks[i + 1][p], ks[i + 2][p]];
      return 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f); };
    return { u: cr("u"), v: cr("v"), az: cr("az"), el: cr("el"), lr: cr("lr") };
  };
}

const tgt = new THREE.Vector3();
function apply(ev, p) {
  const { v } = ev, cam = v.camera;
  const u = Math.min(1, Math.max(0, p.u)), w = Math.min(1, Math.max(0, p.v));
  tgt.set(u - 0.5, v.heightAt(u, w), (w - 0.5) * v.aspect);
  const r = Math.exp(p.lr), el = Math.max(0.22, p.el);
  cam.position.set(tgt.x + r * Math.cos(el) * Math.sin(p.az), tgt.y + r * Math.sin(el), tgt.z + r * Math.cos(el) * Math.cos(p.az));
  // Never dip under the terrain.
  const cu = cam.position.x + 0.5, cv = cam.position.z / v.aspect + 0.5;
  if (cu > 0 && cu < 1 && cv > 0 && cv < 1) cam.position.y = Math.max(cam.position.y, v.heightAt(cu, cv) + 0.04);
  cam.lookAt(tgt);
  v.controls.target.copy(tgt);
}

// Current pose from the camera, so the autopilot can pick up where a visitor left it.
function poseNow(ev) {
  const { camera, controls } = ev.v;
  const d = camera.position.clone().sub(controls.target), r = d.length();
  return { u: controls.target.x + 0.5, v: controls.target.z / ev.v.aspect + 0.5,
    az: Math.atan2(d.x, d.z), el: Math.asin(d.y / r), lr: Math.log(r) };
}

// ---------- kiosk: manual takeover, idle cursor, fullscreen ----------
let manualUntil = 0;
const label = $("#label"), hint = $("#hint");
setTimeout(() => hint.classList.add("off"), 6000);
const takeOver = () => { manualUntil = performance.now() + IDLE_S * 1000; };
addEventListener("pointerdown", takeOver);
addEventListener("wheel", takeOver, { passive: true });
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
let cur = null, nextP = load(nextSlug());
for (;;) {
  let ev;
  try { ev = await nextP; } catch (e) { console.error(e); await sleep(1000); nextP = load(nextSlug(cur?.slug)); continue; }
  const still = ev.meta.still || ["landslide", "flood", "fire"].includes(ev.meta.kind);
  let path = makePath(ev, null, EVENT_S), pathT0 = 0, pathLen = EVENT_S;
  let clock = AT, last = performance.now(), wasManual = false, preloaded = false;
  ev.v.setT(0);
  apply(ev, path(0));
  ev.v.onFrame(() => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
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
    apply(ev, path((clock - pathT0) / pathLen));
    // Grow the measured motion / change footprint in, then hold it.
    ev.v.setT(smooth((clock - 3) / (still ? 12 : 16)));
    if (!preloaded && clock > 8) { preloaded = true; nextP = load(nextSlug(ev.slug)); nextP.catch(() => {}); }
  });

  // Cross-fade through black: old out, new in.
  if (cur) { cur.el.classList.remove("on"); label.classList.remove("on"); await sleep(FADE_S * 1000); cur.v.dispose(); cur.el.remove(); }
  cur = ev;
  ev.el.classList.add("on");
  label.innerHTML = `${ev.meta.name.replace(/[&<>]/g, "")}<small>${ev.meta.date ?? ""}</small>`;
  label.classList.add("on");
  // Wait out the event's time on the autopilot clock (paused while a visitor drives).
  await new Promise((res) => { const iv = setInterval(() => { if (clock >= EVENT_S - FADE_S) { clearInterval(iv); res(); } }, 200); });
  if (!preloaded) { preloaded = true; nextP = load(nextSlug(ev.slug)); }
}
