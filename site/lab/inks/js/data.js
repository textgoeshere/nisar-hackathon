// Loads one event's lab data and the packed layers (see pipeline/lab/inks/pack.py), builds the mip pyramid the dots are sampled from.
const J = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });

async function gunzip(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const buf = await r.arrayBuffer();
  const b = new Uint8Array(buf);
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf; // server already decoded it
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

async function reliefFromPng(url) {
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
  // shadow side only, as a faint pencil tint of the black ink; flat ground (180) and lit slopes stay paper.
  // The darkest 5% of the shadows set the full tint, so a steep volcano is no heavier than gentle hills.
  const sh = []; for (let i = 0; i < d.length; i += 16) if (d[i] < 180) sh.push(180 - d[i]);
  sh.sort((a, b) => a - b); const full = Math.max(40, sh[Math.floor(sh.length * 0.95)] || 90);
  for (let i = 0; i < d.length; i += 4) {
    const a = Math.max(0, Math.min(1, (180 - d[i]) / full)) * 0.26;
    d[i] = 46; d[i + 1] = 38; d[i + 2] = 30; d[i + 3] = Math.round(a * 255);
  }
  x.putImageData(id, 0, 0);
  return c;
}

async function maskFromPng(url, nx, ny) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const m = new Float32Array(c.width * c.height);
  let any = 0;
  for (let i = 0; i < m.length; i++) { m[i] = d[i * 4] > 127 ? 1 : 0; any += m[i]; }
  return { w: c.width, h: c.height, m, any: any > 0 };
}

// level 0 = the cells; level k averages blocks of 2^k cells (valid cells only); cnt = share of the block that has a reading
function pyramid(val0, cnt0, w, h, levels = 5) {
  const L = [{ w, h, val: val0, cnt: cnt0 }];
  for (let k = 1; k < levels; k++) {
    const p = L[k - 1], w2 = (p.w + 1) >> 1, h2 = (p.h + 1) >> 1;
    const val = new Float32Array(w2 * h2), cnt = new Float32Array(w2 * h2);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      let s = 0, c = 0, n = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const xx = x * 2 + dx, yy = y * 2 + dy;
        if (xx >= p.w || yy >= p.h) continue;
        n++;
        const cc = p.cnt[yy * p.w + xx];
        if (cc > 0) { s += p.val[yy * p.w + xx] * cc; c += cc; }
      }
      val[y * w2 + x] = c > 0 ? s / c : 0;
      cnt[y * w2 + x] = n ? c / n : 0;
    }
    L.push({ w: w2, h: h2, val, cnt });
  }
  return L;
}

function percentile(arr, ok, q, lo = 0, hi = null) {
  let mx = 0;
  for (let i = 0; i < arr.length; i++) if (ok(i)) mx = Math.max(mx, Math.abs(arr[i]));
  if (!mx) return 1;
  const B = 4096, h = new Uint32Array(B + 1);
  let n = 0;
  for (let i = 0; i < arr.length; i++) if (ok(i)) { h[Math.min(B, Math.floor(Math.abs(arr[i]) / mx * B))]++; n++; }
  let acc = 0;
  for (let b = 0; b <= B; b++) { acc += h[b]; if (acc >= n * q) return (b + 1) / B * mx; }
  return mx;
}

export async function loadEvent(slug) {
  const lab = await J(`../data/${slug}/lab.json`);
  const here = `data/${slug}/`, shared = `../data/${slug}/`;
  const [info, grid, base, linej, sea, relief] = await Promise.all([
    J(here + "info.json"), gunzip(here + "grid.bin.gz"), J(here + "base.json"), J(shared + "line.json"),
    maskFromPng(shared + "sea.png"), reliefFromPng(here + "relief.png"),
  ]);
  const { nx, ny } = lab.grid, n = nx * ny;
  const raw = new Int16Array(grid, 0, n);
  const sg = lab.signal, ln = lab.line;
  const sig = new Float32Array(n), sigOk = new Float32Array(n);
  for (let i = 0; i < n; i++) if (raw[i] !== info.nodata) { sig[i] = raw[i] * sg.scale; sigOk[i] = 1; }
  let lineRaw = null;
  if (info.layers.includes("line")) lineRaw = new Uint8Array(grid, n * 2, n);

  // What the dots show: from the manifest's kind, with the scale taken from the data.
  let dots;
  if (ln.kind === "front") {
    const v = new Float32Array(n), ok = new Float32Array(n);
    for (let i = 0; i < n; i++) if (lineRaw[i] !== info.line_nodata) { v[i] = lineRaw[i] * ln.raster_scale; ok[i] = 1; }
    const floor = sg.noise * 3; // coherence loss under three times the scatter between neighbouring cells is not printed
    const max = percentile(v, (i) => ok[i] && v[i] > floor, 0.995);
    dots = { mode: "pos", floor, max, ink: "loss", levels: pyramid(v, ok, nx, ny), unit: "coherence lost", label: "Coherence lost between the two passes (0 = none, 1 = all)" };
  } else if (ln.kind === "bend") {
    const floor = sg.noise; // within the noise of zero: nothing printed
    const max = percentile(sig, (i) => sigOk[i] && sig[i] < -floor, 0.99);
    dots = { mode: "neg", floor, max, ink: "neg", levels: pyramid(sig, sigOk, nx, ny), unit: "cm a year", label: "Sinking rate" };
  } else {
    const floor = sg.noise;
    const max = percentile(sig, (i) => sigOk[i] && Math.abs(sig[i]) > floor, 0.99);
    dots = { mode: "two", floor, max, levels: pyramid(sig, sigOk, nx, ny), unit: sg.unit, label: sg.label };
  }

  // polylines to cell units with boxes, for cheap culling
  const prep = (pl) => pl.map((p) => {
    const a = new Float32Array(p.length * 2);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    p.forEach(([u, v], i) => {
      const x = u * nx, y = v * ny;
      a[i * 2] = x; a[i * 2 + 1] = y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    });
    return { a, x0, y0, x1, y1 };
  });
  const roads = {};
  for (const k in base.roads) roads[k] = prep(base.roads[k]);
  const baseP = { roads, rail: prep(base.rail), river: prep(base.river), canal: prep(base.canal), coast: prep(base.coast), places: base.places };
  const runs = linej.runs.map((r) => ({ measured: r.measured, pts: r.points.map(([u, v]) => [u * nx, v * ny]) }));
  return { slug, lab, info, nx, ny, dx: lab.grid.dx, sig, sigOk, dots, base: baseP, sea, runs, sites: linej.sites || [], relief };
}

export async function loadStories(slug) {
  try { return (await J(`../../events/${slug}/stories.json`)).items; } catch { return []; }
}

// bilinear sample of a pyramid level at cell-space (X, Y); returns NaN where fewer than 40% of the neighbourhood has a reading
export function sampleLevel(lv, X, Y, scale) {
  const x = X / scale - 0.5, y = Y / scale - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  let s = 0, c = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const xx = x0 + i, yy = y0 + j;
    if (xx < 0 || yy < 0 || xx >= lv.w || yy >= lv.h) continue;
    const w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy), k = yy * lv.w + xx, cc = lv.cnt[k];
    if (cc > 0) { s += lv.val[k] * cc * w; c += cc * w; }
  }
  return c < 0.4 ? NaN : s / c;
}
