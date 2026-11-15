# Lab: style and interaction variants (overnight, 15 Nov 2026)

**Goal:** by morning, two differently styled versions of three event pages are live on the public
site under `/lab/`, so David can compare them on a phone and a laptop and choose what to promote
into the main site before the Sunday submission.

**Why:** the main site looks like every other entry this weekend (dark page, 3D, rainbow) and never
draws the line its title promises. The lab tries a paper-map look and one new interaction, the
"cut", without touching the main pages.

## What is being tried

Two variants, each on three events:

| Variant | Folder | Look |
|---|---|---|
| **Atlas** | `site/lab/atlas/` | A paper street atlas: light page, relief shading, streets, place names in local script, the line in red, numbered story pins with short labels written on the map. |
| **Three inks** | `site/lab/inks/` | A three-ink print: paper, black and red plus one pair of data colours. The radar measurement is drawn as dots whose size is the amount of change; blank paper means no reading. One big number in heavy type. |

| Event | Slug | The line | What the cut plots |
|---|---|---|---|
| Kumamoto earthquake | `kumamoto-quake` | The surface rupture: a step in ground motion | Motion toward the satellite, cm: a step |
| Mexico City subsidence | `mexico-city-subsidence` | The edge of the sinking ground, where the sinking rate changes over a short distance | Sinking rate, cm a year: a slope |
| Etna eruption | `etna-eruption` | The edge of the new lava: where the radar stopped matching itself | Coherence, 0 to 1: a drop |

Both variants share two ideas:

1. **The line is drawn.** Solid where NISAR measured it, dashed where it is known only from a field
   survey or is uncertain. Every story says whether it is on the line or off it, and how far.
2. **The cut.** The visitor drags across the map from A to B and the page plots the radar signal
   along that stroke as a section. Gaps in the measurement are gaps in the plot. Each story has a
   preset cut through it.

The hero view of each lab page is a flat map (pan and zoom), not the 3D model. Reason: the main 3D
view adds line-of-sight motion as height, so at Kumamoto it lifts the plain north-west of the fault,
where the GPS station actually sank 32 cm while sliding 87 cm north-east. A flat map and a section
do not make that claim.

## Rules for everyone working in the lab

- **Stay in your folders.** Shared data: `pipeline/lab/` and `site/lab/data/`. Atlas:
  `site/lab/atlas/` (+ `pipeline/lab/atlas/` if it needs build scripts). Inks: `site/lab/inks/`
  (+ `pipeline/lab/inks/`). Do not edit any other file in the repository. If you need something
  from `site/js/` changed, copy the file into your folder and change the copy.
- **Read the main site's data in place.** `site/events/<slug>/` is read-only input. Do not copy
  its big binary layers into the lab.
- **No new runtime dependencies.** No map library, no tile server, no CDN beyond what the main site
  already loads (three.js 0.170.0 from jsDelivr, only if you use 3D). Fonts are self-hosted files
  under an open licence (SIL OFL), stored in your variant folder with their licence text.
  The site must still work, untouched, at the end of January.
- **Every page carries** `<meta name="robots" content="noindex">`, a link back to `/lab/`, the
  word "provisional" next to NISAR data, and a credits line including
  "© OpenStreetMap contributors".
- **Numbers on a page come from the data files**, never typed by hand. Where a number comes from a
  field survey, say so next to it.
- **Honesty conventions are part of the style:** solid = measured by radar, dashed = not measured by
  radar, blank = no reading. Do not smooth over a gap to make a picture prettier.
- **No image of a person under 18**, and no photo that the main event page does not already show
  with a licence. Reuse the story records as they are.
- **Work on your own branch in your own worktree and commit there. Do not push.** Bort reviews,
  merges and pushes.
- **Python:** use `~/dev/nisar-hackathon/.venv/bin/python` (do not install packages; numpy, scipy,
  Pillow, pyproj, rasterio and requests are available). Read-only caches are in
  `~/dev/nisar-hackathon/cache/`. Do not write anything inside `~/dev/nisar-hackathon/`: another
  session is working there.
- **Tests:** `~/dev/nisar-hackathon/.venv/bin/python -m pytest -q` from your worktree must still
  pass (9 tests).

## Phase 0: shared data (one worker, first)

`python -m pipeline.lab.build <slug>` writes `site/lab/data/<slug>/`. It reads
`site/events/<slug>/` and `research/`, and fetches OpenStreetMap through Overpass (cached under the
worktree's own `cache/lab/`, which git ignores).

All positions are **(u, v)**: fractions of the event grid, u east from the left edge, v south from
the top edge, exactly as the main site's `stories.json` uses them (`meta.grid` gives `left`, `top`,
`dx`, `nx`, `ny`, `epsg`).

Files per event:

| File | Content |
|---|---|
| `lab.json` | The manifest described below. |
| `basemap.json` | OpenStreetMap vectors as polylines in (u, v), 5 decimals, simplified: `roads` by class (`motorway`, `trunk`, `primary`, `secondary`, `tertiary`, `minor`), `rail`, `river`, `canal`, `coast`, and `places` (`name` in local script, `name_en`, `kind`, `u`, `v`). `minor` roads only inside the focus window. Target under 1.5 MB. |
| `hillshade.png` | Grey relief shading from `dem.i16`, light from the north-west, at 2 × the grid (as `ground.jpg` is). |
| `sea.png` | 8-bit mask at grid size, 255 = sea or large open water, small ponds removed. |
| `signal.i16` or `signal.u8` | The layer the cut plots and the inks variant draws, at grid size, with `scale`, `unit` and `label` in the manifest. Kumamoto: the unsmoothed `los` layer as it is (reference it in place, do not copy). Mexico City: sinking rate in cm a year, zeroed on stable ground (see below). Etna: coherence across the event (`coh.u8`, in place). |
| `line.u8` | Strength of the line at grid size, 0 to 255, with the meaning of 255 in the manifest. Kumamoto: change in motion within 500 m. Mexico City: tilt (change in sinking rate per metre). Etna: coherence drop. |
| `line.json` | The line as polylines in (u, v), each point flagged `measured` true or false, plus `sites` (field-survey points with their value and location confidence). Required for Kumamoto. For Mexico City and Etna, trace the edge of the thresholded `line.u8` if it gives clean lines; otherwise leave it out and say so in the manifest. |

`lab.json`:

```json
{
  "slug": "…", "name": "…", "kind": "…", "date": "…",
  "grid": { … copied from meta.json … },
  "focus": { "u0": 0, "v0": 0, "u1": 1, "v1": 1, "label": "Hikawa to Yatsushiro, 18 km across" },
  "signal": { "file": "../../../events/<slug>/los.i16", "dtype": "int16", "scale": 0.1, "unit": "cm",
              "label": "Motion toward the satellite", "valid": "../../../events/<slug>/valid.u8",
              "positive": "toward the satellite", "noise": 1.2 },
  "line": { "kind": "rupture | bend | front", "name": "the rupture", "raster": "line.u8",
            "raster_scale": 0.2, "raster_unit": "cm within 500 m", "threshold": 10,
            "vector": "line.json", "measured_means": "…", "dashed_means": "…", "caveat": "…" },
  "headline": { "value": "184 cm", "caption": "sideways, across one road", "source": "field survey, GSJ",
                "u": 0.0, "v": 0.0 },
  "stories": [ { "id": "…", "n": 1, "title": "…", "short": "Road: 184 cm", "u": 0.0, "v": 0.0,
                 "on_line": true, "distance_m": 300, "radar": "…one plain sentence…",
                 "cut": [[u, v], [u, v]] } ],
  "credits": [ "…" ],
  "provisional": true
}
```

`stories` are taken from `site/events/<slug>/stories.json` (the same selection rule the event page
uses), plus field-survey sites where they make the line legible. `on_line` is true within 600 m of
the line. `cut` is a 5 km stroke square to the line through the story (or through the nearest
point of the line for off-line stories). `short` is at most 28 characters.

### How each line is made

Reference scripts that already do most of this for one Kumamoto window and one Mexico City window
(written on Saturday evening; read them, reuse the logic, do not import them):
`~/.openclaw/workspace/docs/nasa-space-apps/checks/mockups/` (`lib.py`, `scene.py`, `pic_a2.py`,
`tiles.py`, `osm2.py`). Numbers to reproduce are in
`~/.openclaw/workspace/docs/nasa-space-apps/2026-11-14-on-the-line-and-style-riff.md`
("Numbers behind Part 1").

- **Kumamoto.** `line.u8` = max minus min of measured motion within a 480 m radius, where at least
  25% of the cells in that radius were measured. `line.json` = a polyline through the located
  field-survey sites in `research/media/seeds/kumamoto-quake.json` (anchors of kind `offset` with
  coordinates), ordered along the fault; a point is `measured` when the raster reaches 10 cm within
  1 km of it. Focus: Hikawa to Yatsushiro (grid rows 500 to 670, columns 190 to 420). Check: the
  raster is about 26 cm at the 184 cm site and 12 cm at the school; a cut square to the line at the
  184 cm site steps by about 29 cm.
- **Mexico City.** Rate = `los` ÷ years between the first and last pass. Zero it on stable ground:
  subtract the median rate over the highest 15% of the terrain, and record the offset in the
  manifest. `line.u8` = gradient magnitude of the rate after a Gaussian smoothing of 1 cell, scaled
  so that the manifest can state it as "1 in N a year". Draw nothing below 1 in 5,600 a year (the
  noise on stable ground). Focus: the Tláhuac story (19.311, −98.9655), a window about 14 km wide.
  Check: 480 m east of that story the rate is about −15 to −16 cm a year relative to the ridge
  just west of it, and the tilt near the story is about 1 in 2,200 a year.
- **Etna.** `line.u8` = `cohdrop.u8` as it is. The signal is modest: the footprint in the Valle del
  Bove is about 5 cells (400 m) wide and there are noisy streaks on the north-east flank. Keep the
  largest connected patches near the stories, and say plainly in `caveat` what was dropped and why.
  Focus: the Valle del Bove around the lava-front story. If no honest line can be drawn, say so in
  the manifest and in your report; the variants will then show Etna as "hard to draw".

Also write `site/lab/data/README.md` (what each file is, how to rebuild) and
`site/lab/CREDITS.md` (OpenStreetMap contributors, ODbL, via the Overpass API; everything else is
credited in the main `CREDITS.md`).

## Phase 1: the two variants (two workers, in parallel, after phase 0 is merged)

Each variant delivers, inside its folder:

- `index.html?e=<slug>` (or one page per event): the hero map for the focus window with a control
  to zoom out to the whole scene; the line; story pins with short labels; the headline number; the
  cut (drag, plus a preset per story); story cards below, each saying "on the line" or "off the
  line, N km"; a short plain-words key; credits.
- Works by touch on a phone 390 px wide and by mouse on a laptop. First view in under 3 seconds on
  a 10 Mbps connection: under 2.5 MB before the map appears.
- No layout that needs WebGL float-texture extensions. A 2D canvas or SVG is enough.
- `README.md` in the folder: what was built, what was left out, known problems.
- Screenshots of each event at 390 × 844 and 1280 × 900 in `site/lab/<variant>/shots/`.

Mock-ups to work from (one Kumamoto scene, drawn five ways; A is Atlas, D is Three inks):
`~/.openclaw/workspace/docs/nasa-space-apps/img/style-mockups-1-maps.jpg` and
`style-mockups-2-notebook-inks-blueprint.jpg`. The Mexico City idea is in
`img/on-the-line-mexico-city.jpg`. They are rough guides to the look, not specifications; improve
on them.

Variant-specific:

- **Atlas.** Type: a plain grotesque for labels (for example Inter or Public Sans), local-script
  place names from the data. Legend replaced by words written on the map wherever possible.
- **Three inks.** Type: a geometric sans (Jost). Dots on a hexagonal grid, radius by the absolute
  signal, two colours for the two signs (one colour where the signal has one sign), nothing drawn
  where there is no reading. The before → after slider grows the dots. The headline number is the
  largest thing on the page.

## Phase 2: review and ship (Bort)

1. Read each worker's report and screenshots; open the pages; check the numbers against the data.
2. Merge each branch into `lab/integration`, rebase on `origin/main`, run the tests, push to `main`.
3. Add `site/lab/index.html`: an unlinked contents page listing variant × event with one line on
   what to look at.
4. Check the live URLs: `https://textgoeshere.github.io/nisar-hackathon/lab/`.
5. Report to David: what is live, what each variant does well and badly, what was left out, and a
   recommendation.

## After David chooses

Promote the chosen pieces into the main pages as a separate, reviewed change. Then delete
`site/lab/` and `pipeline/lab/` or leave them unlinked; either way nothing in the main pages may
depend on them.
