import { loadEvent, loadStories } from "./data.js";
import { createMap, INK } from "./map.js";
import { sampleCut, summarise, sentence, drawSection } from "./cut.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const P = new URLSearchParams(location.search);
const SLUGS = ["kumamoto-quake", "mexico-city-subsidence", "etna-eruption"];
const slug = SLUGS.includes(P.get("e")) ? P.get("e") : SLUGS[0];
window.__still = P.has("still");
for (const a of document.querySelectorAll("#tabs a")) if (a.dataset.e === slug) a.setAttribute("aria-current", "page");

const ev = await loadEvent(slug);
const { lab } = ev;
const stories = lab.stories;
const detailsP = loadStories(slug);
let T = P.has("t") ? Math.max(0, Math.min(1, +P.get("t"))) : 1;

// ---------- title, headline, key ----------
const dshort = (iso, year = false) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" }).toUpperCase();
const pair = ev.info.pair, multi = lab.line.kind === "bend";
document.title = `${lab.name} · Three inks · Either side of the line`;
$("#title").textContent = lab.name;
$("#sub").textContent = `${lab.date ? dshort(lab.date, true) + " · " : ""}NISAR provisional data`;
const hv = lab.headline.value, hm = /^([−\-+]?\d[\d.,]*)\s*(.*)$/.exec(hv);
$("#num").textContent = hm ? hm[1] : hv;
const unit = $("#unit"); unit.textContent = hm ? hm[2] : ""; unit.classList.toggle("pct", /^%/.test(hm?.[2] || ""));
$("#cap").textContent = lab.headline.caption.replace(/,? per the main page\.?$/i, "");
$("#src").textContent = `Source: ${lab.headline.source}`;

const D = ev.dots, sg = lab.signal, ln = lab.line;
const nf = (v) => (v >= 10 ? Math.round(v) : v >= 1 ? +v.toFixed(1) : +v.toFixed(2));
const ramp = [0.25, 0.5, 1].map((f) => ({ f, v: D.floor + f * (D.max - D.floor) }));
const short = D.mode === "pos" ? "" : sg.unit === "cm" ? "cm" : "cm/yr";
const dotPx = (f) => 2 * 4.8 * Math.sqrt(f);
const rampHtml = `<span class="k ramp" title="Dot size is the amount"><span><i class="dot" style="width:${dotPx(0.25)}px;height:${dotPx(0.25)}px;background:var(--paper)"></i>${nf(ramp[0].v)}</span><span><i class="dot" style="width:${dotPx(0.5)}px;height:${dotPx(0.5)}px;background:var(--paper)"></i>${nf(ramp[1].v)}</span><span><i class="dot" style="width:${dotPx(1)}px;height:${dotPx(1)}px;background:var(--paper)"></i>${nf(ramp[2].v)}${short ? " " + short.toUpperCase() : ""}${D.mode === "pos" ? " LOST" : "+"}</span></span>`;
const ink = (c, t) => `<span class="k"><i class="dot" style="width:14px;height:14px;background:${c}"></i>${t}</span>`;
let keyHtml;
if (D.mode === "two") keyHtml = ink(INK.yellow, `Toward the satellite`) + ink("#6f8fe8", `Away`) + rampHtml + `<span class="k"><i class="nodata"></i>Blank = no reading</span>`;
else if (D.mode === "neg") keyHtml = ink("#6f8fe8", `Ground sinking, cm a year`) + rampHtml + `<span class="k"><i class="nodata"></i>Blank = no reading, or within ${D.floor} cm a year of still</span>`;
else keyHtml = ink(INK.yellow, `Dots: coherence lost, the radar stopped matching itself`) + rampHtml + `<span class="k"><i class="nodata"></i>Blank = under ${D.floor.toFixed(2)} lost</span>`;
keyHtml += `<span class="k"><i class="ln"></i>${esc(ln.name)}: solid = measured by radar</span><span class="k"><i class="ln dash"></i>Dashed = not measured by radar</span><span class="k"><i class="pinkey">1</i>Story <i class="pinkey" style="border-radius:2px;transform:rotate(45deg) scale(.6)"></i> Survey site</span>`;
keyHtml += `<span class="grow">${esc(D.label)} · NISAR data are provisional · Dot size = amount, even ink = same amount${D.mode === "two" ? " · Yellow positive, blue negative" : ""}</span>`;
$("#key").innerHTML = keyHtml;
for (const i of document.querySelectorAll("#key .k .dot")) if (i.style.background.includes("111, 143, 232") || i.style.background === "rgb(111, 143, 232)") i.style.background = INK.blue, i.style.boxShadow = "0 0 0 2px var(--paper)";

// slider text
const my = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase();
$("#s-before").textContent = multi ? my(pair[0]) : `Before · ${dshort(pair[0])}`;
$("#s-after").textContent = multi ? my(pair[1]) : `After · ${dshort(pair[1])}`;
$("#slider-note").textContent = multi
  ? "Mexico City sinks all year. NISAR measured the total between two passes; the dots grow as if the ground sank at that fitted steady rate: a model of the build-up, not a film."
  : "NISAR saw the ground before and after. The dots grow from nothing to their measured size: this shows how much changed, not how fast.";
function readout() {
  const el = $("#s-read");
  if (multi) { const ms = Date.parse(pair[0]) + T * (Date.parse(pair[1]) - Date.parse(pair[0])); el.textContent = new Date(ms).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase(); }
  else el.textContent = T <= 0.001 ? "NOTHING YET" : T >= 0.999 ? "ALL OF IT" : `${Math.round(T * 100)}% OF THE CHANGE`;
  $("#t").style.setProperty("--p", `${T * 100}%`);
}

// ---------- the map ----------
const hint = $("#hint");
// On a phone the map takes what is left of the first screen under the number, so the Move/Cut control is never hidden by the slider.
function sizeMap() {
  const box = $("#mapbox"), top = box.getBoundingClientRect().top + scrollY;
  const sticky = getComputedStyle($("#slider")).position === "sticky", h = Math.min(640, Math.max(innerWidth < 700 ? 300 : 380, innerHeight - top - (sticky ? 86 : 16)));
  box.style.height = Math.round(h) + "px";
}
sizeMap(); addEventListener("resize", sizeMap);
const map = createMap({
  box: $("#mapbox"), canvas: $("#cv"), svg: $("#ov"), leader: $("#leader"), anchor: $("#num"), ev, getT: () => T,
  onCut: (c, live) => { if (c) { showCut(c.a, c.b, { scroll: !live }); } else hideCut(); },
  onPin: (id) => goCard(id),
  onHeadlineAway: () => setWhole(true),
});
function setMode(m) {
  map.setMode(m);
  $("#btn-move").setAttribute("aria-pressed", m === "move"); $("#btn-cut").setAttribute("aria-pressed", m === "cut");
  hint.hidden = !(m === "cut" && !map.getCut());
  hint.textContent = m === "cut" ? "Cut mode: drag from A to B across the red line" : "";
}
function setWhole(w) { map.fit(w ? "whole" : "focus"); $("#btn-whole").setAttribute("aria-pressed", w); $("#btn-whole").textContent = w ? "Back to focus" : "Whole scene"; }
$("#btn-move").onclick = () => setMode("move");
$("#btn-cut").onclick = () => setMode("cut");
$("#btn-whole").onclick = () => setWhole($("#btn-whole").getAttribute("aria-pressed") !== "true");
$("#btn-zin").onclick = () => map.zoomBy(1.6);
$("#btn-zout").onclick = () => map.zoomBy(1 / 1.6);
const slider = $("#t");
slider.value = Math.round(T * 1000);
slider.oninput = () => { T = slider.value / 1000; readout(); map.setT(); };
readout();
let playing = 0;
$("#play").onclick = () => {
  if (playing) { cancelAnimationFrame(playing); playing = 0; $("#play").classList.remove("on"); $("#play").innerHTML = "&#9654;"; return; }
  $("#play").classList.add("on"); $("#play").innerHTML = "&#10073;&#10073;";
  const t0 = performance.now(), from = T >= 0.999 ? 0 : T, dur = 3200 * (1 - from) + 400;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur); T = from + (1 - from) * (1 - Math.pow(1 - k, 2)); slider.value = Math.round(T * 1000); readout(); map.setT();
    if (k < 1) playing = requestAnimationFrame(step); else { playing = 0; $("#play").classList.remove("on"); $("#play").innerHTML = "&#9654;"; }
  };
  playing = requestAnimationFrame(step);
};

// ---------- the cut ----------
let lastCut = null, sectionShown = false;
function showCut(a, b, { scroll = false, quiet = false } = {}) {
  const c = sampleCut(ev, a, b), s = summarise(ev, c);
  lastCut = { cut: c, sum: s };
  $("#cutbody").hidden = false;
  $("#cuthelp").textContent = "Drag on the plot to read a value. Drag the A or B end on the map to move the cut, or draw a new one.";
  $("#cutsentence").textContent = sentence(ev, c, s);
  drawSection($("#section"), ev, c, { onScrub: (p) => map.setScrub(p) });
  hint.hidden = true;
  if (P.has("debug")) dump(c, s);
  if (scroll && !quiet) {
    const r = $("#cutpanel").getBoundingClientRect();
    if (r.top > innerHeight * 0.6 || r.top < -40) $("#cutpanel").scrollIntoView({ behavior: window.__still ? "auto" : "smooth", block: "start" });
  }
}
function hideCut() { lastCut = null; $("#cutbody").hidden = true; $("#cuthelp").textContent = helpText; }
const helpText = "On the map, switch from Move to Cut, then drag from A to B across the red line. The page plots what the radar saw along your stroke. Or press a story's Cut here.";
$("#cuthelp").textContent = helpText;
window.addEventListener("resize", () => { if (lastCut) drawSection($("#section"), ev, lastCut.cut, { onScrub: (p) => map.setScrub(p) }); });

function dump(c, s) {
  let pre = $("#debug"); if (!pre) { pre = document.createElement("pre"); pre.id = "debug"; pre.hidden = true; document.body.append(pre); }
  const r = (x) => (Number.isNaN(x) ? null : +x.toFixed(3));
  pre.textContent = JSON.stringify({ slug, a: c.a, b: c.b, len: c.len, n: c.n, d: [...c.d].map((x) => +x.toFixed(1)), v: [...c.v].map(r), cross: c.cross, sum: s, sentence: $("#cutsentence").textContent, dots: { mode: D.mode, floor: D.floor, max: D.max }, payload: payload() });
}
function payload() {
  const rs = performance.getEntriesByType("resource");
  return { files: rs.map((x) => [x.name.replace(location.origin, ""), x.encodedBodySize, x.decodedBodySize]), encoded: rs.reduce((a, x) => a + x.encodedBodySize, 0), decoded: rs.reduce((a, x) => a + x.decodedBodySize, 0) };
}

// preset cuts: only where the stroke crosses the line near the story
const cutOk = (s) => s.on_line || s.distance_m < 2500 || s.kind === "site";
function presetCut(s, scroll = true) {
  const a = [s.cut[0][0] * ev.nx, s.cut[0][1] * ev.ny], b = [s.cut[1][0] * ev.nx, s.cut[1][1] * ev.ny];
  map.setCut(a, b); showCut(a, b, { scroll }); map.select(s.id);
}
function goCard(id) {
  const c = document.getElementById("story-" + id); if (!c) return;
  map.select(id);
  c.scrollIntoView({ behavior: window.__still ? "auto" : "smooth", block: "start" });
  c.classList.add("flash"); setTimeout(() => c.classList.remove("flash"), 2200);
}

// ---------- cards ----------
const details = Object.fromEntries((await detailsP).map((i) => [i.id, i]));
const fmtD = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.max(10, Math.round(m / 10) * 10) + " m").toUpperCase();
const eventBase = `../../events/${slug}/`;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "the source"; } };
function card(s) {
  const d = details[s.id], site = s.kind === "site";
  const badge = s.on_line ? `<span class="badge-on">On the line${s.distance_m >= 10 ? " · " + fmtD(s.distance_m) : ""}</span>` : `<span class="badge-off">Off the line · ${fmtD(s.distance_m)}</span>`;
  let photo = "", credit = "";
  if (d) {
    if (d.show_image && d.image_url) photo = P.has("photos")
      ? `<a href="${esc(d.page_url)}" target="_blank" rel="noopener"><img src="${esc(d.image_url)}" alt="${esc(d.what_it_shows)}" loading="lazy" referrerpolicy="no-referrer"></a>`
      : `<p class="credit"><a href="${esc(d.page_url)}" target="_blank" rel="noopener">See the photo at the source ↗</a></p>`;
    else if (d.preview_url) photo = `<a href="${esc(d.page_url)}" target="_blank" rel="noopener"><img class="pix" src="${esc(eventBase + d.preview_url)}" alt="${esc(d.what_it_shows)}" loading="lazy"></a><p class="credit">Pixelated preview — <a href="${esc(d.page_url)}" target="_blank" rel="noopener">view original at ${esc(d.credit || host(d.page_url))}</a></p>`;
    credit = `<p class="credit"><a href="${esc(d.page_url)}" target="_blank" rel="noopener">Source</a> · ${esc(d.credit)}${d.show_image ? " · " + esc(d.licence) : ""}</p>`;
  } else if (site) credit = `<p class="credit">Source: ${esc(s.source)} · location ${esc(s.location_confidence)} confidence (placed from the place name)</p>`;
  const where = d ? `${d.place} · ${d.date || ""}` : "";
  return `<article class="card" id="story-${esc(s.id)}" data-id="${esc(s.id)}">
  <div class="n ${site ? "site" : ""}">${site ? "◆" : s.n}</div>
  <div class="main">${badge}<h3>${esc(site ? s.short : d?.title || s.title)}</h3>
    <p class="where">${esc(site ? s.title : where)}</p>
    ${site ? `<p class="val">${esc(s.value)} · field survey</p>` : `<p class="tx">${esc(d?.caption || d?.what_it_shows || s.title)}</p>`}
    <p class="radar">${esc(s.radar)} <span style="font-weight:500">(NISAR, provisional)</span></p>
    ${credit}
    ${cutOk(s) ? `<button type="button" class="cutbtn" data-cut="${esc(s.id)}">Cut here ✂</button>` : `<p class="credit">No preset cut: the nearest part of the line is ${fmtD(s.distance_m)} away.</p>`}
  </div>
  <div class="side">${photo}</div>
</article>`;
}
const numbered = stories.filter((s) => s.n != null).sort((a, b) => a.n - b.n), sites = stories.filter((s) => s.n == null);
$("#cards").innerHTML = `<h2>On the ground</h2>${numbered.map(card).join("")}${sites.length ? `<p class="sub2">Field-survey sites · ${esc(sites[0].source || "")}</p>${sites.map(card).join("")}` : ""}`;
$("#cards").addEventListener("click", (e) => { const b = e.target.closest("[data-cut]"); if (b) presetCut(stories.find((s) => s.id === b.dataset.cut)); });
$("#presets").innerHTML = stories.filter(cutOk).map((s) => `<button type="button" class="alt" data-cut="${esc(s.id)}">${s.n ?? "◆"} ${esc(s.short)}</button>`).join("") + `<button type="button" id="toMap">↑ Back to the map</button>`;
$("#presets").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cut]"); if (b) presetCut(stories.find((s) => s.id === b.dataset.cut), false);
  if (e.target.closest("#toMap")) $("#poster").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ---------- caveat, credits ----------
$("#caveat-text").textContent = ln.caveat;
$("#line-means").innerHTML = `<strong>Solid red:</strong> ${esc(ln.measured_means)}. <strong>Dashed red:</strong> ${esc(ln.dashed_means)}.`;
const st = ev.info.stack;
$("#credits").innerHTML = `<p><strong>Credits</strong></p>
<p>NISAR: NASA/JPL-Caltech and ISRO, provisional L2 GUNW via the Alaska Satellite Facility DAAC. Track ${st[0]}, frame ${st[1]}, ${st[2] === "A" ? "ascending" : "descending"}. Provisional data, not an official product.</p>
<p>Map data © OpenStreetMap contributors (ODbL), via the Overpass API.</p>
<p>Terrain (used to process the data): Copernicus GLO-30 DEM © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA, via AWS Open Data. Sentinel-2 imagery is not shown on this page.</p>
${lab.credits.filter((c) => !/^(Radar|Map data|Relief)/.test(c)).map((c) => `<p>${esc(c)}</p>`).join("")}
<p>Photos are linked, not loaded: this page makes no requests outside its own files.</p>
<p>Typeface: Jost, SIL Open Font License. Full credits for data, media, software and AI use: <a href="https://github.com/textgoeshere/nisar-hackathon/blob/main/CREDITS.md">CREDITS.md</a>. <a href="../">Back to the lab</a>.</p>`;

// ---------- start-up options (for testing and for links) ----------
if (P.get("whole") === "1") setWhole(true);
if (P.get("mode") === "cut") setMode("cut");
const cp = P.get("cut");
if (cp) {
  if (cp.startsWith("uv:")) { const [u0, v0, u1, v1] = cp.slice(3).split(",").map(Number); const a = [u0 * ev.nx, v0 * ev.ny], b = [u1 * ev.nx, v1 * ev.ny]; map.setCut(a, b, { fit: true }); showCut(a, b); }
  else { const s = stories.find((x) => String(x.n) === cp || x.id === cp); if (s) { presetCut(s, false); } }
}
document.body.dataset.ready = "1";
if (P.has("debug")) { const pre = document.createElement("pre"); pre.id = "debugpay"; pre.hidden = true; document.body.append(pre); setTimeout(() => (pre.textContent = JSON.stringify(payload())), 300); }
