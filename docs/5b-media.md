# Step 5b: media harvest

**Goal:** many geolocated media candidates per event for the editor to triage (step 6): a few that
show the line or the movement directly, plus plenty of relevant context. Each candidate carries what
NISAR measured at its spot.

```sh
.venv/bin/python -m pipeline.media kumamoto-quake            # -> research/media/<slug>.json
.venv/bin/python -m pipeline.media panama-quake --only=commons,gdelt   # a subset of sources
```

## Seeds

`research/media/seeds/<slug>.json`, hand-written from `research/validation-sources.md` and the
stories' `boundary` text, in four search tiers:

1. **anchors**: GNSS stations, field-measured offsets, graded damage points (value, side, source).
2. **terms**: visible-displacement words in the local language and English (`local`, `en`), and
   the stems used to recognise them in captions (`match`).
3. **places**: named places on the NISAR boundary, with aliases (Japanese/Spanish/English).
   `steps` is computed: the strongest local steps in the NISAR layers (and, for subsidence, the
   fastest-sinking spots), reverse-geocoded.
4. **context**: open queries, Commons categories and GDELT queries.

Entries with only a `q` are geocoded with Nominatim inside the grid on the first run, and the
result is written back into the seed file (`geocoded`); fix wrong hits by hand there.

## Sources (`pipeline/media/`, one module each)

| module | what | location | licence |
|---|---|---|---|
| `commons.py` | geosearch (600 m) around every centre, event categories, full-text search of the terms | file geotag, else a seed place named in the title/description | extmetadata |
| `openverse.py` | text search (paced 20/min, retried on 504) | Commons API for Commons hits, Flickr page geo, else text | from Openverse |
| `mapillary.py` | images within 250 m (anchors) / 400 m (places) of each centre, 3 before + 3 after the event | image GPS | CC BY-SA 4.0 |
| `panoramax.py` | STAC search, same centres and periods | image GPS | per picture |
| `gdelt.py` | DOC API artlist, event window, `sourcelang` | seed places in the headline, else Nominatim on place names in it | news: link only |
| `research` / `validation` | `research/stories/<slug>.json` items; seed anchors as measurement/damage items | as researched | as researched |

Mapillary's token is `MAPILLARY_TOKEN`, sent as an `Authorization: OAuth` header (filled by the
gateway proxy); it is never logged or cached. Its `thumb_url`s are signed and expire. All HTTP
responses are cached in `cache/media/http/`.

## Processing

- **Keep** only items located inside the grid; Commons/Openverse hits must be about the event or
  the ground (event words or displacement terms, an event category, or shot after the event); an
  older photo survives only within 300 m of an anchor (a "before" view). For quakes, files shot or
  uploaded before the event are dropped unless found by geosearch (this removes Kumamoto 2016).
- **De-duplicate** by canonical URL, then by location within 30 m + near-identical title.
- **nisar**: `pipeline/stories.sample` at the point: `motion_cm`, `local_step_cm` (5-95th pct within
  500 m), `coherence`, `measured`; for subsidence also `rate_cm_yr` (5x5 median) and
  `rate_fastest_cm_yr` (5th pct within 500 m).
- **tier**: 1 = a measurement anchor or within 300 m of one (location high/medium); 2 = text names a
  visible displacement; 3 = within 1 km of a boundary place / step spot, or local step at least half
  the event's strongest; 4 = context.
- **side_hint**: the research side, else the anchor/place it was found by, else the nearest seeded
  place within 500 m; for subsidence, rate <= -5 cm/yr = affected, >= -1 = unaffected.
- **showable**: photo/street with an open licence (CC/PD); news, reports and agency data are link-only.
- **when**: before/after the event date (subsidence: the start of the NISAR stack).

Fields: id, source, type (photo|street|news|damage|measurement), title, caption, lat, lon,
loc_method, loc_confidence, date, when, thumb_url, page_url, credit, licence, showable, tier,
side_hint, nisar, found_by. Items are sorted by tier, then showable first.
