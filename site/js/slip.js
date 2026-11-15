// Sideways slip (optional, see docs/slip.md): with the before/after slider the ground either side of the
// surface rupture slides along the line, hugely exaggerated, like a map torn along the fault. The movement
// is from field tape measurements and GPS, not NISAR; every number and sentence about it comes from
// slip.json. event.js imports this module only when the URL has `slip`.
import * as THREE from "three";

// The viewer leaves the mesh where it is and changes what each point shows: slipSrc(p) is where the ground
// now at p came from. The field jumps at the line, so it is stored twice, each copy extended a couple of
// cells past the line from its own side, and the side is picked from a signed distance to the line: both
// filter linearly and neither reads the other side's value, so the tear is sharp at any zoom.
const GLSL = /* glsl */ `
uniform sampler2D uSlipF, uSlipL;          // F: east, north mm (side +), east, north mm (side -). L: signed, unsigned distance, arc (cells), measured
uniform float uSlipK, uSlipShow, uSlipPx;
uniform vec2 uSlipScale, uSlipGrid, uSlipN;
vec2 slipSrc(vec2 p) {
  vec4 f = texture2D(uSlipF, p);
  return p - (texture2D(uSlipL, p).r >= 0.0 ? f.rg : f.ba) * uSlipScale * uSlipK * uT;
}`;
const FRAG = /* glsl */ `
vec3 slipDraw(vec3 col, vec2 p, vec2 q) {
  // Reference grid printed on the ground, so it moves with it: 2 km squares, every fifth line brighter,
  // because the offset across the line is about two squares and a plain grid would alias it away.
  vec2 g = q * uSlipGrid, gl = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), 1e-5);
  vec2 m = g / 5.0, ml = abs(fract(m - 0.5) - 0.5) / max(fwidth(m), 1e-5);
  col = mix(col, vec3(1.0), 0.16 * uSlipShow * (1.0 - min(min(gl.x, gl.y) / uSlipPx, 1.0)));
  col = mix(col, vec3(1.0), 0.4 * uSlipShow * (1.0 - min(min(ml.x, ml.y) / (1.5 * uSlipPx), 1.0)));
  // The line, fixed: red, solid where measured, dashed where not, with a dark edge. Width in screen pixels.
  vec4 l = texture2D(uSlipL, p);
  float d = l.g < 2.0 ? abs(l.r) : l.g;               // signed distance interpolates cleanly across the line
  vec2 c = p * uSlipN;                                // cells per screen pixel, whatever the field does
  float px = l.g > 8.0 ? 99.0 : d / max(max(length(dFdx(c)), length(dFdy(c))), 1e-5) / uSlipPx;
  float on = l.a > 0.5 ? 1.0 : step(0.45, fract(l.b / 7.0));
  col = mix(col, vec3(0.05), uSlipShow * on * (1.0 - smoothstep(2.4, 3.2, px)));
  col = mix(col, vec3(1.0, 0.13, 0.1), uSlipShow * on * (1.0 - smoothstep(1.3, 2.0, px)));
  return col;
}`;

// Fetch slip.json and the field; null when the event has none (the URL switch is then ignored).
export async function load(base, meta) {
  const r = await fetch(base + "slip.json").catch(() => null);
  if (!r?.ok) return null;
  const doc = await r.json();
  const { nx, ny, file } = doc.field, n = nx * ny;
  const all = new Int16Array(await (await fetch(base + file)).arrayBuffer());
  const east = all.subarray(0, n), north = all.subarray(n, 2 * n);
  const L = lineField(doc.line.points, nx, ny);
  // Each side's field, extended two cells across the line so linear filtering never mixes the sides.
  const F = new Float32Array(4 * n);
  for (const [side, o] of [[1, 0], [-1, 2]]) {
    const own = new Uint8Array(n);
    for (let c = 0; c < n; c++) if ((L[4 * c] >= 0 ? 1 : -1) === side) { own[c] = 1; F[4 * c + o] = east[c]; F[4 * c + o + 1] = north[c]; }
    for (let pass = 0; pass < 2; pass++) {
      const add = [];
      for (let i = 0; i < ny; i++) for (let j = 0; j < nx; j++) {
        const c = i * nx + j;
        if (own[c]) continue;
        let e = 0, no = 0, k = 0;
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          const ii = i + di, jj = j + dj, cc = ii * nx + jj;
          if (ii >= 0 && jj >= 0 && ii < ny && jj < nx && own[cc]) { e += F[4 * cc + o]; no += F[4 * cc + o + 1]; k++; }
        }
        if (k) add.push([c, e / k, no / k]);
      }
      for (const [c, e, no] of add) { own[c] = 1; F[4 * c + o] = e; F[4 * c + o + 1] = no; }
    }
  }
  const tex = (d) => { const t = new THREE.DataTexture(d, nx, ny, THREE.RGBAFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t; };
  const W = meta.grid.nx * meta.grid.dx, H = meta.grid.ny * meta.grid.dx;
  // Default exaggeration: the largest movement is about 3% of the scene's width, rounded to two figures.
  const k0 = round2((0.03 * W) / (doc.field.max_mm / 1000));
  const uniforms = {
    uSlipF: { value: tex(F) }, uSlipL: { value: tex(L) }, uSlipK: { value: 0 }, uSlipShow: { value: 0 }, uSlipPx: { value: 1 },
    uSlipScale: { value: new THREE.Vector2(1 / (1000 * W), -1 / (1000 * H)) },          // mm east/north -> (u, v), v south
    uSlipGrid: { value: new THREE.Vector2(W / 2000, H / 2000) }, uSlipN: { value: new THREE.Vector2(nx, ny) },
  };
  // JS twin of slipSrc, forwards: where the ground that started at (u, v) is now (pins, labels).
  const shift = (u, v, t) => {
    const c = Math.min(ny - 1, Math.max(0, Math.floor(v * ny))) * nx + Math.min(nx - 1, Math.max(0, Math.floor(u * nx)));
    const s = uniforms.uSlipK.value * t / 1000;
    return [u + (east[c] * s) / W, v - (north[c] * s) / H];
  };
  return { doc, k0, W, H, viewer: { glsl: GLSL, frag: FRAG, uniforms, shift } };
}

const round2 = (x) => { const p = 10 ** (Math.floor(Math.log10(x)) - 1); return Math.round(x / p) * p; };

// Per cell: signed distance to the line, unsigned distance, arc length from the north-east end, measured flag
// (all in cells). Exact near the line; far away a coarse pass is enough (only the side matters there).
function lineField(points, nx, ny) {
  const P = points.map(([u, v, m]) => [u * nx - 0.5, v * ny - 0.5, m]), m = P.length - 1;
  const cum = [0];
  for (let k = 0; k < m; k++) cum.push(cum[k] + Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]));
  const out = new Float32Array(4);
  const near = (x, y) => {
    let best = Infinity;
    for (let k = 0; k < m; k++) {
      const [ax, ay, am] = P[k], bx = P[k + 1][0] - ax, by = P[k + 1][1] - ay, px = x - ax, py = y - ay;
      const t = Math.min(1, Math.max(0, (px * bx + py * by) / (bx * bx + by * by || 1)));
      const dx = px - t * bx, dy = py - t * by, d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        const d = Math.sqrt(d2);
        out[0] = bx * py - by * px >= 0 ? d : -d; out[1] = d; out[2] = cum[k] + t * Math.hypot(bx, by); out[3] = t < 0.5 ? am : P[k + 1][2];
      }
    }
    return out;
  };
  const S = 6, cw = Math.ceil(nx / S) + 1, ch = Math.ceil(ny / S) + 1, C = new Float32Array(4 * cw * ch);
  for (let i = 0; i < ch; i++) for (let j = 0; j < cw; j++) C.set(near(j * S, i * S), 4 * (i * cw + j));
  const L = new Float32Array(4 * nx * ny);
  for (let i = 0; i < ny; i++) for (let j = 0; j < nx; j++) {
    const c = 4 * (Math.round(i / S) * cw + Math.round(j / S));
    L.set(C[c + 1] > 4 * S ? C.subarray(c, c + 4) : near(j, i), 4 * (i * nx + j));
  }
  return L;
}

const CSS = `
.slip-gps { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; overflow: visible; }
.slip-gps .sh { stroke: #000c; stroke-width: 5; stroke-linecap: round; fill: none; }
.slip-gps .ar { stroke: #fff; stroke-width: 2.5; stroke-linecap: round; fill: none; }
.slip-gps .hd { fill: #fff; stroke: #000c; stroke-width: 1.5; stroke-linejoin: round; }
.slip-gps circle { fill: #fff; stroke: #000c; stroke-width: 1.5; }
.slip-gps text { font: 700 12px system-ui, sans-serif; fill: #fff; paint-order: stroke; stroke: #000d; stroke-width: 3px; }
.slip-key { display: inline-block; width: 1.6em; height: 0; border-top: 3px solid #ff2219; vertical-align: middle; }
.slip-key.dash { border-top-style: dashed; }
.slip-key.gps { border-top-color: #fff; box-shadow: 0 0 0 1px #000; }
`;

// ctx: { v (viewer), meta, data (from load), on, t (number or null), sky, setEx (event.js's own) }.
// Returns { on, set(on), exag() }: the page's single switch.
export function mount({ v, meta, data, on, t, sky, setEx }) {
  const $ = (s) => document.querySelector(s);
  const { doc, k0, W, H } = data, U = data.viewer.uniforms, hero = $("#hero");
  document.head.insertAdjacentHTML("beforeend", `<style id="slip-css">${CSS}</style>`);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // The checkbox, after Fringes.
  $("#fringes").parentElement.insertAdjacentHTML("afterend", `<label title="Ground either side of the fault slides along it (field survey and GPS, not NISAR)"><input id="slip" type="checkbox"> Sideways slip</label>`);
  const box = $("#slip"), ex = $("#exag"), exOut = $("#exag-out"), exLabel = ex.parentElement.firstChild;
  const legend = $("#legend"), legend0 = legend.innerHTML, label0 = exLabel.textContent;

  // GPS arrows: measured movement, tail fixed where the station started, same exaggeration as the ground.
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.classList.add("slip-gps");
  hero.appendChild(svg);
  const big = Math.max(...doc.gps.map((g) => Math.hypot(g.east_cm, g.north_cm)));
  const arrows = doc.gps.map((g) => {
    const el = document.createElementNS(NS, "g");
    el.innerHTML = `<path class="sh"/><path class="ar"/><path class="hd"/><circle r="3"/><text></text>`;
    svg.appendChild(el);
    const cm = Math.hypot(g.east_cm, g.north_cm);
    el.querySelector("text").textContent = cm >= 0.15 * big ? `${Math.round(cm)} cm` : "";
    el.querySelector("title")?.remove();
    return { g, el, parts: [...el.children] };
  });
  const pt = new THREE.Vector3();
  const scr = (pu, pv, y) => {
    pt.set(pu - 0.5, y, (pv - 0.5) * v.aspect).project(v.camera);
    return pt.z > 1 ? null : [((pt.x + 1) / 2) * hero.clientWidth, ((1 - pt.y) / 2) * hero.clientHeight];
  };
  v.onFrame(() => {
    if (svg.hidden) return;
    const s = (U.uSlipK.value * (+$("#t").value / 1000)) / 100;     // cm -> m, exaggerated, times the slider
    for (const { g, parts: [sh, ar, hd, dot, tx] } of arrows) {
      const y = v.heightAt(g.u, g.v) + 0.002;
      const a = scr(g.u, g.v, y), b = scr(g.u + (g.east_cm * s) / W, g.v - (g.north_cm * s) / H, y);
      if (!a || !b) { sh.parentNode.style.display = "none"; continue; }
      sh.parentNode.style.display = "";
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), ux = dx / (len || 1), uy = dy / (len || 1);
      const hl = Math.min(10, len * 0.6), bx = b[0] - ux * hl, by = b[1] - uy * hl;
      const line = len > 3 ? `M${a[0]},${a[1]}L${bx},${by}` : "";
      sh.setAttribute("d", line); ar.setAttribute("d", line);
      hd.setAttribute("d", len > 3 ? `M${b[0]},${b[1]}L${bx - uy * hl * 0.55},${by + ux * hl * 0.55}L${bx + uy * hl * 0.55},${by - ux * hl * 0.55}Z` : "");
      dot.setAttribute("cx", a[0]); dot.setAttribute("cy", a[1]);
      // Size beside the head, on the side away from the tail.
      tx.setAttribute("x", b[0] + (ux >= 0 ? 6 : -6)); tx.setAttribute("y", b[1] + (uy >= 0 ? 14 : -6));
      tx.setAttribute("text-anchor", ux >= 0 ? "start" : "end");
      tx.style.opacity = len > 12 ? 1 : 0;
    }
  });

  const fmt = (k) => `×${round2(k).toLocaleString("en")}`;
  const k = () => round2(k0 * 10 ** (ex.value / 100));
  const caption = () => {
    const x = doc.text;
    legend.innerHTML = `<strong>Sideways slip, exaggerated ${fmt(k())}</strong> (the largest movement in the picture is ${Math.round(doc.field.max_mm / 10)} cm on the ground). `
      + `${esc(x.measured)} ${esc(x.drawn)} ${esc(x.caveat)} Height is terrain only. `
      + `<span class="slip-key"></span> the surface rupture, solid where the radar sees the step, <span class="slip-key dash"></span> dashed where only the field survey traces it. `
      + `<span class="slip-key gps"></span> GPS stations: measured movement, same exaggeration. Faint grid: 2 km squares (brighter every 10 km) printed on the ground, so it moves with it. `
      + "Drag to orbit, ctrl/⌘ + scroll (or pinch) to zoom.";
  };
  const credits = (doc.credits ?? []).map((c) => { const li = document.createElement("li"); li.textContent = c; return li; });

  const api = {
    on: false,
    // Slider moved while slip is on: it sets the slip exaggeration.
    exag() { U.uSlipK.value = k(); exOut.textContent = fmt(U.uSlipK.value); caption(); },
    set(x) {
      api.on = box.checked = x;
      U.uSlipShow.value = x ? 1 : 0;
      svg.hidden = !x;
      if (x) {
        v.setLosExag(0);                                   // height is terrain only
        exLabel.textContent = "Slip exaggeration ";
        api.exag();
        $("#sources").append(...credits);
      } else {
        U.uSlipK.value = 0;
        exLabel.textContent = label0;
        legend.innerHTML = legend0;
        credits.forEach((li) => li.remove());
        setEx();                                           // back to motion as height
      }
    },
  };
  box.addEventListener("change", () => api.set(box.checked));

  if (on) {
    // Look steeply down on the middle of the line, north up, framed on its whole length; skycam off.
    sky.set(false);
    $("#opt-skycam").checked = false;
    const P = doc.line.points, us = P.map((p) => p[0]), vs = P.map((p) => p[1]);
    const cu = (Math.min(...us) + Math.max(...us)) / 2, cv = (Math.min(...vs) + Math.max(...vs)) / 2;
    const hx = ((Math.max(...us) - Math.min(...us)) / 2) * 1.25, hz = ((Math.max(...vs) - Math.min(...vs)) / 2) * v.aspect * 1.25;
    const f = Math.tan((v.camera.fov * Math.PI) / 360), a = hero.clientWidth / Math.max(1, hero.clientHeight);
    const d = Math.max(hz / f, hx / (f * a)), tilt = (15 * Math.PI) / 180, y = v.smoothHeightAt(cu, cv);
    v.controls.target.set(cu - 0.5, y, (cv - 0.5) * v.aspect);
    v.camera.position.set(cu - 0.5, y + d * Math.cos(tilt), (cv - 0.5) * v.aspect + d * Math.sin(tilt));
    v.camera.lookAt(v.controls.target);
    v.controls.update();
  }
  api.set(on);
  if (t != null) {
    // Repeatable still: slider held at t, no autoplay loop (this page view only), no skycam.
    sky.set(false);
    $("#opt-skycam").checked = false;
    const s = $("#t");
    s.value = Math.round(Math.min(1, Math.max(0, t)) * 1000);
    s.dispatchEvent(new Event("input"));
  }
  return api;
}
