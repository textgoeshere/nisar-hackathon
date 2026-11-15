// 3D event viewer: terrain from the DEM, NISAR line-of-sight motion added as (exaggerated) height,
// the Sentinel-2 image draped on top and interferogram fringes blended in. All layers share the
// event grid, so (u, v) = (east, south) fractions locate a point in every layer.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const VERT = /* glsl */ `
uniform sampler2D uDem, uLos;
uniform float uDemExag, uLosExag, uT, uAspect, uDemBase, uWidth;
varying vec2 vUv;
varying float vLos;
varying vec3 vNormal;
#ifdef SLIP
SLIP_GLSL
#define S(p) slipSrc(p)
#else
#define S(p) (p)
#endif
float h(vec2 p) {
  p = S(p);                                        // slip: where the ground now at p came from
  return ((texture2D(uDem, p).r - uDemBase) * uDemExag + texture2D(uLos, p).r * uT * uLosExag) / uWidth;
}
void main() {
  vec2 p = vec2(uv.x, 1.0 - uv.y);                 // data row 0 = north
  float e = 1.0 / 512.0;
  float hx = h(p + vec2(e, 0.0)) - h(p - vec2(e, 0.0));
  float hz = h(p + vec2(0.0, e)) - h(p - vec2(0.0, e));
  vNormal = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e * uAspect)));
  vUv = p;
  vLos = texture2D(uLos, S(p)).r * uT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x - 0.5, h(p), (p.y - 0.5) * uAspect, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uGround, uGround0, uCoh, uValid, uDrop;
uniform float uHasGround0;
uniform float uHasGround, uFringe, uCycle, uMode, uLim, uT;
uniform vec3 uDropCol;
varying vec2 vUv;
varying float vLos;
varying vec3 vNormal;
#ifdef SLIP
SLIP_GLSL
SLIP_FRAG
#define S(p) slipSrc(p)
#define B0 (1.0 - uSlipShow)                       // slip: hold the after image, so only the ground moves
#else
#define S(p) (p)
#define B0 1.0
#endif
vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}
void main() {
  vec2 q = S(vUv);                                 // slip: every lookup below goes through q
  float lit = 0.4 + 0.7 * max(dot(normalize(vNormal), normalize(vec3(-0.5, 0.8, -0.3))), 0.0);
  vec3 base = uHasGround > 0.5 ? texture2D(uGround, q).rgb : vec3(0.6, 0.58, 0.54);
  // Optional before image: the slider fades it into the after image. Cloud holes (black) keep the after.
  if (uHasGround > 0.5 && uHasGround0 > 0.5) {
    vec3 b0 = texture2D(uGround0, q).rgb;
    float ok = smoothstep(0.02, 0.06, max(b0.r, max(b0.g, b0.b)));
    base = mix(base, b0, ok * (1.0 - uT) * B0);
  }
  // Mute the satellite image a little so the artificial change colours stand out against it.
  base = mix(vec3(dot(base, vec3(0.299, 0.587, 0.114))), base, 0.65) * 0.9;
  vec3 col = base * lit;
  float coh = texture2D(uCoh, q).r, valid = texture2D(uValid, q).r;
  vec3 fr = hsv(fract(vLos / uCycle), 0.85, 1.0) * lit;
  if (uMode > 1.5) {
    // Change footprint, fading in with the before -> after slider. Landslide: coherence collapsed
    // (the surface was buried or torn up). Flood: ground turned radar-dark (open water). Fire:
    // vegetation backscatter fell (burn scar).
    // Neon fill plus a bright outline at the footprint's edge.
    float x = texture2D(uDrop, q).r;
    float d = smoothstep(0.25, 0.5, x) * uT;
    col = mix(col, uDropCol * (0.6 + 0.4 * lit), d * 0.85);
    float edge = 1.0 - smoothstep(0.0, max(1.5 * fwidth(x), 1e-3), abs(x - 0.375));
    edge *= step(1e-4, fwidth(x));      // flat field: no edge
    col = mix(col, mix(uDropCol, vec3(1.0), 0.45), edge * uT * 0.9);
  } else if (uMode > 0.5) {
    // Subsidence: light red tint where the ground sinks plus a contour every 2 cm, so the city stays
    // readable. Apparent rise of a couple of cm is within the fit's noise, so it gets nothing.
    // Only motion beyond ~2 cm (twice the fit's scatter) is drawn: contours every 5 cm.
    float x = clamp((-vLos - 0.02) / uLim, 0.0, 1.0);
    col = mix(col, vec3(1.0, 0.15, 0.65) * (0.6 + 0.4 * lit), valid * 0.8 * smoothstep(0.0, 0.6, x));
    float c = vLos / 0.05, w = max(fwidth(c), 1e-4);
    float line = 1.0 - smoothstep(0.0, 1.2 * w, abs(fract(c + 0.5) - 0.5));
    col = mix(col, vec3(1.0, 0.6, 0.9), valid * line * 0.9 * step(0.02, -vLos));
  }
  col = mix(col, fr, 0.7 * uFringe * valid * smoothstep(0.3, 0.55, coh) * smoothstep(0.0, 0.003, abs(vLos)));
#ifdef SLIP
  col = slipDraw(col, vUv, q);                     // slip: the line and the moving grid
#endif
  gl_FragColor = vec4(col, 1.0);
}`;

// Kinds where motion is not the signal: no height exaggeration, no fringes.
export const STILL = ["landslide", "flood", "fire"];

// Prefetched downloads, so a carousel can pull the next event over the network while the current one plays.
const cache = new Map();
export function prefetch(base, meta) {
  const urls = [meta.layers.dem, meta.layers.surface ?? meta.layers.los, meta.layers.valid, meta.layers.coh,
    meta.layers.cohdrop ?? meta.layers.change].filter(Boolean).map((f) => base + f);
  for (const u of urls) if (!cache.has(u)) cache.set(u, fetch(u).then((r) => r.arrayBuffer()));
  if (meta.ground && !cache.has(base + meta.ground))
    cache.set(base + meta.ground, fetch(base + meta.ground).then((r) => r.blob()).then((b) => URL.createObjectURL(b)));
  return Promise.all([...cache.entries()].filter(([u]) => u.startsWith(base)).map(([, p]) => p));
}
function take(url, fallback) {
  const p = cache.get(url);
  cache.delete(url);
  return p ?? fallback();
}
async function layer(url, Type) {
  return new Type(await take(url, () => fetch(url).then((r) => r.arrayBuffer())));
}

function tex(data, w, h) {
  const t = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// opts: segments (mesh resolution cap), pixelRatio cap, autoStart (false: call start() to begin rendering).
// slip: optional { glsl, frag, uniforms, shift } from slip.js; absent, the shaders compile exactly as before.
export async function createViewer(el, base, meta, opts = {}) {
  const { nx, ny, dx } = meta.grid;
  const width = nx * dx, aspect = ny / nx;
  const [dem16, los16, valid8, coh8] = await Promise.all([
    layer(base + meta.layers.dem, Int16Array), layer(base + (meta.layers.surface ?? meta.layers.los), Int16Array),
    layer(base + meta.layers.valid, Uint8Array), layer(base + meta.layers.coh, Uint8Array),
  ]);
  const dem = Float32Array.from(dem16), los = Float32Array.from(los16, (v) => v / 1000);
  let demMin = Infinity, demMax = -Infinity;
  for (const v of dem) { demMin = Math.min(demMin, v); demMax = Math.max(demMax, v); }
  // 99th percentile of |motion| by histogram (mm bins): a full sort stalls the page for a frame or ten.
  const hist = new Uint32Array(32768);
  for (const v of los16) hist[Math.min(32767, Math.abs(v))]++;
  let acc = 0, p99 = 0;
  for (; p99 < 32768 && (acc += hist[p99]) < los16.length * 0.99; p99++);
  const losMax = Math.max(0.01, p99 / 1000);

  const u = {
    uDem: { value: tex(dem, nx, ny) }, uLos: { value: tex(los, nx, ny) },
    uValid: { value: tex(Float32Array.from(valid8), nx, ny) }, uCoh: { value: tex(Float32Array.from(coh8, (v) => v / 255), nx, ny) },
    uGround: { value: null }, uHasGround: { value: 0 }, uGround0: { value: null }, uHasGround0: { value: 0 },
    uDemExag: { value: Math.min(5, Math.max(1, (0.08 * width) / Math.max(1, demMax - demMin))) },
    uLosExag: { value: (meta.still || STILL.includes(meta.kind)) ? 0 : (0.03 * width) / losMax }, uT: { value: 1 }, uAspect: { value: aspect },
    uDemBase: { value: demMin }, uWidth: { value: width }, uFringe: { value: meta.kind === "subsidence" || (meta.still || STILL.includes(meta.kind)) ? 0 : 1 }, uCycle: { value: 0.1 },
    uMode: { value: meta.still ? 2 : { subsidence: 1, landslide: 2, flood: 2, fire: 2 }[meta.kind] ?? 0 }, uLim: { value: 1 },
    uDrop: { value: tex(new Float32Array(1), 1, 1) },
    uDropCol: { value: new THREE.Color({ flood: 0x00e5ff, fire: 0xff3d00 }[meta.kind] ?? 0xff2bd6) },
  };
  u.uLim.value = losMax;
  const drop = meta.layers.cohdrop ?? meta.layers.change;
  let drop8 = null;
  if (drop) {
    drop8 = await layer(base + drop, Uint8Array);
    u.uDrop.value = tex(Float32Array.from(drop8, (v) => v / 255), nx, ny);
  }
  if (meta.ground) {
    const g = await new THREE.TextureLoader().loadAsync(await take(base + meta.ground, () => base + meta.ground));
    g.anisotropy = 8;
    u.uGround.value = g; u.uHasGround.value = 1;
  }
  if (opts.groundBefore) {                                // e.g. optical-before.jpg, same grid as the ground image
    try {
      const g0 = await new THREE.TextureLoader().loadAsync(base + opts.groundBefore);
      g0.anisotropy = 8;
      u.uGround0.value = g0; u.uHasGround0.value = 1;
    } catch {}
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, opts.pixelRatio ?? 2));
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f19);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.001, 20);
  camera.position.set(0, 0.6, 0.9 * Math.max(1, aspect));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.48;
  const sl = opts.slip;                                                                   // slip:
  if (sl) { Object.assign(u, sl.uniforms); u.uSlipPx.value = renderer.getPixelRatio(); }   // slip:
  const chunk = (s) => (sl ? s.replace(/SLIP_GLSL/g, sl.glsl).replace("SLIP_FRAG", sl.frag) : s); // slip:
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, Math.min(nx - 1, opts.segments ?? 1e9), Math.min(ny - 1, Math.round((opts.segments ?? 1e9) * aspect))),
    new THREE.ShaderMaterial({ vertexShader: chunk(VERT), fragmentShader: chunk(FRAG), uniforms: u, extensions: { derivatives: true }, ...(sl ? { defines: { SLIP: 1 } } : {}) })); // slip: chunk, defines
  mesh.frustumCulled = false;
  scene.add(mesh);

  function heightAt(pu, pv) {
    const i = Math.min(ny - 1, Math.max(0, Math.round(pv * (ny - 1))));
    const j = Math.min(nx - 1, Math.max(0, Math.round(pu * (nx - 1))));
    const k = i * nx + j;
    return ((dem[k] - demMin) * u.uDemExag.value + los[k] * u.uT.value * u.uLosExag.value) / width;
  }
  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;                                 // hidden / collapsed: keep the last good size and aspect
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const frameHooks = [];
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  // A throwing hook must not kill the loop (three stops requesting frames, and the next resize clears
  // the canvas to blank); a NaN camera (e.g. from a bad orbit) is reset rather than rendered blank.
  const home = camera.position.clone();
  const start = () => renderer.setAnimationLoop(() => {
    controls.update();
    for (const f of frameHooks) { try { f(); } catch (e) { console.error(e); } }
    const p = camera.position, t = controls.target;
    if (![p.x, p.y, p.z, t.x, t.y, t.z].every(Number.isFinite)) { p.copy(home); t.set(0, 0, 0); controls.update(); }
    renderer.render(scene, camera);
  });
  // GPU context lost (memory pressure, tab in the background on phones, GPU reset): ask the browser to
  // restore it, and if it doesn't come back, offer a reload instead of a silent black box.
  const cv = renderer.domElement;
  cv.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    console.warn("WebGL context lost");
    setTimeout(() => {
      if (!renderer.getContext().isContextLost() || el.querySelector(".gl-lost")) return;
      const m = document.createElement("button");
      m.className = "gl-lost"; m.type = "button"; m.textContent = "The 3D view was paused by the browser. Tap to reload it.";
      m.onclick = () => location.reload();
      el.appendChild(m);
    }, 2000);
  });
  cv.addEventListener("webglcontextrestored", () => { el.querySelector(".gl-lost")?.remove(); console.warn("WebGL context restored"); });
  if (opts.autoStart !== false) start();

  // Coarse G x G grids: mean height (smooth camera targets) and max height (camera floor), bilinear.
  const G = 64, gMean = new Float32Array(G * G * 2), gMax = new Float32Array(G * G * 2);
  {
    const cnt = new Uint32Array(G * G);
    gMax.fill(-Infinity);
    for (let i = 0; i < ny; i += 2) for (let j = 0; j < nx; j += 2) {
      const k = i * nx + j, c = Math.floor((i * G) / ny) * G + Math.floor((j * G) / nx);
      gMean[2 * c] += dem[k] - demMin; gMean[2 * c + 1] += los[k]; cnt[c]++;
      if (dem[k] - demMin > gMax[2 * c]) gMax[2 * c] = dem[k] - demMin;
      if (los[k] > gMax[2 * c + 1]) gMax[2 * c + 1] = los[k];
    }
    for (let c = 0; c < G * G; c++) { gMean[2 * c] /= cnt[c] || 1; gMean[2 * c + 1] /= cnt[c] || 1; }
  }
  function gridHeight(g, pu, pv) {
    const x = Math.min(G - 1, Math.max(0, pu * G - 0.5)), y = Math.min(G - 1, Math.max(0, pv * G - 0.5));
    const j = Math.min(G - 2, Math.floor(x)), i = Math.min(G - 2, Math.floor(y)), fx = x - j, fy = y - i;
    const at = (ii, jj) => { const c = ii * G + jj; return (g[2 * c] * u.uDemExag.value + g[2 * c + 1] * u.uT.value * u.uLosExag.value) / width; };
    return (at(i, j) * (1 - fx) + at(i, j + 1) * fx) * (1 - fy) + (at(i + 1, j) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
  }

  return {
    losMax, losExag0: u.uLosExag.value || (0.03 * width) / losMax,
    setT(t) { u.uT.value = t; },
    setLosExag(x) { u.uLosExag.value = x; },
    setFringe(on) { u.uFringe.value = on ? 1 : 0; },
    setCycle(m) { u.uCycle.value = m; },
    setGround(on) { u.uHasGround.value = on && u.uGround.value ? 1 : 0; },
    onFrame(f) { frameHooks.push(f); },
    camera, controls, aspect, heightAt,
    start, smoothHeightAt: (pu, pv) => gridHeight(gMean, pu, pv), ceilingAt: (pu, pv) => gridHeight(gMax, pu, pv),
    // B x B blocks classed 1 = changed, 0 = unchanged, 2 = neither (no data / in between). Still kinds:
    // share of the block inside the change footprint. Motion kinds: mean |motion| over coherent pixels,
    // split by percentile so every scene has both classes.
    changeField(B = 32) {
      const still = u.uMode.value > 1.5 || !u.uLosExag.value;
      const score = new Float32Array(B * B), cls = new Uint8Array(B * B).fill(2);
      for (let bi = 0; bi < B; bi++) for (let bj = 0; bj < B; bj++) {
        let sum = 0, cnt = 0, n = 0;
        for (let i = Math.floor((bi * ny) / B); i < ((bi + 1) * ny) / B; i += 3)
          for (let j = Math.floor((bj * nx) / B); j < ((bj + 1) * nx) / B; j += 3) {
            const k = i * nx + j; n++;
            if (still) { if (drop8) { sum += drop8[k] > 96 ? 1 : 0; cnt++; } }
            else if (valid8[k]) { sum += Math.abs(los[k]); cnt++; }
          }
        const b = bi * B + bj;
        score[b] = cnt ? sum / cnt : -1;
        if (still) cls[b] = score[b] > 0.12 ? 1 : score[b] >= 0 && score[b] < 0.02 ? 0 : 2;
        else if (cnt < n * 0.3) score[b] = -1;
      }
      if (!still) {
        const v = Array.from(score).filter((x) => x >= 0).sort((a, b) => a - b);
        const lo = v[Math.floor(v.length * 0.35)], hi = v[Math.floor(v.length * 0.65)];
        for (let b = 0; b < B * B; b++) if (score[b] >= 0) cls[b] = score[b] >= hi ? 1 : score[b] <= lo ? 0 : 2;
      }
      return { B, cls };
    },
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
      for (const k in u) if (u[k].value?.isTexture) u[k].value.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
    // Screen position (CSS px within el) of the ground at (u, v); null when behind the camera.
    project([pu, pv], lift = 0.015) {
      const [su, sv] = sl ? sl.shift(pu, pv, u.uT.value) : [pu, pv];                     // slip: rides with its ground
      const p = new THREE.Vector3(su - 0.5, heightAt(pu, pv) + lift, (sv - 0.5) * aspect).project(camera); // slip: su, sv
      if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return null;   // behind the camera or off the view
      return { x: ((p.x + 1) / 2) * el.clientWidth, y: ((1 - p.y) / 2) * el.clientHeight };
    },
  };
}
