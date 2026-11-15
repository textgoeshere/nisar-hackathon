// The paper map: a 2D canvas drawn from the lab data (relief, sea, OpenStreetMap vectors, the line),
// plus pan / pinch / cut gestures. Pins, labels and the cut stroke are an SVG layer drawn by app.js.
// Coordinates inside this file are grid cells: X = u * nx (east), Y = v * ny (south).

export const FONT = '"Public Sans", system-ui, -apple-system, "Segoe UI", Roboto, "Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", sans-serif';
const PAPER = "#f1e9d6";
const RED = "#d5251b";
const INK = "#25211a";

const ROAD = { // fill colour, casing flag, width in px at zoom factor 1
  minor: ["#cdc3ad", false, 0.9], tertiary: ["#bdb19b", true, 1.5], secondary: ["#ac9e88", true, 2.0],
  primary: ["#9a8a74", true, 2.6], trunk: ["#85735e", true, 3.0], motorway: ["#6a5844", true, 3.5],
};
const ORDER = ["minor", "tertiary", "secondary", "primary", "trunk", "motorway"];
const NICE = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

function prep(polys, nx, ny) {
  let n = 0, total = 0;
  for (const p of polys) if (p.length > 1) { n++; total += p.length; }
  const pts = new Float32Array(total * 2), off = new Int32Array(n + 1), bb = new Float32Array(n * 4);
  let k = 0, i = 0;
  for (const p of polys) {
    if (p.length < 2) continue;
    off[i] = k;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const q of p) {
      const X = q[0] * nx, Y = q[1] * ny;
      pts[2 * k] = X; pts[2 * k + 1] = Y; k++;
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
    }
    bb[4 * i] = x0; bb[4 * i + 1] = y0; bb[4 * i + 2] = x1; bb[4 * i + 3] = y1;
    i++;
  }
  off[n] = k;
  return { pts, off, bb, n };
}

export function createMap(root, canvas, lab, opts = {}) {
  const NX = lab.grid.nx, NY = lab.grid.ny, DX = lab.grid.dx;
  const ctx = canvas.getContext("2d");
  const view = { x0: 0, y0: 0, s: 1 };
  let W = 0, H = 0, dpr = 1, raf = 0, interacting = false, idleTimer = 0, anim = null;
  const L = { relief: null, sea: null, roads: null, rail: null, river: null, canal: null, coast: null, places: [], runs: [] };
  const handlers = { view: [], cut: [], draw: [] };
  let obstacles = { names: [], line: [], notes: [] };
  const toScreen = (X, Y) => [(X - view.x0) * view.s, (Y - view.y0) * view.s];
  const toCell = (x, y) => [x / view.s + view.x0, y / view.s + view.y0];

  // ---------- layers (each may arrive late; the map draws what it has) ----------
  function setBasemap(b) {
    L.roads = {}; for (const c of ORDER) L.roads[c] = prep(b.roads[c] ?? [], NX, NY);
    L.rail = prep(b.rail ?? [], NX, NY); L.river = prep(b.river ?? [], NX, NY);
    L.canal = prep(b.canal ?? [], NX, NY); L.coast = prep(b.coast ?? [], NX, NY);
    L.places = (b.places ?? []).map((p) => ({ ...p, X: p.u * NX, Y: p.v * NY }));
    draw();
  }
  function setLine(lj) {
    const closedAll = lj.lines.length === lj.runs.length && lj.lines.every((l) => l.closed);
    L.runs = lj.runs.map((r, i) => ({
      measured: r.measured, closed: closedAll,
      pts: r.points.map((p) => [p[0] * NX, p[1] * NY]),
    }));
    draw();
  }
  function setRelief(img) { // grey relief (flat = 180) -> soft shadow / highlight on paper
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const v = a[i];
      if (v < 180) { const t = (180 - v) / 180; a[i] = 96; a[i + 1] = 80; a[i + 2] = 60; a[i + 3] = Math.min(150, t * 150 * 1.05); }
      else { const t = (v - 180) / 75; a[i] = 255; a[i + 1] = 252; a[i + 2] = 240; a[i + 3] = Math.min(150, t * 150); }
    }
    x.putImageData(d, 0, 0);
    L.relief = c; draw();
  }
  function setSea(img) { // mask at grid size -> smooth edge at 2x
    const w = NX * 2, h = NY * 2;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h), a = d.data;
    let any = false;
    for (let i = 0; i < a.length; i += 4) {
      const t = Math.max(0, Math.min(1, (a[i] - 100) / 56));
      a[i] = 188; a[i + 1] = 214; a[i + 2] = 229; a[i + 3] = t * 255; if (t > 0) any = true;
    }
    x.putImageData(d, 0, 0);
    L.sea = any ? c : null; draw();
  }

  // ---------- drawing ----------
  function strokeSet(set, minPx, widthFn) {
    if (!set || !set.n) return 0;
    const { pts, off, bb, n } = set, x0 = view.x0, y0 = view.y0, s = view.s, x1 = x0 + W / s, y1 = y0 + H / s;
    let drawn = 0;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (bb[4 * i + 2] < x0 || bb[4 * i] > x1 || bb[4 * i + 3] < y0 || bb[4 * i + 1] > y1) continue;
      const a = off[i], b = off[i + 1];
      let px = (pts[2 * a] - x0) * s, py = (pts[2 * a + 1] - y0) * s;
      ctx.moveTo(px, py); drawn++;
      for (let k = a + 1; k < b; k++) {
        const x = (pts[2 * k] - x0) * s, y = (pts[2 * k + 1] - y0) * s;
        if (k < b - 1 && Math.abs(x - px) + Math.abs(y - py) < minPx) continue;
        ctx.lineTo(x, y); px = x; py = y;
      }
    }
    ctx.stroke();
    return drawn;
  }

  const kscale = () => Math.max(0.62, Math.min(2.3, 0.45 + view.s * 0.13));
  const lineW = () => Math.max(3.4, Math.min(6, 2.6 + view.s * 0.4));

  function lineGeometry() { // screen polylines, plus samples every ~6 px for label avoidance
    const out = [], samples = [];
    for (const r of L.runs) {
      const p = r.pts.map(([X, Y]) => toScreen(X, Y));
      if (r.closed && p.length) p.push(p[0]);
      out.push({ measured: r.measured, closed: r.closed, p });
      for (let i = 1; i < p.length; i++) {
        const [ax, ay] = p[i - 1], [bx, by] = p[i];
        if (Math.max(ax, bx) < -20 || Math.min(ax, bx) > W + 20 || Math.max(ay, by) < -20 || Math.min(ay, by) > H + 20) continue;
        const len = Math.hypot(bx - ax, by - ay), m = Math.max(1, Math.ceil(len / 6));
        for (let k = 0; k < m; k++) samples.push([ax + ((bx - ax) * k) / m, ay + ((by - ay) * k) / m]);
      }
    }
    return { out, samples };
  }

  function halo(text, x, y, color, w = 3) {
    ctx.lineJoin = "round"; ctx.lineWidth = w; ctx.strokeStyle = "rgba(247,241,224,.92)";
    ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  function drawNames(lg) {
    const rects = furnitureRects().concat(opts.reserved?.() ?? []);
    const hit = (r) => rects.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])
      || lg.samples.some((p) => p[0] > r[0] - 3 && p[0] < r[2] + 3 && p[1] > r[1] - 3 && p[1] < r[3] + 3);
    const rank = { city: 0, town: 1, suburb: 2, village: 2 };
    const list = L.places.filter((p) => { const [x, y] = toScreen(p.X, p.Y); return x > 8 && x < W - 8 && y > 8 && y < H - 8; })
      .sort((a, b) => (rank[a.kind] ?? 3) - (rank[b.kind] ?? 3));
    const cap = Math.max(5, Math.round((W * H) / 24000));
    let placed = 0;
    ctx.textBaseline = "alphabetic";
    for (const p of list) {
      if (placed >= cap) break;
      const [x, y] = toScreen(p.X, p.Y);
      const big = p.kind === "city", mid = p.kind === "town";
      const fs = big ? 15 : mid ? 13 : 11.5, en = p.name_en && p.name_en.toLowerCase() !== p.name.toLowerCase() ? p.name_en : "";
      ctx.font = `${big ? 800 : 700} ${fs}px ${FONT}`;
      const w1 = ctx.measureText(p.name).width;
      ctx.font = `600 ${fs - 3.5}px ${FONT}`;
      const w2 = en ? ctx.measureText(en.toUpperCase()).width + en.length * 0.6 : 0;
      const w = Math.max(w1, w2), h = fs + (en ? fs - 2 : 2);
      // try right of the dot, then left, then above
      const tries = [[x + 6, y - h + fs * 0.7], [x - 6 - w, y - h + fs * 0.7], [x - w / 2, y - h - 4], [x - w / 2, y + 6]];
      let spot = null;
      for (const t of tries) {
        const r = [t[0] - 2, t[1] - 2, t[0] + w + 2, t[1] + h + 2];
        if (r[0] < 4 || r[2] > W - 4 || r[1] < 4 || r[3] > H - 4) continue;
        if (!hit(r)) { spot = { t, r }; break; }
      }
      if (!spot) continue;
      rects.push(spot.r); placed++;
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, big ? 3.2 : 2.4, 0, 6.3); ctx.fill();
      ctx.font = `${big ? 800 : 700} ${fs}px ${FONT}`;
      halo(p.name, spot.t[0], spot.t[1] + fs * 0.9, INK);
      if (en) { ctx.font = `600 ${fs - 3.5}px ${FONT}`; ctx.letterSpacing = "0.6px"; halo(en.toUpperCase(), spot.t[0], spot.t[1] + fs * 0.9 + fs - 3, "#5d5546", 2.5); ctx.letterSpacing = "0px"; }
    }
    return rects;
  }

  function drawLine(lg) {
    if (!lg.out.length) return [];
    const lw = lineW();
    const closed = lg.out.filter((r) => r.closed);
    if (closed.length) { // a pale wash inside the outline (where the radar lost its match)
      ctx.fillStyle = "rgba(213,37,27,.10)";
      for (const r of closed) { ctx.beginPath(); r.p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.fill(); }
    }
    const path = (r) => { ctx.beginPath(); r.p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
    ctx.lineJoin = "round";
    ctx.setLineDash([]); ctx.lineCap = "round"; ctx.strokeStyle = "rgba(255,252,243,.92)"; ctx.lineWidth = lw + 4;
    for (const r of lg.out) { path(r); ctx.stroke(); }
    for (const r of lg.out) {
      path(r);
      ctx.strokeStyle = RED;
      if (r.measured) { ctx.setLineDash([]); ctx.lineCap = "round"; ctx.lineWidth = lw; }
      else { ctx.setLineDash([lw * 2.4, lw * 1.7]); ctx.lineCap = "butt"; ctx.lineWidth = lw * 0.92; }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // words written along the line, put where no pin, survey tick or place name is in the way
    const rects = [];
    if (opts.annotate) {
      const avoid = (opts.avoid?.() ?? []).concat(obstacles.names.map((r) => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2, Math.hypot(r[2] - r[0], r[3] - r[1]) / 2 + 4]));
      for (const flag of [true, false]) {
        const text = flag ? opts.annotate.solid : opts.annotate.dashed;
        if (!text || !lg.out.some((r) => r.measured === flag)) continue;
        ctx.font = `700 12.5px ${FONT}`;
        const tw = ctx.measureText(text).width, off = lw / 2 + 11;
        const pieces = [];
        for (const r of lg.out) {
          if (r.measured !== flag) continue;
          let piece = [];
          const flush = () => { if (piece.length > 1) pieces.push(piece); piece = []; };
          for (const q of r.p) { if (q[0] > 6 && q[0] < W - 6 && q[1] > 6 && q[1] < H - 6) piece.push(q); else flush(); }
          flush();
        }
        let best = null;
        for (const piece of pieces) {
          let total = 0; const cum = [0];
          for (let i = 1; i < piece.length; i++) { total += Math.hypot(piece[i][0] - piece[i - 1][0], piece[i][1] - piece[i - 1][1]); cum.push(total); }
          if (total < tw + 30) continue;
          const at = (s) => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const a = piece[i - 1], b = piece[i], t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
          for (let s = tw / 2 + 12; s <= total - tw / 2 - 12; s += 10) {
            const p0 = at(s - tw / 2), p1 = at(s + tw / 2), c = at(s);
            let ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
            const nx = Math.sin(ang), ny = -Math.cos(ang);
            const cx = c[0] + nx * off * (Math.abs(ang) > Math.PI / 2 ? 1 : 1), cy = c[1] + ny * off;
            let ok = true, clear = 1e9;
            for (const k of [-0.5, -0.25, 0, 0.25, 0.5]) {
              const px = cx + Math.cos(ang) * tw * k, py = cy + Math.sin(ang) * tw * k;
              for (const [ax, ay, ar] of avoid) { const d = Math.hypot(px - ax, py - ay) - ar - 9; if (d < 0) ok = false; if (d < clear) clear = d; }
            }
            if (!ok) continue;
            const score = Math.min(clear, 40) * 2 - Math.abs(s - total / 2) * 0.05 + (total > best?.total ? 0 : 0);
            if (!best || score > best.score) best = { score, cx, cy, ang, total };
          }
        }
        if (!best) continue;
        let ang = best.ang;
        if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
        const cx = best.cx, cy = best.cy;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        halo(text, 0, 0, "#a81d15", 3.5); ctx.restore(); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        const ex = Math.abs(Math.cos(ang)) * tw / 2 + 9, ey = Math.abs(Math.sin(ang)) * tw / 2 + 9;
        rects.push([cx - ex, cy - ey, cx + ex, cy + ey]);
      }
    }
    return rects;
  }

  function scaleBar() {
    const mpp = DX / view.s; let len = NICE[0];
    for (const n of NICE) { len = n; if (n / mpp >= 84) break; }
    return { len, px: len / mpp };
  }
  function furnitureRects() {
    const { px } = scaleBar(), x = 14, y = H - 20;
    return [[x - 6, y - 20, x + px + 56, y + 16], [W - 150, H - 20, W, H], [W - 36, H - 62, W - 8, H - 18]];
  }
  function drawFurniture() {
    const { len, px } = scaleBar(), x = 14, y = H - 20, h = 6;
    ctx.fillStyle = "rgba(251,247,236,.88)"; ctx.fillRect(x - 6, y - 20, px + 12 + 44, 36);
    ctx.lineWidth = 1.2; ctx.strokeStyle = INK;
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? "#fbf7ec" : INK; ctx.fillRect(x + (px * i) / 4, y, px / 4, h); }
    ctx.strokeRect(x, y, px, h);
    ctx.fillStyle = INK; ctx.font = `700 11.5px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText("0", x - 3, y - 5); ctx.fillText(len >= 1000 ? `${len / 1000} km` : `${len} m`, x + px - 6, y - 5);
    // north arrow
    const nx = W - 22, ny = H - 52;
    ctx.fillStyle = "rgba(251,247,236,.88)"; ctx.fillRect(nx - 14, ny - 10, 28, 44);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx + 6, ny + 20); ctx.lineTo(nx, ny + 15); ctx.lineTo(nx - 6, ny + 20); ctx.closePath(); ctx.fill();
    ctx.font = `800 11px ${FONT}`; ctx.textAlign = "center"; ctx.fillText("N", nx, ny + 32); ctx.textAlign = "left";
    ctx.font = `600 10px ${FONT}`; ctx.textAlign = "right"; halo("© OpenStreetMap contributors", W - 8, H - 7, "#4d463a", 2.5); ctx.textAlign = "left";
    obstacles.notes.push(...furnitureRects());
  }

  function draw() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; paint(); });
  }
  function paint() {
    if (!W) return;
    const t0 = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    const s = view.s;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    if (L.relief) ctx.drawImage(L.relief, -view.x0 * s, -view.y0 * s, NX * s, NY * s);
    if (L.sea) ctx.drawImage(L.sea, -view.x0 * s, -view.y0 * s, NX * s, NY * s);
    const k = kscale();
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.setLineDash([]);
    if (L.roads) {
      ctx.strokeStyle = "#8db8d3"; ctx.lineWidth = 1.5 * Math.min(1.6, k + 0.2); strokeSet(L.river, 1.2);
      ctx.strokeStyle = "#9cc1d8"; ctx.lineWidth = 1.1 * Math.min(1.4, k + 0.2); strokeSet(L.canal, 1.2);
      ctx.strokeStyle = "#6f9fbf"; ctx.lineWidth = 1.3; strokeSet(L.coast, 1.2);
      const showMinor = !interacting && (W / s) * (H / s) < NX * NY * 0.3;
      for (const c of ORDER) {
        if (c === "minor" && !showMinor) continue;
        const [col, casing, w0] = ROAD[c], w = w0 * k;
        if (casing) { ctx.strokeStyle = "rgba(251,246,232,.85)"; ctx.lineWidth = w + 1.8; strokeSet(L.roads[c], 1); }
        ctx.strokeStyle = col; ctx.lineWidth = w; strokeSet(L.roads[c], c === "minor" ? 2 : 1);
      }
      ctx.strokeStyle = "#2a2621"; ctx.lineWidth = Math.max(1, 1.1 * k); ctx.setLineDash([5 * k + 2, 4 * k + 2]); ctx.lineCap = "butt";
      strokeSet(L.rail, 1.5); ctx.setLineDash([]); ctx.lineCap = "round";
    }
    obstacles = { names: [], line: [], notes: [] };
    const lg = lineGeometry();
    obstacles.line = lg.samples;
    if (L.roads) obstacles.names = drawNames(lg);
    obstacles.notes.push(...drawLine(lg));
    drawFurniture();
    paint.ms = performance.now() - t0;
    for (const f of handlers.draw) f();
  }

  // ---------- view ----------
  function clamp(v) {
    const sMin = Math.min(W / NX, H / NY) * 0.9, sMax = 18;
    v.s = Math.max(sMin, Math.min(sMax, v.s));
    const vw = W / v.s, vh = H / v.s, padx = Math.min(vw * 0.25, 60), pady = Math.min(vh * 0.25, 60);
    v.x0 = vw >= NX + padx * 2 ? (NX - vw) / 2 : Math.max(-padx, Math.min(NX - vw + padx, v.x0));
    v.y0 = vh >= NY + pady * 2 ? (NY - vh) / 2 : Math.max(-pady, Math.min(NY - vh + pady, v.y0));
    return v;
  }
  function setView(v, animate) {
    const to = clamp({ ...v });
    if (anim) cancelAnimationFrame(anim.id);
    if (!animate) { Object.assign(view, to); anim = null; emit(); draw(); return; }
    const from = { ...view }, t0 = performance.now(), dur = 380;
    const step = (t) => {
      const q = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - q, 3);
      // interpolate scale geometrically, keep centre moving linearly
      const s = from.s * Math.pow(to.s / from.s, e);
      const cx = (from.x0 + W / 2 / from.s) * (1 - e) + (to.x0 + W / 2 / to.s) * e, cy = (from.y0 + H / 2 / from.s) * (1 - e) + (to.y0 + H / 2 / to.s) * e;
      view.s = s; view.x0 = cx - W / 2 / s; view.y0 = cy - H / 2 / s;
      emit(); paint();
      if (q < 1) anim.id = requestAnimationFrame(step); else anim = null;
    };
    anim = { id: requestAnimationFrame(step) };
  }
  function fitRect(r, pad = 24, animate = false, minS, maxS) { // r in cells: {x0,y0,x1,y1}
    const bw = Math.max(1, r.x1 - r.x0), bh = Math.max(1, r.y1 - r.y0);
    let s = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
    if (minS) s = Math.max(s, minS); if (maxS) s = Math.min(s, maxS);
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    setView({ s, x0: cx - W / 2 / s, y0: cy - H / 2 / s }, animate);
  }
  function zoomAt(f, x = W / 2, y = H / 2, animate = true) {
    const [X, Y] = toCell(x, y), s = view.s * f;
    setView({ s, x0: X - x / s, y0: Y - y / s }, animate);
  }
  function emit() { for (const f of handlers.view) f(view); }

  function resize() {
    const r = root.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return;
    const first = !W;
    const cx = view.x0 + W / 2 / view.s, cy = view.y0 + H / 2 / view.s, oldW = W;
    W = w; H = h; dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    if (!first && oldW) { view.x0 = cx - W / 2 / view.s; view.y0 = cy - H / 2 / view.s; clamp(view); }
    emit(); draw();
  }

  // ---------- gestures ----------
  const ptr = new Map();
  let g = null; // current gesture
  const idle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { interacting = false; draw(); emit(); }, 140); };
  const rel = (e) => { const r = root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  root.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".mapbtns") || (e.button && e.button !== 0)) return;
    ptr.set(e.pointerId, rel(e));
    const mode = root.dataset.mode;
    if (anim) { cancelAnimationFrame(anim.id); anim = null; }
    if (ptr.size === 1) g = { kind: mode, start: rel(e), v0: { ...view }, moved: false, id: e.pointerId };
    else if (ptr.size === 2 && mode === "move") {
      const [a, b] = [...ptr.values()];
      g = { kind: "pinch", v0: { ...view }, d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], moved: true };
    } else if (g && g.kind === "cut") { g.cancelled = true; }
  });
  root.addEventListener("pointermove", (e) => {
    if (!ptr.has(e.pointerId) || !g) return;
    const p = rel(e); ptr.set(e.pointerId, p);
    if (g.cancelled) return;
    if (g.kind === "move") {
      const dx = p[0] - g.start[0], dy = p[1] - g.start[1];
      if (!g.moved && Math.hypot(dx, dy) < 5) return;
      if (!g.moved) { g.moved = true; interacting = true; root.classList.add("dragging"); try { root.setPointerCapture(e.pointerId); } catch {} }
      view.x0 = g.v0.x0 - dx / g.v0.s; view.y0 = g.v0.y0 - dy / g.v0.s; clamp(view);
      emit(); draw(); idle();
    } else if (g.kind === "pinch" && ptr.size >= 2) {
      const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const s = g.v0.s * (d / g.d0);
      const X = g.m0[0] / g.v0.s + g.v0.x0, Y = g.m0[1] / g.v0.s + g.v0.y0;
      interacting = true; view.s = s; view.x0 = X - m[0] / s; view.y0 = Y - m[1] / s; clamp(view);
      emit(); draw(); idle();
    } else if (g.kind === "cut") {
      if (!g.moved && Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) < 6) return;
      if (!g.moved) { g.moved = true; root.classList.add("dragging"); try { root.setPointerCapture(e.pointerId); } catch {} }
      const A = toCell(g.start[0], g.start[1]), B = toCell(p[0], p[1]);
      for (const f of handlers.cut) f({ A, B, final: false });
    }
  });
  const up = (e) => {
    if (!ptr.has(e.pointerId)) return;
    const p = rel(e); ptr.delete(e.pointerId);
    if (g && g.kind === "cut" && g.id === e.pointerId && g.moved && !g.cancelled && e.type === "pointerup") {
      const long = Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) >= 28;
      const A = toCell(g.start[0], g.start[1]), B = toCell(p[0], p[1]);
      for (const f of handlers.cut) f({ A, B, final: true, tooShort: !long });
    }
    if (ptr.size === 0) { g = null; root.classList.remove("dragging"); if (interacting) idle(); }
    else if (ptr.size === 1 && g && g.kind === "pinch") { const [only] = [...ptr.values()]; g = { kind: "move", start: only, v0: { ...view }, moved: true, id: [...ptr.keys()][0] }; }
  };
  root.addEventListener("pointerup", up); root.addEventListener("pointercancel", up);
  root.addEventListener("wheel", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return; // plain wheel scrolls the page
    e.preventDefault();
    const [x, y] = rel(e); interacting = true;
    zoomAt(Math.exp(-e.deltaY * 0.012), x, y, false); idle();
  }, { passive: false });
  root.addEventListener("dblclick", (e) => { if (root.dataset.mode === "move" && !e.target.closest(".mapbtns")) { const [x, y] = rel(e); zoomAt(2, x, y, true); } });
  new ResizeObserver(resize).observe(root);

  return {
    view, setBasemap, setLine, setRelief, setSea, draw, paint, resize, setView, fitRect, zoomAt,
    project: toScreen, unproject: toCell,
    size: () => [W, H], obstacles: () => obstacles, paintMs: () => paint.ms,
    on: (ev, f) => handlers[ev].push(f),
    setMode: (m) => { root.dataset.mode = m; },
    lineGeometry,
  };
}
