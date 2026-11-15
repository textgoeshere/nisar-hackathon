// The cut: sample the radar signal along a stroke A -> B, find where it crosses the line, say what happens across it, draw the section.
const NS = "http://www.w3.org/2000/svg";
const fmt = (v, d = 1) => (Math.abs(v) < 0.05 && d === 1 ? "0" : v.toFixed(d)).replace("-", "−");
const sgn = (v, d = 1) => (v > 0 ? "+" : "") + fmt(v, d);
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// a, b in cell units. Samples sit every half cell at most; a sample with no reading, or outside the grid, is NaN (a gap, never joined).
export function sampleCut(ev, a, b) {
  const lenCells = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.min(2000, Math.ceil(lenCells * 2) + 1));
  const d = new Float32Array(n), v = new Float32Array(n), pos = [];
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1), X = a[0] + (b[0] - a[0]) * t, Y = a[1] + (b[1] - a[1]) * t;
    d[k] = t * lenCells * ev.dx;
    const j = Math.floor(X), i = Math.floor(Y);
    if (j < 0 || i < 0 || j >= ev.nx || i >= ev.ny) v[k] = NaN;
    else { const q = i * ev.nx + j; v[k] = ev.sigOk[q] ? ev.sig[q] : NaN; }
    pos.push([X, Y]);
  }
  return { a, b, n, d, v, pos, len: lenCells * ev.dx, cross: crossings(ev, a, b, lenCells * ev.dx) };
}

function crossings(ev, a, b, len) {
  const out = [];
  const rx = b[0] - a[0], ry = b[1] - a[1], den0 = rx * rx + ry * ry;
  for (const run of ev.runs) {
    for (let k = 0; k + 1 < run.pts.length; k++) {
      const p = run.pts[k], q = run.pts[k + 1], sx = q[0] - p[0], sy = q[1] - p[1];
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((p[0] - a[0]) * sy - (p[1] - a[1]) * sx) / den, u = ((p[0] - a[0]) * ry - (p[1] - a[1]) * rx) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push({ d: t * len, measured: run.measured });
    }
  }
  out.sort((x, y) => x.d - y.d);
  const merged = [];
  for (const c of out) {
    const last = merged[merged.length - 1];
    if (last && c.d - last.d < 150) { last.measured = last.measured || c.measured; } else merged.push({ ...c });
  }
  return merged;
}

function side(cut, from, to) {
  const xs = [];
  for (let k = 0; k < cut.n; k++) if (cut.d[k] >= from && cut.d[k] <= to && !Number.isNaN(cut.v[k])) xs.push(cut.v[k]);
  return xs.length >= 4 ? med(xs) : null;
}

// Steepest change over 500 m, using means over +-2 samples so one noisy cell does not decide it.
function steepest500(cut) {
  const sm = new Float32Array(cut.n).fill(NaN);
  for (let k = 2; k < cut.n - 2; k++) {
    let s = 0, c = 0;
    for (let j = -2; j <= 2; j++) if (!Number.isNaN(cut.v[k + j])) { s += cut.v[k + j]; c++; }
    if (c === 5) sm[k] = s / 5;
  }
  let best = null, k2 = 0;
  for (let k = 0; k < cut.n; k++) {
    if (Number.isNaN(sm[k])) continue;
    while (k2 < cut.n && cut.d[k2] - cut.d[k] < 500) k2++;
    if (k2 >= cut.n) break;
    if (Number.isNaN(sm[k2])) continue;
    const ch = sm[k2] - sm[k];
    if (!best || Math.abs(ch) > Math.abs(best.ch)) best = { ch, from: sm[k], to: sm[k2], d0: cut.d[k], d1: cut.d[k2] };
  }
  return best;
}

// Everything the sentence and the tests need, as numbers.
export function summarise(ev, cut) {
  const kind = ev.lab.line.kind, W = 1000, GAP = 150;
  const mid = cut.len / 2;
  const c = cut.cross.length ? cut.cross.reduce((p, q) => (Math.abs(q.d - mid) < Math.abs(p.d - mid) ? q : p)) : null;
  const res = { kind, crossing: c, sideA: null, sideB: null, change: null, steepest: null };
  if (c) { res.sideA = side(cut, c.d - W, c.d - GAP); res.sideB = side(cut, c.d + GAP, c.d + W); if (res.sideA != null && res.sideB != null) res.change = res.sideB - res.sideA; }
  if (kind === "front" && cut.cross.length >= 2) { // the stroke goes in and out of an outline: compare inside with outside
    const c1 = cut.cross[0].d, c2 = cut.cross[cut.cross.length - 1].d;
    const inside = side(cut, c1 + 100, c2 - 100);
    res.inside = inside; res.outA = side(cut, c1 - W, c1 - GAP); res.outB = side(cut, c2 + GAP, c2 + W);
  }
  if (kind === "bend") res.steepest = steepest500(cut);
  const vals = [...cut.v].filter((x) => !Number.isNaN(x));
  res.min = vals.length ? Math.min(...vals) : null; res.max = vals.length ? Math.max(...vals) : null; res.valid = vals.length / cut.n;
  return res;
}

export function sentence(ev, cut, s = summarise(ev, cut)) {
  const km = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.round(m / 10) * 10 + " m");
  if (s.valid === 0) return "No radar reading anywhere along this stroke: the surface changed or the signal was lost. Try another place.";
  if (!s.crossing) return `This stroke does not cross the line. Along it the signal runs from ${fmt(s.min)} to ${fmt(s.max)} ${ev.lab.signal.unit}.`;
  const live = s.crossing.measured ? "the line" : "the line (dashed here: not measured by radar)";
  if (s.kind === "front" && cut.cross.length >= 3)
    return `This stroke meets the outline ${cut.cross.length} times, so there is no single drop to state. Along it coherence runs from ${s.min.toFixed(2)} to ${s.max.toFixed(2)} (1 = the ground looks the same in both passes).`;
  if (s.sideA == null || s.sideB == null)
    return `The stroke crosses ${live}, but one side has no radar reading within 1 km of it, so no step can be stated.`;
  const r1 = (x) => +x.toFixed(1), ch = Math.abs(r1(s.sideB) - r1(s.sideA));
  if (s.kind === "rupture")
    return `Across ${live} the motion goes from ${sgn(s.sideA)} cm to ${sgn(s.sideB)} cm (plus = toward the satellite): a step of ${ch.toFixed(ch >= 10 ? 0 : 1)} cm, A side to B side.`;
  if (s.kind === "bend") {
    const st = s.steepest;
    return `Across ${live} the sinking rate goes from ${sgn(s.sideA)} to ${sgn(s.sideB)} cm a year (minus = sinking), a change of ${ch.toFixed(ch >= 10 ? 0 : 1)} cm a year between 150 m and 1 km either side of it.`
      + (st ? ` The steepest 500 m of the stroke changes by ${Math.abs(st.ch).toFixed(1)} cm a year.` : "");
  }
  if (s.inside != null && s.outA != null && s.outB != null) {
    const a = +s.outA.toFixed(2), b = +s.outB.toFixed(2), i = +s.inside.toFixed(2);
    return `Coherence is ${a.toFixed(2)} on the A side, ${i.toFixed(2)} inside the outline and ${b.toFixed(2)} on the B side: going in, it drops by ${(a - i).toFixed(2)}; coming out, it recovers by ${(b - i).toFixed(2)} (1 = the ground looks the same in both passes, 0 = no match).`;
  }
  const hi = +Math.max(s.sideA, s.sideB).toFixed(2), lo = +Math.min(s.sideA, s.sideB).toFixed(2);
  return `Across ${live} coherence falls from ${hi.toFixed(2)} on the intact side to ${lo.toFixed(2)} on the other: a drop of ${(hi - lo).toFixed(2)} (1 = the ground looks the same in both passes).`;
}

const el = (n, a = {}, p) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (p) p.append(e); return e; };
function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1, raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p, t = [];
  for (let x = Math.ceil(lo / step) * step; x <= hi + 1e-9; x += step) t.push(+x.toFixed(10));
  return { t, step };
}

// Section plot in three inks: trace black, the line red, gaps blank (and marked in a strip), data ink under the trace.
export function drawSection(svg, ev, cut, opts = {}) {
  const W = Math.max(280, svg.clientWidth || 320), H = opts.height || (W < 480 ? 250 : 300);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("height", H);
  svg.replaceChildren();
  const m = { l: 46, r: 14, t: 48, b: 62 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const kind = ev.lab.line.kind, unit = ev.lab.signal.unit;
  let lo, hi;
  if (kind === "front") { lo = 0; hi = 1; } else {
    const vals = [...cut.v].filter((x) => !Number.isNaN(x));
    lo = Math.min(0, ...(vals.length ? vals : [0])); hi = Math.max(0, ...(vals.length ? vals : [0]));
    const pad = (hi - lo || 1) * 0.08; lo -= pad; hi += pad * 0.6;
    if (kind === "bend") hi = Math.max(hi, 1);
  }
  const x = (d) => m.l + (d / cut.len) * pw, y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * ph;
  const g = el("g", {}, svg);
  // grid + y ticks
  const yt = niceTicks(lo, hi, 4);
  for (const t of yt.t) {
    el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === 0 ? "zero" : "grid" }, g);
    const tx = el("text", { x: m.l - 6, y: y(t) + 4, class: "tick", "text-anchor": "end" }, g); tx.textContent = kind === "front" ? t.toFixed(1) : fmt(t, yt.step < 1 ? 1 : 0);
  }
  // data-ink fill: between the trace and zero (or, for coherence, between the trace and 1 = the part that was lost)
  const base = kind === "front" ? 1 : 0, ink = kind === "front" ? "loss" : null;
  const segs = []; let cur = [];
  for (let k = 0; k < cut.n; k++) { if (Number.isNaN(cut.v[k])) { if (cur.length) segs.push(cur); cur = []; } else cur.push(k); }
  if (cur.length) segs.push(cur);
  const clipUp = el("clipPath", { id: "cu" }, g), clipDn = el("clipPath", { id: "cd" }, g);
  const clipLoss = kind === "front" ? "url(#cd)" : "url(#cu)";
  el("rect", { x: m.l, y: m.t, width: pw, height: Math.max(0, y(base) - m.t) }, clipUp);
  el("rect", { x: m.l, y: y(base), width: pw, height: Math.max(0, m.t + ph - y(base)) }, clipDn);
  for (const s of segs) {
    if (s.length < 2) continue;
    const pts = s.map((k) => `${x(cut.d[k]).toFixed(1)},${y(cut.v[k]).toFixed(1)}`).join(" ");
    const poly = `${x(cut.d[s[0]]).toFixed(1)},${y(base).toFixed(1)} ${pts} ${x(cut.d[s[s.length - 1]]).toFixed(1)},${y(base).toFixed(1)}`;
    if (kind === "front") { el("polygon", { points: poly, class: "fill-loss", "clip-path": clipLoss }, g); }
    else if (kind === "bend") { el("polygon", { points: poly, class: "fill-neg", "clip-path": "url(#cd)" }, g); }
    else { el("polygon", { points: poly, class: "fill-pos", "clip-path": "url(#cu)" }, g); el("polygon", { points: poly, class: "fill-neg", "clip-path": "url(#cd)" }, g); }
  }
  // the line, in red; one short label, not repeated where crossings are close
  let lastLab = -1e9;
  for (const c of cut.cross) {
    const cx = x(c.d);
    el("line", { x1: cx, x2: cx, y1: m.t - 10, y2: m.t + ph + 6, class: "lineband" + (c.measured ? "" : " dashed") }, g);
    if (cx - lastLab < 92) continue;
    lastLab = cx;
    const t = el("text", { x: cx + (cx > W - 100 ? -5 : 5), y: m.t - 14, class: "linelab", "text-anchor": cx > W - 100 ? "end" : "start" }, g);
    t.textContent = c.measured ? "THE LINE" : "THE LINE \u00b7 DASHED";
  }
  // trace, black, broken at gaps
  for (const s of segs) {
    if (s.length === 1) { el("circle", { cx: x(cut.d[s[0]]), cy: y(cut.v[s[0]]), r: 1.6, class: "trace-dot" }, g); continue; }
    el("polyline", { points: s.map((k) => `${x(cut.d[k]).toFixed(1)},${y(cut.v[k]).toFixed(1)}`).join(" "), class: "trace" }, g);
  }
  // reading strip: black where the radar has a reading, outline where it has none
  const sy = m.t + ph + 20;
  el("rect", { x: m.l, y: sy, width: pw, height: 7, class: "strip-gap" }, g);
  for (const s of segs) el("rect", { x: x(cut.d[s[0]]), y: sy, width: Math.max(1, x(cut.d[s[s.length - 1]]) - x(cut.d[s[0]])), height: 7, class: "strip-ok" }, g);
  // x axis in km
  const xt = niceTicks(0, cut.len / 1000, 5);
  for (const t of xt.t) {
    el("line", { x1: x(t * 1000), x2: x(t * 1000), y1: m.t + ph, y2: m.t + ph + 4, class: "grid" }, g);
    const tx = el("text", { x: x(t * 1000), y: m.t + ph + 15, class: "tick", "text-anchor": "middle" }, g); tx.textContent = t + (t === xt.t[xt.t.length - 1] ? " km" : "");
  }
  for (const [lbl, cx] of [["A", m.l + 11], ["B", W - m.r - 11]]) {
    const cy = H - 15;
    el("circle", { cx, cy, r: 11, class: "badge" }, g); const t = el("text", { x: cx, y: cy + 5, class: "badge-t", "text-anchor": "middle" }, g); t.textContent = lbl;
  }
  const dl = el("text", { x: W / 2, y: H - 11, class: "tick", "text-anchor": "middle" }, g); dl.textContent = `${(cut.len / 1000).toFixed(1)} KM, A TO B`;
  const yl = el("text", { x: 4, y: 14, class: "ylab" }, g); yl.textContent = (kind === "front" ? "COHERENCE (0 TO 1)" : unit === "cm" ? "MOTION, CM (PLUS = TOWARD THE SATELLITE)" : "SINKING RATE, " + unit.toUpperCase() + " (MINUS = SINKING)");
  // scrub cursor
  const cur2 = el("g", { class: "cursor", visibility: "hidden" }, svg);
  el("line", { x1: 0, x2: 0, y1: m.t, y2: m.t + ph }, cur2); el("circle", { r: 4.5, cx: 0, cy: 0 }, cur2);
  const rd = el("text", { x: 0, y: m.t + 12, class: "readout" }, cur2);
  svg.onpointermove = svg.onpointerdown = (e) => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width);
    if (px < m.l || px > W - m.r) return opts.onScrub?.(null);
    const k = Math.round(((px - m.l) / pw) * (cut.n - 1)), v = cut.v[k];
    cur2.setAttribute("visibility", "visible");
    cur2.setAttribute("transform", `translate(${x(cut.d[k])},0)`);
    cur2.querySelector("circle").setAttribute("cy", Number.isNaN(v) ? m.t + ph : y(v));
    rd.textContent = Number.isNaN(v) ? "NO READING" : (kind === "front" ? v.toFixed(2) : sgn(v) + " " + unit.replace(" a year", "/yr"));
    rd.setAttribute("text-anchor", x(cut.d[k]) > W - 120 ? "end" : "start"); rd.setAttribute("x", x(cut.d[k]) > W - 120 ? -6 : 6);
    opts.onScrub?.(cut.pos[k]);
  };
  svg.onpointerleave = () => { cur2.setAttribute("visibility", "hidden"); opts.onScrub?.(null); };
}
