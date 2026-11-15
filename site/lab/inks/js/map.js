// The poster map: a 2D canvas for paper, sea, dots and roads (redrawn for every view, so it is crisp at any zoom),
// an SVG layer for the red line, names, pins and the cut, and the pointer handling (move: pan and pinch; cut: draw A to B).
import { sampleLevel } from "./data.js";

export const INK = { paper: "#efe6d2", ink: "#15120f", red: "#e3241b", yellow: "#ffb703", blue: "#1c3f99", sea: "#cdd9d3", water: "#9fb5b0", muted: "#5d5446" };
const NS = "http://www.w3.org/2000/svg";
const el = (n, a = {}, p) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (p) p.append(e); return e; };
const RANK = { city: 0, town: 1, suburb: 2, village: 3 };
const ROAD_W = { motorway: 3.4, trunk: 2.6, primary: 1.8, secondary: 1.3, tertiary: 1 };
const ZMAX = 14;

export function createMap({ box, canvas, svg, leader, anchor, ev, getT, onCut, onPin, onHeadlineAway }) {
  const ctx = canvas.getContext("2d");
  const { nx, ny } = ev, lab = ev.lab, focus = lab.focus;
  let W = 0, H = 0, dpr = 1, view = { cx: nx / 2, cy: ny / 2, z: 1 }, mode = "move", cut = null, selected = null, fitState = "focus", moved = false, anim = 0, scrub = null;
  const m2 = document.createElement("canvas"), m2c = m2.getContext("2d");
  const meas = document.createElement("canvas").getContext("2d");
  const textW = (s, font, ls = 0) => { meas.font = font; return meas.measureText(s).width + ls * s.length; };
  const smallScreen = () => W < 520;

  // ---------- SVG scaffolding ----------
  svg.replaceChildren();
  const gLines = el("g", {}, svg), gLineLab = el("g", {}, svg), gPlaces = el("g", { class: "places" }, svg), gPins = el("g", { class: "pins" }, svg), gLabels = el("g", { class: "plabels" }, svg), gCut = el("g", { class: "cut" }, svg), gAway = el("g", { class: "away" }, svg);
  const lineDs = ev.runs.map((r) => ({ m: r.measured, d: "M" + r.pts.map((p) => p[0].toFixed(2) + " " + p[1].toFixed(2)).join("L") }));
  for (const r of lineDs) el("path", { d: r.d, class: "line-casing" }, gLines);
  for (const r of lineDs) el("path", { d: r.d, class: "line-red" + (r.m ? "" : " dashed") }, gLines);
  const lineLab = el("text", { class: "linelabel" }, gLineLab); lineLab.textContent = (lab.line.name || "the line").toUpperCase();
  const places = ev.base.places.slice().sort((a, b) => RANK[a.kind] - RANK[b.kind]).map((p) => {
    const label = (p.name_en || p.name).toUpperCase();
    return { ...p, label, X: p.u * nx, Y: p.v * ny, dot: el("circle", { r: 2.2, class: "pdot" }, gPlaces), t: Object.assign(el("text", { class: "place" }, gPlaces), { textContent: label }) };
  });
  const hu = lab.headline.u * nx, hv = lab.headline.v * ny;
  const pins = lab.stories.map((s) => {
    const site = s.kind === "site", g = el("g", { class: "pin" + (site ? " site" : ""), "data-pin": s.id }, gPins);
    const lead = el("line", { class: "pin-lead" }, g), dot = el("circle", { r: 2.4, class: "pin-dot" }, g);
    const disc = site ? el("rect", { width: 11, height: 11, x: -5.5, y: -5.5, class: "pin-disc", transform: "rotate(45)" }, g) : el("circle", { r: 12.5, class: "pin-disc" }, g);
    const num = site ? null : Object.assign(el("text", { class: "pin-n", "text-anchor": "middle", y: 5 }, g), { textContent: String(s.n) });
    el("circle", { r: 22, class: "pin-hit" }, g);
    const lab2 = Object.assign(el("text", { class: "plabel" }, gLabels), { textContent: s.short.toUpperCase() });
    const head = Math.abs(s.u - lab.headline.u) < 1e-4 && Math.abs(s.v - lab.headline.v) < 1e-4;
    return { s, g, lead, dot, disc, num, label: lab2, r: site ? 7.5 : 12.5, X: s.u * nx, Y: s.v * ny, prio: head ? 0 : s.n ? (s.on_line ? 1 : 2) + s.n / 100 : 3 };
  });
  const cutPath = el("path", { class: "cut-casing" }, gCut), cutLine = el("path", { class: "cut-line" }, gCut);
  const cutA = el("g", { class: "cut-end" }, gCut), cutB = el("g", { class: "cut-end" }, gCut), scrubG = el("g", { class: "scrub", visibility: "hidden" }, gCut);
  for (const [g, t] of [[cutA, "A"], [cutB, "B"]]) { el("circle", { r: 12.5 }, g); Object.assign(el("text", { "text-anchor": "middle", y: 5 }, g), { textContent: t }); }
  el("circle", { r: 7, class: "scrub-ring" }, scrubG); el("circle", { r: 2, class: "scrub-dot" }, scrubG);
  const leadSvg = leader; leadSvg.replaceChildren();
  const gLead = el("g", {}, leadSvg);

  // ---------- geometry ----------
  const px = (X, Y) => [(X - view.cx) * view.z + W / 2, (Y - view.cy) * view.z + H / 2];
  const cell = (x, y) => [(x - W / 2) / view.z + view.cx, (y - H / 2) / view.z + view.cy];
  const zMin = () => Math.min(W / nx, H / ny) * 0.92;
  function clampView(v) {
    v.z = Math.max(zMin(), Math.min(ZMAX, v.z));
    const hw = W / 2 / v.z, hh = H / 2 / v.z;
    v.cx = Math.max(Math.min(hw * 0.35, nx / 2), Math.min(nx - Math.min(hw * 0.35, nx / 2), v.cx));
    v.cy = Math.max(Math.min(hh * 0.35, ny / 2), Math.min(ny - Math.min(hh * 0.35, ny / 2), v.cy));
    if (W / v.z >= nx) v.cx = nx / 2; if (H / v.z >= ny) v.cy = ny / 2;
    return v;
  }
  function rectView(r, pad = 10) {
    const w = (r.u1 - r.u0) * nx, h = (r.v1 - r.v0) * ny;
    return clampView({ cx: ((r.u0 + r.u1) / 2) * nx, cy: ((r.v0 + r.v1) / 2) * ny, z: Math.min((W - pad * 2) / w, (H - pad * 2) / h) });
  }
  function animateTo(t, ms = 450) {
    cancelAnimationFrame(anim);
    const a = { ...view }, t0 = performance.now();
    if (ms === 0 || window.__still) { view = t; return redraw(); }
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const lz = Math.log(a.z) + (Math.log(t.z) - Math.log(a.z)) * e;
      view = { cx: a.cx + (t.cx - a.cx) * e, cy: a.cy + (t.cy - a.cy) * e, z: Math.exp(lz) };
      redraw(); if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  // ---------- canvas drawing ----------
  function drawSea() {
    const S = ev.sea; if (!S.any) return;
    const sw = Math.ceil(W / 2), sh = Math.ceil(H / 2);
    if (m2.width !== sw || m2.height !== sh) { m2.width = sw; m2.height = sh; }
    const img = m2c.createImageData(sw, sh), d = img.data;
    const c = [parseInt(INK.sea.slice(1, 3), 16), parseInt(INK.sea.slice(3, 5), 16), parseInt(INK.sea.slice(5, 7), 16)], sx = S.w / nx, sy = S.h / ny;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const [X, Y] = cell(x * 2 + 1, y * 2 + 1);
      const fx = X * sx - 0.5, fy = Y * sy - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
      let v = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const xx = Math.min(S.w - 1, Math.max(0, x0 + i)), yy = Math.min(S.h - 1, Math.max(0, y0 + j));
        v += S.m[yy * S.w + xx] * (i ? ax : 1 - ax) * (j ? ay : 1 - ay);
      }
      const a = Math.max(0, Math.min(1, (v - 0.35) / 0.3)), o = (y * sw + x) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = a * 255;
    }
    m2c.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(m2, 0, 0, W, H);
  }
  function poly(list, style, width, dash) {
    ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash || []);
    ctx.beginPath();
    const x0 = view.cx - W / 2 / view.z - 2, x1 = view.cx + W / 2 / view.z + 2, y0 = view.cy - H / 2 / view.z - 2, y1 = view.cy + H / 2 / view.z + 2;
    for (const p of list) {
      if (p.x1 < x0 || p.x0 > x1 || p.y1 < y0 || p.y0 > y1) continue;
      const a = p.a;
      ctx.moveTo((a[0] - view.cx) * view.z + W / 2, (a[1] - view.cy) * view.z + H / 2);
      for (let i = 2; i < a.length; i += 2) ctx.lineTo((a[i] - view.cx) * view.z + W / 2, (a[i + 1] - view.cy) * view.z + H / 2);
    }
    ctx.stroke();
  }
  function dotMetrics() {
    const pmin = smallScreen() ? 6.6 : 7.6, k = Math.ceil(2 * Math.log2(pmin / view.z)), pc = Math.pow(2, k / 2);
    return { pc, pitch: pc * view.z, L: Math.max(0, Math.min(ev.dots.levels.length - 1, Math.floor(Math.log2(pc) + 1e-6))) };
  }
  function drawDots() {
    const D = ev.dots, t = getT(), { pc, pitch, L } = dotMetrics(), lv = D.levels[L], sc = 1 << L, rowH = pc * 0.8660254, rmax = pitch * 0.52;
    const xs = view.cx - W / 2 / view.z, xe = view.cx + W / 2 / view.z, ys = view.cy - H / 2 / view.z, ye = view.cy + H / 2 / view.z;
    const paths = { a: new Path2D(), b: new Path2D() };
    const colA = D.mode === "two" ? INK.yellow : D.mode === "neg" ? INK.blue : INK.yellow, colB = INK.blue, span = D.max - D.floor;
    for (let j = Math.floor(ys / rowH) - 1; j <= Math.ceil(ye / rowH) + 1; j++) {
      const Y = j * rowH; if (Y < 0 || Y > ny) continue;
      const off = j & 1 ? pc / 2 : 0;
      for (let i = Math.floor((xs - off) / pc) - 1; i <= Math.ceil((xe - off) / pc) + 1; i++) {
        const X = i * pc + off; if (X < 0 || X > nx) continue;
        const v = sampleLevel(lv, X, Y, sc); if (v !== v) continue;
        let a, side;
        if (D.mode === "two") { a = Math.abs(v); side = v > 0 ? "a" : "b"; } else if (D.mode === "neg") { if (v >= 0) continue; a = -v; side = "b"; } else { a = v; side = "a"; }
        const f = (a * t - D.floor) / span; if (f <= 0) continue;
        const r = rmax * Math.sqrt(Math.min(1, f)); if (r < 0.3) continue;
        const x = (X - view.cx) * view.z + W / 2, y = (Y - view.cy) * view.z + H / 2, p = paths[side];
        p.moveTo(x + r, y); p.arc(x, y, r, 0, 6.2832);
      }
    }
    ctx.fillStyle = colA; ctx.fill(paths.a); ctx.fillStyle = colB; ctx.fill(paths.b);
  }
  function drawCanvas() {
    if (!W || !H) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#e0d4ba"; ctx.fillRect(0, 0, W, H); // outside the scene
    { const [gx, gy] = px(0, 0), [gx2, gy2] = px(nx, ny); ctx.fillStyle = INK.paper; ctx.fillRect(gx, gy, gx2 - gx, gy2 - gy); }
    drawSea();
    { const x0 = (0 - view.cx) * view.z + W / 2, y0 = (0 - view.cy) * view.z + H / 2, rw = ev.relief.width / nx; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(ev.relief, 0, 0, ev.relief.width, ev.relief.height, x0, y0, nx * view.z, ny * view.z); }
    const B = ev.base, zs = Math.max(0.45, Math.min(1.5, 0.42 + 0.3 * Math.log2(view.z + 0.5)));
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    poly(B.river, INK.water, 1.3); poly(B.canal, INK.water, 1.3);
    drawDots();
    ctx.globalAlpha = 1;
    const classes = view.z < 0.8 ? ["trunk", "motorway"] : view.z < 2 ? ["primary", "trunk", "motorway"] : ["tertiary", "secondary", "primary", "trunk", "motorway"];
    for (const k of classes) if (B.roads[k] && B.roads[k].length) poly(B.roads[k], INK.ink, ROAD_W[k] * zs * (k === "tertiary" || k === "secondary" ? 0.8 : 1));
    poly(B.rail, INK.ink, 1.5); ctx.lineCap = "butt"; poly(B.rail, INK.ink, 6, [1.5, 7]); ctx.lineCap = "round";
    poly(B.coast, INK.ink, 1.3);
  }

  // ---------- SVG layout (pins, labels, names, cut, line label) ----------
  function layout() {
    if (!W || !H) return;
    gLines.setAttribute("transform", `translate(${W / 2 - view.cx * view.z} ${H / 2 - view.cy * view.z}) scale(${view.z})`);
    const rpad = matchMedia("(pointer: coarse)").matches ? 24 : 4, occ = [], free = (r) => r.x >= 4 && r.y >= 4 && r.x + r.w <= W - rpad && r.y + r.h <= H - 4 && !occ.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
    // pins, pushed apart when they would sit on top of each other (a thin leader keeps the true spot)
    const P = pins.filter((p) => { const [x, y] = px(p.X, p.Y); p.x0 = x; p.y0 = y; p.x = x; p.y = y; const vis = x > -40 && x < W + 40 && y > -40 && y < H + 40; p.g.style.display = vis ? "" : "none"; p.label.style.display = "none"; p.vis = vis; return vis; });
    P.sort((a, b) => a.prio - b.prio);
    for (let it = 0; it < 30; it++) for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j], min = a.r + b.r + 3; let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= min) continue;
      if (d < 0.01) { dx = Math.cos(i * 2.4 + j); dy = Math.sin(i * 2.4 + j); d = 1; }
      const k = (min - d) / 2 / d; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k;
    }
    for (const p of P) {
      p.g.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      const moved = Math.hypot(p.x - p.x0, p.y - p.y0) > 3;
      p.lead.style.display = p.dot.style.display = moved ? "" : "none";
      p.lead.setAttribute("x2", (p.x0 - p.x).toFixed(1)); p.lead.setAttribute("y2", (p.y0 - p.y).toFixed(1));
      p.dot.setAttribute("cx", (p.x0 - p.x).toFixed(1)); p.dot.setAttribute("cy", (p.y0 - p.y).toFixed(1));
      p.g.classList.toggle("sel", selected === p.s.id);
      occ.push({ x: p.x - p.r - 2, y: p.y - p.r - 2, w: p.r * 2 + 4, h: p.r * 2 + 4 });
    }
    const lr = layoutLineLabel(); if (lr) occ.push(lr);
    const pf = `700 ${smallScreen() ? 10.5 : 11.5}px Jost`;
    for (const p of P) {
      const w = textW(p.label.textContent, pf, 0.5) + 2, h = 13, r = p.r;
      const cand = [[p.x + r + 4, p.y - h / 2, "start"], [p.x - r - 4 - w, p.y - h / 2, "end"], [p.x - w / 2, p.y - r - 4 - h, "middle"], [p.x - w / 2, p.y + r + 4, "middle"], [p.x + r + 4, p.y - r - h, "start"], [p.x - r - 4 - w, p.y + 2, "end"]];
      for (const [x, y, anc] of cand) {
        const rect = { x, y, w, h };
        if (!free(rect)) continue;
        occ.push({ x: x - 1, y: y - 1, w: w + 2, h: h + 2 });
        p.label.style.display = ""; p.label.setAttribute("x", (anc === "start" ? x : anc === "end" ? x + w - 2 : x + w / 2 - 1).toFixed(1)); p.label.setAttribute("y", (y + h - 2.5).toFixed(1)); p.label.setAttribute("text-anchor", anc);
        break;
      }
    }
    // place names, big places first
    const nf = `600 ${smallScreen() ? 9.5 : 10.5}px Jost`, maxN = smallScreen() ? 12 : 22; let n = 0;
    for (const p of places) {
      p.t.style.display = p.dot.style.display = "none";
      if (n >= maxN) continue;
      const [x, y] = px(p.X, p.Y); if (x < 6 || y < 6 || x > W - 6 || y > H - 6) continue;
      const w = textW(p.label, nf, 1.3) + 2, h = 12;
      for (const [rx, ry, anc] of [[x + 6, y - h / 2, "start"], [x - 6 - w, y - h / 2, "end"], [x - w / 2, y - 6 - h, "middle"]]) {
        const rect = { x: rx, y: ry, w, h };
        if (!free(rect)) continue;
        occ.push({ x: rx - 2, y: ry - 2, w: w + 4, h: h + 4 });
        p.dot.style.display = p.t.style.display = ""; p.dot.setAttribute("cx", x.toFixed(1)); p.dot.setAttribute("cy", y.toFixed(1));
        p.t.setAttribute("x", (anc === "start" ? rx : anc === "end" ? rx + w - 2 : rx + w / 2 - 1).toFixed(1)); p.t.setAttribute("y", (ry + h - 2.5).toFixed(1)); p.t.setAttribute("text-anchor", anc);
        n++; break;
      }
    }
    layoutCut();
    layoutLeader();
  }
  function layoutLineLabel() {
    // written along an open line, on the stretch nearest the middle of the view; above the top of the nearest closed ring
    let best = null;
    for (const r of ev.runs) {
      const closed = r.pts.length > 3 && r.pts[0][0] === r.pts[r.pts.length - 1][0] && r.pts[0][1] === r.pts[r.pts.length - 1][1];
      if (closed) {
        let top = null; for (const p of r.pts) { const [x, y] = px(p[0], p[1]); if (!top || y < top.y) top = { x, y }; }
        if (top && top.x > 80 && top.x < W - 80 && top.y > 30 && top.y < H - 30 && r.pts.length > 20) { const dd = Math.hypot(top.x - W / 2, top.y - H / 2); if (!best || dd < best.dd) best = { dd, closed: true, x: top.x, y: top.y - 4 }; }
        continue;
      }
      for (let k = 3; k + 3 < r.pts.length; k += 1) {
        const [x, y] = px(r.pts[k][0], r.pts[k][1]); if (x < 60 || x > W - 60 || y < 40 || y > H - 40) continue;
        const dd = Math.hypot(x - W / 2, y - H / 2);
        if (r.pts.length >= 12 && (!best || dd < best.dd)) best = { dd, k, r, x, y };
      }
    }
    if (!best) { lineLab.style.display = "none"; return null; }
    let ang = 0, off = -13;
    if (best.closed) off = -8; else {
      const a = px(best.r.pts[best.k - 3][0], best.r.pts[best.k - 3][1]), b = px(best.r.pts[best.k + 3][0], best.r.pts[best.k + 3][1]);
      ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    }
    lineLab.style.display = ""; lineLab.setAttribute("transform", `translate(${best.x} ${best.y}) rotate(${ang}) translate(0 ${off})`); lineLab.setAttribute("text-anchor", "middle");
    const w = textW(lineLab.textContent, "900 12.5px Jost", 2.2), rad = ang * Math.PI / 180, bw = Math.abs(Math.cos(rad)) * w + 20, bh = Math.abs(Math.sin(rad)) * w + 26;
    return { x: best.x - bw / 2, y: best.y - bh / 2 - (best.closed ? 12 : 6), w: bw, h: bh };
  }
  function layoutCut() {
    gCut.style.display = cut ? "" : "none";
    if (!cut) return;
    const [ax, ay] = px(cut.a[0], cut.a[1]), [bx, by] = px(cut.b[0], cut.b[1]);
    const d = `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`;
    cutPath.setAttribute("d", d); cutLine.setAttribute("d", d);
    // keep the letters off the stroke: nudge each badge outward along it
    const L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L;
    cutA.setAttribute("transform", `translate(${(ax - ux * 4).toFixed(1)} ${(ay - uy * 4).toFixed(1)})`); cutB.setAttribute("transform", `translate(${(bx + ux * 4).toFixed(1)} ${(by + uy * 4).toFixed(1)})`);
    if (scrub) { const [sx, sy] = px(scrub[0], scrub[1]); scrubG.setAttribute("visibility", "visible"); scrubG.setAttribute("transform", `translate(${sx.toFixed(1)} ${sy.toFixed(1)})`); } else scrubG.setAttribute("visibility", "hidden");
  }
  function layoutLeader() {
    gLead.replaceChildren(); gAway.replaceChildren();
    const [x, y] = px(hu, hv), inside = x > 10 && x < W - 10 && y > 10 && y < H - 10;
    const bw = box.getBoundingClientRect(), aw = anchor.closest(".typeblock").getBoundingClientRect(), sw = leadSvg.getBoundingClientRect();
    if (inside) {
      const bottom = aw.bottom - sw.top + 3, ox = bw.left - sw.left, oy = bw.top - sw.top, X = x + ox, Y = y + oy;
      el("line", { x1: X, y1: Y - 7, x2: X, y2: bottom + 8, class: "leader" }, gLead);
      el("circle", { cx: X, cy: Y, r: 7, class: "leader-ring" }, gLead);
      el("path", { d: `M${X - 6} ${bottom + 12}L${X} ${bottom + 2}L${X + 6} ${bottom + 12}Z`, class: "leader-tip" }, gLead);
    } else {
      // the number's place is outside this view: point to it, tap to go there
      const dx = x - W / 2, dy = y - H / 2, s = Math.min((W / 2 - 24) / Math.abs(dx || 1e-6), (H / 2 - 24) / Math.abs(dy || 1e-6));
      const ex = W / 2 + dx * s, ey = H / 2 + dy * s, ang = Math.atan2(dy, dx) * 180 / Math.PI;
      const dir = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"][Math.round(((ang + 360) % 360) / 45) % 8];
      const g = el("g", { class: "away-g", transform: `translate(${ex.toFixed(1)} ${ey.toFixed(1)})` }, gAway);
      el("path", { d: "M-10 -9L10 0L-10 9Z", transform: `rotate(${ang})`, class: "away-tip" }, g);
      const msg = `THE BIG NUMBER IS ${dir} · TAP`, tw = textW(msg, "800 11px Jost", 1.2) + 4;
      el("rect", { x: ex > W / 2 ? -18 - tw - 6 : 12, y: -10, width: tw + 12, height: 20, class: "away-bg" }, g);
      Object.assign(el("text", { class: "away-t", y: 4, "text-anchor": ex > W / 2 ? "end" : "start", x: ex > W / 2 ? -18 : 18 }, g), { textContent: msg });
      g.dataset.away = "1"; gAway.style.pointerEvents = "all";
    }
  }

  // ---------- redraw ----------
  let raf = 0;
  function redraw() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { drawCanvas(); layout(); }); }
  function redrawNow() { cancelAnimationFrame(raf); drawCanvas(); layout(); }

  function resize() {
    const r = box.getBoundingClientRect(); if (r.width < 20 || r.height < 20) return;
    W = Math.round(r.width); H = Math.round(r.height); dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    if (!moved) view = fitState === "whole" ? rectView({ u0: 0, v0: 0, u1: 1, v1: 1 }, 0) : rectView(focus, 6); else clampView(view);
    redrawNow();
  }
  new ResizeObserver(() => resize()).observe(box);

  // ---------- pointers ----------
  const ptrs = new Map(); let drag = null, tapPin = null, travel = 0, pinch = null, prevCut = null;
  const local = (e) => { const r = box.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const clampCell = (c) => [Math.max(0, Math.min(nx, c[0])), Math.max(0, Math.min(ny, c[1]))];
  box.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest("button")) return;
    if (e.target.closest("[data-away]")) { onHeadlineAway?.(); return; }
    try { box.setPointerCapture(e.pointerId); } catch {}
    const [x, y] = local(e); ptrs.set(e.pointerId, { x, y }); travel = 0;
    tapPin = e.target.closest?.("[data-pin]")?.dataset.pin || null;
    cancelAnimationFrame(anim);
    if (mode === "cut" && ptrs.size === 1) {
      prevCut = cut ? { a: cut.a, b: cut.b } : null;
      const near = (c) => { const [cx2, cy2] = px(c[0], c[1]); return Math.hypot(cx2 - x, cy2 - y) < 26; };
      if (cut && near(cut.a)) drag = { end: "a" }; else if (cut && near(cut.b)) drag = { end: "b" };
      else { const c = clampCell(cell(x, y)); cut = { a: c, b: c.slice() }; drag = { end: "b", fresh: true }; }
    } else if (ptrs.size === 2) {
      const [p, q] = [...ptrs.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), z: view.z }; drag = null; tapPin = null;
    }
    box.classList.add("down");
  });
  box.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const [x, y] = local(e), dx = x - p.x, dy = y - p.y; travel += Math.abs(dx) + Math.abs(dy); p.x = x; p.y = y;
    if (mode === "move") {
      if (ptrs.size === 1) { if (travel > 4) moved = true; view.cx -= dx / view.z; view.cy -= dy / view.z; clampView(view); }
      else if (ptrs.size === 2 && pinch) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const before = cell(mx, my); view.z = Math.max(zMin(), Math.min(ZMAX, pinch.z * d / pinch.d));
        const after = cell(mx, my); view.cx += before[0] - after[0]; view.cy += before[1] - after[1]; clampView(view); moved = true;
      }
      fitState = "custom"; redraw();
    } else if (drag && travel > 3) {
      const c = clampCell(cell(x, y)); cut[drag.end] = c; redraw(); onCut?.({ a: cut.a, b: cut.b }, true);
    }
  });
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; box.classList.remove("down");
    if (travel < 7 && tapPin && ptrs.size === 0) { if (mode === "cut" && drag?.fresh) cut = prevCut ? { ...prevCut } : null; drag = null; redraw(); return onPin?.(tapPin); }
    if (mode === "cut" && drag) {
      const [ax, ay] = px(cut.a[0], cut.a[1]), [bx, by] = px(cut.b[0], cut.b[1]);
      if (Math.hypot(ax - bx, ay - by) < 16) cut = prevCut ? { ...prevCut } : null; // a tap, not a stroke
      drag = null; redraw(); onCut?.(cut ? { a: cut.a, b: cut.b } : null, false);
    }
  };
  box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
  box.addEventListener("wheel", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault(); const [x, y] = local(e), before = cell(x, y);
    view.z = Math.max(zMin(), Math.min(ZMAX, view.z * Math.exp(-e.deltaY * 0.01))); const after = cell(x, y);
    view.cx += before[0] - after[0]; view.cy += before[1] - after[1]; clampView(view); moved = true; fitState = "custom"; redraw();
  }, { passive: false });
  box.addEventListener("dblclick", (e) => { if (mode !== "move") return; const [x, y] = local(e), c = cell(x, y); moved = true; fitState = "custom"; animateTo(clampView({ cx: c[0], cy: c[1], z: view.z * 2 }), 300); });

  return {
    setMode(m) { mode = m; box.dataset.mode = m; },
    getMode: () => mode,
    fit(which) { fitState = which; moved = false; animateTo(which === "whole" ? rectView({ u0: 0, v0: 0, u1: 1, v1: 1 }, 0) : rectView(focus, 6), 500); },
    state: () => fitState,
    zoomBy(f) { moved = true; fitState = "custom"; animateTo(clampView({ ...view, z: view.z * f }), 250); },
    setT() { redraw(); },
    setCut(a, b, { fit = true } = {}) {
      cut = { a, b };
      if (fit) {
        const pad = 46, ok = (c) => { const [x, y] = px(c[0], c[1]); return x > pad && x < W - pad && y > pad && y < H - pad; };
        if (!ok(a) || !ok(b)) { const u0 = Math.min(a[0], b[0]) / nx, u1 = Math.max(a[0], b[0]) / nx, v0 = Math.min(a[1], b[1]) / ny, v1 = Math.max(a[1], b[1]) / ny, mu = 0.02; moved = true; fitState = "custom"; animateTo(rectView({ u0: u0 - mu, u1: u1 + mu, v0: v0 - mu, v1: v1 + mu }, 40), 450); return; }
      }
      redraw();
    },
    clearCut() { cut = null; redraw(); },
    getCut: () => cut,
    select(id) { selected = id; redraw(); },
    setScrub(c) { scrub = c; layoutCut(); },
    redraw: redrawNow,
    dotInfo: () => dotMetrics(),
    px,
  };
}
