// Skycam for the event page: the demo kiosk's camera autopilot (js/demo.js), ported as-is. A random,
// smooth Catmull-Rom flight through keyframes (wide shot, low swoops along the edge of the changed
// ground), every pose checked so the frame holds some changed and some unchanged ground. Touching the
// view hands over the orbit controls; IDLE_S seconds without input resumes from where it was left.
import * as THREE from "three";

const IDLE_S = 30, LEG_S = 13;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Changed / unchanged blocks and the edges between them, judged with the change fully grown in.
function survey(v) {
  const ev = { v };
  ev.field = v.changeField(32);
  const { B, cls } = ev.field;
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

const tgt = new THREE.Vector3(), probe = new THREE.PerspectiveCamera(40, 1, 0.001, 20), pt = new THREE.Vector3();
function place(ev, p, cam) {
  const { v } = ev;
  const u = Math.min(1, Math.max(0, p.u)), w = Math.min(1, Math.max(0, p.v));
  tgt.set(u - 0.5, v.smoothHeightAt(u, w), (w - 0.5) * v.aspect);
  const r = Math.exp(p.lr), el = Math.max(0.24, p.el);
  cam.position.set(tgt.x + r * Math.cos(el) * Math.sin(p.az), tgt.y + r * Math.sin(el), tgt.z + r * Math.cos(el) * Math.cos(p.az));
  const cu = cam.position.x + 0.5, cv = cam.position.z / v.aspect + 0.5;
  if (cu > -0.05 && cu < 1.05 && cv > -0.05 && cv < 1.05) cam.position.y = Math.max(cam.position.y, v.ceilingAt(cu, cv) + 0.05);
  cam.lookAt(tgt);
}

function judge(ev, p) {
  const { v } = ev, { B, cls } = ev.field;
  probe.aspect = ev.aspect();
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
  const h0 = v.smoothHeightAt(0.5, 0.5);
  let miss = 0, rays = 0;
  for (const sy of [-0.9, -0.5, -0.1, 0.3]) for (const sx of [-0.9, -0.45, 0, 0.45, 0.9]) {
    pt.set(sx, sy, 0.5).unproject(probe).sub(probe.position);
    rays++;
    if (pt.y >= 0) { if (sy < 0) miss++; continue; }
    const t = (h0 - probe.position.y) / pt.y;
    const gu = probe.position.x + pt.x * t + 0.5, gv = (probe.position.z + pt.z * t) / v.aspect + 0.5;
    if (gu < 0 || gu > 1 || gv < 0 || gv > 1) miss++;
  }
  const f = wc + wu > 0 ? wc / (wc + wu) : 0, off = miss / rays;
  return { f, ok: n >= 12 && f >= 0.18 && f <= 0.75 && off <= 0.1,
    cost: (n < 12 ? 9 : Math.abs(f - 0.45)) + Math.max(0, off - 0.05) * 4 };
}

const lerpPose = (a, b, t) => ({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t, az: a.az + (b.az - a.az) * t, el: a.el + (b.el - a.el) * t, lr: a.lr + (b.lr - a.lr) * t });

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

// Endless Catmull-Rom flight through keyframes, LEG_S seconds apart, so the motion never stops.
// The demo plans a whole 40 s flight up front in the black gap between events; here there is no gap,
// so keyframes are planned one at a time, a few legs ahead, while the browser is idle.
const idle = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 2000 }) : setTimeout(f, 50));
function makeFlight(ev, start) {
  let dir = Math.random() < 0.5 ? -1 : 1, n = 0, queued = false;
  const ks = [start ?? keyframe(ev, null, true, dir)];
  ks.unshift(ks[0]);
  const more = () => {
    n++;
    if (n % 6 === 0) dir = -dir;
    ks.push(keyframe(ev, ks.at(-1), n % 4 === 0, dir));          // every 4th keyframe a wide shot
  };
  more(); more();
  return (x) => { // x: legs flown so far
    const i = Math.floor(x) + 1, f = x - Math.floor(x);
    while (ks.length < i + 3) more();                             // fell behind: plan now
    if (ks.length < i + 5 && !queued) { queued = true; idle(() => { queued = false; more(); }); }
    const cr = (p) => { const [a, b, c, d] = [ks[i - 1][p], ks[i][p], ks[i + 1][p], ks[i + 2][p]];
      return 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f); };
    return { u: cr("u"), v: cr("v"), az: cr("az"), el: cr("el"), lr: cr("lr") };
  };
}

function poseNow(v) {
  const { camera, controls } = v;
  const d = camera.position.clone().sub(controls.target), r = d.length();
  return { u: controls.target.x + 0.5, v: controls.target.z / v.aspect + 0.5,
    az: Math.atan2(d.x, d.z), el: Math.asin(d.y / r), lr: Math.log(r) };
}

// el: the element holding the canvas. survey() needs the change fully grown in: call with T = 1.
export function createSkycam(v, el) {
  const ev = survey(v);
  ev.aspect = () => el.clientWidth / Math.max(1, el.clientHeight);
  let on = false, path = null, clock = 0, last = 0, manualUntil = 0;
  const fresh = (fromNow) => { path = makeFlight(ev, fromNow ? poseNow(v) : null); clock = 0; };
  // Any pointer on the view (capture phase, so the controls are live for this same touch) hands over.
  const takeOver = () => { if (!on) return; manualUntil = performance.now() + IDLE_S * 1000; v.controls.enabled = true; };
  el.addEventListener("pointerdown", takeOver, { capture: true });
  v.onFrame(() => {
    const now = performance.now(), dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (!on) return;
    if (now < manualUntil) { v.controls.enabled = true; return; }
    if (manualUntil) { manualUntil = 0; fresh(true); } // visitor let go: fly on from where they left it
    v.controls.enabled = false;
    clock += dt;
    place(ev, path(clock / LEG_S), v.camera);
    v.controls.target.copy(tgt);
  });
  return {
    takeOver,
    get on() { return on; },
    // fromNow: start from the current view (toggled on mid-visit) rather than a fresh wide shot.
    set(x, fromNow = false) {
      if (x === on) return;
      on = x;
      manualUntil = 0;
      v.controls.enabled = true;
      if (on) { fresh(fromNow); last = 0; }
    },
  };
}
