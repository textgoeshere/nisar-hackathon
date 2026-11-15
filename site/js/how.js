// "How it works": a numbered walkthrough from NISAR's two passes to the 3D view, built from meta.json.
// Four versions, by what the event's signal is:
//   motion      quakes (and volcanoes whose motion beat the quiet baseline): interferogram phase -> cm
//   damage      landslides and `still` GUNW events: coherence drop across the event
//   brightness  floods and fires: GCOV backscatter change, no interferogram
//   subsidence  a year-long chain of pairs, fitted to one steady rate
import { STILL } from "./viewer.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const day = (s) => Date.parse(s + "T00:00:00Z");
const days = (a, b) => Math.round((day(b) - day(a)) / 864e5);
const nDays = (k) => `${k} day${k === 1 ? "" : "s"}`;
const fmt = (s) => new Date(day(s)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const stamps = (g) => [...String(g ?? "").matchAll(/_(\d{8})T(\d{2})(\d{2})\d{2}(?=_)/g)].map((m) => `${m[2]}:${m[3]}`);
const EVENT_NOUN = { quake: "earthquake", volcano: "eruption", landslide: "avalanche", flood: "flood", fire: "fire" };

export function variant(meta) {
  if (meta.nisar.passes_after) return "brightness";
  if (meta.nisar.dates) return "subsidence";
  if (meta.still || STILL.includes(meta.kind)) return "damage";
  return "motion";
}

// ---------------------------------------------------------------- diagrams (inline SVG)

// Pass timeline: dots on a date axis, the event as a marker, the compared pair highlighted.
function timeline(passes, { event, eventLabel = "event", pair, label = {} } = {}) {
  const all = [...passes, ...(event ? [event] : [])].map(day);
  const t0 = Math.min(...all), t1 = Math.max(...all), W = 640, L = 40, R = 600;
  const x = (s) => L + ((day(s) - t0) / Math.max(1, t1 - t0)) * (R - L);
  const inPair = (s) => pair && pair.includes(s);
  const dense = passes.length > 8;
  let svg = `<svg class="diagram" viewBox="0 0 ${W} 136" role="img" aria-label="Timeline of NISAR passes${event ? " and the event" : ""}">
<line x1="${L - 16}" y1="60" x2="${R + 16}" y2="60" class="axis"/>`;
  if (pair) {
    const [a, b] = pair.map(x);
    svg += `<path d="M${a} 44 V36 H${b} V44" class="bracket"/><text x="${(a + b) / 2}" y="28" class="lbl" text-anchor="middle">${days(...pair)} days</text>`;
  }
  passes.forEach((p, i) => {
    const on = inPair(p) || !pair;
    svg += `<circle cx="${x(p)}" cy="60" r="${dense ? 4 : 7}" class="${on ? "pass" : "pass off"}"><title>NISAR pass ${fmt(p)}</title></circle>`;
    if (!dense || i === 0 || i === passes.length - 1)
      svg += `<text x="${x(p)}" y="${dense ? 84 : 88}" class="lbl" text-anchor="middle">${fmt(p)}</text>${label[p] ? `<text x="${x(p)}" y="104" class="lbl muted" text-anchor="middle">${label[p]}</text>` : ""}`;
  });
  if (event) {
    const e = x(event);
    svg += `<path d="M${e} 50 l9 10 l-9 10 l-9 -10 z" class="event"/><text x="${e}" y="${dense ? 104 : 126}" class="lbl ev" text-anchor="middle">${esc(eventLabel)}</text>`;
  }
  return svg + "</svg>";
}

// A sine wave as a path, for the phase diagram.
function wave(x0, y0, len, lam, amp, phase = 0) {
  let d = "";
  for (let i = 0; i <= len; i += 2) d += `${i ? "L" : "M"}${(x0 + i).toFixed(1)} ${(y0 - amp * Math.sin((2 * Math.PI * i) / lam + phase)).toFixed(1)}`;
  return d;
}

function phaseDiagram(lamCm) {
  const half = (lamCm / 2).toFixed(1), shift = 1.15;
  return `<svg class="diagram" viewBox="0 0 640 270" role="img" aria-label="Ground moving away from the satellite lengthens the echo's round trip, shifting the returning wave">
<g transform="translate(46 26)"><rect x="-14" y="-7" width="28" height="14" rx="2" class="sat"/><rect x="-40" y="-4" width="22" height="8" class="panel"/><rect x="18" y="-4" width="22" height="8" class="panel"/></g>
<text x="46" y="58" class="lbl" text-anchor="middle">NISAR</text>
<line x1="60" y1="40" x2="236" y2="196" class="ray"/><line x1="60" y1="40" x2="250" y2="210" class="ray b"/>
<path d="M150 196 Q200 178 236 196 T320 196" class="ground"/><path d="M150 210 Q210 192 250 210 T320 210" class="ground b"/>
<text x="326" y="196" class="lbl">pass 1</text><text x="326" y="214" class="lbl acc">pass 2</text>
<line x1="236" y1="196" x2="250" y2="210" class="d"/><text x="226" y="222" class="lbl acc" text-anchor="end">moved d</text>
<text x="30" y="244" class="lbl muted">The echo goes there and back,</text><text x="30" y="264" class="lbl muted">so its path is 2d longer.</text>
<g transform="translate(400 0)">
 <text x="0" y="34" class="lbl">echo, pass 1</text><path d="${wave(0, 66, 220, 70, 16)}" class="w"/>
 <text x="0" y="114" class="lbl acc">echo, pass 2</text><path d="${wave(0, 146, 220, 70, 16, -shift)}" class="w b"/>
 <line x1="17.5" y1="44" x2="17.5" y2="166" class="guide"/><line x1="${17.5 + (shift / (2 * Math.PI)) * 70}" y1="128" x2="${17.5 + (shift / (2 * Math.PI)) * 70}" y2="166" class="guide b"/>
 <text x="0" y="190" class="lbl">phase shift Δφ</text>
 <text x="0" y="222" class="lbl">one full cycle of shift (2π)</text><text x="0" y="240" class="lbl">= half a wavelength = ${half} cm of motion</text>
</g></svg>`;
}

// Deterministic speckle pattern of scatterers in a cell.
function scatter(seed, n, x0, y0, w, h) {
  let s = seed, out = "";
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) out += `<circle cx="${(x0 + r() * w).toFixed(1)}" cy="${(y0 + r() * h).toFixed(1)}" r="${(1.5 + r() * 3).toFixed(1)}"/>`;
  return out;
}

function coherenceDiagram() {
  const cell = (x, seedA, seedB, title, note) => `
<text x="${x + 130}" y="24" class="lbl" text-anchor="middle">${title}</text>
<rect x="${x}" y="36" width="120" height="90" rx="4" class="cell"/><rect x="${x + 140}" y="36" width="120" height="90" rx="4" class="cell"/>
<g class="dots">${scatter(seedA, 26, x + 8, 44, 104, 74)}</g><g class="dots b">${scatter(seedB, 26, x + 148, 44, 104, 74)}</g>
<text x="${x + 60}" y="144" class="lbl muted" text-anchor="middle">pass 1</text><text x="${x + 200}" y="144" class="lbl muted" text-anchor="middle">pass 2</text>
<text x="${x + 130}" y="172" class="lbl ${seedA === seedB ? "" : "acc"}" text-anchor="middle">${note}</text>`;
  return `<svg class="diagram" viewBox="0 0 640 190" role="img" aria-label="Unchanged ground gives matching echo patterns (high coherence); disturbed ground gives different patterns (low coherence)">
${cell(20, 7, 7, "Ground unchanged", "patterns match: high coherence")}
${cell(360, 7, 91, "Ground buried or torn up", "patterns differ: coherence drops")}</svg>`;
}

function backscatterDiagram(kind) {
  const sat = (x) => `<g transform="translate(${x} 24)"><rect x="-12" y="-6" width="24" height="12" rx="2" class="sat"/><rect x="-32" y="-3" width="18" height="6" class="panel"/><rect x="14" y="-3" width="18" height="6" class="panel"/></g>`;
  const arrow = (x1, y1, x2, y2, cls = "") => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="ray ${cls}" marker-end="url(#ah)"/>`;
  const defs = `<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="ahead"/></marker></defs>`;
  if (kind === "fire") {
    const tree = (x) => `<g class="tree"><line x1="${x}" y1="176" x2="${x}" y2="120"/><line x1="${x}" y1="140" x2="${x - 14}" y2="126"/><line x1="${x}" y1="132" x2="${x + 14}" y2="118"/><line x1="${x}" y1="152" x2="${x + 12}" y2="142"/></g>`;
    const stump = (x) => `<g class="tree b"><line x1="${x}" y1="176" x2="${x}" y2="150"/></g>`;
    return `<svg class="diagram" viewBox="0 0 640 220" role="img" aria-label="Forest canopy scatters the radar many times and returns a strong cross-polarised (HV) echo; burnt ground returns little HV">${defs}
${sat(70)}${arrow(80, 34, 150, 124)}${arrow(158, 132, 96, 40, "ret")}${arrow(174, 128, 112, 44, "ret")}
<line x1="40" y1="176" x2="290" y2="176" class="ground"/>${[130, 165, 200, 235].map(tree).join("")}
<text x="165" y="200" class="lbl" text-anchor="middle">Forest: branches bounce the wave around,</text><text x="165" y="214" class="lbl" text-anchor="middle">twisting it: strong HV echo</text>
${sat(390)}${arrow(400, 34, 480, 172)}${arrow(482, 172, 560, 60, "lost")}${arrow(476, 168, 420, 70, "ret thin")}
<line x1="360" y1="176" x2="610" y2="176" class="ground"/>${[450, 500, 550].map(stump).join("")}
<text x="485" y="200" class="lbl acc" text-anchor="middle">Burnt: little left to scatter,</text><text x="485" y="214" class="lbl acc" text-anchor="middle">HV echo falls</text></svg>`;
  }
  return `<svg class="diagram" viewBox="0 0 640 220" role="img" aria-label="Rough ground scatters the radar back to the satellite; smooth water reflects it away like a mirror">${defs}
${sat(70)}${arrow(80, 34, 160, 168)}${arrow(162, 166, 98, 42, "ret")}${arrow(166, 168, 250, 110, "ret thin")}${arrow(160, 168, 120, 100, "ret thin")}
<path d="M40 176 l12 -6 l10 5 l14 -8 l12 7 l16 -6 l10 4 l14 -7 l14 8 l12 -5 l16 6 l12 -7 l14 6 l12 -4 l16 6 l12 -5 l14 7 l10 -3" class="ground"/>
<text x="165" y="200" class="lbl" text-anchor="middle">Land: rough surface scatters some</text><text x="165" y="214" class="lbl" text-anchor="middle">of the pulse back: bright</text>
${sat(390)}${arrow(400, 34, 480, 172)}${arrow(482, 172, 562, 40, "lost")}
<line x1="360" y1="176" x2="610" y2="176" class="water"/>
<text x="485" y="200" class="lbl acc" text-anchor="middle">Water: smooth, reflects it away</text><text x="485" y="214" class="lbl acc" text-anchor="middle">like a mirror: dark</text></svg>`;
}

// Fastest-sinking pixel: cumulative motion at each pass, with a steady rate fitted to it.
function sinkChart(dates, cm) {
  const t = dates.map((d) => days(dates[0], d));
  const rate = t.reduce((s, x, i) => s + x * cm[i], 0) / t.reduce((s, x) => s + x * x, 0);   // cm/day, through origin
  const W = 640, H = 260, L = 52, R = 620, T = 18, B = 220;
  const lo = Math.min(...cm, rate * t.at(-1)), y0 = Math.floor(lo / 10) * 10;
  const X = (x) => L + (x / t.at(-1)) * (R - L), Y = (v) => T + (v / y0) * (B - T);
  let g = "";
  for (let v = 0; v >= y0; v -= 10) g += `<line x1="${L}" x2="${R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 8}" y="${Y(v) + 4}" class="lbl muted" text-anchor="end">${v}</text>`;
  const pts = cm.map((v, i) => `<circle cx="${X(t[i])}" cy="${Y(v)}" r="4" class="pt" data-i="${i}"/>`).join("");
  const hits = cm.map((v, i) => `<rect x="${X(t[i]) - 10}" y="${T}" width="20" height="${B - T}" class="hit" data-i="${i}"/>`).join("");
  return {
    rate: rate * 365.25,
    svg: `<svg class="diagram chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative line-of-sight motion of the fastest-sinking spot at each pass, with a fitted straight line">
${g}<text x="${L}" y="${T - 6}" class="lbl muted">cm (line of sight)</text>
<line x1="${X(0)}" y1="${Y(0)}" x2="${X(t.at(-1))}" y2="${Y(rate * t.at(-1))}" class="fit"/>
<polyline points="${cm.map((v, i) => `${X(t[i])},${Y(v)}`).join(" ")}" class="series"/>${pts}
<text x="${L}" y="${B + 20}" class="lbl muted">${fmt(dates[0])}</text><text x="${R}" y="${B + 20}" class="lbl muted" text-anchor="end">${fmt(dates.at(-1))}</text>
<text x="${X(t.at(-1)) - 6}" y="${Y(rate * t.at(-1)) + 18}" class="lbl" text-anchor="end">fitted steady rate</text>
<g class="tip" visibility="hidden"><line class="xh" y1="${T}" y2="${B}"/><text class="lbl tt" y="${T + 14}"></text></g>${hits}</svg>`,
    wire(el) {
      const tip = el.querySelector(".tip"), xh = tip.querySelector(".xh"), tt = tip.querySelector(".tt");
      el.querySelectorAll(".hit").forEach((h) => {
        const i = +h.dataset.i, x = X(t[i]);
        h.addEventListener("mouseenter", () => {
          xh.setAttribute("x1", x); xh.setAttribute("x2", x);
          tt.setAttribute("x", x + (x > 480 ? -8 : 8)); tt.setAttribute("text-anchor", x > 480 ? "end" : "start");
          tt.textContent = `${fmt(dates[i])}: ${cm[i]} cm`;
          tip.setAttribute("visibility", "visible");
          el.querySelectorAll(".pt").forEach((p) => p.classList.toggle("on", +p.dataset.i === i));
        });
      });
      el.querySelector("svg").addEventListener("mouseleave", () => { tip.setAttribute("visibility", "hidden"); el.querySelectorAll(".pt.on").forEach((p) => p.classList.remove("on")); });
    },
  };
}

// Coherence-drop footprint drawn client-side from cohdrop.u8 over a dimmed optical image.
async function dropFigure(base, meta, color) {
  const { nx, ny } = meta.grid;
  const drop = new Uint8Array(await (await fetch(base + meta.layers.cohdrop)).arrayBuffer());
  const c = document.createElement("canvas");
  c.width = nx; c.height = ny;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#1a1d26"; ctx.fillRect(0, 0, nx, ny);
  const bg = meta.images.find((i) => i.file === "optical-after.jpg");
  if (bg) {
    const im = new Image();
    im.src = base + bg.file;
    await im.decode().catch(() => null);
    if (im.naturalWidth) { ctx.drawImage(im, 0, 0, nx, ny); ctx.fillStyle = "rgba(11, 15, 25, 0.55)"; ctx.fillRect(0, 0, nx, ny); }
  }
  const px = ctx.getImageData(0, 0, nx, ny), d = px.data;
  const [r, g, b] = color;
  for (let i = 0; i < drop.length; i++) {
    const a = Math.min(1, Math.max(0, (drop[i] / 255 - 0.2) / 0.3)) * 0.9;
    if (!a) continue;
    d[4 * i] += (r - d[4 * i]) * a; d[4 * i + 1] += (g - d[4 * i + 1]) * a; d[4 * i + 2] += (b - d[4 * i + 2]) * a;
  }
  ctx.putImageData(px, 0, 0);
  return c;
}

// ---------------------------------------------------------------- copy

function fig(base, meta, used, file, caption) {
  const im = meta.images.find((i) => i.file === file);
  if (!im) return "";
  used.add(file);
  return `<figure><a href="${base + im.file}"><img src="${base + im.file}" alt="${esc(im.caption)}" loading="lazy"></a>
<figcaption>${caption ? `<strong>${caption}</strong> ` : ""}${esc(im.caption)}<br><small class="muted">${esc(im.source)}</small></figcaption></figure>`;
}

const step = (title, body, figs = "", cls = "") => `<li class="step ${cls}"><h3>${title}</h3>${body}${figs ? `<div class="figs">${figs}</div>` : ""}</li>`;
const sub = (title, body, figs = "") => step(title, body, figs, "sub");

export async function renderHow(el, base, meta, viewer) {
  const v = variant(meta), n = meta.nisar, s = meta.stats, used = new Set();
  const F = (file, cap) => fig(base, meta, used, file, cap);
  const noun = EVENT_NOUN[meta.kind] ?? "event";
  const dir = n.stack[2] === "A" ? "ascending (south-to-north)" : "descending (north-to-south)";
  const lamCm = ((n.wavelength_m ?? 0.24) * 100).toFixed(1), lamTxt = n.wavelength_m ? `${lamCm} cm` : "about 24 cm";
  const mb = (Math.round(n.mb_read * 10) / 10).toLocaleString();
  const km = Math.round((meta.grid.nx * meta.grid.dx) / 1000), dx = meta.grid.dx;
  const exag = viewer?.losExag0 ? `×${Math.round(viewer.losExag0).toLocaleString()}` : "thousands of times";
  const radarIntro = `NISAR's L-band radar (wavelength ${lamTxt}) sends its own microwave pulses and records the echoes, so it sees through cloud, smoke and darkness.`;
  const parts = [];
  let after = null;   // async figure filled in once the list is in the page

  const nasaWindow = `<li>We read just the ${km} km × ${km} km window around the ${noun}: <strong>${mb} MB</strong>, pulled straight out of NASA's much larger files without downloading them whole.</li>`;
  const grid = `<li>We put the terrain (Copernicus 30 m elevation model) and the optical images (step 5) on the same ${dx} m grid as the radar, so every layer lines up pixel for pixel.</li>`;

  if (v === "motion" || v === "damage") {
    const [a, b] = n.pair, [ta, , tb] = stamps(n.granule), k = days(a, b);
    const passes = [n.pre_pair?.[0], a, b].filter(Boolean);
    parts.push(step(`1 · First pass: ${fmt(a)}`,
      `<p>At ${ta ?? "—"} UTC on ${fmt(a)}, NISAR flew over on its ${dir} track. ${radarIntro} For every patch of ground it kept two things: how strong the echo was, and its exact <em>timing</em>, the point in the wave's cycle (its phase) when it came back.</p>
<p class="muted small">On its own, a single pass looks like a grainy black-and-white photo, and its phase looks like static. The information only appears when you compare two passes.</p>`));
    parts.push(step(`2 · Second pass: ${fmt(b)}, ${k} days later`,
      `<p>NISAR repeats the same orbit every 12 days. It flew the same track again at ${tb ?? "—"} UTC on ${fmt(b)}, ${nDays(days(meta.date, b))} after the ${noun} on ${fmt(meta.date)}.${k > 12 ? ` The 12-day pair across the ${noun} wasn't available, so we used the ${k}-day one.` : ""}${n.pre_pair ? ` We also kept the pair just before it (${fmt(n.pre_pair[0])} → ${fmt(n.pre_pair[1])}) to see what quiet ground looks like.` : ""}</p>`,
      timeline(passes, { event: meta.date, eventLabel: noun, pair: n.pair, label: { [n.pre_pair?.[0]]: "baseline", [a]: "before", [b]: "after" } })));
  }

  if (v === "motion") {
    const [a, b] = n.pair;
    parts.push(step("3 · Comparing the passes: the interferogram",
      `<p><strong>NASA/JPL did the heavy lifting here.</strong> NISAR's processing system lined up the two radar images to within a fraction of a pixel and compared the echo phase pixel by pixel. If the ground moved away from the satellite by a distance <em>d</em>, the echo's round trip got 2<em>d</em> longer, so it came back shifted in its cycle. The processor then removed the shifts caused by the satellite being in a slightly different place and by the shape of the terrain, "unwrapped" the shift (which only comes as an angle from 0 to 360°) into a continuous number, and put it on a map. NASA publishes the result as a <abbr title="Geocoded Unwrapped Interferogram">GUNW</abbr> product, along with an estimate of the ionosphere's effect and a coherence score for every pixel.</p>`,
      phaseDiagram(+lamCm)));
    parts.push(sub("3a · What we had to do",
      `<ul class="todo">${nasaWindow}
<li><strong>Turn phase into centimetres:</strong> <span class="eq">motion = −λ ⁄ 4π × (Δφ − Δφ<sub>ionosphere</sub>)</span>, with λ = ${lamCm} cm. We subtract NASA's ionosphere estimate first: the charged upper atmosphere delays radar too.</li>
<li><strong>Throw out what we can't trust:</strong> pixels where the two passes barely match (coherence below 0.3), and anything outside the largest unwrapped region, which can be off by whole cycles. That leaves <strong>${s.measured_pct}%</strong> of the scene.</li>
<li><strong>Pick a zero.</strong> Phase has no absolute reference, so all motion is relative to the scene's median, which sits on stable ground away from the ${noun}.</li>
${s.baseline_range_cm != null ? `<li><strong>Check against quiet ground.</strong> In the baseline pair before the ${noun}, the "motion" (really water vapour and noise) spans ${s.baseline_range_cm} cm. Across the ${noun} it spans <strong>${s.motion_range_cm} cm</strong>.</li>` : ""}
${grid}
<li><strong>Smooth, for the 3D surface only,</strong> to fill pinholes. The numbers on the story cards come from the unsmoothed measurements.</li></ul>`));
    parts.push(step("4 · Painting the motion in colour",
      `<p>We drew the motion as repeating bands of colour: <strong>one full rainbow cycle for every 10 cm</strong> the ground moved toward or away from the satellite. NISAR's own cycle is ${(lamCm / 2).toFixed(1)} cm (half its wavelength); we re-drew it at a round 10 cm so the bands are easy to count. Brightness shows coherence, and dim ground wasn't measured.</p>
<div class="ramp" aria-hidden="true"></div><p class="ramp-l small muted"><span>0</span><span>+10 cm along the line of sight, then the colours repeat</span></p>`,
      F("interferogram.png", `Across the ${noun}.`) + F("interferogram-before.png", "Quiet pair, for comparison.") + F("coherence.png", "Coherence.")));
    if (meta.kind === "quake") parts.push(sub("4a · Reading the fringes",
      `<p>Fringes work like contour lines on a hiking map: each band is another 10 cm. Count the bands between two places and multiply by 10 cm to get how much more one moved than the other. Bands bunched tightly together mean the motion changes fast over a short distance, which usually happens near the fault. Right next to the rupture the ground can be torn up so badly that the passes stop matching and the fringes break up into noise.</p>
<p>NISAR looks sideways, so it only measures motion along its slanted line of sight. A single interferogram can't tell ground rising from ground sliding sideways toward the satellite; it only sees how much closer or farther each point got.</p>`));
    else parts.push(sub("4a · Reading the fringes",
      `<p>Fringes work like contour lines: each band is another 10 cm toward or away from the satellite. Rings of fringes centred on a volcano are the classic sign of magma inflating or draining beneath it.</p>`));
  }

  if (v === "damage") {
    parts.push(step("3 · Comparing the passes: coherence",
      `<p><strong>NASA/JPL did the heavy lifting here.</strong> NISAR's processing system lined up the two radar images to within a fraction of a pixel and compared them pixel by pixel. Alongside the interferogram (how far each patch moved), it measures <strong>coherence</strong>: how well the fine echo pattern from each patch matches between the two passes, from 0 (no match) to 1 (identical). Ground that is buried, swept away or resurfaced between the passes no longer matches itself, so its coherence collapses. NASA publishes both in its <abbr title="Geocoded Unwrapped Interferogram">GUNW</abbr> product.</p>`,
      coherenceDiagram()));
    parts.push(sub("3a · What we had to do",
      `<ul class="todo">${nasaWindow}
<li><strong>Read coherence twice:</strong> from the quiet pair before the ${noun} (${fmt(n.pre_pair[0])} → ${fmt(n.pre_pair[1])}) and from the pair across it (${fmt(n.pair[0])} → ${fmt(n.pair[1])}).</li>
<li><strong>Subtract:</strong> <span class="eq">drop = coherence<sub>before</sub> − coherence<sub>across</sub></span>. Only ground that matched itself before and stopped matching across the ${noun} counts. Water and dense forest, which never match, don't. <strong>${s.coherence_drop_pct}%</strong> of the scene dropped by more than 0.3.</li>
${meta.footprint_rule ? `<li><strong>Keep only ground that could plausibly have been buried.</strong> Fields, forest and alpine meadows also lose some coherence between passes, so a raw drop lights up places the ${noun} never reached. ${meta.footprint_rule}</li>`
  : meta.kind === "landslide" ? `<li><strong>Mask out the high peaks.</strong> Fresh snow above about 3,500 m also scrambles the echoes, so we only map valley ground below the snowline.</li>` : ""}
${meta.note ? `<li><strong>Checked against the ground truth:</strong> ${meta.note}</li>` : ""}
${grid}</ul>`));
    parts.push(step("4 · Painting the change in colour",
      `<p>We painted the coherence drop in a single colour, <strong class="magenta">magenta</strong>: the brighter, the more the surface changed. In the 3D view the magenta fades in with the slider.</p>`,
      `<figure id="drop-fig"><div class="canvas-slot"></div><figcaption><strong>Coherence drop</strong> across the ${noun}, over the Sentinel-2 after image (dimmed).<br><small class="muted">NISAR L2 GUNW (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC</small></figcaption></figure>` + F("coherence.png", `Coherence across the ${noun}.`)));
    after = async (root) => {
      const slot = root.querySelector("#drop-fig .canvas-slot");
      if (slot && meta.layers.cohdrop) slot.replaceWith(await dropFigure(base, meta, [255, 43, 214]));
    };
    const why = meta.kind === "landslide"
      ? `An avalanche or landslide moves debris metres, not centimetres, and replaces the surface rather than nudging it. There's no matching echo left to measure a shift against, so fringes can't capture it. The loss of coherence <em>is</em> the footprint.`
      : s.measured_pct < 5
      ? `Almost nothing in this scene could be measured (${s.measured_pct}%). It is mostly open sea, which never matches itself between passes, plus ground freshly covered in ash. Coherence change is the only signal left.`
      : `We compared the spread of motion across the ${noun} (${s.motion_range_cm} cm) with the quiet pair before it (${s.baseline_range_cm} cm). The eruption pair varied barely more than the quiet one, so most of the variation is mostly atmosphere (water vapour delays the radar too), not the volcano. What did change is the surface: fresh lava and ash wipe out the old echo pattern.`;
    if (s.measured_pct < 5) ["interferogram.png", "interferogram-before.png"].forEach((f) => used.add(f));   // nothing measured: blank
    parts.push(sub("4a · Why not ground motion?", `<p>${why}</p>`, s.measured_pct < 5 ? "" :
      F("interferogram.png", `Motion across the ${noun}, set aside.`) + F("interferogram-before.png", "Quiet pair, for comparison.")));
  }

  if (v === "brightness") {
    const pb = n.passes_before, pa = n.passes_after, g = n.granules, t = g.map((x) => stamps(x)[0]);
    const fire = meta.kind === "fire", pol = fire ? "HV" : "HH";
    parts.push(step(`1 · Before: ${pb.length} passes, ${fmt(pb[0])} to ${fmt(pb.at(-1))}`,
      `<p>NISAR flew over ${pb.length === 2 ? "twice" : `${pb.length} times`} on its ${dir} track before the ${noun}, the last at ${t[pb.length - 1] ?? "—"} UTC on ${fmt(pb.at(-1))}. ${radarIntro} Here we only need how <em>strongly</em> the ground bounced the pulse back, recorded in two polarisations: <strong>HH</strong> (sent and received with the wave horizontal) and <strong>HV</strong> (sent horizontal, received vertical), which mostly comes from vegetation scattering the wave around.</p>`,
      F("backscatter-before.jpg", "Before.")));
    parts.push(step(`2 · After: ${pa.map(fmt).join(", ")}`,
      `<p>NISAR repeats the same orbit every 12 days. It flew the same track again on ${fmt(pa[0])}, ${nDays(days(meta.date, pa[0]))} after the ${noun} began on ${fmt(meta.date)}.</p>`,
      timeline([...pb, ...pa], { event: meta.date, eventLabel: noun, pair: n.pair, label: Object.fromEntries([...pb.map((p) => [p, "before"]), ...pa.map((p) => [p, "after"])]) })
        + F("backscatter-after.jpg", "After.")));
    parts.push(step("3 · Comparing the passes: brightness",
      `<p>For a ${noun} we don't need the echo's timing, only its strength. <strong>NASA/JPL did the groundwork:</strong> NISAR's processing system focused the raw echoes into images, calibrated their brightness, corrected for slopes tilted toward or away from the radar, and mapped every pass onto the same grid. NASA publishes this as a <abbr title="Geocoded Polarimetric Covariance">GCOV</abbr> product. ${fire ? "When fire strips the canopy, the twisted (HV) echo from branches and leaves falls." : "When land floods, its echo collapses: still water acts like a mirror."}</p>`,
      backscatterDiagram(meta.kind)));
    parts.push(sub("3a · What we had to do",
      `<ul class="todo">${nasaWindow}
<li><strong>Beat the speckle.</strong> A single radar image is grainy, so we took the median of the ${pb.length} passes before as "normal" and averaged into ${dx} m cells.</li>
<li><strong>Apply a simple rule</strong> on brightness in decibels (dB): ${fire
  ? "ground whose HV fell by more than 1.5 dB is mapped as burnt, leaving out ground that was already dark (water, bare rock)."
  : "ground that wasn't dark before (HH above −15 dB), is dark after (below −15 dB) and fell by more than 3 dB is mapped as new open water."}</li>
<li><strong>Clean up lone pixels</strong> with a 3 × 3 median filter, then <strong>drop patches smaller than ${(10 * dx * dx / 1e4).toFixed(1)} ha</strong> (10 cells). Neighbouring cells share speckle, so a handful of them together is one piece of evidence, not ten. Result: <strong>${s.change_km2} km²</strong> mapped, typically ${s.median_db_change} dB darker in ${pol}.</li>
${grid}</ul>`));
    parts.push(step("4 · Painting the change in colour",
      `<p>We painted the mapped ground a single colour: <strong class="${fire ? "red" : "cyan"}">${fire ? "red" : "cyan"}</strong> in the 3D view, where it fades in with the slider. Below, white is changed ground.</p>`,
      F("change.png", "Change.")));
    parts.push(sub("4a · What radar sees in a " + noun, fire
      ? `<p>HV echoes come mostly from "volume scattering": the wave bouncing around inside a canopy of branches and leaves before heading back. Burn away the canopy and that echo falls, while HH (from the ground surface) changes much less. Radar sees through smoke, so it can map a scar while the fire is still burning.</p>`
      : `<p>Water under crops or trees can do the opposite. The pulse bounces off the water, then off stems, and straight back to the satellite (a "double bounce"), so it gets <em>brighter</em>. ${s.brightened_km2 != null ? `${s.brightened_km2} km² brightened like this. ` : ""}We report it but don't map it, because growing crops and buildings brighten too. Monsoon cloud often hides every optical scene for weeks, so radar can be the only clear view of a flood.</p>`));
  }

  if (v === "subsidence") {
    const d = n.dates, gaps = d.slice(1).map((x, i) => days(d[i], x)), long = gaps.filter((g) => g > 12);
    parts.push(step(`1 · First pass: ${fmt(d[0])}`,
      `<p>At ${stamps(n.granules[0])[0] ?? "—"} UTC on ${fmt(d[0])}, NISAR flew over on its ${dir} track. ${radarIntro} For every patch of ground it kept how strong the echo was and its exact <em>timing</em>, the point in the wave's cycle (its phase) when it came back.</p>
<p class="muted small">On its own, a single pass looks like a grainy black-and-white photo, and its phase looks like static. The information only appears when you compare passes.</p>`));
    parts.push(step(`2 · Then every 12 days for a year: ${d.length} passes`,
      `<p>NISAR repeats the same orbit every 12 days. Unlike a sudden event, sinking ground needs a long record, so we used every pass on this track from ${fmt(d[0])} to ${fmt(d.at(-1))}${long.length ? ` (one gap of ${long[0]} days where a pair wasn't available)` : ""}.</p>`,
      timeline(d)));
    parts.push(step("3 · Comparing the passes: interferograms",
      `<p><strong>NASA/JPL did the heavy lifting here.</strong> For each pair of consecutive passes, NISAR's processing system lined up the two radar images to within a fraction of a pixel and compared the echo phase pixel by pixel. If the ground sank by a distance <em>d</em>, the echo's round trip got 2<em>d</em> longer, so it came back shifted in its cycle. The processor removed the shifts caused by the satellite's position and the terrain, unwrapped the shift into a continuous number and put it on a map: the <abbr title="Geocoded Unwrapped Interferogram">GUNW</abbr> product.</p>`,
      phaseDiagram(+lamCm)));
    parts.push(sub("3a · What we had to do",
      `<ul class="todo"><li>We read the same ${km} km window from all <strong>${n.granules.length}</strong> interferograms: ${mb} MB in total, without downloading the files whole.</li>
<li><strong>Turn each pair into centimetres:</strong> <span class="eq">motion = −λ ⁄ 4π × (Δφ − Δφ<sub>ionosphere</sub>)</span>, with λ = ${lamCm} cm, keeping only well-matched pixels (coherence ≥ 0.3) in the largest unwrapped region, relative to the scene median.</li>
<li><strong>Chain the pairs:</strong> each starts where the last ended, so adding them up gives the ground's total motion since ${fmt(d[0])}, one step every 12 days.</li>
<li><strong>Fit a steady rate.</strong> Each pair carries about 0.5–1 cm of atmospheric noise, and adding them up adds up the noise too. Groundwater pumping sinks the city at a steady pace, so we fit a straight line through each pixel's record and keep its slope. On average the passes sit <strong>${s.fit_rms_cm} cm</strong> from the line.</li>
<li><strong>Keep pixels measured in at least 80% of the pairs:</strong> ${s.measured_pct}% of the scene.</li>
${grid}</ul>`));
    parts.push(step("4 · Painting the sinking in colour",
      `<p>Below, the fitted motion over the whole year is drawn as repeating bands of colour, one rainbow cycle per 10 cm. In the 3D view we use something quieter so the city stays readable: a <strong class="magenta">pink</strong> tint where the ground sank, with a contour line every 5 cm, only where it sank by more than 2 cm (about twice the noise).</p>
<div class="ramp" aria-hidden="true"></div><p class="ramp-l small muted"><span>0</span><span>+10 cm along the line of sight, then the colours repeat</span></p>`,
      F("interferogram.png", "A year of sinking.") + F("coherence.png", "Coherence.")));
    if (s.fastest_series_cm?.length === d.length) {
      const c = sinkChart(d, s.fastest_series_cm);
      parts.push(sub("4a · One spot, pass by pass",
        `<p>This is the record at the fastest-sinking spot: the total motion at each pass, with the straight line we fit to it (<strong>${Math.abs(c.rate).toFixed(1)} cm/year</strong> for this pixel alone; the ${s.max_sinking_cm_yr} cm/year in the table above averages it with its neighbours to keep single-pixel errors out). The real record isn't perfectly straight: pass-to-pass jitter is mostly atmosphere, and any slower drift, such as sinking that speeds up or levels off, gets averaged into the single rate. NISAR measures along its slanted line of sight, so for ground that only sinks, the true vertical drop is somewhat larger.</p>`,
        `<figure class="wide" id="sink-chart">${c.svg}<figcaption class="small muted">Hover a point for its date and value.</figcaption></figure>`));
      after = async (root) => c.wire(root.querySelector("#sink-chart"));
    }
  }

  // 5 · optical
  const ob = n.optical_before, oa = n.optical_after;
  if (ob || oa) parts.push(step("5 · Optical images for context",
    `<p>Radar images are hard to read, so we added ordinary colour images from ESA's Sentinel-2 satellites. Clouds spoil most single scenes, so each image is a cloud-masked blend of several: ${ob ? `${ob.scenes.length} scenes from ${fmt(ob.window[0])} to ${fmt(ob.window[1])} before` : ""}${ob && oa ? ", and " : ""}${oa ? `${oa.scenes.length} from ${fmt(oa.window[0])} to ${fmt(oa.window[1])} after` : ""}. In the 3D view the after image is draped over the terrain, with gaps filled from the before image${v === "brightness" ? " and, where clouds hid every scene, from radar brightness" : ""}.</p>`,
    F("optical-before.jpg", "Before.") + F("optical-after.jpg", "After.")));

  // 6 · together
  const layers = v === "motion"
    ? `NISAR's measured motion added as extra height, exaggerated <strong>${exag}</strong> by default because ${s.motion_range_cm} cm would otherwise be invisible across ${km} km, and the colour fringes on top`
    : v === "subsidence"
    ? `the fitted sinking added as extra height, exaggerated <strong>${exag}</strong> by default, with the pink tint and contours on top`
    : `the ${v === "damage" ? "magenta coherence-drop" : meta.kind === "fire" ? "red burn" : "cyan flood"} footprint on top. Ground motion is switched off here because it isn't the signal; the exaggeration slider turns it back on`;
  const when = v === "subsidence"
    ? `NISAR saw the ground every 12 days, but the slider doesn't replay those passes: it walks through the year at the single steady rate we fitted, to make the overall sinking easy to see. The pass-by-pass record is in the chart above.`
    : `NISAR only saw the ground on ${fmt(n.pair[0])} and ${fmt(n.pair[1])}. ${meta.kind === "quake" ? `The earthquake itself took seconds, on ${fmt(meta.date)}.` : `What happened in between, and how fast, isn't in the data.`} The slider simply blends from "before" to "after" to make the difference easy to see. It doesn't show how fast or in what order things changed${v === "motion" ? ", and the height exaggeration is far beyond anything real" : ""}.`;
  parts.push(step("6 · Putting it together",
    `<p>The 3D view at the top stacks it all: Copernicus terrain (height mildly exaggerated so the relief reads at this scale), the Sentinel-2 image, and ${layers}. Then we animate the change.</p>
<aside class="callout"><strong>The animation is not a recording.</strong> ${when}</aside>`));

  // Anything the steps didn't place (new image types) still gets shown.
  const rest = meta.images.filter((i) => !used.has(i.file)).map((i) => F(i.file)).join("");
  if (rest) parts.push(step("More images", "", rest, "sub"));

  el.innerHTML = `<ol class="steps">${parts.join("")}</ol>`;
  if (after) await after(el);
}
