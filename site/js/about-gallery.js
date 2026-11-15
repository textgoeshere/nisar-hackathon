/**
 * Twelve actual DEM meshes, one WebGL context, no private animation loop.
 * Caller: await createGallery(grid, metas); resize(); render(shotSeconds, kind).
 * Reuses viewer.js's Three.js import map, north-first rasters and relief rule.
 * Heights are DEM ONLY: LOS is colour, never uplift. No surface.i16 is used.
 * Ground JPEGs are the existing Sentinel-2 composite (with the pipeline's
 * before-image/radar hole filling). Missing radar is NOT zero motion.
 */
import * as THREE from "three";

const COLS = 4, ROWS = 3, SEGMENTS = 80, DIMMED = 0.18;
const KINDS = new Set(["quake", "volcano", "fire", "flood", "landslide", "subsidence"]);
const COLOURS = { quake: 0x7cd8ef, volcano: 0xffa45c, fire: 0xff633c,
  flood: 0x36dbff, landslide: 0xf074db, subsidence: 0xec88c5 };
const SHORT = {
  "anak-krakatau": "Anak Krakatau", "aspen-acres-fire": "Aspen Acres",
  "bangladesh-flood": "Moulvibazar", "etna-eruption": "Etna",
  "flores-quake": "Flores Sea", "fuego-eruption": "Fuego",
  "kumamoto-quake": "Kumamoto", "langtang-avalanche": "Langtang",
  "little-giant-fire": "Little Giant", "mexico-city-subsidence": "Mexico City",
  "panama-quake": "Azuero", "venezuela-quake": "Yaracuy",
};
const KIND_LABEL = { quake: "Earthquake", volcano: "Volcano", fire: "Fire",
  flood: "Flood", landslide: "Landslide", subsidence: "Subsidence" };

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const FRAG = /* glsl */ `
uniform sampler2D uGround, uSignal, uCoverage, uCoh;
uniform vec3 uAccent;
uniform float uMode, uOpacity;
varying vec2 vUv;
varying vec3 vNormal;
vec3 hsv(float h) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return mix(vec3(1.0), k, 0.85);
}
void main() {
  float light = 0.58 + 0.48 * max(dot(normalize(vNormal), normalize(vec3(-0.4, 0.7, 0.6))), 0.0);
  vec3 ground = texture2D(uGround, vUv).rgb;
  float grey = dot(ground, vec3(0.299, 0.587, 0.114));
  vec3 col = mix(vec3(grey), ground, 0.82) * light;
  float coverage = texture2D(uCoverage, vUv).r;
  float signal = texture2D(uSignal, vUv).r;
  if (uMode > 0.5) {
    // Positive mapped change only. Zero is deliberately NOT labelled "unchanged":
    // the exported change mask conflates no signal and no radar coverage.
    float strength = smoothstep(0.25, 0.50, signal) * coverage;
    col = mix(col, uAccent * (0.72 + 0.28 * light), strength * 0.90);
    float w = max(fwidth(signal), 0.003);
    float edge = (1.0 - smoothstep(0.0, w * 1.4, abs(signal - 0.375))) * step(0.0001, fwidth(signal));
    col = mix(col, mix(uAccent, vec3(1.0), 0.42), edge * coverage * 0.65);
  } else {
    // Both quakes and subsidence use the measured LOS raster and hard validity
    // mask. 10 cm per colour cycle; hue is not a vertical-motion estimate.
    float coh = texture2D(uCoh, vUv).r;
    vec3 fringe = hsv(fract(signal / 0.10));
    float ink = coverage * smoothstep(0.30, 0.55, coh) * smoothstep(0.0, 0.003, abs(signal));
    col = mix(col, fringe * light, ink * 0.82);
    col *= mix(0.52, 1.0, coverage); // unknown stays visibly dim, never a zero fringe
  }
  gl_FragColor = vec4(col, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// URL is relative to this module, not the document route (/about or /about.html).
function eventURL(meta, file) {
  return new URL("../events/" + encodeURIComponent(meta.slug) + "/" + file, import.meta.url).href;
}
async function binary(url, Type, count, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("HTTP " + response.status + " loading " + url);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength !== count * Type.BYTES_PER_ELEMENT)
    throw new Error("Wrong raster size: " + url + " (expected " + count + " samples)");
  // Files are little-endian. Decode explicitly, including on a big-endian host.
  if (Type === Int16Array) {
    const view = new DataView(buffer), values = new Int16Array(count);
    for (let i = 0; i < count; i++) values[i] = view.getInt16(i * 2, true);
    return values;
  }
  return new Type(buffer);
}
function dataTexture(values, nx, ny, type = THREE.UnsignedByteType) {
  const texture = new THREE.DataTexture(values, nx, ny, THREE.RedFormat, type);
  // Nearest is important: neither no-data nor measured LOS is interpolated into
  // an unobserved cell. DEM interpolation happens separately on the CPU.
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}
function isChange(meta) {
  return !!meta.still || ["fire", "flood", "landslide"].includes(meta.kind);
}
function validate(meta) {
  const g = meta?.grid, layers = meta?.layers;
  if (!meta?.slug || !/^[a-z0-9-]+$/i.test(meta.slug) || !KINDS.has(meta.kind))
    throw new Error("Gallery event has an invalid slug or kind");
  if (!g || !Number.isInteger(g.nx) || !Number.isInteger(g.ny) ||
      g.nx < 2 || g.ny < 2 || !(g.dx > 0) || !Number.isFinite(g.dx))
    throw new Error("Invalid DEM grid for " + meta.slug);
  if (!layers?.dem || !meta.ground || (isChange(meta) ? !(layers.change || layers.cohdrop) :
      !(layers.los && layers.valid && layers.coh)))
    throw new Error("Missing gallery layers for " + meta.slug);
}
async function loadEvent(meta, signal, resources) {
  const { nx, ny } = meta.grid, count = nx * ny, change = isChange(meta);
  const layer = (file, Type) => binary(eventURL(meta, file), Type, count, signal);
  const groundPromise = (async () => {
    const url = eventURL(meta, meta.ground), response = await fetch(url, { signal });
    if (!response.ok) throw new Error("HTTP " + response.status + " loading " + url);
    const objectURL = URL.createObjectURL(await response.blob());
    try {
      const ground = await new THREE.TextureLoader().loadAsync(objectURL);
      // Rows are north-first, matching dataTexture and the mesh's UVs.
      ground.flipY = false;
      ground.colorSpace = THREE.SRGBColorSpace;
      ground.anisotropy = 4;
      ground.needsUpdate = true;
      resources.add(ground);
      return ground;
    } finally { URL.revokeObjectURL(objectURL); }
  })();
  const pending = [
    layer(meta.layers.dem, Int16Array),
    layer(change ? (meta.layers.change ?? meta.layers.cohdrop) : meta.layers.los,
      change ? Uint8Array : Int16Array),
    change ? null : layer(meta.layers.valid, Uint8Array),
    change ? null : layer(meta.layers.coh, Uint8Array),
    groundPromise,
  ];
  let values;
  try { values = await Promise.all(pending); }
  catch (error) {
    // Include a decoder that may already own a blob URL when another raster
    // fails. No late texture can be created after the outer cleanup.
    await Promise.allSettled(pending);
    throw error;
  }
  const [dem, signalData, valid, coherence, ground] = values;
  return { meta, dem, signalData, valid, coherence, ground, change };
}

function makeTerrain(asset, own) {
  const { meta, dem, signalData, valid, coherence, ground, change } = asset;
  const { nx, ny, dx } = meta.grid;
  const width = nx * dx, aspect = ny / nx;
  // Existing pipeline has sea/absent-DEM tiles encoded as 0, with no separate
  // DEM validity layer. Honour an explicit future sentinel, but never treat 0
  // (sea level) or negative coastal elevations as missing.
  const noData = meta.grid.dem_nodata ?? meta.dem_nodata ?? -32768;
  const known = value => value !== noData && Number.isFinite(value);
  let min = Infinity, max = -Infinity;
  for (const value of dem) if (known(value)) { min = Math.min(min, value); max = Math.max(max, value); }
  if (!Number.isFinite(min)) throw new Error("No terrain samples for " + meta.slug);
  const relief = Math.min(5, Math.max(1, 0.08 * width / Math.max(1, max - min)));
  const height = (max - min) * relief / width;
  const sx = Math.min(nx - 1, SEGMENTS), sy = Math.min(ny - 1, Math.max(1, Math.round(SEGMENTS * aspect)));
  const stride = sx + 1, count = stride * (sy + 1), bottom = -0.025;
  const position = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const available = new Uint8Array(count), indices = [];
  function sample(u, v) {
    const x = u * (nx - 1), y = v * (ny - 1), x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(nx - 1, x0 + 1), y1 = Math.min(ny - 1, y0 + 1);
    const a = dem[y0 * nx + x0], b = dem[y0 * nx + x1];
    const c = dem[y1 * nx + x0], d = dem[y1 * nx + x1];
    if (![a, b, c, d].every(known)) return null;
    const fx = x - x0, fy = y - y0;
    return ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy - min) * relief / width;
  }
  for (let y = 0; y <= sy; y++) for (let x = 0; x <= sx; x++) {
    const k = y * stride + x, u = x / sx, v = y / sy, h = sample(u, v);
    position.set([u - 0.5, h ?? 0, (v - 0.5) * aspect], k * 3);
    uv.set([u, v], k * 2);
    available[k] = h === null ? 0 : 1;
  }
  // Winding is +Y, with v increasing south. Omit unavailable vertices instead
  // of erecting cliffs from a DEM fill value.
  for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) {
    const a = y * stride + x, b = a + 1, c = a + stride, d = c + 1;
    if (available[a] && available[c] && available[b]) indices.push(a, c, b);
    if (available[b] && available[c] && available[d]) indices.push(b, c, d);
  }
  const geometry = own(new THREE.BufferGeometry());
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const signal = own(dataTexture(change ? signalData : Float32Array.from(signalData, x => x / 1000),
    nx, ny, change ? THREE.UnsignedByteType : THREE.FloatType));
  // A drop/change layer is itself the evidence, NOT valid.u8: volcano and
  // landslide footprints can be decorrelated (invalid for LOS). Fire/flood
  // valid.u8 is entirely zero by design. Never use it to suppress their mask.
  const coverage = own(dataTexture(change ? new Uint8Array([255]) : Uint8Array.from(valid, x => x ? 255 : 0),
    change ? 1 : nx, change ? 1 : ny));
  const coh = own(dataTexture(change ? new Uint8Array([255]) : coherence,
    change ? 1 : nx, change ? 1 : ny));
  const uniforms = {
    uGround: { value: ground }, uSignal: { value: signal }, uCoverage: { value: coverage },
    uCoh: { value: coh }, uAccent: { value: new THREE.Color(COLOURS[meta.kind]) },
    uMode: { value: change ? 1 : 0 }, uOpacity: { value: 1 },
  };
  const material = own(new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG,
    uniforms, transparent: true, depthWrite: true, side: THREE.FrontSide }));
  const scene = new THREE.Scene();
  const terrain = new THREE.Mesh(geometry, material);
  terrain.renderOrder = -3; // depth-only prepass runs before these colour passes
  scene.add(terrain);

  // A thin, explicitly illustrative plinth makes very flat flood terrain read
  // as a rotating 3D volume; its thickness does not encode subsurface geology.
  const perimeter = [];
  for (let x = 0; x <= sx; x++) perimeter.push(x);
  for (let y = 1; y <= sy; y++) perimeter.push(y * stride + sx);
  for (let x = sx - 1; x >= 0; x--) perimeter.push(sy * stride + x);
  for (let y = sy - 1; y > 0; y--) perimeter.push(y * stride);
  const walls = [], rim = [];
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length];
    if (!available[a] || !available[b]) continue;
    const ax = position[a * 3], ay = position[a * 3 + 1], az = position[a * 3 + 2];
    const bx = position[b * 3], by = position[b * 3 + 1], bz = position[b * 3 + 2];
    walls.push(ax, ay, az, ax, bottom, az, bx, by, bz, bx, by, bz, ax, bottom, az, bx, bottom, bz);
    rim.push(ax, ay + 0.0004, az, bx, by + 0.0004, bz);
  }
  const wallGeometry = own(new THREE.BufferGeometry());
  wallGeometry.setAttribute("position", new THREE.Float32BufferAttribute(walls, 3));
  wallGeometry.computeVertexNormals();
  const wallMaterial = own(new THREE.MeshStandardMaterial({ color: 0x263846,
    roughness: 0.95, transparent: true, side: THREE.FrontSide }));
  const wall = new THREE.Mesh(wallGeometry, wallMaterial);
  wall.renderOrder = -2;
  scene.add(wall);
  const baseGeometry = own(new THREE.BoxGeometry(1, 0.006, aspect));
  const baseMaterial = own(new THREE.MeshStandardMaterial({ color: 0x304a59, roughness: 0.9, transparent: true }));
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.y = bottom - 0.003;
  base.renderOrder = -1;
  scene.add(base);
  const rimGeometry = own(new THREE.BufferGeometry());
  rimGeometry.setAttribute("position", new THREE.Float32BufferAttribute(rim, 3));
  const rimMaterial = own(new THREE.LineBasicMaterial({ color: 0x91b5bf, transparent: true, opacity: 0.55 }));
  scene.add(new THREE.LineSegments(rimGeometry, rimMaterial));
  scene.add(new THREE.HemisphereLight(0xe5f5ff, 0x152434, 2));
  const light = new THREE.DirectionalLight(0xffefd6, 2.4);
  light.position.set(-1, 3, 2);
  scene.add(light);
  const target = new THREE.Vector3(0, (height + bottom - 0.006) / 2, 0);
  // All eight conservative bounding-box corners, fitted at each deterministic
  // camera pose. This fills short landscape tiles without clipping on turns.
  const bounds = [];
  for (const x of [-0.5, 0.5]) for (const y of [bottom - 0.006, height])
    for (const z of [-aspect / 2, aspect / 2]) bounds.push(new THREE.Vector3(x, y, z).sub(target));
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
  return { meta, scene, camera, target, bounds, relief, uniforms,
    materials: [material, wallMaterial, baseMaterial, rimMaterial],
    fades: [[wallMaterial, 1], [baseMaterial, 1], [rimMaterial, 0.55]] };
}

function makeTile(entry) {
  const { meta, relief } = entry, tile = document.createElement("div");
  tile.className = "event-tile";
  tile.dataset.kind = meta.kind;
  tile.dataset.slug = meta.slug;
  tile.dataset.reliefScale = relief.toFixed(2);
  tile.dataset.signal = isChange(meta) ? "mapped-change" : "measured-los";
  const caveat = "DEM relief ×" + relief.toFixed(1) + "; decorative base; " +
    (isChange(meta) ? "mapped radar-change footprint; uncoloured does not mean unchanged." :
      "colour = line-of-sight motion, 10 cm/cycle; dim = unmeasured; not vertical uplift.");
  tile.title = meta.name + " — " + caveat;
  tile.setAttribute("role", "img");
  tile.setAttribute("aria-label", meta.name + ". Animated 3D terrain. " + caveat);
  // Inline basics prevent the former opaque image-tile background hiding the
  // shared canvas. Parent may restyle borders/typography with scoped CSS.
  Object.assign(tile.style, { position: "relative", zIndex: "1", minWidth: "0", minHeight: "0",
    background: "transparent", overflow: "hidden", pointerEvents: "none",
    transition: "none", transform: "none", border: "1px solid #ffffff22" });
  const label = document.createElement("span");
  label.className = "event-tile-label";
  label.textContent = SHORT[meta.slug] ?? meta.name.split(",")[0];
  Object.assign(label.style, { position: "absolute", left: "16px", right: "12px", bottom: "12px",
    top: "auto", zIndex: "2", fontSize: "28px", lineHeight: "1.15", fontWeight: "600",
    color: "#f2f5f7", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
  const kind = document.createElement("small");
  kind.className = "event-tile-kind";
  kind.textContent = KIND_LABEL[meta.kind];
  Object.assign(kind.style, { position: "absolute", left: "16px", top: "9px", zIndex: "2",
    fontSize: "15px", lineHeight: "1.2", letterSpacing: ".1em", textTransform: "uppercase",
    color: "#c0d0d9", textShadow: "0 1px 5px #080d14" });
  tile.append(kind, label);
  return tile;
}

/** Resolves only after every used asset has loaded and GPU programs are ready. */
export async function createGallery(container, metas) {
  if (!container || typeof container.appendChild !== "function") throw new Error("Gallery needs a container");
  if (!Array.isArray(metas) || metas.length !== COLS * ROWS)
    throw new Error("Gallery requires exactly twelve event metadata records");
  metas.forEach(validate);
  if (new Set(metas.map(meta => meta.slug)).size !== metas.length) throw new Error("Duplicate gallery events");
  const resources = new Set(), own = resource => { resources.add(resource); return resource; };
  const abort = new AbortController(), tiles = [], entries = [];
  let renderer, disposed = false, width = 1764, height = 660, boxes = [];
  let lastSeconds = 0, lastKind = null, lastPrevious = null, lastBlend = 1, contextLost = false, shaderError = null;
  const loadTimer = setTimeout(() => abort.abort(), 45000);
  const onLost = event => {
    event.preventDefault(); contextLost = true;
    container.dispatchEvent(new CustomEvent("galleryerror", { detail: new Error("Gallery WebGL context lost") }));
  };
  const onRestored = () => { contextLost = false; resize(); render(lastSeconds, lastKind, lastPrevious, lastBlend); };
  function dispose() {
    if (disposed) return;
    disposed = true;
    abort.abort();
    clearTimeout(loadTimer);
    for (const resource of resources) resource.dispose();
    resources.clear();
    for (const tile of tiles) tile.remove();
    if (renderer) {
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onRestored);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
  }
  function resize() {
    if (disposed || !renderer) return;
    const style = getComputedStyle(container);
    const pixels = value => /^\d+(?:\.\d+)?px$/.test(value ?? "") ? parseFloat(value) : 0;
    // getBoundingClientRect is intentionally NOT used: the 1920px stage is
    // transformed to fit the browser. [hidden] ancestors may make client* 0.
    width = Math.max(1, Math.round(container.clientWidth || pixels(style.width) || pixels(container.style.width) || width || 1764));
    height = Math.max(1, Math.round(container.clientHeight || pixels(style.height) || pixels(container.style.height) || height || 660));
    if (renderer.domElement.width !== Math.round(width * renderer.getPixelRatio()) ||
        renderer.domElement.height !== Math.round(height * renderer.getPixelRatio())) renderer.setSize(width, height, false);
    const gx = pixels(style.columnGap), gy = pixels(style.rowGap);
    const left = pixels(style.paddingLeft), right = pixels(style.paddingRight);
    const top = pixels(style.paddingTop), bottom = pixels(style.paddingBottom);
    const cellWidth = (width - left - right - gx * (COLS - 1)) / COLS;
    const cellHeight = (height - top - bottom - gy * (ROWS - 1)) / ROWS;
    boxes = entries.map((entry, i) => {
      // Reserve bottom label and a small kind heading, avoiding canvas cropping.
      const x = Math.round(left + (i % COLS) * (cellWidth + gx) + 6);
      const y = Math.round(top + Math.floor(i / COLS) * (cellHeight + gy) + 25);
      const w = Math.max(1, Math.round(cellWidth - 12)), h = Math.max(1, Math.round(cellHeight - 70));
      entry.camera.aspect = w / h;
      entry.camera.updateProjectionMatrix();
      const halfY = THREE.MathUtils.degToRad(entry.camera.fov / 2);
      entry.tanY = Math.tan(halfY);
      entry.tanX = entry.tanY * entry.camera.aspect;
      return { x, y, w, h };
    });
  }
  function render(seconds, activeKind = null, previousKind = null, blend = 1) {
    if (disposed) return;
    if (!Number.isFinite(seconds)) throw new Error("Gallery time must be finite elapsed seconds");
    if (activeKind !== null && !KINDS.has(activeKind)) throw new Error("Unknown gallery kind: " + activeKind);
    if (contextLost) throw new Error("Gallery WebGL context is lost; waiting for restoration");
    if (previousKind !== null && !KINDS.has(previousKind)) throw new Error("Unknown previous gallery kind");
    blend = Math.max(0, Math.min(1, Number.isFinite(blend) ? blend : 1));
    lastSeconds = seconds; lastKind = activeKind; lastPrevious = previousKind; lastBlend = blend;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.setScissorTest(true);
    // Every tile renders on every call, even when dimmed. No CSS animation,
    // wall-clock time, accumulating rotations or hidden rAF affects seeking.
    entries.forEach((entry, i) => {
      // Parent supplies an explicit blend, so fades also survive arbitrary seeks.
      const current = activeKind === null || entry.meta.kind === activeKind ? 1 : DIMMED;
      const previous = previousKind === null || entry.meta.kind === previousKind ? 1 : DIMMED;
      const opacity = previous + (current - previous) * blend;
      tiles[i].style.opacity = String(opacity);
      entry.uniforms.uOpacity.value = opacity;
      for (const [material, alpha] of entry.fades) material.opacity = alpha * opacity;
      const azimuth = -0.68 + (i % COLS) * 0.18 + Math.floor(i / COLS) * 0.10 + seconds * 0.48;
      const elevation = 0.63 + Math.sin(seconds * 0.48 + i * 0.7) * 0.045;
      const sinA = Math.sin(azimuth), cosA = Math.cos(azimuth);
      const sinE = Math.sin(elevation), cosE = Math.cos(elevation);
      // Camera right/up/back vectors. The exact perspective condition for each
      // corner is distance >= depth + abs(projected coordinate)/tan(halfFOV).
      let distance = 1;
      for (const p of entry.bounds) {
        const x = cosA * p.x - sinA * p.z;
        const y = -sinA * sinE * p.x + cosE * p.y - cosA * sinE * p.z;
        const z = sinA * cosE * p.x + sinE * p.y + cosA * cosE * p.z;
        distance = Math.max(distance, z + Math.abs(x) / entry.tanX, z + Math.abs(y) / entry.tanY);
      }
      distance *= 1.10;
      entry.camera.position.set(entry.target.x + sinA * cosE * distance,
        entry.target.y + sinE * distance, entry.target.z + cosA * cosE * distance);
      entry.camera.lookAt(entry.target);
      const box = boxes[i], bottom = height - box.y - box.h;
      renderer.setViewport(box.x, bottom, box.w, box.h);
      renderer.setScissor(box.x, bottom, box.w, box.h);
      renderer.clearDepth();
      // Occlusion must be opaque even when colour is faded. A depth-only pass
      // prevents base/back faces accumulating to >.18 alpha behind a dim tile.
      for (const material of entry.materials) material.colorWrite = false;
      try { renderer.render(entry.scene, entry.camera); }
      finally { for (const material of entry.materials) material.colorWrite = true; }
      renderer.render(entry.scene, entry.camera);
    });
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    if (shaderError) throw shaderError;
  }
  try {
    // Settled collection owns late texture loads too: an early failed fetch
    // cannot leave a texture/context alive after a rejected gallery boot.
    const loaded = await Promise.allSettled(metas.map(meta => loadEvent(meta, abort.signal, resources)
      .catch(error => { abort.abort(); throw new Error(meta.slug + ": " + error.message, { cause: error }); })));
    clearTimeout(loadTimer);
    const failures = loaded.filter(result => result.status === "rejected");
    if (failures.length) throw new Error("Gallery assets failed: " + failures.map(result => result.reason.message).join("; "));
    for (const result of loaded) entries.push(makeTerrain(result.value, own));
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
    // The fixed 1920px film already supplies capture resolution; avoid 12
    // retina viewports needlessly multiplying the fill-rate on a scaled stage.
    renderer.setPixelRatio(1);
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
      shaderError = new Error("Gallery shader failed: " + [gl.getProgramInfoLog(program),
        gl.getShaderInfoLog(vertexShader), gl.getShaderInfoLog(fragmentShader)].filter(Boolean).join("; "));
    };
    const canvas = renderer.domElement;
    canvas.className = "event-gallery-canvas";
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%",
      display: "block", pointerEvents: "none", zIndex: "0" });
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    container.appendChild(canvas);
    entries.forEach((entry, i) => {
      const tile = makeTile(entry);
      tile.style.gridColumn = String(i % COLS + 1);
      tile.style.gridRow = String(Math.floor(i / COLS) + 1);
      tiles.push(tile); container.appendChild(tile);
    });
    resize();
    await Promise.all(entries.map(entry => renderer.compileAsync(entry.scene, entry.camera)));
    // Warm every viewport and texture before resolving, even under [hidden].
    render(0);
    if (renderer.getContext().isContextLost()) throw new Error("Gallery WebGL context lost during setup");
    return { render, resize, dispose, count: entries.length, canvas };
  } catch (error) {
    dispose();
    throw error;
  }
}
