# CREATE: from an event name to a details page

**Minimum deliverable:** this operator guide, using the existing Python pipeline and static site.
There is **no free-text event-name command or creation server/UI**. The browser editor selects
stories for an already-built event; a local/self-hosted creation UI is a stretch, not implemented.
An event name starts research, not a guaranteed build: suitable NISAR coverage and an interpretable
signal are prerequisites. A valid outcome is “not suitable yet”, with the reason recorded.

## 1. Prepare; choose rebuild or new event

Run commands from the repository root. First-time setup (Python 3.12):

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Use a free [Earthdata Login](https://urs.earthdata.nasa.gov) bearer token in the environment variable
`EARTHDATA_TOKEN` (set it privately in your shell; the pipeline reads the environment, not a `.env` file).

Viewing the committed site and searching CMR need no login. A cache-miss build needs the token,
network access to ASF, Copernicus DEM on AWS and Element 84 Earth Search; the browser needs WebGL
and access to the three.js CDN. Dependencies are in [requirements.txt](../requirements.txt).
Never put credentials, signed download URLs or raw HDF5 downloads in the repository.

- **Existing event:** keep its registered slug and researched inputs. The supported worked example
  below is `kumamoto-quake`. You can skip new registration/research, but review coverage and outputs.
- **New event:** do steps 2–6. A new name is not accepted until you register a structured candidate,
  check coverage, build the layers and supply researched, human-reviewed story inputs.
- Builds overwrite generated files and update the shared index/credits. Preserve unrelated changes;
  run builds serially. Serving a page locally does not publish it or require a Git commit.

```sh
SLUG=kumamoto-quake  # existing worked recipe; replace with your registered slug for a new event
```

## 2. Turn the name into a registered candidate (manual)

Verify the exact event/year, onset date and affected footprint from original agency/news sources;
record citations and uncertainty in research notes (see [validation sources](../research/validation-sources.md)).
Use the actual fire perimeter, debris corridor, flood area or vent, not just a nearby town's centroid.
Choose a centre in decimal WGS84 latitude/longitude and a square window whose **half-width** is
`half_km` in km. Include the whole footprint plus stable reference ground; start around 30–40 km
for a large quake, 10–20 km for a local change, then inspect actual coverage.

Append an object to `events` in [pipeline/candidates.json](../pipeline/candidates.json), keeping existing
entries and a unique URL-safe slug. This is the existing example's schema, **not a second entry**:

```json
{"slug":"kumamoto-quake", "name":"Kumamoto M6.8 earthquake, Japan",
 "kind":"quake", "lat":32.682, "lon":130.722, "date":"2026-07-28", "half_km":30}
```

Required: `slug, name, kind, lat, lon, date, half_km`. Use ISO `YYYY-MM-DD`; `date: null` is for ongoing
subsidence, not an unknown event date. Supported kinds and actual selection rules:

| Kind | Product and selection in `pipeline.build_event` |
|---|---|
| `quake`, `volcano`, `landslide` | GUNW: shortest pair with `start < date <= end` across all stacks; latest preceding pair on the same stack as baseline, if available. |
| `flood`, `fire` | GCOV HH/HV: same stack, at least two pre-event passes; take up to three before, first one after (flood) or up to two (fire). Choose earliest post-event coverage. |
| `subsidence` (`date: null`) | GUNW: consecutive shortest pairs from the earliest date on the largest stack; cumulative LOS fitted to a steady rate. Inspect gaps and retained pairs. |

Optional fields: `after_from` (ISO date; delay GCOV post-event selection, e.g. until a fire's final scar),
`reach_km` (documented volcanic run-out), `note` (GUNW page caveat; GCOV currently does not copy it).
Do not copy `newland: true` to a new volcano: that extra GCOV analysis is Anak Krakatau-specific
(fixed dates/projection/crop and a required stories file), not a generic new-land detector.
Landslide thresholds are tuned to Himalayan monsoon valley floors; another setting needs validation,
not just a changed name. Unknown kinds are not a supported extension point.

## 3. Screen coverage; stop if it cannot answer the question

```sh
.venv/bin/python -m pipeline.coverage
```

This searches public CMR for **all registered candidates**, writes `site/data/coverage.json` and prints
rankings. Collections are `NISAR_L2_GUNW_PROVISIONAL_V1` / `NISAR_L2_GCOV_PROVISIONAL_V1` in
[pipeline/cmr.py](../pipeline/cmr.py). It tests the centre point, **not full-window coverage or signal quality**.
Compare only one (track, frame, ascending/descending direction) stack. Check granule footprints in
[ASF Search](https://search.asf.alaska.edu/) and later check the built grid/masks cover your footprint.

Preview the builder's actual choices with public metadata only (no radar download):

```sh
.venv/bin/python - "$SLUG" <<'PY'
import sys
from pipeline import build_event as b

ev = b.candidates()[sys.argv[1]]
if ev["date"] is None:
    chosen = b.chain(ev)
elif ev["kind"] in b.BACKSCATTER:
    pre, post = b.pick_passes(ev)
    chosen = pre + post
else:
    across, baseline = b.pick_pairs(ev)
    if baseline is None:
        print("WARNING: no quiet baseline; coherence-drop evidence is unavailable")
    chosen = [g for g in (baseline, across) if g is not None]
for g in chosen:
    print(g.id, g.stack, g.start, g.end)
PY
```

A coverage score is only a screen: GCOV scoring wants two passes on **each** side, whereas the builder
accepts two before/one after; scoring ignores `after_from`. Subsidence scoring counts a stack, not its
continuous chain. The builder does not enforce a score or choose the cleanest signal. There is no
CLI track/granule override; a different scientific selection requires a reviewed code change.

**Stop/defer** for no spanning pair, no adequate same-stack passes, an unusable chain, or a flood
already drained before the first post-event pass. Keep the candidate and document why; do not add a
fake live page. Recheck later for archive/product lag, or choose another event. CMR errors are not
proof of absent coverage: resolve the service error and rerun. A missing baseline prevents the
baseline comparison/coherence-drop story even if the across-event motion layer builds.

## 4. Build radar, terrain and optical layers

```sh
.venv/bin/python -m pipeline.build_event "$SLUG"
# Only when deliberately refreshing acquisitions, or after changing date/centre/extent/kind:
# .venv/bin/python -m pipeline.build_event "$SLUG" --refetch
```

First run reads HDF5 windows through HTTP ranges (not entire multi-GB granules); budget minutes and
potentially substantial network traffic, especially for a chain. `cache/<slug>.npz` is reused by slug,
**not keyed by parameters**. Use `--refetch` after scientific input changes. Only load trusted caches.
A missing/expired Earthdata token or ASF access failure is an authentication blocker, not “no event”.

The build reprojects Copernicus GLO-30 terrain and Sentinel-2 L2A onto the radar grid. Optical windows
are event −75 to −1 days / +1 to +45 days; for subsidence the anchor is chain end minus 60 days.
Cloud-masked composites use up to six dates each. Draping uses after, then before to fill holes;
GCOV also falls back to radar brightness. Without optical, ordinary GUNW can have no ground texture.
Missing DEM tiles become zero: check that land has real terrain, not a silent download/coverage gap.
STAC/network failures may abort the build; fix them rather than treating an incomplete folder as ready.

Outputs: `site/events/<slug>/meta.json` (grid, provenance, dates, stats, image credits), binary layers,
images and ground texture when available. GUNW yields LOS/coherence and, with a baseline, coherence
loss; GCOV yields backscatter change, not motion; subsidence yields fitted cumulative motion/rate.
The build adds the slug to `site/events/index.json` automatically, but **does not build stories**.
Inspect baseline versus event signal, valid area, cloud gaps and agreement with independent mapped
extents. Low coherence is not proof of damage; explain mismatches in the page/story text, or stop.
See [ingest methods and limitations](3-ingest.md); event animation is interpolation, not a recording.

## 5. Research stories/media, then make human selections

For a new event create `research/stories/<slug>.json` manually. Use
[the Kumamoto source](../research/stories/kumamoto-quake.json) as the concrete schema example:
top-level `slug`, `boundary` (one checked sentence), `items` (array). Every item needs a stable `id`,
`title, place, lat, lon, side, what_it_shows, image_url, page_url, credit, licence, date, confidence, notes`.
Use `side` = `affected` or `unaffected` only with evidence; `confidence` = high/medium/low.
Verify source pages, event/year, location and rights yourself. Aim for a well-located hit/spared pair,
not invented people, damage, sources or coordinates. An empty `items` array is a technical bootstrap,
not a completed ground-story page. Approximate locations cannot prove opposite sides of a boundary.

Optional enrichment (not needed for a radar + researched-story page):

- Media harvest requires a hand-written `research/media/seeds/<slug>.json` first; see
  [seed schema, providers and outputs](5b-media.md) and the four existing seed files. It is not generated
  from an event name. `.venv/bin/python -m pipeline.media "$SLUG" --only=commons,gdelt` avoids Mapillary;
  the default harvest's Mapillary provider needs `MAPILLARY_TOKEN`. Harvest rewrites candidates and may
  geocode/update seeds; inspect failures and wrong matches. Its relevance/tiering is quake/subsidence-
  oriented, not a validated generic hazard search.
- `.venv/bin/python -m pipeline.establishing "$SLUG"` finds optional Commons place photos; review
  `research/establishing/<slug>.json` and mark bad choices `"rejected": true`. These are labelled context,
  **not pictures of the event**. `.venv/bin/python scripts/places.py "$SLUG"` adds optional OSM labels.

```sh
.venv/bin/python -m pipeline.stories "$SLUG"
.venv/bin/python -m http.server 8000 --bind 127.0.0.1 --directory site
```

The first command samples radar at researched points and creates `site/events/<slug>/stories.json`.
It may fetch image previews; it also regenerates per-event `CREDITS.md`. Keep the server running in
this terminal. Open `http://localhost:8000/editor.html?e=kumamoto-quake` (substitute your slug), select/
reject candidates, order and caption them, and **download** decisions into
`research/editorial/<slug>.json`. Browser autosave alone never updates repository files. Decisions
have `boundary` text plus `items`/`media` maps keyed by ID, with `status`, `caption` and `order`.
In another terminal at the repo root, rerun `.venv/bin/python -m pipeline.stories kumamoto-quake`
(or your slug) to apply them. The page falls back to non-rejected candidates marked **unreviewed**
if no selected in-frame stories remain; do not mistake that for editorial approval.

Retain source URLs, creators, licences and modification notices. News images may become pixelated
linked previews in the current pipeline; pixelation is **not permission**. If rights are unclear,
use link-only text with `image_url: null` and no `preview_file`. Review harvested previews too.
Add any new dataset/software/service attribution to the hand-maintained part of
[CREDITS.md](../CREDITS.md); regenerate its marked per-event block with `pipeline.stories` or
`.venv/bin/python -m pipeline.credits`, never by hand. Selected Mapillary URLs can expire; see
[editorial shipping checks](6-editorial.md).

## 6. Validate and open the actual details page

**Worked example URL:** [http://localhost:8000/e/kumamoto-quake.html](http://localhost:8000/e/kumamoto-quake.html).
After building or changing stories, run `scripts/pages.py` below to regenerate the static event pages
and their titles/descriptions. It reads `site/events/index.json`, writes `site/e/<slug>.html` and makes
`site/index.html` the Kumamoto landing page. Edit `site/event.html`, not those generated copies.

For a new event use `http://localhost:8000/e/<slug>.html`; the shared template also works at
`http://localhost:8000/event.html?e=<slug>`. Do not open an events-directory URL or `file://`.
The catalogue at `events.html` lists `site/data/coverage.json` and links built slugs from
`site/events/index.json` to their static pages. A new event therefore needs the coverage refresh,
a successful build **and** page generation. Neither JSON file is an editorial-readiness gate.
Generated asset folders alone do not register a candidate.

```sh
.venv/bin/python scripts/pages.py
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q -p no:cacheprovider tests/test_pipeline.py
.venv/bin/python -m pipeline.credits --check
# Optional macOS screenshot, with the server above still running and Chrome installed:
PORT=8000 sh scripts/shot.sh 'e/kumamoto-quake.html' /tmp/nisar-event.png
```

Before calling it ready, check the actual new slug, not just the example: metadata dates/extent/
provenance, every referenced layer/image, binary sizes (`nx × ny` bytes for u8, twice that for i16),
working 3D/slider, in-frame pins, reviewed stories/media, source links/credits, caveats and catalogue
link. Inspect the screenshot and browser console/network errors; automated tests do not establish
scientific validity or rights. Changed grids also require resampling stories and refreshing optional
media/places; existing media seeds' computed `steps` are cached in the seed JSON, not auto-invalidated.
Optional lab/sideways-slip outputs are separate, not generated for arbitrary events by this recipe.

### Verification and remaining limits (15 November 2026)

Checked source/CLI contracts, relative links and the committed Kumamoto fixture/asset sizes. Shell/JSON/
Python examples pass syntax checks; metadata preview ran with mocked CMR for all six kinds. All 11
pipeline tests and `pipeline.credits --check` passed. No authenticated fetch, rebuild, new event,
live coverage check or browser render was run. Credentials, network, scientific review and human
research/editorial remain prerequisites. No all-in-one creator, automatic scientific quality gate
or generic new-event smoke test exists; a creation server/UI remains stretch scope.
