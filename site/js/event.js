import { createViewer } from "./viewer.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const slug = new URLSearchParams(location.search).get("e");
const base = `events/${slug}/`;
const meta = await (await fetch(base + "meta.json")).json();

document.title = `${meta.name} · Either side of the line`;
$("#title").textContent = meta.name;
$("#sub").textContent = `${meta.date ?? "ongoing"} · ${meta.kind} · NISAR pass ${meta.nisar.pair.join(" → ")}`;

const v = await createViewer($("#hero"), base, meta);
$("#loading").remove();

// Before → after slider (interpolated: two passes only).
const t = $("#t"), tOut = $("#t-out"), play = $("#play");
const [d0, d1] = meta.nisar.pair;
const showT = () => {
  const x = t.value / 1000;
  v.setT(x);
  tOut.textContent = x === 0 ? `before (${d0})` : x === 1 ? `after (${d1})` : `${Math.round(x * 100)}% of the measured motion`;
};
t.addEventListener("input", () => { playing = false; play.textContent = "Play"; showT(); });
let playing = false, last = 0;
play.addEventListener("click", () => { playing = !playing; play.textContent = playing ? "Pause" : "Play"; if (t.value >= 1000) t.value = 0; });
v.onFrame(() => {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!playing) return;
  t.value = Math.min(1000, +t.value + dt * 250);
  showT();
  if (+t.value >= 1000) { playing = false; play.textContent = "Play"; }
});
showT();

const ex = $("#exag"), exOut = $("#exag-out");
const setEx = () => { const x = v.losExag0 * 10 ** (ex.value / 100); v.setLosExag(x); exOut.textContent = `×${Math.round(x).toLocaleString()}`; };
ex.addEventListener("input", setEx); setEx();
$("#fringes").addEventListener("change", (e) => v.setFringe(e.target.checked));
$("#ground").addEventListener("change", (e) => v.setGround(e.target.checked));

const s = meta.stats;
$("#numbers").innerHTML = `<table>
<tr><th>Ground motion across the scene (2nd-98th percentile, line of sight)</th><td>${s.motion_range_cm} cm</td></tr>
${s.baseline_range_cm != null ? `<tr><th>Same, in the quiet baseline pair before the event</th><td>${s.baseline_range_cm} cm</td></tr>` : ""}
<tr><th>Area where motion was measured (coherent)</th><td>${s.measured_pct}%</td></tr></table>`;

$("#images").innerHTML = meta.images.map((im) => `<figure><a href="${base + im.file}"><img src="${base + im.file}" alt="${esc(im.caption)}" loading="lazy"></a>
<figcaption>${esc(im.caption)}<br><small class="muted">${esc(im.source)}</small></figcaption></figure>`).join("");

$("#sources").innerHTML = [
  `NISAR: NASA/JPL-Caltech and ISRO, provisional L2 GUNW via the Alaska Satellite Facility DAAC. Track ${meta.nisar.stack[0]}, frame ${meta.nisar.stack[1]}, ${meta.nisar.stack[2] === "A" ? "ascending" : "descending"}.`,
  `<code>${esc(meta.nisar.granule)}</code>`, meta.nisar.pre_granule ? `<code>${esc(meta.nisar.pre_granule)}</code>` : "",
  "Terrain: Copernicus GLO-30 DEM © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA, via AWS Open Data.",
  "Optical: contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search.",
  "3D: three.js.",
].filter(Boolean).map((x) => `<li>${x}</li>`).join("");

window.eventPage = { meta, viewer: v };
