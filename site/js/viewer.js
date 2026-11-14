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
float h(vec2 p) {
  return ((texture2D(uDem, p).r - uDemBase) * uDemExag + texture2D(uLos, p).r * uT * uLosExag) / uWidth;
}
void main() {
  vec2 p = vec2(uv.x, 1.0 - uv.y);                 // data row 0 = north
  float e = 1.0 / 512.0;
  float hx = h(p + vec2(e, 0.0)) - h(p - vec2(e, 0.0));
  float hz = h(p + vec2(0.0, e)) - h(p - vec2(0.0, e));
  vNormal = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e * uAspect)));
  vUv = p;
  vLos = texture2D(uLos, p).r * uT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x - 0.5, h(p), (p.y - 0.5) * uAspect, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uGround, uCoh, uValid, uDrop;
uniform float uHasGround, uFringe, uCycle, uMode, uLim;
varying vec2 vUv;
varying float vLos;
varying vec3 vNormal;
vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}
void main() {
  float lit = 0.4 + 0.7 * max(dot(normalize(vNormal), normalize(vec3(-0.5, 0.8, -0.3))), 0.0);
  vec3 base = uHasGround > 0.5 ? texture2D(uGround, vUv).rgb : vec3(0.6, 0.58, 0.54);
  vec3 col = base * lit;
  float coh = texture2D(uCoh, vUv).r, valid = texture2D(uValid, vUv).r;
  vec3 fr = hsv(fract(vLos / uCycle), 0.85, 1.0) * lit;
  if (uMode > 1.5) {
    // Landslide / debris: tint where coherence collapsed across the event (the surface was buried
    // or torn up), with a bright edge so the footprint reads at a glance.
    float d = smoothstep(0.25, 0.5, texture2D(uDrop, vUv).r);
    col = mix(col, vec3(0.95, 0.6, 0.3) * lit, d * 0.6);
  } else if (uMode > 0.5) {
    // Subsidence: light red tint where the ground sinks plus a contour every 2 cm, so the city stays
    // readable. Apparent rise of a couple of cm is within the fit's noise, so it gets nothing.
    float x = clamp(-vLos / uLim, 0.0, 1.0);
    col = mix(col, col * 0.5 + vec3(1.0, 0.25, 0.2) * 0.5 * lit, valid * 0.65 * smoothstep(0.05, 0.9, x));
    float c = vLos / 0.02, w = fwidth(c);
    float line = 1.0 - smoothstep(0.0, 1.2 * w, abs(fract(c + 0.5) - 0.5));
    col = mix(col, vec3(1.0, 0.35, 0.25), valid * line * 0.75 * step(0.005, -vLos));
  }
  col = mix(col, fr, 0.7 * uFringe * valid * smoothstep(0.3, 0.55, coh) * smoothstep(0.0, 0.003, abs(vLos)));
  gl_FragColor = vec4(col, 1.0);
}`;

async function layer(url, Type) {
  return new Type(await (await fetch(url)).arrayBuffer());
}

function tex(data, w, h) {
  const t = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export async function createViewer(el, base, meta) {
  const { nx, ny, dx } = meta.grid;
  const width = nx * dx, aspect = ny / nx;
  const [dem16, los16, valid8, coh8] = await Promise.all([
    layer(base + meta.layers.dem, Int16Array), layer(base + (meta.layers.surface ?? meta.layers.los), Int16Array),
    layer(base + meta.layers.valid, Uint8Array), layer(base + meta.layers.coh, Uint8Array),
  ]);
  const dem = Float32Array.from(dem16), los = Float32Array.from(los16, (v) => v / 1000);
  let demMin = Infinity, demMax = -Infinity;
  for (const v of dem) { demMin = Math.min(demMin, v); demMax = Math.max(demMax, v); }
  const sorted = Array.from(los, Math.abs).sort((a, b) => a - b);
  const losMax = Math.max(0.01, sorted[Math.floor(sorted.length * 0.99)]);

  const u = {
    uDem: { value: tex(dem, nx, ny) }, uLos: { value: tex(los, nx, ny) },
    uValid: { value: tex(Float32Array.from(valid8), nx, ny) }, uCoh: { value: tex(Float32Array.from(coh8, (v) => v / 255), nx, ny) },
    uGround: { value: null }, uHasGround: { value: 0 },
    uDemExag: { value: Math.min(5, Math.max(1, (0.08 * width) / Math.max(1, demMax - demMin))) },
    uLosExag: { value: meta.kind === "landslide" ? 0 : (0.03 * width) / losMax }, uT: { value: 1 }, uAspect: { value: aspect },
    uDemBase: { value: demMin }, uWidth: { value: width }, uFringe: { value: ["subsidence", "landslide"].includes(meta.kind) ? 0 : 1 }, uCycle: { value: 0.1 },
    uMode: { value: { subsidence: 1, landslide: 2 }[meta.kind] ?? 0 }, uLim: { value: 1 },
    uDrop: { value: tex(new Float32Array(1), 1, 1) },
  };
  u.uLim.value = losMax;
  if (meta.layers.cohdrop) u.uDrop.value = tex(Float32Array.from(await layer(base + meta.layers.cohdrop, Uint8Array), (v) => v / 255), nx, ny);
  if (meta.ground) {
    const g = await new THREE.TextureLoader().loadAsync(base + meta.ground);
    g.anisotropy = 8;
    u.uGround.value = g; u.uHasGround.value = 1;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f19);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.001, 20);
  camera.position.set(0, 0.6, 0.9 * Math.max(1, aspect));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.48;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, nx - 1, ny - 1),
    new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u, extensions: { derivatives: true } }));
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
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(el);
  resize();
  const frameHooks = [];
  renderer.setAnimationLoop(() => {
    controls.update();
    frameHooks.forEach((f) => f());
    renderer.render(scene, camera);
  });

  return {
    losMax, losExag0: u.uLosExag.value || (0.03 * width) / losMax,
    setT(t) { u.uT.value = t; },
    setLosExag(x) { u.uLosExag.value = x; },
    setFringe(on) { u.uFringe.value = on ? 1 : 0; },
    setCycle(m) { u.uCycle.value = m; },
    setGround(on) { u.uHasGround.value = on && u.uGround.value ? 1 : 0; },
    onFrame(f) { frameHooks.push(f); },
    // Screen position (CSS px within el) of the ground at (u, v); null when behind the camera.
    project([pu, pv], lift = 0.015) {
      const p = new THREE.Vector3(pu - 0.5, heightAt(pu, pv) + lift, (pv - 0.5) * aspect).project(camera);
      if (p.z > 1) return null;
      return { x: ((p.x + 1) / 2) * el.clientWidth, y: ((1 - p.y) / 2) * el.clientHeight };
    },
  };
}
