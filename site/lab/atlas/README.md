# Atlas (lab variant)

A paper street atlas for the three lab events, with the line in red and a drag-to-cut section plot.
Static page, plain ES modules, 2D canvas plus SVG, no dependency, no network request except this site's own files
(plus the story photos, which load from the hosts the main event page already uses, lazily, only where it shows them).

    lab/atlas/?e=kumamoto-quake            (default)
    lab/atlas/?e=mexico-city-subsidence
    lab/atlas/?e=etna-eruption

Extra parameters, for checking and sharing:

| Parameter | Effect |
|---|---|
| `cut=<n>` / `cut=<site id>` | Draws that story's (or field-survey site's) preset cut on load. `cut=1`, `cut=site-gsj-08`. |
| `cut=u1,v1,u2,v2` | Draws a cut between two positions in grid fractions. |
| `view=scene` | Opens on the whole scene instead of the focus window. |
| `mode=cut` | Opens with the cut tool on. |

## Files

- `index.html`, `atlas.css`: page and style (Public Sans, warm paper, one red).
- `map.js`: canvas map. Relief (`hillshade.png`, recoloured into soft shadow and highlight on paper), sea mask (smoothed at 2x), rivers, canals,
  coast, six road classes, rail, place names (local script, English small beneath, collision-checked), the line (white casing, solid or dashed,
  words written along it where there is room), scale bar, north arrow, OSM attribution. Pan, pinch, cut stroke, wheel zoom with Ctrl or Cmd.
- `cut.js`: loads the signal layer, samples along the stroke every 25 m (bilinear over measured cells only; no reading = gap), finds where the stroke
  crosses the line, writes the one-sentence result, draws the section plot (SVG).
- `app.js`: manifest to page: title and sentence from `line.kind`, pins, labels with leader lines, story cards, survey list, caveat, credits, preset cuts.
- `fonts/`: Public Sans variable (SIL OFL) with `OFL.txt`.
- `shots/`: screenshots (phone 390x844, laptop 1280x900; with a cut drawn; whole scene).
- `../../../pipeline/lab/atlas/`: `shoot.mjs` (headless Chrome driver over CDP: screenshots, drags, pinch), `shots.sh` (regenerates `shots/`),
  `verify_cut.py` (independent check of a cut's numbers against the data files).

## How the page decides things

- **Opening view.** The focus window, trimmed to what is on the line (on-line stories and survey sites, the measured line within 2.5 km of them, and
  stories within 2 km of that), never tighter than about 3 km. "Whole scene" zooms out to the full grid. Stories outside the view are named under the map.
- **Pins.** Black disc = story on the line (placed beside the line with a dot on the true spot, so it does not hide the line; the 480 m solid stretch in
  Mexico City would otherwise be under the disc). Black square = off the line. Survey sites: a tick across the line (direction taken from the line
  at that point) with the short value in small type, shown when zoomed in enough to read.
- **Labels.** White box with a leader line, placed greedily around each pin; avoids other labels, pins, place names, the scale bar, map buttons, the
  line, and a drawn cut. A label that cannot be placed is dropped for survey sites, forced for stories.
- **Words on the line.** "radar sees the step" on a solid stretch and "surveyed; radar has no reading" on a dashed one (text keyed on `line.kind`);
  only where a stretch is long enough and clear of pins.
- **The sentence.** Keyed on `line.kind`. Rupture and front: the middle reading in 150 m to 1.2 km either side of the crossing, difference between them.
  Bend: the steepest 500 m of the stroke (near the line if it crosses one), and how many metres it takes to change the rate by 1 cm a year.
  No crossing, or no reading on one side: it says so instead of giving a number.
- **Preset cuts** only where `on_line` or `distance_m` < 2,500, and for survey sites. Stories beyond that get "draw your own".
- **Mode control.** Under the map: **Move the map** / **Cut across it**. Cut mode shows a red frame and a banner. In both modes a drag that starts on
  the map is captured by the map; the page scrolls from the title block, the mode bar and everything below the map. The map is 60% of the phone screen
  height so there is always page above and below to grab. On a laptop, plain wheel scrolls the page; Ctrl/Cmd + wheel or pinch zooms the map.
- Tap a pin or label: scrolls to its card. Tap "Cut here": draws the preset on the map (zooming to it if needed) and scrolls the section to the top.
  "See it on the map" in the section scrolls back. Drag a finger or mouse over the plot to read values; a dot follows on the map stroke.

## Checks done (see the report for numbers)

- Cuts compared with an independent numpy read of the same files (`pipeline/lab/atlas/verify_cut.py`): crossings agree to the metre, gaps agree,
  plotted values within 0.15 cm (median) of the nearest-cell value for Kumamoto.
- Headless Chrome, phone and laptop, three events, touch drag, pinch, mouse drag, tap on pin, tap on "cut here": no console errors.

## Left out or weak

- No screen-reader description of the map beyond pin labels. Pins and survey ticks are focusable and open their cards with Enter.
- Place names: Etna has none inside its focus window (there are no villages in the Valle del Bove), so the map there is relief, the outline and pins only.
- Etna relief is dark and flat because the valley is steep and there is no land use or contour data to add texture. Honest, but the least pretty page.
- The measure for "how big is the step" (middle reading either side) understates a step that dies out close to the line: at the school playground (story 1)
  the page says 0.9 cm while the radar note on the card says 13 cm within 500 m. Both are true; they ask different questions.
- Story photos come from the hosts named in `stories.json` (as on the main page); they are the only requests that leave this site, and they are lazy.
- Nothing tested on a real iPhone. Canvas size is capped at 2.5x pixel ratio; `ctx.letterSpacing` (English place names) is ignored by older Safari.
- Pinch zoom is tested with synthetic touch events, not fingers.
