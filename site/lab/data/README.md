# Lab data layer (`site/lab/data/<slug>/`)

Shared input for the lab pages. Built by `pipeline/lab/` from `site/events/<slug>/`, `research/` and OpenStreetMap. Do not edit by hand.
Events: `kumamoto-quake`, `mexico-city-subsidence`, `etna-eruption`.

## Coordinates

Every position is **(u, v)**: fractions of the event grid, u east from the grid's west edge, v south from its north edge (as in the
main site's `stories.json`). `lab.json` → `grid` has `left`, `top`, `dx`, `nx`, `ny`, `epsg`. Cell (row i, column j) has its centre at
((j + 0.5) / nx, (i + 0.5) / ny). Row 0 is north. Metres per unit u = `nx * dx`; per unit v = `ny * dx`.

## Files in each event folder

| File | What it is |
|---|---|
| `lab.json` | The manifest: grid, focus window, signal, line, headline, stories (with `cut`), credits, `files`, `checks`. Read this first. |
| `basemap.json` | OpenStreetMap vectors in (u, v), 5 decimals, simplified (about 10 m; minor roads 12 to 35 m). `roads.{motorway,trunk,primary,secondary,tertiary,minor}`, `rail`, `river`, `canal`, `coast` are lists of polylines `[[u, v], ...]`; `places` is `[{name, name_en, kind, u, v}]` (`name` in local script, `name_en` may be empty); `meta` records what was kept. `minor` roads are only inside the focus window. Polylines may stray up to 0.4% outside the grid. |
| `hillshade.png` | 8-bit grey relief at **2 x the grid** (like `ground.jpg`), light from the north-west at 45 degrees, flat ground = 180. |
| `sea.png` | 8-bit mask at grid size, 255 = sea or large open water (small ponds removed). All zero when the scene has none (Mexico City, Etna). |
| `signal.i16` | Mexico City only (its signal is derived): sinking rate, int16 little-endian, `scale` cm a year per count, zeroed on stable ground. For the other two events `lab.json` → `signal.file` points at the event's own layer (`../../../events/<slug>/los.i16` or `coh.u8`), which is read in place. |
| `line.u8` | Strength of the line at grid size, 0 to 255. Meaning in `lab.json` → `line` (`raster_scale`, `raster_unit`). |
| `line-valid.u8` | 1 where `line.u8` has a reading, 0 where it has none (so 0 in `line.u8` there means "no reading", not "no change"). |
| `line.json` | The line as polylines in (u, v): `lines[].points` = `[u, v, measured]` (1 = measured by radar, 0 = not); `runs` = the same line cut into pieces that are all solid or all dashed (`measured` true or false); `sites` = field-survey points (Kumamoto); other keys describe how it was made. |
| `proof-focus.jpg`, `proof-scene.jpg` | Pictures drawn only from the files above, to see by eye that roads, relief, line and pins agree. |

Layer units of the event data these refer to: `los.i16` is millimetres of line-of-sight motion (cm = value / 10, positive = toward the
satellite); `valid.u8` is 0/1; `coh.u8`, `cohdrop.u8` are 0 to 255 for 0 to 1; `dem.i16` is metres.

## Rebuild

From the repository root, with the project's virtual environment:

    ~/dev/nisar-hackathon/.venv/bin/python -m pipeline.lab.build               # all three events
    ~/dev/nisar-hackathon/.venv/bin/python -m pipeline.lab.build etna-eruption # one
    ~/dev/nisar-hackathon/.venv/bin/python -m pipeline.lab.check               # loader check of every manifest
    ~/dev/nisar-hackathon/.venv/bin/python -m pipeline.lab.proof               # redraw the proof images

OpenStreetMap responses are cached in `cache/lab/overpass/` (git-ignored); with the cache present a rebuild makes no network calls.
Without it, the build asks Overpass politely (descriptive User-Agent, 12 s pause between queries, retries with backoff, a fallback server,
minor roads fetched in tiles) and takes a few minutes. A rebuild is deterministic given the same cache.

## Honesty conventions

Solid = measured by radar. Dashed = not measured by radar (field survey only, or too weak to tell from noise). Blank = no reading.
NISAR data are provisional. Each event's `lab.json` → `line.caveat` says what the line is not.
