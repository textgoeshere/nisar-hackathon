// The cut: sample the radar signal along an A-B stroke, find where the stroke crosses the line,
// say in one sentence what the signal does across it, and draw the section as an SVG plot.
// Gaps (no reading, or off the grid) are gaps in the plot. Positions here are grid cells; distances are metres.

export const STEP_M = 25; // sample spacing along the stroke

export async function loadSignal(lab, dataBase) {
  const sig = lab.signal;
  const get = async (rel) => { const r = await fetch(new URL(rel, dataBase)); if (!r.ok) throw new Error(`${rel}: ${r.status}`); return r.arrayBuffer(); };
  const [buf, vbuf] = await Promise.all([get(sig.file), sig.valid ? get(sig.valid) : null]);
  return {
    raw: sig.dtype === "int16" ? new Int16Array(buf) : new Uint8Array(buf),
    valid: vbuf ? new Uint8Array(vbuf) : null, scale: sig.scale, nx: lab.grid.nx, ny: lab.grid.ny,
  };
}

function sampleAt(S, X, Y) { // bilinear over measured cells only; null where there is no reading
  const { nx, ny, raw, valid, scale } = S;
  if (X < 0 || Y < 0 || X >= nx || Y >= ny) return null;
  const nearest = Math.floor(Y) * nx + Math.floor(X);
  if (valid && !valid[nearest]) return null;
  const fx = X - 0.5, fy = Y - 0.5, j0 = Math.floor(fx), i0 = Math.floor(fy), tx = fx - j0, ty = fy - i0;
  let sw = 0, sv = 0, tot = 0;
  for (let di = 0; di < 2; di++) for (let dj = 0; dj < 2; dj++) {
    const w = (dj ? tx : 1 - tx) * (di ? ty : 1 - ty); tot += w;
    const i = i0 + di, j = j0 + dj;
    if (i < 0 || j < 0 || i >= ny || j >= nx) continue;
    const k = i * nx + j;
    if (valid && !valid[k]) continue;
    sw += w; sv += w * raw[k];
  }
  if (!sw || sw / tot < 0.5) return null;
  return (sv / sw) * scale;
}

export function profile(S, lab, A, B) { // A, B in cells
  const mx = (B[0] - A[0]) * lab.grid.dx, my = (B[1] - A[1]) * lab.grid.dx;
  const len = Math.hypot(mx, my), n = Math.max(2, Math.round(len / STEP_M) + 1);
  const d = new Float32Array(n), v = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    d[i] = t * len; v[i] = sampleAt(S, A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t);
  }
  return { d, v, len, n, A, B };
}

export function crossings(line, A, B, dx) { // where A-B meets the line (runs hold the measured flag)
  const out = [], rx = B[0] - A[0], ry = B[1] - A[1], len = Math.hypot(rx, ry) * dx;
  const seg = (p, q, measured) => {
    const sx = q[0] - p[0], sy = q[1] - p[1], den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return;
    const t = ((p[0] - A[0]) * sy - (p[1] - A[1]) * sx) / den, u = ((p[0] - A[0]) * ry - (p[1] - A[1]) * rx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push({ d: t * len, measured });
  };
  for (const r of line) {
    for (let i = 1; i < r.pts.length; i++) seg(r.pts[i - 1], r.pts[i], r.measured);
    if (r.closed && r.pts.length > 2) seg(r.pts[r.pts.length - 1], r.pts[0], r.measured);
  }
  out.sort((a, b) => a.d - b.d);
  return out.filter((c, i) => !i || c.d - out[i - 1].d > 60 || ((out[i - 1].measured = out[i - 1].measured || c.measured), false));
}

const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const minus = (x) => String(x).replace("-", "−");
export function fmt(lab, v, plain) {
  const k = lab.line.kind;
  const t = k === "front" ? v.toFixed(2) : Math.abs(v) < 10 ? v.toFixed(1) : v.toFixed(0);
  return minus(t) + (plain ? "" : k === "front" ? "" : k === "bend" ? " cm a year" : " cm");
}
const win = (p, d0, d1) => { const o = []; for (let i = 0; i < p.n; i++) if (p.d[i] >= d0 && p.d[i] <= d1 && p.v[i] != null) o.push(p.v[i]); return o; };

export function compass(A, B) { // which way side A lies from the middle of the stroke
  const east = A[0] - B[0], north = -(A[1] - B[1]);
  const a = (Math.atan2(east, north) * 180) / Math.PI;
  return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(((a + 360) % 360) / 45) % 8];
}

export function analyse(lab, p, cross) {
  const kind = lab.line.kind, vals = p.v.filter((x) => x != null);
  const res = { kind, cross, text: "", facts: {}, levels: [], band: null };
  if (vals.length < 8) { res.text = "The radar has no reading along most of this stroke, so there is nothing to plot."; res.facts.none = true; return res; }
  const lo = Math.min(...vals), hi = Math.max(...vals);
  if (kind === "bend") {
    const k = Math.round(500 / STEP_M);
    let d0 = 0, d1 = p.len;
    if (cross.length) { const c = cross.reduce((a, b) => (Math.abs(a.d - p.len / 2) < Math.abs(b.d - p.len / 2) ? a : b)); d0 = c.d - 1000; d1 = c.d + 1000; }
    let best = null;
    for (let i = 0; i + k < p.n; i++) {
      if (p.d[i] < d0 || p.d[i + k] > d1 || p.v[i] == null || p.v[i + k] == null) continue;
      const dv = p.v[i + k] - p.v[i];
      if (!best || Math.abs(dv) > Math.abs(best.dv)) best = { i, j: i + k, dv, a: p.v[i], b: p.v[i + k] };
    }
    if (!best || Math.abs(best.dv) < lab.signal.noise * 2) {
      res.text = `The sinking rate hardly changes along this stroke (${fmt(lab, lo, true)} to ${fmt(lab, hi)}): no bend to measure here.`;
      res.facts = { flat: true, lo, hi };
    } else {
      const perM = Math.round(500 / Math.abs(best.dv)), tilt = Math.round(50000 / Math.abs(best.dv) / 100) * 100;
      res.text = `Within 500 m the sinking rate changes from <em>${fmt(lab, best.a, true)}</em> to <em>${fmt(lab, best.b)}</em> (negative is sinking). That is the steepest stretch of this cut${cross.length ? ", and it sits at the line" : ", and it does not cross the line"}: the rate changes by 1 cm a year every ${perM} m.`;
      res.facts = { a: best.a, b: best.b, dv: best.dv, d_a: p.d[best.i], d_b: p.d[best.j], tilt, metres_per_cm_a_year: perM };
      res.band = [p.d[best.i], p.d[best.j]];
    }
    return res;
  }
  // rupture (step) and front (drop): compare the two sides of a crossing
  let best = null;
  cross.forEach((c, ci) => {
    const lb = Math.max(c.d - 1200, ci ? cross[ci - 1].d + 100 : -1), rb = Math.min(c.d + 1200, ci < cross.length - 1 ? cross[ci + 1].d - 100 : 1e9);
    const L = win(p, lb, c.d - 150), R = win(p, c.d + 150, rb);
    if (L.length < 6 || R.length < 6) return;
    const a = med(L), b = med(R), dv = b - a;
    if (!best || Math.abs(dv) > Math.abs(best.dv)) best = { c, a, b, dv, l0: Math.max(lb, 0), l1: c.d - 150, r0: c.d + 150, r1: Math.min(rb, p.len) };
  });
  if (!cross.length) {
    res.text = `This stroke does not cross the line, so there is no ${kind === "rupture" ? "step" : "drop"} to measure. Along it the signal runs from ${fmt(lab, lo, true)} to ${fmt(lab, hi)}.`;
    res.facts = { nocross: true, lo, hi };
  } else if (!best) {
    res.text = "The stroke crosses the line, but the radar has no reading close to it on one side, so there is no number to give. The gap is the finding: the surface changed or the signal was lost there.";
    res.facts = { crossed: cross.length, nodata: true };
  } else {
    const mag = fmt(lab, Math.abs(best.dv), kind === "front");
    res.text = kind === "rupture"
      ? `Across the line, motion toward the satellite jumps by <em>${mag}</em>: from ${fmt(lab, best.a)} on side A to ${fmt(lab, best.b)} on side B.`
      : `Across the line the radar's match (coherence) ${best.dv < 0 ? "drops" : "rises"} by <em>${mag}</em>: from ${fmt(lab, best.a)} on side A to ${fmt(lab, best.b)} on side B (1 is the same surface, 0 is no match).`;
    res.facts = { a: best.a, b: best.b, dv: best.dv, at_m: best.c.d, windows: [[best.l0, best.l1], [best.r0, best.r1]] };
    res.levels = [{ d0: best.l0, d1: best.l1, v: best.a }, { d0: best.r0, d1: best.r1, v: best.b }];
  }
  return res;
}

// ---------- plot ----------
function niceTicks(lo, hi, want) {
  const span = hi - lo || 1, raw = span / want, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? p * 10;
  const out = []; for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.abs(t) < 1e-9 ? 0 : +t.toFixed(6));
  return { step, ticks: out };
}
let uid = 0;
const DASHED = { rupture: "survey only", bend: "too gentle to measure", front: "weak loss" };
export function plot(lab, p, an, width) {
  const id = `h${++uid}`, w = Math.max(280, Math.round(width)), h = w < 520 ? 250 : 270;
  const m = { l: 44, r: 12, t: 30, b: 50 };
  const kind = lab.line.kind, vals = p.v.filter((x) => x != null);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (kind === "front") { lo = 0; hi = 1; } else { const pad = (hi - lo) * 0.1 || 1; lo -= pad; if (hi > 0) hi += pad * 0.6; }
  const pw = w - m.l - m.r, ph = h - m.t - m.b;
  const X = (d) => m.l + (d / p.len) * pw, Y = (v) => m.t + ph - ((v - lo) / (hi - lo)) * ph;
  const { ticks } = niceTicks(lo, hi, 4);
  let s = `<svg class="plot" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Section along the cut from A to B">`;
  s += `<defs><pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#b9ad93" stroke-width="2"/></pattern></defs>`;
  for (const t of ticks) s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="${t === 0 && kind !== "front" ? "#25211a" : "#ddd2b8"}" stroke-width="${t === 0 && kind !== "front" ? 1.6 : 1}"/><text x="${m.l - 6}" y="${Y(t) + 4}" text-anchor="end" font-size="11.5" font-weight="600">${minus(t)}</text>`;
  // gaps
  let g0 = null;
  const flushGap = (d1) => { if (g0 == null) return; const x0 = X(g0), x1 = X(d1); s += `<rect x="${x0}" y="${m.t}" width="${Math.max(1, x1 - x0)}" height="${ph}" fill="url(#${id})" opacity=".55"/>`; if (x1 - x0 > 74) s += `<text x="${(x0 + x1) / 2}" y="${m.t + ph / 2}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#5d5546" style="paint-order:stroke;stroke:#fbf7ec;stroke-width:4px">no reading</text>`; g0 = null; };
  for (let i = 0; i < p.n; i++) { if (p.v[i] == null) { if (g0 == null) g0 = i ? p.d[i - 1] : 0; } else flushGap(p.d[i]); }
  flushGap(p.len);
  // the signal: area to zero + line, one piece per run of readings
  const base = Y(Math.max(lo, Math.min(hi, 0)));
  let run = [];
  const flush = () => { if (run.length > 1) { const pts = run.map(([d, v]) => `${X(d).toFixed(1)},${Y(v).toFixed(1)}`).join(" L"); s += `<path d="M${X(run[0][0]).toFixed(1)},${base} L${pts} L${X(run[run.length - 1][0]).toFixed(1)},${base} Z" fill="#e4d8bb" opacity=".8"/><path d="M${pts}" fill="none" stroke="#25211a" stroke-width="2.1" stroke-linejoin="round"/>`; } else if (run.length === 1) s += `<circle cx="${X(run[0][0])}" cy="${Y(run[0][1])}" r="1.6" fill="#25211a"/>`; run = []; };
  for (let i = 0; i < p.n; i++) { if (p.v[i] == null) flush(); else run.push([p.d[i], p.v[i]]); }
  flush();
  // sides compared / steepest stretch
  for (const L of an.levels) s += `<line x1="${X(L.d0)}" x2="${X(L.d1)}" y1="${Y(L.v)}" y2="${Y(L.v)}" stroke="#a81d15" stroke-width="1.6" stroke-dasharray="5 3"/>`;
  if (an.band) s += `<rect x="${X(an.band[0])}" y="${m.t}" width="${Math.max(2, X(an.band[1]) - X(an.band[0]))}" height="${ph}" fill="#d5251b" opacity=".10"/><text x="${X(an.band[1]) + 4}" y="${m.t + 13}" text-anchor="start" font-size="11" font-weight="700" fill="#a81d15">500 m</text>`;
  // the line
  let labelEnd = -99;
  for (const c of an.cross) {
    const x = X(c.d);
    s += `<line x1="${x}" x2="${x}" y1="${m.t - 6}" y2="${m.t + ph}" stroke="#d5251b" stroke-width="3" ${c.measured ? "" : 'stroke-dasharray="6 4"'}/>`;
    const text = `the line${c.measured ? "" : ` (${DASHED[kind]})`}`, tw = text.length * 6.6;
    const left = x + 6 + tw > w - 4, x0 = left ? x - 6 - tw : x + 6;
    if (x0 > labelEnd + 8 && x0 > 2) { s += `<text x="${left ? x - 6 : x + 6}" y="${m.t - 11}" text-anchor="${left ? "end" : "start"}" font-size="12" font-weight="800" fill="#a81d15">${text}</text>`; labelEnd = x0 + tw; }
  }
  for (const L of an.levels) { const xm = (X(L.d0) + X(L.d1)) / 2; s += `<text x="${xm}" y="${Y(L.v) + (L.v >= (hi + lo) / 2 ? 16 : -7)}" text-anchor="middle" font-size="12" font-weight="800" fill="#a81d15" style="paint-order:stroke;stroke:#fbf7ec;stroke-width:4px">${fmt(lab, L.v, true)}</text>`; }
  // axis, A and B
  const km = p.len / 1000, stepKm = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20].find((q) => km / q <= 5) ?? 20;
  s += `<line x1="${m.l}" x2="${w - m.r}" y1="${m.t + ph}" y2="${m.t + ph}" stroke="#25211a" stroke-width="1.4"/>`;
  for (let t = stepKm; t < km - stepKm * 0.25; t += stepKm) s += `<line x1="${X(t * 1000)}" x2="${X(t * 1000)}" y1="${m.t + ph}" y2="${m.t + ph + 5}" stroke="#25211a"/><text x="${X(t * 1000)}" y="${m.t + ph + 18}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#6b6354">${+t.toFixed(2)} km</text>`;
  const disc = (x, ch, anchor, who) => `<circle cx="${x}" cy="${m.t + ph + 24}" r="9.5" fill="#25211a"/><text x="${x}" y="${m.t + ph + 28.2}" text-anchor="middle" font-size="12" font-weight="800" style="fill:#fff">${ch}</text><text x="${anchor === "start" ? x + 14 : x - 14}" y="${m.t + ph + 28.2}" text-anchor="${anchor}" font-size="12" font-weight="700">${who}</text>`;
  s += disc(m.l + 10, "A", "start", compass(p.A, p.B)) + disc(w - m.r - 10, "B", "end", compass(p.B, p.A));
  const q4 = Math.max(2, Math.floor(p.n / 4)), minOf = (a) => Math.min(0.0001, ...a.filter((x) => x != null)), leftBad = minOf(p.v.slice(0, q4)) < 0, rightBad = minOf(p.v.slice(-q4)) < 0, zl = leftBad && !rightBad ? [w - m.r - 2, "end"] : rightBad && !leftBad ? [m.l + 4, "start"] : [w - m.r - 2, "end"];
  if (kind === "rupture") s += `<text x="${zl[0]}" y="${Y(0) + 13}" text-anchor="${zl[1]}" font-size="11" font-weight="600" fill="#6b6354">0 = no motion</text>`;
  if (kind === "bend") s += `<text x="${zl[0]}" y="${Y(0) + 13}" text-anchor="${zl[1]}" font-size="11" font-weight="600" fill="#6b6354">0 = stable ground</text>`;
  if (kind === "front") s += `<text x="${m.l + 4}" y="${Y(1) + 13}" font-size="11" font-weight="600" fill="#6b6354">1 = same surface</text><text x="${m.l + 4}" y="${Y(0) - 5}" font-size="11" font-weight="600" fill="#6b6354">0 = no match</text>`;
  s += `<g class="cursor" visibility="hidden"><line y1="${m.t}" y2="${m.t + ph}" stroke="#25211a" stroke-width="1"/><circle r="4.5" fill="#fff" stroke="#25211a" stroke-width="2"/></g></svg>`;
  return { svg: s, m, w, h, ph, pw, dAt: (x) => Math.max(0, Math.min(p.len, ((x - m.l) / pw) * p.len)), X, Y };
}
