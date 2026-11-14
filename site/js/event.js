import { createViewer } from "./viewer.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const slug = new URLSearchParams(location.search).get("e");
const base = `events/${slug}/`;
const meta = await (await fetch(base + "meta.json")).json();

document.title = `${meta.name} · Either side of the line`;
$("#title").textContent = meta.name;
const multi = !!meta.nisar.dates;
$("#sub").textContent = multi ? `${meta.kind} · ${meta.nisar.granules.length} NISAR interferograms, ${meta.nisar.pair.join(" → ")}`
  : `${meta.date} · ${meta.kind} · NISAR pass ${meta.nisar.pair.join(" → ")}`;
if (multi) $("#fringes").checked = false;

const v = await createViewer($("#hero"), base, meta);
$("#loading").remove();

// Before → after slider (interpolated: two passes only).
const t = $("#t"), tOut = $("#t-out"), play = $("#play");
const [d0, d1] = meta.nisar.pair;
const showT = () => {
  const x = t.value / 1000;
  v.setT(x);
  if (multi) {
    const a = Date.parse(d0), b = Date.parse(d1);
    tOut.textContent = `${new Date(a + x * (b - a)).toISOString().slice(0, 10)} (steady rate fitted to all passes)`;
  } else tOut.textContent = x === 0 ? `before (${d0})` : x === 1 ? `after (${d1})` : `${Math.round(x * 100)}% of the measured motion`;
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
${s.max_sinking_cm_yr != null ? `<tr><th>Fastest sinking (line of sight)</th><td>${s.max_sinking_cm_yr} cm/year</td></tr><tr><th>Scatter of the passes around the fitted steady rate</th><td>${s.fit_rms_cm} cm</td></tr>` : ""}
<tr><th>Area where motion was measured (coherent)</th><td>${s.measured_pct}%</td></tr></table>`;

$("#images").innerHTML = meta.images.map((im) => `<figure><a href="${base + im.file}"><img src="${base + im.file}" alt="${esc(im.caption)}" loading="lazy"></a>
<figcaption>${esc(im.caption)}<br><small class="muted">${esc(im.source)}</small></figcaption></figure>`).join("");

$("#sources").innerHTML = [
  `NISAR: NASA/JPL-Caltech and ISRO, provisional L2 GUNW via the Alaska Satellite Facility DAAC. Track ${meta.nisar.stack[0]}, frame ${meta.nisar.stack[1]}, ${meta.nisar.stack[2] === "A" ? "ascending" : "descending"}.`,
  ...(meta.nisar.granules ?? [meta.nisar.granule]).map((g) => `<code>${esc(g)}</code>`), meta.nisar.pre_granule ? `<code>${esc(meta.nisar.pre_granule)}</code>` : "",
  "Terrain: Copernicus GLO-30 DEM © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA, via AWS Open Data.",
  "Optical: contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search.",
  "3D: three.js.",
].filter(Boolean).map((x) => `<li>${x}</li>`).join("");

// ---------- on the ground: editor-selected stories, pinned in 3D ----------
const stories = await fetch(base + "stories.json").then((r) => (r.ok ? r.json() : null), () => null);
if (stories) {
  let items = stories.items.filter((i) => i.status === "selected" && i.nisar?.inside !== false);
  if (!items.length) {
    items = stories.items.filter((i) => i.status !== "rejected" && i.nisar?.inside !== false);
    $("#unreviewed").hidden = false;
  }
  items.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  $("#stories").hidden = false;
  $("#boundary").textContent = stories.boundary ?? "";
  const nisarLine = (n) => !n.measured ? `NISAR: no motion measured here (coherence ${n.coherence}: the surface changed or the signal was lost).`
    : `NISAR: ${n.motion_cm > 0 ? "+" : ""}${n.motion_cm} cm along the line of sight${n.local_step_cm != null ? `; ${n.local_step_cm} cm of change within 500 m` : ""}; coherence ${n.coherence}.`;
  $("#cards").innerHTML = items.map((it, k) => `
<article class="card ${it.side === "affected" ? "hit" : "spared"}" data-k="${k}" tabindex="0" id="story-${k + 1}">
  <h3><span class="num">${k + 1}</span>${esc(it.title)}</h3>
  <p class="small muted">${esc(it.place)} · ${esc(it.date)}</p>
  ${it.show_image ? `<a href="${esc(it.page_url)}" target="_blank" rel="noopener"><img src="${esc(it.image_url)}" alt="${esc(it.what_it_shows)}" loading="lazy" referrerpolicy="no-referrer"></a>` : ""}
  <p>${esc(it.caption || it.what_it_shows)}</p>
  <p class="nisar small">${nisarLine(it.nisar)}</p>
  <p class="small muted"><a href="${esc(it.page_url)}" target="_blank" rel="noopener">Source</a> · ${esc(it.credit)}${it.show_image ? ` · ${esc(it.licence)}` : ""}</p>
</article>`).join("");
  const pins = items.map((it, k) => {
    const p = document.createElement("button");
    p.className = `pin ${it.side === "affected" ? "hit" : "spared"}`;
    p.type = "button";
    p.title = it.title;
    p.innerHTML = `<span>${k + 1}</span>`;
    p.onclick = () => { const c = $(`#story-${k + 1}`); c.scrollIntoView({ behavior: "smooth", block: "center" }); c.classList.add("hot"); setTimeout(() => c.classList.remove("hot"), 1800); };
    $("#hero").appendChild(p);
    return { p, uv: [it.nisar.u, it.nisar.v] };
  });
  document.querySelectorAll(".card").forEach((c) => {
    const p = pins[c.dataset.k].p;
    c.addEventListener("mouseenter", () => p.classList.add("hot"));
    c.addEventListener("mouseleave", () => p.classList.remove("hot"));
  });
  v.onFrame(() => {
    for (const { p, uv } of pins) {
      const s = v.project(uv);
      p.hidden = !s;
      if (s) p.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
    }
  });
}

window.eventPage = { meta, viewer: v };
