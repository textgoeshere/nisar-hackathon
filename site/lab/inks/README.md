# Three inks (lab variant)

A three-ink poster for each event: warm paper, black, one red, plus the data ink. The radar measurement is printed as dots on a hexagonal grid, sized by the amount of change; bare paper is "no reading". The line is red (solid = measured by radar, dashed = not). One very large number. A drag across the map from A to B plots the radar signal along the stroke as a section.

Open `index.html?e=kumamoto-quake`, `?e=mexico-city-subsidence` or `?e=etna-eruption`. Static files, plain ES modules, no build step, no network request except to this site's own files.

## Files

| File | What it does |
|---|---|
| `index.html`, `inks.css` | Page shell and styles (Jost, self-hosted in `fonts/` with `OFL.txt`). |
| `js/data.js` | Loads the lab data and the packed layers, builds the mip pyramid the dots are sampled from, computes the dot scale from the data. |
| `js/map.js` | Canvas (paper, sea, relief tint, dots, roads, rail, coast), SVG layer (line, names, pins, cut, leader), pan / pinch / cut pointer handling. |
| `js/cut.js` | Samples the signal along a stroke, finds where it crosses the line, writes the one-sentence summary, draws the section. |
| `js/page.js` | Headline, key band, slider, story cards, caveat, credits, start-up options. |
| `data/<slug>/` | Derived by `pipeline/lab/inks/pack.py` from `site/lab/data/<slug>/` and the event layers (see below). |
| `shots/` | Phone (390 x 844) and laptop (1280 x 900) screenshots, cut examples. |

## Derived data (`pipeline/lab/inks/pack.py`)

The shared lab data (`signal` layers read in place, `basemap.json` 1 MB, `hillshade.png` 1 MB) is too heavy for a phone, so the script writes, per event:

- `grid.bin.gz`: the signal as int16 counts (no reading = -32768, valid mask folded in), plus the line raster for Etna. Not smoothed or resampled.
- `base.json`: the OpenStreetMap layers this poster draws (motorway, trunk, primary; for Etna also secondary and tertiary; rail, rivers, canals, coast, places), coordinates to 4 decimals (about 4 m at Kumamoto).
- `relief.png`: the hillshade at grid size.
- `info.json`: grid size and the NISAR pass dates.

Rebuild: `~/dev/nisar-hackathon/.venv/bin/python pipeline/lab/inks/pack.py`.

## Checking a cut against the raw files

Open a page with `?debug=1&cut=<story number or id>` (or `&cut=uv:u0,v0,u1,v1`). The page writes every sample it plotted into `<pre id="debug">`. `pipeline/lab/inks/check_cut.py dump.json` re-reads the event's own files (`los.i16` + `valid.u8`, `signal.i16`, `coh.u8`), samples them along the same stroke with separate code, and compares sample by sample, gap by gap, then recomputes the medians and steps the sentence states.

## URL options

`e` event, `cut=<n | id | uv:...>` draw a cut on load, `whole=1` whole scene, `t=0..1` slider position, `mode=cut`, `still=1` no animation, `photos=1` load remote story photos as the main page does, `debug=1`.

## Decisions made without asking

- **What the dots show.** Kumamoto: `signal` (motion), yellow toward the satellite, blue away. Mexico City: sinking only, in blue, nothing printed within the noise of zero (0.8 cm a year). Etna: the line raster (coherence lost), yellow, nothing printed under 3 times the scatter between neighbouring cells (0.15). Scale: radius = 0.52 x pitch x sqrt of (value - floor) / (robust max - floor), so ink area follows the amount; the robust maximum is the 99th percentile (99.5th at Etna) of the cells that are drawn; `floor` is the manifest's `signal.noise`. A fully heavy dot just touches its neighbours.
- **Dot grid.** Anchored in map space (it moves with the map, no shimmer), pitch about 6.6 px on a phone and 7.6 px on a laptop, stepping by a factor of the square root of 2 as you zoom so the pitch stays in range. Sampled from a mip pyramid (blocks of 1, 2, 4, 8, 16 cells) with bilinear weights; a dot is dropped where less than 40% of its neighbourhood has a reading.
- **Relief.** A faint pencil tint (shadow side only) from the hillshade, so hills read on a map that has few roads. It is a fourth, very light use of the black ink, not a data layer. The darkest 5% of shadows set the full tint so Etna is no heavier than Kumamoto.
- **Remote photos are not loaded.** The main page hot-links story photos; the brief forbids runtime requests outside this site, so a card with `show_image` carries a link "See the photo at the source" instead. Pixelated local previews (`preview_url`, as for Mexico City story 1) are shown inline. `?photos=1` turns the hot-linking on, exactly as `site/js/event.js` does.
- **Mode control.** Move / Cut sits inside the map at the bottom (thumb height); Cut mode puts a red frame round the map and shows a hint until the first cut. On touch screens a dotted strip on the map's right edge lets one finger scroll the page; all of the page outside the map scrolls as usual.
- **Mouse wheel** over the map scrolls the page; Ctrl or Cmd + wheel (or a trackpad pinch), the + and - buttons, and double-click zoom the map.
- **The slider is sticky** at the bottom of the screen while the poster is in view, so it can be used without losing the dots.
- **The sentence under the cut** compares the median of the samples 150 m to 1 km either side of the crossing nearest the middle of the stroke (at least 4 samples each side, else it says one side has no reading). Mexico City adds the steepest 500 m of the stroke. At Etna, a stroke that goes in and out of one outline gives inside and both outsides; a stroke that meets the outline 3 or more times gives only the range.
- The headline caption at Etna has its trailing ", per the main page" removed; everything else is as in `lab.json`.

## Left out

- No terrain labels, contour lines or Sentinel-2 imagery. Sentinel-2 is not shown, so it is not credited (the Copernicus DEM credit is kept because the data were processed with it).
- No hover tooltips on pins; the card is one tap away.
- Labels use a greedy placement; at the whole-scene view of Kumamoto and Mexico City some story labels are dropped for lack of room (the pins remain).
- The cut stroke can be drawn and its ends dragged, but not undone except by drawing another.
- No keyboard way to draw a cut (the preset "Cut here" buttons are keyboard-operable).

## Known problems

- The Mexico City headline ("21 cm a year, the fastest") is the 1st percentile of the whole scene's rate (-21.2); the key's top dot is the 99th percentile of the sinking cells (24 cm a year), so the two numbers differ by a few cm. Both come from the data; they answer slightly different questions.
- Mexico City's headline place is outside the opening view (it is in the city centre); the page points to it and a tap shows the whole scene.
- The Etna outline sits 1.4 km from the lava-front story; the page says so and draws no front.
- Sticky slider: on phones shorter than 760 px it is not sticky, so it never covers the Move / Cut control.
