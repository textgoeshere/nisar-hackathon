# Step 5: ground stories and media

**Goal:** for each event, candidate stories and photos of specific places, located precisely
enough to put on the 3D view, ideally in pairs either side of the boundary: one place hit, one
spared.

```sh
.venv/bin/python -m pipeline.stories kumamoto-quake    # -> site/events/<slug>/stories.json
```

## Research method

Candidates live in [`research/stories/<slug>.json`](../research/stories/). They were gathered
during pre-hackathon research and are reproducible by the same method:

1. **Find the boundary first.** Read the NISAR layers: where is the sharpest change in motion, or
   the edge of coherence loss? Describe it in one sentence (stored as `boundary`).
2. **Search for places on and off it.** News, agency field reports (e.g. geological surveys),
   Wikimedia Commons, NGO reports. Prefer named, mappable places: a school, a shrine, a bridge, a
   street.
3. **Verify on the page itself**, never from a search snippet: the fact, the date, and where the
   photo was taken.
4. **Locate** each item (OpenStreetMap or the source's own coordinates) and record a `confidence`
   (high: within ~100 m; medium: street or village; low: district).
5. **Record the licence** at research time. This decides what can be shown.
6. Label each item's `side`: affected (hit) or unaffected (spared).

Each item has: id, title, place, lat, lon, side, what_it_shows, image_url, page_url, credit,
licence, date, confidence, notes.

## What NISAR says at each spot

[`pipeline/stories.py`](../pipeline/stories.py) projects each item onto the event grid and
samples, within ~500 m:

- **motion**: LOS motion at the point (cm), if measured;
- **local step**: the 5th-95th percentile spread of motion within 500 m. Large = the point sits on
  a boundary;
- **coherence**: low = the surface itself was destroyed or changed.

This turns "the satellite explains the story" into a number a reader can check.

### Kumamoto, first pass

| Story | Local step | Coherence |
|---|---|---|
| Ryuho Elementary (playground lines offset 94 cm) | 11.8 cm | 0.36 |
| Yatsushiro Shrine (approach path offset 95 cm) | 9.5 cm | 0.40 |
| Myoken expressway viaduct (dropped) | 8.4 cm | 0.16 |
| Nippon Paper mill, ~2 km off the rupture (chimney collapse) | 9.4 cm | 0.67 |
| Kumamoto Castle, 13 km away (shaking damage) | 1.1 cm | 0.63 |

On-rupture sites combine a large step with low coherence. The mill also sits near a step but keeps
good coherence: its damage came from shaking, not from the ground breaking under it. The castle
sits on quiet ground.

## Establishing shots

A story with no photo of its own (nothing openly licensed, nothing to pixelate) gets an
**establishing shot**: a recent, openly licensed Wikimedia Commons photo of the place it is about.
It is context, never evidence, and the card says so: "Establishing shot: <place> (<year>), not of
the event", muted and smaller than real event media, with credit, licence and a link to Commons.

```sh
.venv/bin/python -m pipeline.establishing --all      # -> research/establishing/<slug>.json
.venv/bin/python -m pipeline.stories <slug>          # attaches it to the story as `establishing`
```

[`pipeline/establishing.py`](../pipeline/establishing.py) tries Commons geosearch within 2 km of the
story's point, then the Commons category and full-text search for the story's main place (a
hand-written `PLACES` list, since `place` is a precise locator rather than a search term), then
geosearch within 8 km. Only CC BY / BY-SA / CC0 / public domain raster photos in landscape format,
taken within ~15 years before the event; maps, logos, arms, documents, plants and animals, and
anything mentioning damage or disasters are skipped. For an *affected* story a photo taken after the
event is never used (it could show the damage and pass as the event); for an *unaffected* one the
most recent wins. To review: delete an entry or set `"rejected": true`; `"pin": "File:..."` forces
a file; a turned-down file goes into `REJECT` so it is never offered again.

## Rules

- **Licensing:** show images only with an open licence (Wikimedia Commons CC BY / CC BY-SA, public
  domain, agency CC). CC BY-ND images are shown unmodified. **News photos are linked, never
  hosted.** Credit every image.
- **People:** places and published quotes only; no private individuals' details.
