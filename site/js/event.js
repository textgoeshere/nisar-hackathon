import { createViewer, STILL } from "./viewer.js";
import { renderHow } from "./how.js";
import { createSkycam } from "./skycam.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const slug = new URLSearchParams(location.search).get("e");
const base = `events/${slug}/`;
const meta = await (await fetch(base + "meta.json")).json();

// Animation settings, global: one localStorage entry shared by every event page.
const SETTINGS_KEY = "nisar.event.settings";
const settings = { autoplay: true, places: true };   // skycam is per page view: Autoplay starts it
try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {}; for (const k in settings) if (k in s) settings[k] = s[k]; } catch {}
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} };

document.title = `${meta.name} · Either side of the line`;
$("#demo-link").href = `demo.html?e=${encodeURIComponent(slug)}`; // tour starts on this event
$("#title").textContent = meta.name;
const multi = !!meta.nisar.dates;
const bs = !!meta.nisar.passes_after;
$("#sub").textContent = bs ? `${meta.date} · ${meta.kind} · NISAR backscatter, ${meta.nisar.passes_before.length} passes before, ${meta.nisar.passes_after.join(", ")} after`
  : multi ? `${meta.kind} · ${meta.nisar.granules.length} NISAR interferograms, ${meta.nisar.pair.join(" → ")}`
  : `${meta.date} · ${meta.kind} · NISAR pass ${meta.nisar.pair.join(" → ")}`;
if (multi || (meta.still || STILL.includes(meta.kind))) $("#fringes").checked = false;

const hero = $("#hero");
// Skycam renders like the demo kiosk does (mesh capped at 640 segments, pixel ratio 1.5) so the flight stays smooth.
const before = (meta.images ?? []).some((i) => i.file === "optical-before.jpg") ? "optical-before.jpg" : null;
const v = await createViewer(hero, base, meta, { groundBefore: before, ...(settings.autoplay ? { segments: 640, pixelRatio: 1.5 } : {}) });
v.setT(1); // the skycam judges its shots with the change fully grown in
const sky = createSkycam(v, hero, () => { $("#opt-skycam").checked = false; }); // touching the view stops it
sky.set(settings.autoplay);

// Wheel zoom only with ctrl/⌘ (trackpad pinch sends ctrl) or after clicking the view, until the pointer
// leaves it; otherwise the wheel scrolls the page. Capture phase, so it runs before OrbitControls' listener.
let armed = false, hintTimer;
const hint = document.createElement("div");
hint.className = "zoom-hint";
hint.textContent = `${/Mac|iP/.test(navigator.platform) ? "⌘" : "Ctrl"} + scroll to zoom, or click the view first`;
hero.appendChild(hint);
hero.addEventListener("pointerdown", () => { armed = true; hint.classList.remove("on"); });
hero.addEventListener("pointerleave", () => { armed = false; });
hero.addEventListener("wheel", (e) => {
  if (armed || e.ctrlKey || e.metaKey) { sky.takeOver(); return; }
  e.stopPropagation();
  hint.classList.add("on");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.remove("on"), 1600);
}, { capture: true, passive: true });

// North arrow: the grid is UTM, so grid north (-z in the scene) is true north to within a degree or two.
const north = document.createElement("div");
north.className = "north";
north.title = "North";
north.innerHTML = `<svg viewBox="-14 -14 28 28" aria-hidden="true"><circle r="13"/><path d="M0-6.5 3 0H-3Z"/><path class="s" d="M0 6.5 3 0H-3Z"/><text y="-9.2">N</text></svg>`;
hero.appendChild(north);
const needle = north.firstChild, look = v.camera.position.clone();
v.onFrame(() => {
  v.camera.getWorldDirection(look);
  needle.style.transform = `rotate(${-Math.atan2(look.x, -look.z)}rad)`;
});
const still = meta.still || STILL.includes(meta.kind);
if (still) {
  const tint = { flood: "Cyan: ground that turned radar-dark between the passes, i.e. new open water (HH backscatter fell).",
    fire: "Red: ground whose vegetation backscatter (HV) fell between the passes, i.e. the burn scar." }[meta.kind]
    ?? "Magenta: ground that stopped matching itself between the radar passes (coherence drop), where the surface was buried or torn up.";
  $("#legend").innerHTML = `Terrain: Copernicus DEM, ground image Sentinel-2${bs ? " (radar brightness where clouds hid every scene)" : ""}. ${tint} `
    + "The slider fades the change in. Drag to orbit, ctrl/⌘ + scroll (or pinch) to zoom.";
}
if (meta.note) {                                          // honest caveats from the pipeline (what NISAR does/doesn't show)
  const n = document.createElement("p");
  n.className = "small muted"; n.id = "note"; n.textContent = meta.note;
  $("#legend").after(n);
}
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
  } else if (bs) tOut.textContent = x === 0 ? `before (${d0})` : x === 1 ? `after (${d1})` : "";
  else tOut.textContent = x === 0 ? `before (${d0})` : x === 1 ? `after (${d1})` : `${Math.round(x * 100)}% of the measured motion`;
};
// Play runs before -> after in 4 s. Autoplay loops it: hold on "after", rewind, hold on "before", play again.
let playing = false, last = 0, hold = 0, rewinding = false;
const setPlaying = (x) => { playing = x; hold = 0; rewinding = false; play.textContent = x ? "Pause" : "Play"; };
t.addEventListener("input", () => { setPlaying(false); showT(); });
play.addEventListener("click", () => { const x = !playing; if (x && t.value >= 1000) t.value = 0; setPlaying(x); });
v.onFrame(() => {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!playing) return;
  if (hold > 0) { hold -= dt; return; }
  if (rewinding) {
    t.value = Math.max(0, +t.value - dt * 1000);
    if (+t.value <= 0) { rewinding = false; hold = 1; }
  } else {
    t.value = Math.min(1000, +t.value + dt * 250);
    if (+t.value >= 1000) { if (settings.autoplay) { rewinding = true; hold = 3; } else setPlaying(false); }
  }
  showT();
});
if (settings.autoplay) { t.value = 0; setPlaying(true); }
showT();

const ex = $("#exag"), exOut = $("#exag-out");
const setEx = () => { const x = v.losExag0 * 10 ** (ex.value / 100); v.setLosExag(x); exOut.textContent = `×${Math.round(x).toLocaleString()}`; };
ex.addEventListener("input", setEx);
if ((meta.still || STILL.includes(meta.kind))) { ex.value = -100; exOut.textContent = "off (motion is not the signal here)"; ex.addEventListener("input", setEx, { once: true }); v.setLosExag(0); } else setEx();
$("#fringes").addEventListener("change", (e) => v.setFringe(e.target.checked));
$("#ground").addEventListener("change", (e) => v.setGround(e.target.checked));

const opt = (id, key, apply) => {
  const box = $(id);
  box.checked = settings[key];
  box.addEventListener("change", () => { settings[key] = box.checked; saveSettings(); apply(box.checked); });
};
// Autoplay (remembered): runs the before -> after loop and the skycam together; off stops both.
// Skycam alone is a switch for this page view only.
const skyBox = $("#opt-skycam");
skyBox.checked = settings.autoplay;
skyBox.addEventListener("change", () => sky.set(skyBox.checked, true));
opt("#opt-autoplay", "autoplay", (on) => {
  if (on) { if (t.value >= 1000) t.value = 0; setPlaying(true); } else { setPlaying(false); t.value = 1000; showT(); }
  skyBox.checked = on; sky.set(on, true);
});
opt("#opt-places", "places", (on) => { placeLayer.hidden = !on; });
const placeLayer = document.createElement("div");
placeLayer.className = "places";
placeLayer.hidden = !settings.places;
hero.appendChild(placeLayer);
const pinUVs = []; // story and media pins: place names keep clear of them

const s = meta.stats;
$("#numbers").innerHTML = `<table>
${s.motion_range_cm != null ? `<tr><th>Ground motion across the scene (2nd-98th percentile, line of sight)</th><td>${s.motion_range_cm} cm</td></tr>` : ""}
${s.change_km2 != null ? `<tr><th>${meta.kind === "flood" ? "Ground that turned radar-dark (new open water)" : "Ground that lost vegetation backscatter (burn scar)"}</th><td>${s.change_km2} km² (${s.change_pct}% of the scene)</td></tr>
<tr><th>Typical backscatter change there (${meta.kind === "flood" ? "HH" : "HV"})</th><td>${s.median_db_change} dB</td></tr>` : ""}
${s.brightened_km2 != null ? `<tr><th>Ground that brightened (water under crops or trees: double bounce)</th><td>${s.brightened_km2} km²</td></tr>` : ""}
${s.baseline_range_cm != null ? `<tr><th>Same, in the quiet baseline pair before the event</th><td>${s.baseline_range_cm} cm</td></tr>` : ""}
${s.max_sinking_cm_yr != null ? `<tr><th>Fastest sinking (line of sight)</th><td>${s.max_sinking_cm_yr} cm/year</td></tr><tr><th>Scatter of the passes around the fitted steady rate</th><td>${s.fit_rms_cm} cm</td></tr>` : ""}
${s.coherence_drop_pct != null ? `<tr><th>Area where the surface stopped matching itself across the event (coherence drop > 0.3)</th><td>${s.coherence_drop_pct}%</td></tr>` : ""}
<tr><th>${bs ? "Area seen by both passes" : "Area where motion was measured (coherent)"}</th><td>${s.measured_pct}%</td></tr></table>`;

renderHow($("#how-steps"), base, meta, v).catch((e) => console.error("how it works:", e));

$("#sources").innerHTML = [
  `NISAR: NASA/JPL-Caltech and ISRO, provisional L2 ${bs ? "GCOV" : "GUNW"} via the Alaska Satellite Facility DAAC. Track ${meta.nisar.stack[0]}, frame ${meta.nisar.stack[1]}, ${meta.nisar.stack[2] === "A" ? "ascending" : "descending"}.`,
  ...(meta.nisar.granules ?? [meta.nisar.granule]).map((g) => `<code>${esc(g)}</code>`), meta.nisar.pre_granule ? `<code>${esc(meta.nisar.pre_granule)}</code>` : "",
  "Terrain: Copernicus GLO-30 DEM © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA, via AWS Open Data.",
  "Optical: contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search.",
  "3D: three.js.",
].filter(Boolean).map((x) => `<li>${x}</li>`).join("");

// News and agency images are never hosted: a gently pixelated preview links to the original.
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "the source"; } };
const pixelated = (src, page, credit, alt) => `<a href="${esc(page)}" target="_blank" rel="noopener"><img class="pix" src="${esc(base + src)}" alt="${esc(alt)}" loading="lazy"></a>
  <p class="small muted">Pixelated preview — <a href="${esc(page)}" target="_blank" rel="noopener">view original at ${esc(credit || host(page))}</a></p>`;

// A story with no photo of its own gets an establishing shot: a recent open-licence Commons photo of the
// place, labelled as context so it never passes for the event.
const establishing = (e) => `<figure class="est"><a href="${esc(e.page_url)}" target="_blank" rel="noopener"><img src="${esc(e.thumb_url)}" alt="${esc(e.place)}" loading="lazy" referrerpolicy="no-referrer"></a>
  <figcaption class="small muted">Establishing shot: ${esc(e.place)}${e.date ? ` (${esc(e.date.slice(0, 4))})` : ""}, not of the event · ${esc(e.credit || "Wikimedia Commons")} · ${esc(e.licence)} · <a href="${esc(e.page_url)}" target="_blank" rel="noopener">Commons</a></figcaption></figure>`;

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
  const what = meta.kind === "flood" ? "HH" : "HV";
  const nisarLine = (n) => bs ? (n.db_change == null ? "NISAR: not seen by both passes here."
    : `NISAR: ${what} backscatter ${n.db_change > 0 ? "+" : ""}${n.db_change} dB between the passes; ${n.change > 0.5 ? (meta.kind === "flood" ? "mapped as new open water" : "mapped as burnt") : "not mapped as changed"}.`)
    : n.rate_fastest_cm_yr != null ? `NISAR: ${n.rate_cm_yr != null ? `${n.rate_cm_yr > 0 ? "+" : ""}${n.rate_cm_yr} cm/yr along the line of sight here` : "no motion measured at the spot"}; fastest within 500 m ${n.rate_fastest_cm_yr} cm/yr; coherence ${n.coherence}.`
    : !n.measured ? `NISAR: no motion measured here (coherence ${n.coherence}: the surface changed or the signal was lost).`
    : `NISAR: ${n.motion_cm > 0 ? "+" : ""}${n.motion_cm} cm along the line of sight${n.local_step_cm != null ? `; ${n.local_step_cm} cm of change within 500 m` : ""}; coherence ${n.coherence}.`;
  $("#cards").innerHTML = items.map((it, k) => `
<article class="card ${it.side === "affected" ? "hit" : "spared"}" data-k="${k}" tabindex="0" id="story-${k + 1}">
  <h3><span class="num">${k + 1}</span>${esc(it.title)}</h3>
  <p class="small muted">${esc(it.place)} · ${esc(it.date)}</p>
  ${it.show_image ? `<a href="${esc(it.page_url)}" target="_blank" rel="noopener"><img src="${esc(it.image_url)}" alt="${esc(it.what_it_shows)}" loading="lazy" referrerpolicy="no-referrer"></a>`
    : it.preview_url ? pixelated(it.preview_url, it.page_url, it.credit, it.what_it_shows) : it.establishing ? establishing(it.establishing) : ""}
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
    pinUVs.push([it.nisar.u, it.nisar.v]);
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

// ---------- harvested media the editor selected (step 5b/6), lettered pins ----------
const media = (stories?.media ?? []).filter((m) => m.status === "selected");
if (media.length) {
  $("#media-sec").hidden = false;
  const letter = (k) => String.fromCharCode(65 + (k % 26)) + (k >= 26 ? Math.floor(k / 26) : "");
  const side = (m) => m.side === "affected" ? "hit" : m.side === "unaffected" ? "spared" : "neutral";
  const mLine = (n) => n.rate_fastest_cm_yr != null ? `NISAR: ${n.rate_cm_yr != null ? `${n.rate_cm_yr > 0 ? "+" : ""}${n.rate_cm_yr} cm/yr here` : "no motion measured at the spot"}; fastest within 500 m ${n.rate_fastest_cm_yr} cm/yr.`
    : n.db_change != null ? `NISAR: backscatter ${n.db_change > 0 ? "+" : ""}${n.db_change} dB between the passes.`
    : !n.measured ? `NISAR: no motion measured here (coherence ${n.coherence}).`
    : `NISAR: ${n.motion_cm > 0 ? "+" : ""}${n.motion_cm} cm along the line of sight${n.local_step_cm != null ? `; ${n.local_step_cm} cm of change within 500 m` : ""}; coherence ${n.coherence}.`;
  $("#media-cards").innerHTML = media.map((m, k) => {
    const img = m.preview === "pixelated" && m.preview_url ? pixelated(m.preview_url, m.page_url, m.credit, m.title)
      : m.showable && m.thumb_url ? `<a href="${esc(m.page_url)}" target="_blank" rel="noopener"><img src="${esc(m.thumb_url)}" alt="${esc(m.title)}" loading="lazy" referrerpolicy="no-referrer" data-fallback="1"></a>` : "";
    const where = m.unlocated ? (m.located ? `location: ${m.located}` : "location not mapped") : m.approx ? "approximate location" : "";
    return `<article class="card ${side(m)}" data-m="${k}" tabindex="0" id="media-${k + 1}">
  <h3><span class="num">${letter(k)}</span>${esc(m.title)}</h3>
  <p class="small muted">${esc(m.date ?? "date unknown")}${m.when === "before" ? " · before the event" : m.when === "after" ? " · after the event" : ""}${where ? ` · <strong>${esc(where)}</strong>` : ""}${m.pair ? " · one of a before/after pair" : ""}</p>
  ${img}
  <p>${esc(m.editor_caption || m.caption)}</p>
  ${m.nisar && !m.unlocated ? `<p class="nisar small">${mLine(m.nisar)}${m.approx ? " (at the approximate location)" : ""}</p>` : ""}
  <p class="small muted"><a href="${esc(m.page_url)}" target="_blank" rel="noopener">Source</a> · ${esc(m.credit)}${m.licence ? ` · ${esc(m.licence)}` : ""}</p>
</article>`;
  }).join("");
  $("#media-cards").querySelectorAll("img[data-fallback]").forEach((img) => img.addEventListener("error", () => {
    img.parentElement.outerHTML = `<p class="small muted">Preview unavailable: <a href="${esc(img.parentElement.href)}" target="_blank" rel="noopener">view at the source</a></p>`;
  }, { once: true }));
  const mpins = media.map((m, k) => {
    if (m.unlocated || m.nisar?.u == null) return null;
    const p = document.createElement("button");
    p.className = `pin media ${side(m)}`;
    p.type = "button";
    p.title = m.title + (m.approx ? " (approximate location)" : "");
    p.innerHTML = `<span>${letter(k)}</span>`;
    p.onclick = () => { const c = $(`#media-${k + 1}`); c.scrollIntoView({ behavior: "smooth", block: "center" }); c.classList.add("hot"); setTimeout(() => c.classList.remove("hot"), 1800); };
    $("#hero").appendChild(p);
    pinUVs.push([m.nisar.u, m.nisar.v]);
    return { p, uv: [m.nisar.u, m.nisar.v] };
  });
  document.querySelectorAll("#media-cards .card").forEach((c) => {
    const pin = mpins[c.dataset.m];
    if (!pin) return;
    c.addEventListener("mouseenter", () => pin.p.classList.add("hot"));
    c.addEventListener("mouseleave", () => pin.p.classList.remove("hot"));
  });
  v.onFrame(() => {
    for (const x of mpins) {
      if (!x) continue;
      const s = v.project(x.uv);
      x.p.hidden = !s;
      if (s) x.p.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
    }
  });
}

// ---------- place names: at most three towns, kept clear of each other and of the pins ----------
// places.json is made once offline from OpenStreetMap (scripts/places.py), largest first.
const placesDoc = await fetch(base + "places.json").then((r) => (r.ok ? r.json() : null), () => null);
const chosen = [];
for (const p of placesDoc?.places ?? []) {
  if (chosen.length >= 3) break;
  const far = ([qu, qv], d) => Math.hypot(p.u - qu, (p.v - qv) * v.aspect) >= d;
  if (chosen.every((c) => far([c.u, c.v], 0.2)) && pinUVs.every((q) => far(q, 0.05))) chosen.push(p);
}
if (chosen.length) {
  $("#sources").insertAdjacentHTML("beforeend", "<li>Place names: © OpenStreetMap contributors (ODbL 1.0), via the Overpass API.</li>");
  const labels = chosen.map((p) => {
    const el = document.createElement("div");
    el.className = "place";
    el.textContent = p.name;
    placeLayer.appendChild(el);
    return { el, uv: [p.u, p.v], w: 0 };
  });
  // Each frame: hide a label (fade) when it would overlap a pin, the north arrow or a bigger town's label.
  v.onFrame(() => {
    if (placeLayer.hidden) return;
    const W = hero.clientWidth, H = hero.clientHeight, boxes = [[W - 56, H - 56, W, H]];
    for (const uv of pinUVs) { const s = v.project(uv); if (s) boxes.push([s.x - 15, s.y - 15, s.x + 15, s.y + 15]); }
    for (const l of labels) {
      const s = v.project(l.uv, 0.004);
      l.w ||= l.el.offsetWidth;
      const box = s && [s.x - 4, s.y - 9, s.x + l.w + 2, s.y + 9];
      const show = box && box[0] > 0 && box[1] > 0 && box[2] < W && box[3] < H
        && boxes.every((b) => box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]);
      l.el.classList.toggle("off", !show);
      if (s) l.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
      if (show) boxes.push(box);
    }
  });
}

window.eventPage = { meta, viewer: v, settings };
