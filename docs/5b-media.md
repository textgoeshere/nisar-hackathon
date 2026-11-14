# Step 5b: media harvest

**Goal:** many geolocated media candidates per event for the editor to triage (step 6): a few that
show the line or the movement directly, plus plenty of relevant context. Each candidate carries what
NISAR measured at its spot.

```sh
.venv/bin/python -m pipeline.media kumamoto-quake            # -> research/media/<slug>.json + site/events/<slug>/media.json
.venv/bin/python -m pipeline.media panama-quake --only=commons,gdelt   # a subset of sources
```

Outputs:

- `research/media/<slug>.json`: the located candidates (fields below).
- `research/media/unlocated/<slug>.json`: relevant hits the harvest could not place in the frame, with
  `located` naming the place when a caption put it outside the frame ("Penonomé, outside the NISAR frame").
- `site/events/<slug>/media.json`: both lists (research items left out: they are the stories), for the
  editor's *Media candidates* and *Unlocated* tabs (step 6).
- `site/events/<slug>/media/*.png`: pixelated previews of news and agency images (below).

## Seeds

`research/media/seeds/<slug>.json`, hand-written from `research/validation-sources.md` and the
stories' `boundary` text, in four search tiers:

1. **anchors**: GNSS stations, field-measured offsets, graded damage points (value, side, source).
2. **terms**: visible-displacement words in the local language and English (`local`, `en`), and
   the stems used to recognise them in captions (`match`).
3. **places**: named places on the NISAR boundary and the towns captions name, with aliases
   (Japanese/Spanish/English). Places marked `outside: true` (with coordinates; e.g. Penonomé, Soná,
   Caracas, Puerto Cabello) lie beyond the frame: they are not search centres, they only recognise
   captions, so those photos go to the Unlocated list labelled with the town. `steps` is computed: the strongest local steps in the NISAR layers (and, for subsidence, the
   fastest-sinking spots), reverse-geocoded.
4. **context**: open queries, Commons categories and GDELT queries.

Entries with only a `q` are geocoded with Nominatim inside the grid on the first run, and the
result is written back into the seed file (`geocoded`); fix wrong hits by hand there.

## Sources (`pipeline/media/`, one module each)

| module | what | location | licence |
|---|---|---|---|
| `commons.py` | geosearch (600 m) around every centre, event categories, full-text search of the terms | file geotag, else the seed place named first in the title, then the description, then the categories | extmetadata |
| `openverse.py` | text search (paced 20/min, retried on 504) | Commons API for Commons hits, Flickr page geo, else text | from Openverse |
| `mapillary.py` | images within 250 m (anchors) / 400 m (places) of each centre, 3 before + 3 after the event | image GPS | CC BY-SA 4.0 |
| `panoramax.py` | STAC search, same centres and periods | image GPS | per picture |
| `gdelt.py` | DOC API artlist, event window, `sourcelang` | seed places in the headline, else Nominatim on place names in it (settlement hits only, regions skipped) | news: pixelated preview + link |
| `research` / `validation` | `research/stories/<slug>.json` items; seed anchors as measurement/damage items | as researched | as researched |

Mapillary's token is `MAPILLARY_TOKEN`, sent as an `Authorization: OAuth` header (filled by the
gateway proxy); it is never logged or cached. Its `thumb_url`s are signed and expire. All HTTP
responses are cached in `cache/media/http/`.

## Processing

- **Keep** only items located inside the grid. Commons/Openverse hits must be about the event or the
  ground: event words or displacement terms, an event category, or (quakes) shot after the event. An
  older photo survives only within 300 m of an anchor **and** only as a "before" view of the ground or
  the landmark there: its text has a ground word (road, street, bridge, church, paddy, calle, iglesia,
  道路, 神社, ...) or names the landmark of a nearby offset/damage anchor (its distinctive name words or
  `aliases`, e.g. "Columna de la Independencia" at the Ángel). GNSS stations have no landmark, so
  airliners at the airport station and generic city shots are dropped. For quakes, files shot or
  uploaded before the event are dropped unless found by geosearch (this removes Kumamoto 2016).
  Free Nominatim geocoding is used for news headlines only, never photo captions (it put Bolivian and
  colonial-history pictures on Mexico City streets named after places); captions are matched against
  the seed places.
- **De-duplicate** by canonical URL, then by location within 30 m + near-identical title.
- **nisar**: `pipeline/stories.sample` at the point: `u`, `v` (grid position, for the 3D pin),
  `motion_cm`, `local_step_cm` (5-95th pct within 500 m), `coherence`, `measured`; for subsidence also
  `rate_cm_yr` (5x5 median) and `rate_fastest_cm_yr` (5th pct within 500 m).
- **approx**: located only by a town name / centroid, or researched as approximate (`loc_confidence`
  low). Kept (David's rule: if the precise spot isn't load-bearing and the image is compelling, keep it
  and caption it "approximate location"), shown as such in the editor and on the event page, never
  tier 1 or 3, and never one side of a hit/spared pair at a precise spot (published with no side).
- **tier** (proximity alone never gives tier 1):
  1. a measurement anchor; or within 300 m of one, precisely located, **and** evidently about the event
     there: event/displacement words, an event category, or shot after the event. Subsidence: any date,
     but only if the text is about sinking/cracks or names the landmark.
  2. text names a visible displacement (not street views: their titles name the search centre).
  3. precisely located within 300 m of an anchor or 1 km of a boundary place / step spot, or local
     step at least half the event's strongest.
  4. context.

  Street views (Mapillary, Panoramax) reach tier 1 only when shot after the event at an anchor; a
  pre-event view tops out at tier 3 (4 when it is near nothing). **Pairs:** a before and an after view
  within 50 m of each other are kept as a pair: each names the other in `pair` (distance `pair_m`) and
  both take the after view's tier.
- **side_hint**: the research side, else the anchor/place it was found by, else the nearest seeded
  place within 500 m; for subsidence, rate <= -5 cm/yr = affected, >= -1 = unaffected.
- **showable**: photo/street with an open licence (CC/PD). Mapillary `thumb_url`s are signed and
  expire; the editor and event page fall back to "no preview" with the link.
- **pixelated previews** (David's rule for news and agency images: use them, gently pixelated,
  clicking through to the attributed source). For news (GDELT) and link-only agency photos (e.g. the
  GSJ field photos for Kumamoto), `pipeline/media/pixelate.py` takes the article's og:image (GDELT's
  `socialimage`, else the page's `og:image`/`twitter:image`; generic logos skipped), caches the
  download in `cache/media/img/`, shrinks it to 56 px on the long side and scales it back up 8x with
  nearest neighbour: the scene reads, but it is clearly not a reproduction. Only that derivative is
  stored, as `site/events/<slug>/media/<id>.png`, and the item gets `preview_url` + `preview:
  "pixelated"`. The full-resolution original is never hosted. Pages show it linked to `page_url`
  with the credit and "pixelated preview — view original at <source>". `pipeline.stories` does the
  same for link-only story photos.
- **when**: before/after the event date (subsidence: the start of the NISAR stack).

Fields: id, source, type (photo|street|news|damage|measurement), title, caption, lat, lon,
loc_method, loc_confidence, approx, date, when, thumb_url, page_url, credit, licence, showable,
preview_url, preview, tier, side_hint, pair, pair_m, nisar, found_by. Items are sorted by tier, then
showable first. Unlocated items carry id, source, type, title, caption, date, page_url, thumb_url,
credit, licence, showable, found_by, located.
