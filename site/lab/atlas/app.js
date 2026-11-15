// Atlas: paper street-atlas page for one event (?e=<slug>). Everything drawn comes from ../data/<slug>/ at run time.
import { createMap, FONT } from "./map.js";
import { loadSignal, profile, crossings, analyse, plot, compass } from "./cut.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const EVENTS = [["kumamoto-quake", "Kumamoto"], ["mexico-city-subsidence", "Mexico City"], ["etna-eruption", "Etna"]];
const q = new URLSearchParams(location.search);
const slug = EVENTS.some((e) => e[0] === q.get("e")) ? q.get("e") : "kumamoto-quake";
const dataBase = new URL(`../data/${slug}/`, location.href), eventBase = new URL(`../../events/${slug}/`, location.href);
const getJson = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); };
const loadImg = (u) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(String(u))); i.src = u; });
const SVGNS = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}, parent) => { const n = document.createElementNS(SVGNS, name); for (const k in attrs) n.setAttribute(k, attrs[k]); parent?.appendChild(n); return n; };
const fmtDist = (m) => (m >= 950 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);
const isWide = () => matchMedia("(min-width: 980px)").matches;

$("#events").innerHTML = EVENTS.map(([s, n]) => `<a href="?e=${s}"${s === slug ? " aria-current=page" : ""}>${n}</a>`).join("");

const lab = await getJson(new URL("lab.json", dataBase));
const { nx: NX, ny: NY, dx: DX } = lab.grid;
const kind = lab.line.kind;
document.title = `${lab.name} · Atlas · groundstory`;
$("#title").textContent = lab.name;
$("#meta").textContent = `${lab.date ? lab.date + " · " : ""}${lab.focus.label} · NISAR radar, provisional`;
const LEDE = {
  rupture: "where the ground broke and one side slid past the other. Cut across it to see the step the radar measured.",
  bend: "where the sinking rate changes over a short distance, which is what cracks streets. Cut across it to see the slope.",
  front: "where the radar stopped matching itself between two passes. Cut across it to see the drop.",
}[kind];
$("#lede").innerHTML = `The <span class="redword">red line</span> is ${esc(lab.line.name)}: ${LEDE}`;
const ANNOT = {
  rupture: { solid: "radar sees the step", dashed: "surveyed; radar has no reading" },
  bend: { solid: "radar sees the ground bend", dashed: "edge of the sinking ground; too gentle to measure" },
  front: { solid: "radar lost its match", dashed: "weaker loss: lava, or noise" },
}[kind];
{ const sent = lab.line.caveat.split(/(?<=\.)\s/), keep = [sent[0], ...sent.slice(1).filter((x) => /\bstory\b/i.test(x))]; $("#firstcaveat").textContent = keep.join(" "); }
$("#caveat").textContent = lab.line.caveat;
$("#line-key").innerHTML = `<b style="color:var(--red-dark)">Solid red line:</b> ${esc(lab.line.measured_means)}.<br><b style="color:var(--red-dark)">Dashed red line:</b> ${esc(lab.line.dashed_means)}.`;
{
  const nisar = "NISAR: NASA/JPL-Caltech and ISRO, provisional L2 GUNW via the Alaska Satellite Facility DAAC.";
  const dem = "Terrain: Copernicus GLO-30 DEM © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA, via AWS Open Data.";
  const rest = lab.credits.filter((c) => !/^(Radar|Relief)/.test(c));
  $("#credits").innerHTML = [nisar, ...rest, dem].map(esc).join(" · ");
}
if (lab.headline) {
  $("#headline").hidden = false;
  $("#hl-value").textContent = lab.headline.value; $("#hl-cap").textContent = lab.headline.caption; $("#hl-src").textContent = `Source: ${lab.headline.source}`;
}

// ---------- map ----------
const atlas = (window.atlas = { lab });
const root = $("#map");
const strokeSpots = () => { // points along a drawn cut, so words are not written across it
  const c = atlas.cutState; if (!c) return [];
  const a = atlas.map.project(...c.A), b = atlas.map.project(...c.B), n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 12)), out = [];
  for (let i = 0; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, 4]);
  return out;
};
const pinSpots = () => (atlas.items ?? []).map((it) => { const [x, y] = atlas.map.project(it.s.X, it.s.Y); return [x, y, it.site ? 6 : 13]; }).concat(strokeSpots());
const uiRects = () => { const mb = $(".mapbtns").getBoundingClientRect(), mr = root.getBoundingClientRect(); return [[mb.left - mr.left - 4, mb.top - mr.top - 4, mb.right - mr.left + 4, mb.bottom - mr.top + 4]]; };
const map = createMap(root, $("#base"), lab, { annotate: ANNOT, avoid: pinSpots, reserved: uiRects });
atlas.map = map;
map.resize();
document.fonts.load(`700 14px "Public Sans"`).then(() => map.draw());
const loading = $("#loading");
const marks = {};
const lineP = getJson(new URL("line.json", dataBase)).then((lj) => { map.setLine(lj); marks.line = performance.now(); return lj; });
const baseP = getJson(new URL("basemap.json", dataBase)).then((b) => { map.setBasemap(b); loading.remove(); marks.base = performance.now(); });
const reliefP = loadImg(new URL(lab.files.hillshade, dataBase)).then((i) => { map.setRelief(i); marks.relief = performance.now(); });
const seaP = lab.sea.present ? loadImg(new URL(lab.files.sea, dataBase)).then((i) => map.setSea(i)) : Promise.resolve();
Promise.allSettled([lineP, baseP, reliefP, seaP]).then(() => {
  const bytes = performance.getEntriesByType("resource").reduce((a, r) => a + (r.encodedBodySize || 0), 0);
  document.body.dataset.payload = String(bytes); document.body.dataset.ready = "1"; atlas.payloadBytes = bytes;
});

// ---------- stories ----------
const all = lab.stories.map((s) => ({ ...s, X: s.u * NX, Y: s.v * NY }));
const stories = all.filter((s) => s.kind === "story").sort((a, b) => a.n - b.n);
const sites = all.filter((s) => s.kind === "site");
const canCut = (s) => s.kind === "site" || s.on_line || s.distance_m < 2500;
let lineRuns = [];
const toCellsRuns = (lj) => lj.runs.map((r, i) => ({ measured: r.measured, closed: lj.lines.length === lj.runs.length && !!lj.lines[i].closed, pts: r.points.map((p) => [p[0] * NX, p[1] * NY]) }));
const lj = await lineP;
lineRuns = toCellsRuns(lj);
const tangent = (X, Y) => { // direction of the line at the nearest point (cells)
  let best = { d: 1e9, t: [0, 1] };
  for (const r of lineRuns) for (let i = 1; i < r.pts.length; i++) {
    const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i], sx = bx - ax, sy = by - ay, L2 = sx * sx + sy * sy || 1e-9;
    const t = Math.max(0, Math.min(1, ((X - ax) * sx + (Y - ay) * sy) / L2)), d = Math.hypot(ax + sx * t - X, ay + sy * t - Y);
    if (d < best.d) best = { d, t: [sx / Math.sqrt(L2), sy / Math.sqrt(L2)] };
  }
  return best.t;
};
for (const s of all) s.tan = tangent(s.X, s.Y);
for (const s of stories) { // an on-line pin sits beside the line (true spot = small dot) so it does not hide it
  const nrm = [-s.tan[1], s.tan[0]]; if (nrm[0] < -1e-6 || (Math.abs(nrm[0]) < 1e-6 && nrm[1] < 0)) { nrm[0] = -nrm[0]; nrm[1] = -nrm[1]; }
  s.side = nrm;
}

// ---------- overlay: pins, labels, cut stroke ----------
const over = $("#over");
const gLeaders = el("g", {}, over), gLabels = el("g", {}, over), gCut = el("g", {}, over), gTicks = el("g", {}, over), gPins = el("g", {}, over);
const mctx = document.createElement("canvas").getContext("2d");
const textW = (t, fs, wt) => { mctx.font = `${wt} ${fs}px ${FONT}`; return mctx.measureText(t).width; };
const items = (atlas.items = []);
for (const s of [...stories, ...sites]) {
  const it = { s, on: !!s.on_line, site: s.kind === "site" };
  if (!it.site) {
    it.pin = el("g", { class: "pin", tabindex: 0, role: "button", "aria-label": `Story ${s.n}: ${s.short}. Go to the card.` }, gPins);
    it.stem = el("line", { stroke: "#25211a", "stroke-width": 1.5 }, gLeaders);
    it.dot = el("circle", { r: 2.6, fill: "#25211a" }, gLeaders);
    it.shape = s.on_line ? el("circle", { r: 12.5 }, it.pin) : el("rect", { x: -11.5, y: -11.5, width: 23, height: 23, rx: 2 }, it.pin);
    it.shape.setAttribute("fill", "#25211a"); it.shape.setAttribute("stroke", "#fffdf6"); it.shape.setAttribute("stroke-width", 2.4);
    const t = el("text", { "text-anchor": "middle", y: 4.6, "font-size": 13, "font-weight": 800, fill: "#fff" }, it.pin); t.textContent = s.n;
    el("circle", { r: 21, fill: "transparent" }, it.pin);
    it.lab = el("g", { class: "pin", tabindex: -1 }, gLabels);
    it.leader = el("line", { stroke: "#25211a", "stroke-width": 1.3 }, gLeaders);
    it.rect = el("rect", { fill: "#fffdf6", stroke: "#25211a", "stroke-width": 1.3, rx: 2, opacity: 0.97 }, it.lab);
    it.text = el("text", { "font-size": 12.5, "font-weight": 700, fill: "#25211a" }, it.lab); it.text.textContent = s.short;
    it.w = textW(s.short, 12.5, 700) + 14; it.h = 24;
  } else {
    it.pin = el("g", { class: "tick", tabindex: 0, role: "button", "aria-label": `${s.short}, field survey. Go to the list.` }, gTicks);
    el("line", { x1: -10 * s.tan[1], y1: 10 * s.tan[0], x2: 10 * s.tan[1], y2: -10 * s.tan[0], stroke: "#fffdf6", "stroke-width": 6, "stroke-linecap": "butt" }, it.pin);
    el("line", { x1: -10 * s.tan[1], y1: 10 * s.tan[0], x2: 10 * s.tan[1], y2: -10 * s.tan[0], stroke: "#25211a", "stroke-width": 2.6, "stroke-linecap": "butt" }, it.pin);
    el("circle", { r: 16, fill: "transparent" }, it.pin);
    it.text = el("text", { "font-size": 11, "font-weight": 700, fill: "#25211a", stroke: "rgba(251,246,232,.95)", "stroke-width": 3.5, "paint-order": "stroke", "stroke-linejoin": "round" }, gLabels);
    it.text.textContent = s.short; it.w = textW(s.short, 11, 700) + 2; it.h = 14; it.lab = it.text;
  }
  const go = () => goCard(s);
  it.pin.addEventListener("click", go); it.pin.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  if (!it.site) it.lab.addEventListener("click", go);
  it.pin.addEventListener("pointerenter", () => hot(s, true)); it.pin.addEventListener("pointerleave", () => hot(s, false));
  items.push(it);
}
const cardOf = (s) => document.getElementById(s.kind === "site" ? `site-${s.id}` : `story-${s.n}`);
function hot(s, on) { cardOf(s)?.classList.toggle("hot", on); }
function goCard(s) {
  const c = cardOf(s); if (!c) return;
  c.scrollIntoView({ behavior: "smooth", block: "center" }); c.classList.add("flash"); setTimeout(() => c.classList.remove("flash"), 2200);
}

let committed = null; // the cut the section panel is showing
let cached = new Map(); // id -> label offset, kept while panning
let relayout = 0, cutState = null, scrubD = null;
const setCutState = (c) => { cutState = c; atlas.cutState = c; };
const hits = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
function layoutOverlay(full) {
  const [W, H] = map.size(), ob = map.obstacles(), sp = strokeSpots();
  const vis = [];
  for (const it of items) {
    const [x, y] = map.project(it.s.X, it.s.Y);
    it.x = x; it.y = y; it.vis = x > 9 && x < W - 9 && y > 9 && y < H - 9;
    if (it.vis) vis.push(it);
  }
  // keep pin discs apart; the true spot keeps a small dot
  const discs = vis.filter((i) => !i.site);
  discs.forEach((i) => { const o = i.s.on_line ? 19 : 0; i.px = i.x + (i.s.side?.[0] ?? 0) * o; i.py = i.y + (i.s.side?.[1] ?? 0) * o; });
  for (let k = 0; k < 14; k++) for (let a = 0; a < discs.length; a++) for (let b = a + 1; b < discs.length; b++) {
    const A = discs[a], B = discs[b]; let dx = B.px - A.px, dy = B.py - A.py, d = Math.hypot(dx, dy);
    if (d < 27) { if (d < 0.01) { dx = 1; dy = 0.2; d = 1; } const m = (27 - d) / 2; A.px -= (dx / d) * m; A.py -= (dy / d) * m; B.px += (dx / d) * m; B.py += (dy / d) * m; }
  }
  for (const it of items) {
    if (!it.vis) { it.pin.style.display = "none"; if (it.lab) it.lab.style.display = "none"; if (it.leader) it.leader.style.display = "none"; if (it.stem) { it.stem.style.display = "none"; it.dot.style.display = "none"; } continue; }
    it.pin.style.display = ""; if (it.site) it.pin.setAttribute("transform", `translate(${it.x} ${it.y})`);
    else {
      it.pin.setAttribute("transform", `translate(${it.px} ${it.py})`);
      const moved = Math.hypot(it.px - it.x, it.py - it.y) > 4;
      it.dot.style.display = moved ? "" : "none"; it.stem.style.display = moved ? "" : "none";
      it.dot.setAttribute("cx", it.x); it.dot.setAttribute("cy", it.y);
      for (const [k, v] of Object.entries({ x1: it.x, y1: it.y, x2: it.px, y2: it.py })) it.stem.setAttribute(k, v);
    }
  }
  // labels
  const mb = $(".mapbtns").getBoundingClientRect(), mr = root.getBoundingClientRect();
  const ui = [[mb.left - mr.left - 4, mb.top - mr.top - 4, mb.right - mr.left + 4, mb.bottom - mr.top + 4]];
  if (!banner.hidden) { const bb = banner.getBoundingClientRect(); ui.push([bb.left - mr.left, bb.top - mr.top, bb.right - mr.left, bb.bottom - mr.top]); }
  const placed = [], discBoxes = discs.map((i) => [i.px - 14, i.py - 14, i.px + 14, i.py + 14]);
  vis.filter((i) => i.site).forEach((i) => discBoxes.push([i.x - 11, i.y - 11, i.x + 11, i.y + 11]));
  const order = [...vis].sort((a, b) => (a.site - b.site) || (b.on - a.on) || (a.s.n ?? 99) - (b.s.n ?? 99));
  for (const it of order) {
    const cx = it.site ? it.x : it.px, cy = it.site ? it.y : it.py, r = it.site ? 8 : 13, { w, h } = it;
    const boxAt = (ox, oy) => [cx + ox - w / 2, cy + oy - h / 2, cx + ox + w / 2, cy + oy + h / 2];
    let pick = null;
    const prev = cached.get(it.s.id);
    const cands = [];
    if (prev && !full) cands.push({ ox: prev.ox, oy: prev.oy, keep: true });
    else {
      const dists = it.site ? [r + 6, r + 18, r + 36] : [r + 6, r + 26, r + 52, r + 84];
      for (const d of dists) for (let a = 0; a < 16; a++) {
        const th = (a * Math.PI) / 8, ox = Math.cos(th) * (w / 2 + d), oy = Math.sin(th) * (h / 2 + d);
        cands.push({ ox, oy, d, th });
      }
    }
    if (it.site && map.view.s < 2.2) { it.lab.style.display = "none"; continue; } // too small to write beside the tick
    let bestScore = 1e9;
    for (const c of cands) {
      const b = boxAt(c.ox, c.oy);
      let sc = (c.d ?? 0) * 0.8 + (c.th != null && Math.abs(Math.sin(c.th)) > 0.9 ? 6 : 0);
      if (b[0] < 6 || b[2] > W - 6 || b[1] < 6 || b[3] > H - 6) sc += 1e5;
      for (const p of placed) if (hits(b, p)) sc += 1e4;
      for (const d of discBoxes) if (hits(b, d) && !(Math.abs(d[0] + 14 - cx) < 1 && Math.abs(d[1] + 14 - cy) < 1)) sc += 1e4;
      for (const n of ob.notes) if (hits(b, n)) sc += 1e4;
      for (const n of ui) if (hits(b, n)) sc += 1e4;
      for (const n of ob.names) if (hits(b, n)) sc += 400;
      for (const p of sp) if (p[0] > b[0] - 2 && p[0] < b[2] + 2 && p[1] > b[1] - 2 && p[1] < b[3] + 2) sc += it.site ? 30 : 25;
      let onLine = 0; for (const p of ob.line) if (p[0] > b[0] - 1 && p[0] < b[2] + 1 && p[1] > b[1] - 1 && p[1] < b[3] + 1) onLine++;
      sc += onLine * (it.site ? 16 : 25);
      if (sc < bestScore) { bestScore = sc; pick = { ...c, b }; }
    }
    if (!pick || (it.site && bestScore >= 1e4)) { it.lab.style.display = "none"; if (it.leader) it.leader.style.display = "none"; cached.delete(it.s.id); continue; }
    if (full || !prev) cached.set(it.s.id, { ox: pick.ox, oy: pick.oy });
    placed.push(pick.b);
    const [bx0, by0, bx1, by1] = pick.b;
    it.lab.style.display = "";
    if (it.site) { it.text.setAttribute("x", bx0 + 1); it.text.setAttribute("y", by0 + 11); continue; }
    it.rect.setAttribute("x", bx0); it.rect.setAttribute("y", by0); it.rect.setAttribute("width", w); it.rect.setAttribute("height", h);
    it.text.setAttribute("x", bx0 + 7); it.text.setAttribute("y", by0 + 16.5);
    const lx = Math.max(bx0, Math.min(bx1, cx)), ly = Math.max(by0, Math.min(by1, cy));
    const dd = Math.hypot(lx - cx, ly - cy);
    it.leader.style.display = dd > r + 2 ? "" : "none";
    const ux = (lx - cx) / (dd || 1), uy = (ly - cy) / (dd || 1);
    for (const [k, v] of Object.entries({ x1: cx + ux * (r - 1), y1: cy + uy * (r - 1), x2: lx, y2: ly })) it.leader.setAttribute(k, v);
  }
  drawCutStroke();
  noteOutside();
}
function noteOutside() {
  const [W, H] = map.size();
  const out = stories.filter((s) => { const [x, y] = map.project(s.X, s.Y); return !(x > 0 && x < W && y > 0 && y < H); });
  const list = out.map((s) => s.n);
  $("#viewnote").textContent = !list.length ? "" : `Stor${list.length > 1 ? "ies" : "y"} ${list.join(", ")} ${list.length > 1 ? "lie" : "lies"} outside this view. Press “Whole scene” to see ${list.length > 1 ? "them" : "it"}.`;
}
let rafO = 0;
function scheduleOverlay() {
  if (!rafO) rafO = requestAnimationFrame(() => { rafO = 0; layoutOverlay(false); });
  clearTimeout(relayout); relayout = setTimeout(() => layoutOverlay(true), 170);
}
map.on("view", scheduleOverlay);
map.on("draw", () => { clearTimeout(relayout); relayout = setTimeout(() => layoutOverlay(true), 60); });

// ---------- view: focus and whole scene ----------
const inFocus = (X, Y) => X / NX >= lab.focus.u0 && X / NX <= lab.focus.u1 && Y / NY >= lab.focus.v0 && Y / NY <= lab.focus.v1;
function focusRect() { // the part of the focus window worth opening on: what is on the line, the solid line near it, and pins close by
  const f = { x0: lab.focus.u0 * NX, y0: lab.focus.v0 * NY, x1: lab.focus.u1 * NX, y1: lab.focus.v1 * NY };
  const core = all.filter((s) => s.on_line && inFocus(s.X, s.Y));
  if (!core.length) {
    const pts = lineRuns.flatMap((r) => r.pts).filter((p) => inFocus(p[0], p[1]));
    return pts.length ? { bbox: { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) }, f } : { bbox: f, f };
  }
  const R = 2500 / DX, pts = core.map((s) => [s.X, s.Y]);
  for (const r of lineRuns) if (r.measured) for (const p of r.pts) if (inFocus(p[0], p[1]) && core.some((s) => Math.hypot(s.X - p[0], s.Y - p[1]) < R)) pts.push(p);
  const box = () => ({ x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) });
  let bb = box();
  const near = (s) => s.X > bb.x0 - 2000 / DX && s.X < bb.x1 + 2000 / DX && s.Y > bb.y0 - 2000 / DX && s.Y < bb.y1 + 2000 / DX;
  for (const s of all) if (!s.on_line && s.distance_m < 2500 && inFocus(s.X, s.Y) && near(s)) pts.push([s.X, s.Y]);
  bb = box();
  const minSpan = 3200 / DX; // never open tighter than about 3 km
  for (const [lo, hi] of [["x0", "x1"], ["y0", "y1"]]) if (bb[hi] - bb[lo] < minSpan) { const c = (bb[lo] + bb[hi]) / 2; bb[lo] = c - minSpan / 2; bb[hi] = c + minSpan / 2; }
  return { bbox: bb, f };
}
let scene = false;
function showFocus(animate) {
  const [W, H] = map.size(), { bbox, f } = focusRect();
  const pad = 0.14, bw = (bbox.x1 - bbox.x0) * (1 + pad * 2), bh = (bbox.y1 - bbox.y0) * (1 + pad * 2);
  const sFit = Math.min(W / bw, H / bh), sContain = Math.min(W / (f.x1 - f.x0), H / (f.y1 - f.y0)), sCover = Math.max(W / (f.x1 - f.x0), H / (f.y1 - f.y0));
  const s = Math.max(sContain, Math.min(sFit, 9));
  let cx = (bbox.x0 + bbox.x1) / 2, cy = (bbox.y0 + bbox.y1) / 2;
  const vw = W / s, vh = H / s; // keep the view inside the focus window where it fits
  if (vw <= f.x1 - f.x0) cx = Math.max(f.x0 + vw / 2, Math.min(f.x1 - vw / 2, cx));
  if (vh <= f.y1 - f.y0) cy = Math.max(f.y0 + vh / 2, Math.min(f.y1 - vh / 2, cy));
  map.setView({ s, x0: cx - vw / 2, y0: cy - vh / 2 }, animate);
  scene = false; $("#scope").textContent = "Whole scene";
}
function showScene(animate) {
  const [W, H] = map.size(); const s = Math.min(W / NX, H / NY) * 0.98;
  map.setView({ s, x0: NX / 2 - W / 2 / s, y0: NY / 2 - H / 2 / s }, animate);
  scene = true; $("#scope").textContent = "Back to the line";
}
$("#scope").onclick = () => (scene ? showFocus(true) : showScene(true));
$("#zin").onclick = () => map.zoomAt(1.6); $("#zout").onclick = () => map.zoomAt(1 / 1.6);
showFocus(false);
if (q.get("view") === "scene") showScene(false);

// ---------- mode ----------
const banner = $("#banner");
function setMode(m) {
  map.setMode(m);
  $("#m-move").setAttribute("aria-pressed", String(m === "move")); $("#m-cut").setAttribute("aria-pressed", String(m === "cut"));
  banner.hidden = m !== "cut"; banner.style.opacity = 1;
  banner.textContent = cutState ? "Drag again to cut somewhere else." : "Cut mode: drag across the red line, from A to B.";
  clearTimeout(setMode.t); if (cutState && m === "cut") setMode.t = setTimeout(() => (banner.style.opacity = 0), 3500);
}
$("#m-move").onclick = () => setMode("move"); $("#m-cut").onclick = () => setMode("cut");
setMode(q.get("mode") === "cut" ? "cut" : "move");

// ---------- the cut ----------
let signal = null;
const signalP = () => (signal ??= loadSignal(lab, dataBase));
setTimeout(() => signalP().catch((e) => console.error("signal:", e)), 600); // after the map has appeared
const secBody = $("#section-body");
function emptySection() {
  const ex = [...stories, ...sites].find((s) => lab.headline && Math.abs(s.u - lab.headline.u) < 1e-4 && Math.abs(s.v - lab.headline.v) < 1e-4) ?? stories.find((s) => s.on_line) ?? stories[0];
  secBody.innerHTML = `<div class="empty">
    <svg class="ph" viewBox="0 0 300 150" preserveAspectRatio="none" aria-hidden="true"><rect x="1" y="1" width="298" height="148" fill="#f7f1e1" stroke="#d3c8ae" stroke-dasharray="4 4"/><path d="M12 90 H300" stroke="#25211a" stroke-dasharray="3 5" opacity=".4"/><path d="M12 60 C70 56 110 58 150 62 S210 104 288 100" fill="none" stroke="#25211a" stroke-width="2" stroke-dasharray="2 6" opacity=".45"/><line x1="150" y1="14" x2="150" y2="136" stroke="#d5251b" stroke-width="3" opacity=".55"/><text x="156" y="26" font-size="11" font-weight="800" fill="#a81d15">the line</text><circle cx="22" cy="136" r="9" fill="#25211a"/><text x="22" y="140" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">A</text><circle cx="278" cy="136" r="9" fill="#25211a"/><text x="278" y="140" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">B</text></svg>
    <p><b>Cut across the line.</b> Press <b>Cut across it</b> under the map, then drag from A to B over the red line. The radar signal along your stroke is plotted here.</p>
    <p class="small muted">Or use a “cut here” button on a story below.</p>
    ${ex ? `<p><button class="btn red" id="try" type="button">Try it: cut at “${esc(ex.short)}”</button></p>` : ""}</div>`;
  $("#try")?.addEventListener("click", () => presetCut(ex, true));
}
emptySection();

function toUV(c) { return [c[0] / NX, c[1] / NY]; }
function drawCutStroke() {
  gCut.replaceChildren();
  if (!cutState) return;
  const a = map.project(...cutState.A), b = map.project(...cutState.B);
  el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: "#fffdf6", "stroke-width": 7, "stroke-linecap": "round" }, gCut);
  el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: "#25211a", "stroke-width": 2.6, "stroke-dasharray": "7 5", "stroke-linecap": "butt" }, gCut);
  for (const [p, ch] of [[a, "A"], [b, "B"]]) {
    el("circle", { cx: p[0], cy: p[1], r: 11, fill: "#25211a", stroke: "#fffdf6", "stroke-width": 2 }, gCut);
    const t = el("text", { x: p[0], y: p[1] + 4.4, "text-anchor": "middle", "font-size": 12.5, "font-weight": 800, fill: "#fff" }, gCut); t.textContent = ch;
  }
  if (scrubD != null && cutState.len) {
    const t = scrubD / cutState.len, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    el("circle", { cx: x, cy: y, r: 6, fill: "#fff", stroke: "#d5251b", "stroke-width": 3 }, gCut);
  }
}
let curPlot = null, curProf = null, curAn = null;
async function runCut(A, B, label) {
  setCutState({ A, B, len: Math.hypot(B[0] - A[0], B[1] - A[1]) * DX, label }); committed = cutState;
  drawCutStroke(); setMode(root.dataset.mode); map.draw();
  secBody.innerHTML = `<p class="muted">Reading the radar layer…</p>`;
  let S; try { S = await signalP(); } catch (e) { secBody.innerHTML = `<p>Could not load the radar layer (${esc(e.message)}).</p>`; return; }
  if (cutState.A !== A) return; // a newer cut replaced this one
  const p = profile(S, lab, A, B), cross = crossings(lineRuns, A, B, DX), an = analyse(lab, p, cross);
  curProf = p; curAn = an;
  const km = p.len / 1000;
  secBody.innerHTML = `<p class="small cutmeta">${esc(label)} · A (${compass(A, B)}) to B · ${km.toFixed(1)} km · NISAR radar, provisional</p>
    <p class="sentence">${an.text}</p>
    <p class="small ytitle"><b>${esc(lab.signal.label)}</b>${kind === "front" ? " (0 to 1)" : ", " + esc(lab.signal.unit)}</p>
    <div class="plotwrap" id="plotwrap"></div>
    <p class="small muted plotnote">Black: the radar signal along the stroke. Hatched: no reading, so nothing is drawn there. Red bar: where the stroke crosses the line (dashed where the line is dashed on the map). ${kind === "bend" ? "Pink band: the steepest 500 m of the stroke." : "Dashed red levels: the middle reading 150 m to 1.2 km either side of the line."} Reading noise is about ±${lab.signal.noise}${kind === "front" ? "" : " " + (kind === "bend" ? "cm a year" : "cm")}.</p>
    <p class="acts2"><button class="btn" id="seemap" type="button">See it on the map</button> <button class="btn ghost" id="clear" type="button">Clear the cut</button></p>
    <script type="application/json" id="cut-data"></script>`;
  mountPlot();
  $("#seemap").onclick = () => root.scrollIntoView({ behavior: "smooth", block: "start" });
  $("#clear").onclick = () => { committed = null; setCutState(null); curPlot = null; emptySection(); drawCutStroke(); setMode(root.dataset.mode); map.draw(); };
  const keep = []; for (let i = 0; i < p.n; i += Math.max(1, Math.round(100 / 25))) keep.push([Math.round(p.d[i]), p.v[i] == null ? null : +p.v[i].toFixed(3)]);
  $("#cut-data").textContent = JSON.stringify({ A: toUV(A), B: toUV(B), len_m: Math.round(p.len), crossings: cross, text: an.text.replace(/<[^>]+>/g, ""), facts: an.facts, samples: keep });
  document.body.dataset.cut = "1";
  atlas.lastCut = { p, an, cross };
}
function mountPlot() {
  const wrap = $("#plotwrap"); if (!wrap || !curProf) return;
  curPlot = plot(lab, curProf, curAn, wrap.clientWidth || 340);
  wrap.innerHTML = curPlot.svg;
  const svg = wrap.querySelector("svg"), cur = svg.querySelector(".cursor");
  const move = (e) => {
    const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * curPlot.w, d = curPlot.dAt(x);
    const i = Math.min(curProf.n - 1, Math.round((d / curProf.len) * (curProf.n - 1))), v = curProf.v[i];
    scrubD = d; drawCutStroke();
    cur.setAttribute("visibility", "visible"); cur.setAttribute("transform", `translate(${curPlot.X(d)} 0)`);
    cur.querySelector("circle").setAttribute("cy", v == null ? curPlot.m.t + curPlot.ph : curPlot.Y(v));
    let tip = svg.querySelector(".tip"); tip?.remove();
    tip = el("text", { class: "tip", x: Math.min(curPlot.w - 6, Math.max(6, curPlot.X(d))), y: curPlot.m.t + 12, "text-anchor": curPlot.X(d) > curPlot.w - 90 ? "end" : curPlot.X(d) < 90 ? "start" : "middle", "font-size": 12, "font-weight": 800, style: "paint-order:stroke;stroke:#fbf7ec;stroke-width:4px" }, svg);
    tip.textContent = `${(d / 1000).toFixed(2)} km: ${v == null ? "no reading" : (kind === "front" ? v.toFixed(2) : v.toFixed(1) + (kind === "bend" ? " cm a year" : " cm")).replace("-", "−")}`;
  };
  const leave = () => { scrubD = null; drawCutStroke(); cur.setAttribute("visibility", "hidden"); svg.querySelector(".tip")?.remove(); };
  svg.addEventListener("pointermove", move); svg.addEventListener("pointerdown", move); svg.addEventListener("pointerleave", leave);
}
let rt = 0; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(mountPlot, 150); });

map.on("cut", ({ A, B, final, tooShort }) => {
  if (!final) { setCutState({ A, B, len: Math.hypot(B[0] - A[0], B[1] - A[1]) * DX, label: "" }); drawCutStroke(); return; }
  if (tooShort) { setCutState(committed); drawCutStroke(); banner.textContent = "Too short: drag further, across the red line."; return; }
  runCut(A, B, "Cut you drew");
});

function presetCut(s, scroll) {
  const A = [s.cut[0][0] * NX, s.cut[0][1] * NY], B = [s.cut[1][0] * NX, s.cut[1][1] * NY];
  const [W, H] = map.size(), pa = map.project(...A), pb = map.project(...B), ps = map.project(s.X, s.Y);
  const inside = [pa, pb, ps].every((p) => p[0] > 30 && p[0] < W - 30 && p[1] > 30 && p[1] < H - 30);
  if (!inside) {
    const r = { x0: Math.min(A[0], B[0], s.X), y0: Math.min(A[1], B[1], s.Y), x1: Math.max(A[0], B[0], s.X), y1: Math.max(A[1], B[1], s.Y) };
    const m = 1500 / DX; // bring in pins close to the stroke too, so the neighbours stay in view
    for (const o of all) if (o.X > r.x0 - m && o.X < r.x1 + m && o.Y > r.y0 - m && o.Y < r.y1 + m && (o.on_line || o.distance_m < 2500)) { r.x0 = Math.min(r.x0, o.X); r.x1 = Math.max(r.x1, o.X); r.y0 = Math.min(r.y0, o.Y); r.y1 = Math.max(r.y1, o.Y); }
    map.fitRect(r, 56, true, undefined, 9);
  }
  scene = false; $("#scope").textContent = "Whole scene";
  const via = s.cut_through === "the story" ? `through ${s.short}` : `through the nearest point of the line, ${fmtDist(s.distance_m)} from ${s.short}`;
  runCut(A, B, `Cut ${via}`);
  if (scroll) requestAnimationFrame(() => $("#section").scrollIntoView({ behavior: "smooth", block: isWide() ? "nearest" : "start" }));
}

// ---------- cards ----------
const stJ = await getJson(new URL("stories.json", eventBase)).catch(() => null);
const byId = new Map((stJ?.items ?? []).map((i) => [i.id, i]));
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "the source"; } };
if (stJ?.boundary) { $("#boundary").textContent = stJ.boundary; $("#bound-d").hidden = false; }
const photo = (it) => {
  if (!it) return "";
  if (it.show_image) return `<a href="${esc(it.page_url)}" target="_blank" rel="noopener"><img src="${esc(it.image_url)}" alt="${esc(it.what_it_shows)}" loading="lazy" referrerpolicy="no-referrer"></a>`;
  if (it.preview_url) return `<a href="${esc(it.page_url)}" target="_blank" rel="noopener"><img class="pix" src="${esc(new URL(it.preview_url, eventBase).href)}" alt="${esc(it.what_it_shows)}" loading="lazy"></a>
    <p class="small muted">Pixelated preview — <a href="${esc(it.page_url)}" target="_blank" rel="noopener">view original at ${esc(it.credit || host(it.page_url))}</a></p>`;
  return "";
};
const source = (it) => (it ? `<p class="small muted"><a href="${esc(it.page_url)}" target="_blank" rel="noopener">Source</a> · ${esc(it.credit)}${it.show_image ? ` · ${esc(it.licence)}` : ""}</p>` : "");
if (stories.length) {
  $("#stories-sec").hidden = false;
  $("#cards").innerHTML = stories.map((s) => {
    const it = byId.get(s.id), tag = s.on_line ? `<span class="tag on">on the line</span>` : `<span class="tag off">off the line, ${fmtDist(s.distance_m)}</span>`;
    return `<article class="card" id="story-${s.n}" tabindex="-1">
  <div class="row"><span class="badge${s.on_line ? "" : " sq"}">${s.n}</span>${tag}</div>
  <h3>${esc(it?.title ?? s.title)}</h3>
  ${it ? `<p class="small muted place">${esc(it.place)} · ${esc(it.date)}</p>` : ""}
  ${photo(it)}
  <p class="grow">${esc(it?.caption || it?.what_it_shows || "")}</p>
  <p class="radar"><b>NISAR (provisional):</b> ${esc(s.radar)}</p>
  ${!s.on_line && s.distance_m >= 600 ? `<p class="why">The line is ${fmtDist(s.distance_m)} from here. <a href="#caveat-sec">Why this matters</a>.</p>` : ""}
  ${source(it)}
  <div class="acts">${canCut(s) ? `<button class="btn red cut-btn" type="button" data-id="${esc(s.id)}">✂ Cut here</button>` : `<span class="small muted">Too far from the line for a preset cut: draw your own.</span>`}
  <button class="btn ghost loc-btn" type="button" data-id="${esc(s.id)}">Show on map</button></div>
</article>`;
  }).join("");
}
if (sites.length) {
  $("#sites-sec").hidden = false;
  $("#sites").innerHTML = sites.map((s) => `<div class="site" id="site-${esc(s.id)}">
  <p><b>${esc(s.short)}</b></p><p class="small muted">${esc(s.value)} · ${esc(s.source)} · location ${esc(s.location_confidence)}<br>${esc(s.radar)}</p>
  <div class="acts"><button class="btn red cut-btn" type="button" data-id="${esc(s.id)}">✂ Cut here</button></div></div>`).join("");
}
document.querySelectorAll(".card img").forEach((img) => img.addEventListener("error", () => {
  const link = img.closest("a")?.href; img.closest("a")?.replaceWith(Object.assign(document.createElement("p"), { className: "small muted", innerHTML: `Photo unavailable here: <a href="${esc(link)}" target="_blank" rel="noopener">view it at the source</a>.` }));
}, { once: true }));
const byStory = new Map(all.map((s) => [s.id, s]));
document.addEventListener("click", (e) => {
  const c = e.target.closest(".cut-btn"); if (c) { presetCut(byStory.get(c.dataset.id), true); return; }
  const l = e.target.closest(".loc-btn");
  if (l) { const s = byStory.get(l.dataset.id); map.fitRect({ x0: s.X - 60, x1: s.X + 60, y0: s.Y - 45, y1: s.Y + 45 }, 20, true, undefined, 9); root.scrollIntoView({ behavior: "smooth", block: "start" }); }
});

// ---------- deep link for checking: ?cut=<n | story id | site id> or ?cut=u1,v1,u2,v2 ----------
const want = q.get("cut");
if (want) {
  if (want.includes(",")) { const [a, b, c, d] = want.split(",").map(Number); runCut([a * NX, b * NY], [c * NX, d * NY], "Cut from the link"); }
  else { const s = all.find((x) => String(x.n) === want || x.id === want || x.id.endsWith(want)); if (s) presetCut(s, false); }
}
Object.assign(atlas, { runCut, presetCut });
