// Event page, full screen: the 3D view fills the window; controls float over it. One template serves
// event.html?e=<slug>, the static per-event pages e/<slug>.html (scripts/pages.py) and index.html.
//   top left   ? (how it works, numbers, sources), people (stories and photos), radar (on the ground)
//   top right  before/after slider, play/pause, settings
//   bottom left  title (opens the event list), Next (fills up in demo mode, then moves on), attribution
// Demo mode (on by default) tours the events one page at a time; any interaction turns it off, Next
// turns it back on. The state rides along in sessionStorage, so each event keeps its own URL.
import * as THREE from "three";
import { createViewer, STILL } from "./viewer.js";
import { renderHow } from "./how.js";
import { createSkycam } from "./skycam.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const params = new URLSearchParams(location.search);
const slug = document.body.dataset.slug || params.get("e") || "kumamoto-quake";
const base = `events/${slug}/`;
const pageUrl = (s) => `e/${encodeURIComponent(s)}.html`;   // relative to the site root (e/ pages set <base href="../">)
const meta = await (await fetch(base + "meta.json")).json();
// Tour order (Next, demo mode, the event list): the hero first, then roughly strongest to weakest, with
// the kinds mixed so two of a kind rarely follow each other. Events not listed here go on the end.
const TOUR = ["kumamoto-quake", "mexico-city-subsidence", "panama-quake", "anak-krakatau", "venezuela-quake", "etna-eruption",
  "little-giant-fire", "bangladesh-flood", "flores-quake", "fuego-eruption", "aspen-acres-fire", "langtang-avalanche"];
const live = await fetch("events/index.json").then((r) => (r.ok ? r.json() : [slug]), () => [slug]);
const slugs = [...TOUR.filter((s) => live.includes(s)), ...live.filter((s) => !TOUR.includes(s))];
// Loading state: a spinner until the first frames are drawn; a plain message if the data never arrives.
const loading = $("#loading");
const loadFailed = () => { if (loading.isConnected && !loading.classList.contains("done")) { loading.classList.add("fail"); loading.querySelector("span").innerHTML = 'The 3D view could not load. <a href="">Try again</a>'; } };
addEventListener("unhandledrejection", loadFailed);
addEventListener("error", loadFailed);
// slip: sideways slip (docs/slip.md). SLIP: null = not offered, else whether it starts on. This is the line to
// change to make it a remembered setting or the default for earthquakes; slip.js is only loaded when offered.
const SLIP = params.has("slip") ? params.get("slip") !== "0" : null;                      // slip:
const slipMod = SLIP == null ? null : await import("./slip.js");                          // slip:
const slipData = slipMod && await slipMod.load(base, meta);                               // slip: null when the event has no slip.json
let slip = null;                                                                          // slip: { on, set(on), exag() } once mounted

// Animation settings, global: one localStorage entry shared by every event page.
const SETTINGS_KEY = "nisar.event.settings";
const settings = { autoplay: true, places: true };   // skycam is per page view: Autoplay starts it
try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {}; for (const k in settings) if (k in s) settings[k] = s[k]; } catch {}
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} };

// Demo mode: ?demo=1 / ?demo=0 force it; otherwise on unless this tab turned it off.
const DEMO_KEY = "nisar.demo", DEMO_S = 45;
const store = { get: () => { try { return sessionStorage.getItem(DEMO_KEY); } catch { return null; } },
  set: (x) => { try { sessionStorage.setItem(DEMO_KEY, x); } catch {} } };
let demo = params.has("demo") ? params.get("demo") !== "0" : store.get() !== "0";

document.title = `${meta.name} · Either side of the line`;
if (!document.querySelector("link[rel=canonical]")) {
  const l = document.createElement("link");
  l.rel = "canonical"; l.href = new URL(pageUrl(slug), document.baseURI).href;
  document.head.appendChild(l);
}
$("#title").textContent = meta.name;
$("#info-h").textContent = meta.name;
$("#date").textContent = meta.date ?? "";
const multi = !!meta.nisar.dates;
const bs = !!meta.nisar.passes_after;
const still = meta.still || STILL.includes(meta.kind);
$("#sub").textContent = bs ? `${meta.date} · ${meta.kind} · NISAR backscatter, ${meta.nisar.passes_before.length} passes before, ${meta.nisar.passes_after.join(", ")} after`
  : multi ? `${meta.kind} · ${meta.nisar.granules.length} NISAR interferograms, ${meta.nisar.pair.join(" → ")}`
  : `${meta.date} · ${meta.kind} · NISAR pass ${meta.nisar.pair.join(" → ")}`;
if (multi || still) $("#fringes").checked = false;
$("#credit").innerHTML = `NISAR ${bs ? "radar backscatter" : "interferometry"}: NASA/JPL-Caltech &amp; ISRO via ASF DAAC · Copernicus DEM · Sentinel-2 imagery (ESA) · `
  + `<a href="credits.html">Credits</a>`;

// Small key: what the artificial colour means for this event.
const RAINBOW = "linear-gradient(90deg,#f33,#fd3,#3f6,#3df,#36f,#f3f,#f33)";
{
  const [bg, text] = still ? ({ flood: ["#00e5ff", "new open water"], fire: ["#ff3d00", "burn scar"] }[meta.kind] ?? ["#ff2bd6", "ground buried or torn up"])
    : meta.kind === "subsidence" ? ["#ff26a6", "sinking ground (line every 5 cm)"] : [RAINBOW, "ground motion: one cycle = 10 cm"];
  $("#key").innerHTML = `<i style="background:${bg}"></i>${text}`;
}

const hero = $("#hero");
// Skycam renders like the demo kiosk does (mesh capped at 640 segments, pixel ratio 1.5) so the flight stays smooth.
const flying = demo || settings.autoplay;
const before = (meta.images ?? []).some((i) => i.file === "optical-before.jpg") ? "optical-before.jpg" : null;
const v = await createViewer(hero, base, meta, { groundBefore: before, ...(flying ? { segments: 640, pixelRatio: 1.5 } : {}),
  ...(slipData ? { slip: slipData.viewer } : {}) });                                     // slip:
v.setT(1); // the skycam judges its shots with the change fully grown in
const sky = createSkycam(v, hero, () => { $("#opt-skycam").checked = false; }); // touching the view stops it
sky.set(flying);
// Full screen, so the wheel zooms the view (overlays and panels scroll on their own). It stops the skycam.
hero.addEventListener("wheel", () => sky.takeOver(), { capture: true, passive: true });

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
if (still) {
  const tint = { flood: "Cyan: ground that turned radar-dark between the passes, i.e. new open water (HH backscatter fell).",
    fire: "Red: ground whose vegetation backscatter (HV) fell between the passes, i.e. the burn scar." }[meta.kind]
    ?? "Magenta: ground that stopped matching itself between the radar passes (coherence drop), where the surface was buried or torn up.";
  $("#legend").innerHTML = `Terrain: Copernicus DEM, ground image Sentinel-2${bs ? " (radar brightness where clouds hid every scene)" : ""}. ${tint} `
    + "The slider fades the change in. Drag to orbit, scroll (or pinch) to zoom.";
}
if (meta.note) {                                          // honest caveats from the pipeline (what NISAR does/doesn't show)
  const n = document.createElement("p");
  n.className = "small muted"; n.id = "note"; n.textContent = meta.note;
  $("#legend").after(n);
}

// ---------- before -> after slider and play ----------
const t = $("#t"), tOut = $("#t-out"), play = $("#play");
const [d0, d1] = meta.nisar.pair;
const showT = () => {
  const x = t.value / 1000;
  v.setT(x);
  if (multi) {
    const a = Date.parse(d0), b = Date.parse(d1);
    tOut.textContent = `${new Date(a + x * (b - a)).toISOString().slice(0, 10)} (steady rate fitted to all passes)`;
  } else if (bs) tOut.textContent = x === 0 ? `before (${d0})` : x === 1 ? `after (${d1})` : `before ${d0} → after ${d1}`;
  else tOut.textContent = x === 0 ? `before (${d0})` : x === 1 ? `after (${d1})` : `${Math.round(x * 100)}% of the measured motion`;
};
// Play runs before -> after in 4 s. Autoplay (and demo mode) loops it: hold on "after", rewind, hold on "before", play again.
let playing = false, last = 0, hold = 0, rewinding = false;
const setPlaying = (x) => {
  playing = x; hold = 0; rewinding = false;
  play.classList.toggle("on", x);
  play.title = x ? "Pause" : "Play";
  play.setAttribute("aria-label", play.title);
};
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
    if (+t.value >= 1000) { if (settings.autoplay || demo) { rewinding = true; hold = 3; } else setPlaying(false); }
  }
  showT();
});
if (flying) { t.value = 0; setPlaying(true); } else setPlaying(false);
showT();

// ---------- settings panel ----------
const ex = $("#exag"), exOut = $("#exag-out");
const setEx = () => { if (slip?.on) return slip.exag(); const x = v.losExag0 * 10 ** (ex.value / 100); v.setLosExag(x); exOut.textContent = `×${Math.round(x).toLocaleString()}`; }; // slip: guard
ex.addEventListener("input", setEx);
if (still) { ex.value = -100; exOut.textContent = "off (motion is not the signal here)"; ex.addEventListener("input", setEx, { once: true }); v.setLosExag(0); } else setEx();
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
skyBox.checked = flying;
skyBox.addEventListener("change", () => sky.set(skyBox.checked, true));
opt("#opt-autoplay", "autoplay", (on) => {
  if (on) { if (t.value >= 1000) t.value = 0; setPlaying(true); } else { setPlaying(false); t.value = 1000; showT(); }
  skyBox.checked = on; sky.set(on, true);
});
const placeLayer = document.createElement("div");
placeLayer.className = "places";
placeLayer.hidden = !settings.places;
hero.appendChild(placeLayer);
opt("#opt-places", "places", (on) => { placeLayer.hidden = !on; });
if (slipData) slip = slipMod.mount({ v, meta, data: slipData, on: SLIP, sky, setEx,          // slip:
  t: params.has("t") ? +params.get("t") : null });                                      // slip:

// Small panels (settings, event list): one open at a time, closed by a tap elsewhere or Esc.
const panels = { cog: [$("#cog"), $("#b-cog")], list: [$("#list"), $("#name")] };
const setPanel = (name, open) => {
  const [p, b] = panels[name];
  p.hidden = !open;
  b.setAttribute("aria-expanded", open);
  document.body.classList.toggle(`${name}-open`, open);
  if (open) for (const k in panels) if (k !== name) setPanel(k, false);
  if (open && name === "list") fillList();
};
$("#b-cog").addEventListener("click", () => setPanel("cog", $("#cog").hidden));
$("#name").addEventListener("click", () => setPanel("list", $("#list").hidden));
addEventListener("pointerdown", (e) => {
  for (const k in panels) { const [p, b] = panels[k]; if (!p.hidden && !p.contains(e.target) && !b.contains(e.target)) setPanel(k, false); }
});

// ---------- the event list (title) and Next ----------
const nextSlug = slugs[(slugs.indexOf(slug) + 1) % slugs.length] ?? slug;
let listed = false;
async function fillList() {
  if (listed) return;
  listed = true;
  const ul = $("#list-ul");
  const metas = await Promise.all(slugs.map((s) => (s === slug ? meta : fetch(`events/${s}/meta.json`).then((r) => r.json()).catch(() => null))));
  ul.innerHTML = slugs.map((s, i) => `<li><a href="${pageUrl(s)}"${s === slug ? ' aria-current="page"' : ""}>${esc(metas[i]?.name ?? s)}
    <small>${esc([metas[i]?.kind, metas[i]?.date].filter(Boolean).join(" · "))}</small></a></li>`).join("");
  // Choosing from the list is a visit, not the tour: demo mode stays off there.
  ul.addEventListener("click", (e) => { if (e.target.closest("a")) store.set("0"); });
}
function go(url) {
  document.body.classList.add("leaving");
  setTimeout(() => { location.href = url; }, 700);
}
const nextBtn = $("#next");
nextBtn.addEventListener("click", () => { store.set("1"); go(pageUrl(nextSlug)); });

// ---------- demo mode ----------
// The Next button fills over DEMO_S seconds of tour time (paused while the "?" overlay is open or the tab
// is hidden, since frames stop), then moves on. Any pointer, wheel or key (except F for fullscreen and
// Next itself) turns it off for this tab.
let demoClock = 0, demoLast = 0, paused = false, warmed = false;
const stopDemo = () => {
  if (!demo) return;
  demo = false;
  store.set("0");
  nextBtn.style.setProperty("--p", 0);
  document.body.classList.remove("idle", "demo");
};
addEventListener("pointerdown", (e) => { if (!e.target.closest?.("#next")) stopDemo(); }, { capture: true });
addEventListener("wheel", stopDemo, { capture: true, passive: true });
addEventListener("keydown", (e) => {
  if (e.key === "f" || e.key === "F") {
    if (e.target.closest?.("input, textarea")) return;
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    return;
  }
  if (e.key === "Escape") { if (!$("#info").hidden) closeInfo(); for (const k in panels) setPanel(k, false); }
  if (!(e.target.closest?.("#next") && (e.key === "Enter" || e.key === " "))) stopDemo();
}, { capture: true });
v.onFrame(() => {
  const now = performance.now(), dt = demoLast ? Math.min(0.1, (now - demoLast) / 1000) : 0;
  demoLast = now;
  if (!demo || paused) return;
  demoClock += dt;
  nextBtn.style.setProperty("--p", Math.min(1, demoClock / DEMO_S));
  // Warm the HTTP cache with the next event's data while this one plays.
  if (!warmed && demoClock > DEMO_S * 0.5) {
    warmed = true;
    fetch(`events/${nextSlug}/meta.json`).then((r) => r.json()).then((m) => {
      for (const f of [...Object.values(m.layers ?? {}), m.ground].filter(Boolean)) fetch(`events/${nextSlug}/${f}`).catch(() => {});
    }).catch(() => {});
  }
  if (demoClock >= DEMO_S) { demo = false; store.set("1"); go(pageUrl(nextSlug)); }
});
if (demo) {
  document.body.classList.add("demo");
  let idleTimer;
  const wake = () => {
    document.body.classList.remove("idle");
    clearTimeout(idleTimer);
    if (demo) idleTimer = setTimeout(() => demo && document.body.classList.add("idle"), 2500);
  };
  addEventListener("pointermove", wake);
  wake();
}

// ---------- "?" overlay: how it works, the numbers, sources ----------
// Opening it pauses the before/after loop, the skycam and the demo fill; closing resumes what was running.
let resume = null, howDone = false;
function openInfo() {
  if (!$("#info").hidden) return;
  resume = { playing, sky: sky.on };
  setPlaying(false); sky.set(false); paused = true;
  $("#info").hidden = false;
  document.body.classList.add("info-open");
  $("#b-how").setAttribute("aria-expanded", "true");
  $("#info-x").focus({ preventScroll: true });
  if (!howDone) { howDone = true; renderHow($("#how-steps"), base, meta, v).catch((e) => console.error("how it works:", e)); }
}
function closeInfo() {
  if ($("#info").hidden) return;
  $("#info").hidden = true;
  document.body.classList.remove("info-open");
  $("#b-how").setAttribute("aria-expanded", "false");
  paused = false;
  if (resume?.playing) setPlaying(true);
  if (resume?.sky) sky.set(true, true);
  resume = null;
  $("#b-how").focus({ preventScroll: true });
}
$("#b-how").addEventListener("click", openInfo);
$("#info-x").addEventListener("click", closeInfo);

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

$("#sources").innerHTML = [
  `NISAR: NASA/JPL-Caltech and ISRO, provisional L2 ${bs ? "GCOV" : "GUNW"} via the Alaska Satellite Facility DAAC. Track ${meta.nisar.stack[0]}, frame ${meta.nisar.stack[1]}, ${meta.nisar.stack[2] === "A" ? "ascending" : "descending"}.`,
  ...(meta.nisar.granules ?? [meta.nisar.granule]).map((g) => `<code>${esc(g)}</code>`), meta.nisar.pre_granule ? `<code>${esc(meta.nisar.pre_granule)}</code>` : "",
  "Terrain: Copernicus GLO-30 DEM © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA, via AWS Open Data.",
  "Optical: contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search.",
  "3D: three.js.",
].filter(Boolean).map((x) => `<li>${x}</li>`).join("");

// ---------- anchored cards: a layer is a set of cards, each tied to a ground point by a pin and a line ----------
// Wide screens: two columns at the left and right edges (west half of the anchors left, east half right,
// north to south), a line from each card to its point on the ground, re-projected every frame.
// Narrow screens: one swipeable row at the bottom; tapping a card flies the view to its point.
const NS = "http://www.w3.org/2000/svg";
const lines = document.createElementNS(NS, "svg");
lines.classList.add("lines");
const patchG = document.createElementNS(NS, "g"), lineG = document.createElementNS(NS, "g");
lines.append(patchG, lineG);
hero.appendChild(lines);
const colL = $("#cards-l"), colR = $("#cards-r");
const narrow = matchMedia("(max-width: 760px), (max-height: 520px)");
const layers = {};
let active = null;

function addPin(cls, label, title) {
  const p = document.createElement("button");
  p.className = `pin ${cls}`;
  p.type = "button";
  p.title = title;
  p.setAttribute("aria-label", title);
  p.innerHTML = label ? `<span>${esc(label)}</span>` : "";
  p.hidden = true;
  hero.appendChild(p);
  return p;
}
// it: { el (card), uv ([u, v] or null), pin, patch ([[u, v], ...] or null) }
function makeLayer(name, items) {
  for (const it of items) {
    const hot = (on) => { it.el.classList.toggle("hot", on); it.pin?.classList.toggle("hot", on); it.line?.classList.toggle("hot", on); it.path?.classList.toggle("hot", on); };
    it.hot = hot;
    it.el.addEventListener("mouseenter", () => hot(true));
    it.el.addEventListener("mouseleave", () => hot(false));
    it.el.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      it.el.classList.toggle("open");
      if (it.uv) fly(it.uv);
      hot(true); setTimeout(() => hot(false), 1600);
    });
    if (it.pin) {
      it.pin.addEventListener("mouseenter", () => hot(true));
      it.pin.addEventListener("mouseleave", () => hot(false));
      it.pin.addEventListener("click", () => {
        it.el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        hot(true); setTimeout(() => hot(false), 1800);
      });
    }
    if (it.uv) { it.line = document.createElementNS(NS, "line"); it.line.setAttribute("visibility", "hidden"); }
    if (it.patch) { it.path = document.createElementNS(NS, "path"); it.path.setAttribute("class", `patch ${it.side ?? ""}`); }
  }
  layers[name] = { name, items };
}
function layout() {
  colL.replaceChildren(); colR.replaceChildren(); lineG.replaceChildren(); patchG.replaceChildren();
  if (!active) { colL.hidden = colR.hidden = true; return; }
  const located = active.items.filter((i) => i.uv).sort((a, b) => a.uv[0] - b.uv[0]), loose = active.items.filter((i) => !i.uv);
  const byV = (a, b) => a.uv[1] - b.uv[1];
  if (narrow.matches) colL.append(...[...located, ...loose].map((i) => i.el));
  else {
    const half = Math.ceil(located.length / 2), L = located.slice(0, half).sort(byV), R = located.slice(half).sort(byV);
    colL.append(...L.map((i) => i.el));
    colR.append(...R.map((i) => i.el));
    for (const i of loose) (colR.children.length < colL.children.length ? colR : colL).append(i.el);
  }
  for (const i of active.items) { if (i.line) lineG.append(i.line); if (i.path) patchG.append(i.path); }
  colL.hidden = !colL.children.length;
  colR.hidden = !colR.children.length;
  colL.scrollTo?.(0, 0); colR.scrollTo?.(0, 0);
}
narrow.addEventListener?.("change", layout);
function showLayer(name) {
  const next = active?.name === name ? null : layers[name];
  for (const it of active?.items ?? []) if (it.pin) it.pin.hidden = true;
  active = next;
  $("#b-people").setAttribute("aria-pressed", active?.name === "people");
  $("#b-radar").setAttribute("aria-pressed", active?.name === "radar");
  layout();
}
$("#b-people").addEventListener("click", () => showLayer("people"));
$("#b-radar").addEventListener("click", () => showLayer("radar"));

// Ground point -> screen, kept even when off the edge (for patch outlines); null behind the camera.
const pv = new THREE.Vector3();
function toScreen(pu, pw, lift) {
  pv.set(pu - 0.5, v.heightAt(pu, pw) + lift, (pw - 0.5) * v.aspect).applyMatrix4(v.camera.matrixWorldInverse);
  if (pv.z > -v.camera.near) return null;
  pv.applyMatrix4(v.camera.projectionMatrix);
  return [((pv.x + 1) / 2) * hero.clientWidth, ((1 - pv.y) / 2) * hero.clientHeight];
}
// Patch outlines are densified (~1% of the scene per step) so they drape over the terrain.
function densify(poly) {
  const out = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.01));
    for (let i = 0; i < n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  }
  return out;
}
v.onFrame(() => {
  if (!active) return;
  const wide = !narrow.matches;
  for (const it of active.items) {
    if (it.path) {
      let d = "", ok = true;
      for (const [pu, pw] of it.dense) { const q = toScreen(pu, pw, 0.003); if (!q) { ok = false; break; } d += `${d ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`; }
      it.path.setAttribute("d", ok && d ? d + "Z" : "");
    }
    if (!it.uv) continue;
    const s = v.project(it.uv);
    if (it.pin) { it.pin.hidden = !s; if (s) it.pin.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`; }
    const r = it.el.getBoundingClientRect(), c = it.el.parentElement?.getBoundingClientRect();
    if (!s || !wide || !c || r.bottom < c.top + 12 || r.top > c.bottom - 12) { it.line.setAttribute("visibility", "hidden"); continue; }
    const left = it.el.parentElement === colL, y = Math.min(c.bottom - 6, Math.max(c.top + 6, r.top + 20));
    it.line.setAttribute("x1", left ? r.right : r.left); it.line.setAttribute("y1", y);
    it.line.setAttribute("x2", s.x); it.line.setAttribute("y2", s.y);
    it.line.setAttribute("visibility", "visible");
  }
});

// Fly: glide the look-at point to a card's place on the ground (and come in a little if far out).
let flight = null;
const smooth = (x) => x * x * (3 - 2 * x);
function fly([pu, pw]) {
  sky.takeOver();
  flight = { from: v.controls.target.clone(), to: new THREE.Vector3(pu - 0.5, v.heightAt(pu, pw), (pw - 0.5) * v.aspect),
    r0: v.camera.position.distanceTo(v.controls.target), t0: performance.now() };
}
v.onFrame(() => {
  if (!flight) return;
  const k = smooth(Math.min(1, (performance.now() - flight.t0) / 900));
  const off = v.camera.position.clone().sub(v.controls.target);
  const r = flight.r0 + (Math.min(flight.r0, 0.6 * Math.max(1, v.aspect)) - flight.r0) * k;
  v.controls.target.copy(flight.from).lerp(flight.to, k);
  v.camera.position.copy(v.controls.target).add(off.setLength(r));
  if (k >= 1) flight = null;
});
hero.addEventListener("pointerdown", () => { flight = null; });

// News and agency images are never hosted: a gently pixelated preview links to the original.
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "the source"; } };
const pixelated = (src, page, credit, alt) => `<a href="${esc(page)}" target="_blank" rel="noopener"><img class="pix" src="${esc(base + src)}" alt="${esc(alt)}" loading="lazy"></a>
  <p class="small muted">Pixelated preview — <a href="${esc(page)}" target="_blank" rel="noopener">view original at ${esc(credit || host(page))}</a></p>`;
// A story with no photo of its own gets an establishing shot: a recent open-licence Commons photo of the
// place, labelled as context so it never passes for the event.
const establishing = (e) => `<figure class="est"><a href="${esc(e.page_url)}" target="_blank" rel="noopener"><img src="${esc(e.thumb_url)}" alt="${esc(e.place)}" loading="lazy" referrerpolicy="no-referrer"></a>
  <figcaption class="small muted">Establishing shot: ${esc(e.place)}${e.date ? ` (${esc(e.date.slice(0, 4))})` : ""}, not of the event · ${esc(e.credit || "Wikimedia Commons")} · ${esc(e.licence)} · <a href="${esc(e.page_url)}" target="_blank" rel="noopener">Commons</a></figcaption></figure>`;
const card = (cls, html, id) => {
  const el = document.createElement("article");
  el.className = `card ${cls}`;
  el.tabIndex = 0;
  if (id) el.id = id;
  el.innerHTML = html;
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === el) el.click(); });
  return el;
};
const note = (text) => { const el = document.createElement("p"); el.className = "note"; el.textContent = text; return el; };
const pinUVs = []; // story and media pins: place names keep clear of them

// ---------- people: editor-selected stories (numbered) and media (lettered) ----------
const stories = await fetch(base + "stories.json").then((r) => (r.ok ? r.json() : null), () => null);
const people = [];
if (stories) {
  let items = stories.items.filter((i) => i.status === "selected" && i.nisar?.inside !== false), unreviewed = false;
  if (!items.length) { items = stories.items.filter((i) => i.status !== "rejected" && i.nisar?.inside !== false); unreviewed = true; }
  items.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  const what = meta.kind === "flood" ? "HH" : "HV";
  const nisarLine = (n) => bs ? (n.db_change == null ? "NISAR: not seen by both passes here."
    : `NISAR: ${what} backscatter ${n.db_change > 0 ? "+" : ""}${n.db_change} dB between the passes; ${n.change > 0.5 ? (meta.kind === "flood" ? "mapped as new open water" : "mapped as burnt") : "not mapped as changed"}.`)
    : n.rate_fastest_cm_yr != null ? `NISAR: ${n.rate_cm_yr != null ? `${n.rate_cm_yr > 0 ? "+" : ""}${n.rate_cm_yr} cm/yr along the line of sight here` : "no motion measured at the spot"}; fastest within 500 m ${n.rate_fastest_cm_yr} cm/yr; coherence ${n.coherence}.`
    : !n.measured ? `NISAR: no motion measured here (coherence ${n.coherence}: the surface changed or the signal was lost).`
    : `NISAR: ${n.motion_cm > 0 ? "+" : ""}${n.motion_cm} cm along the line of sight${n.local_step_cm != null ? `; ${n.local_step_cm} cm of change within 500 m` : ""}; coherence ${n.coherence}.`;
  items.forEach((it, k) => {
    const cls = it.side === "affected" ? "hit" : "spared";
    const el = card(cls, `<h3><span class="num">${k + 1}</span>${esc(it.title)}</h3>
  <p class="small muted">${esc(it.place)} · ${esc(it.date)}${unreviewed ? " · not yet reviewed" : ""}</p>
  ${it.show_image ? `<a href="${esc(it.page_url)}" target="_blank" rel="noopener"><img src="${esc(it.image_url)}" alt="${esc(it.what_it_shows)}" loading="lazy" referrerpolicy="no-referrer"></a>`
    : it.preview_url ? pixelated(it.preview_url, it.page_url, it.credit, it.what_it_shows) : it.establishing ? establishing(it.establishing) : ""}
  <p class="cap">${esc(it.caption || it.what_it_shows)}</p>
  <p class="nisar small more">${nisarLine(it.nisar)}</p>
  <p class="small muted"><a href="${esc(it.page_url)}" target="_blank" rel="noopener">Source</a> · ${esc(it.credit)}${it.show_image ? ` · ${esc(it.licence)}` : ""}</p>`, `story-${k + 1}`);
    const uv = it.nisar?.u != null ? [it.nisar.u, it.nisar.v] : null;
    if (uv) pinUVs.push(uv);
    people.push({ el, uv, pin: uv && addPin(cls, k + 1, it.title) });
  });
}
// Harvested media the editor selected (step 5b/6).
const media = (stories?.media ?? []).filter((m) => m.status === "selected");
{
  const letter = (k) => String.fromCharCode(65 + (k % 26)) + (k >= 26 ? Math.floor(k / 26) : "");
  const side = (m) => m.side === "affected" ? "hit" : m.side === "unaffected" ? "spared" : "neutral";
  const mLine = (n) => n.rate_fastest_cm_yr != null ? `NISAR: ${n.rate_cm_yr != null ? `${n.rate_cm_yr > 0 ? "+" : ""}${n.rate_cm_yr} cm/yr here` : "no motion measured at the spot"}; fastest within 500 m ${n.rate_fastest_cm_yr} cm/yr.`
    : n.db_change != null ? `NISAR: backscatter ${n.db_change > 0 ? "+" : ""}${n.db_change} dB between the passes.`
    : !n.measured ? `NISAR: no motion measured here (coherence ${n.coherence}).`
    : `NISAR: ${n.motion_cm > 0 ? "+" : ""}${n.motion_cm} cm along the line of sight${n.local_step_cm != null ? `; ${n.local_step_cm} cm of change within 500 m` : ""}; coherence ${n.coherence}.`;
  media.forEach((m, k) => {
    const img = m.preview === "pixelated" && m.preview_url ? pixelated(m.preview_url, m.page_url, m.credit, m.title)
      : m.showable && m.thumb_url ? `<a href="${esc(m.page_url)}" target="_blank" rel="noopener"><img src="${esc(m.thumb_url)}" alt="${esc(m.title)}" loading="lazy" referrerpolicy="no-referrer" data-fallback="1"></a>` : "";
    const where = m.unlocated ? (m.located ? `location: ${m.located}` : "location not mapped") : m.approx ? "approximate location" : "";
    const el = card(`${side(m)} media`, `<h3><span class="num">${letter(k)}</span>${esc(m.title)}</h3>
  <p class="small muted">${esc(m.date ?? "date unknown")}${m.when === "before" ? " · before the event" : m.when === "after" ? " · after the event" : ""}${where ? ` · <strong>${esc(where)}</strong>` : ""}${m.pair ? " · one of a before/after pair" : ""}</p>
  ${img}
  <p class="cap">${esc(m.editor_caption || m.caption)}</p>
  ${m.nisar && !m.unlocated ? `<p class="nisar small more">${mLine(m.nisar)}${m.approx ? " (at the approximate location)" : ""}</p>` : ""}
  <p class="small muted"><a href="${esc(m.page_url)}" target="_blank" rel="noopener">Source</a> · ${esc(m.credit)}${m.licence ? ` · ${esc(m.licence)}` : ""}</p>`, `media-${k + 1}`);
    el.querySelectorAll("img[data-fallback]").forEach((im) => im.addEventListener("error", () => {
      im.parentElement.outerHTML = `<p class="small muted">Preview unavailable: <a href="${esc(im.parentElement.href)}" target="_blank" rel="noopener">view at the source</a></p>`;
    }, { once: true }));
    const uv = !m.unlocated && m.nisar?.u != null ? [m.nisar.u, m.nisar.v] : null;
    if (uv) pinUVs.push(uv);
    people.push({ el, uv, pin: uv && addPin(`media ${side(m)}`, letter(k), m.title + (m.approx ? " (approximate location)" : "")) });
  });
}
if (people.length) { makeLayer("people", people); $("#b-people").hidden = false; }

// ---------- radar: "on the ground" facts from ground.json, each a highlighted patch plus a card ----------
const groundDoc = await fetch(params.get("ground") || base + "ground.json").then((r) => (r.ok ? r.json() : null), () => null);
const facts = [];
const fmtVal = (x) => typeof x === "number" ? x.toLocaleString(undefined, { maximumFractionDigits: 2 }) : esc(Array.isArray(x) ? x.join(" – ") : x);
const LABELS = { measured_pct: "measured (%)", coherence_mean: "coherence", coherence_drop_pct: "coherence lost (%)", coherence_drop_km2: "coherence lost (km²)",
  los_mean_cm: "mean motion (cm)", los_p5_cm: "motion, low end (cm)", los_p95_cm: "motion, high end (cm)", step_cm: "step across it (cm)" };
// A source string may hold URLs: show each as a short link so it can't overflow the card.
const linkify = (s) => esc(s).replace(/https?:\/\/[^\s|,;)]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}</a>`);
const srcHtml = (src) => !src ? "" : typeof src === "string" ? linkify(src)
  : src.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.label ?? src.name ?? "Source")}</a>` : esc(src.label ?? src.name ?? "");
for (const f of groundDoc?.facts ?? []) {
  const cls = f.side === "affected" ? "hit" : f.side === "unaffected" || f.side === "spared" ? "spared" : "neutral";
  const vals = Object.entries(f.values ?? {}).filter(([k, x]) => k !== "pixels" && (x != null && typeof x !== "object" || Array.isArray(x)));
  const el = card(`fact ${cls}`, `<h3>${esc(f.title)}</h3>
  ${f.kind ? `<p class="small muted">${esc(f.kind)}</p>` : ""}
  <p>${esc(f.text)}</p>
  ${vals.length ? `<table class="more">${vals.map(([k, x]) => `<tr><th>${esc(LABELS[k] ?? k.replace(/_/g, " "))}</th><td>${fmtVal(x)}</td></tr>`).join("")}</table>` : ""}
  ${f.source ? `<p class="small muted">${srcHtml(f.source)}</p>` : ""}`, f.id ? `fact-${f.id}` : null);
  const uv = Array.isArray(f.anchor) && f.anchor.length === 2 ? f.anchor : null;
  const poly = Array.isArray(f.uv_polygon) && f.uv_polygon.length > 2 ? f.uv_polygon : null;
  facts.push({ el, uv, side: cls, pin: uv && addPin(`fact ${cls}`, "", f.title), patch: poly, dense: poly && densify(poly) });
}
if (!facts.length) facts.push({ el: note(stories?.boundary || meta.note || "No ground notes for this event yet."), uv: null });
makeLayer("radar", facts);

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
  // Each frame: hide a label (fade) when it would overlap a shown pin, the north arrow or a bigger town's label.
  v.onFrame(() => {
    if (placeLayer.hidden) return;
    const W = hero.clientWidth, H = hero.clientHeight, boxes = [[W - 56, H - 56, W, H]];
    for (const it of active?.items ?? []) if (it.uv) { const s = v.project(it.uv); if (s) boxes.push([s.x - 15, s.y - 15, s.x + 15, s.y + 15]); }
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

// ?open=how|people|radar|cog|list opens that part on load (for screenshots and links); it doesn't stop demo mode.
const open = params.get("open");
if (open === "how") openInfo();
else if (open === "people" || open === "radar") showLayer(open);
else if (open === "cog" || open === "list") setPanel(open, true);

// Fade in once the first frames (texture upload, shader compile) are done.
requestAnimationFrame(() => requestAnimationFrame(() => { hero.classList.add("on"); loading.classList.add("done"); setTimeout(() => loading.remove(), 800); }));

window.eventPage = { meta, viewer: v, settings, get demo() { return demo; } };
