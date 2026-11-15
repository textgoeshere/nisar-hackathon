# Sideways slip: the data contract (both workers build to this)

Two files per event, in `site/events/<slug>/`, written by `pipeline/slip.py` and read by `site/js/slip.js`.
Only Kumamoto (`kumamoto-quake`) has them today. Nothing else on the site reads them, and `meta.json` does not mention them.

All positions are **(u, v)**: fractions of the event grid, u east from the west edge, v south from the north edge, as in
`stories.json`. Cell (row i, column j) is centred at ((j + 0.5) / nx, (i + 0.5) / ny). Row 0 is north. The Kumamoto grid is
750 × 750 cells of 80 m (`meta.json` → `grid`).

## `slip.i16`: the movement field

- int16, little-endian, two bands one after the other: first `east_mm` (ny rows × nx columns), then `north_mm` (the same).
- The value is how far the ground in that cell moved sideways, **true size, in millimetres**. It is not exaggerated; the viewer does that.
- Positive east, positive north. Zero where nothing is claimed.
- **It jumps at the line.** Each cell carries the value for its own side. Nothing is blended across the line, so the two cells
  either side of it differ by the full offset.
- It returns to zero at both ends of the line, so the tear closes there.

## `slip.json`: the manifest

```json
{
  "slug": "kumamoto-quake",
  "version": 1,
  "field": { "file": "slip.i16", "dtype": "int16", "nx": 750, "ny": 750, "bands": ["east_mm", "north_mm"], "max_mm": 919 },
  "line": {
    "points": [[u, v, measured, offset_cm], ...],
    "runs": [{ "measured": true, "points": [[u, v], ...] }, ...],
    "length_km": 26.6
  },
  "sites": [{ "id": "gsj-08", "label": "…", "u": 0.44609, "v": 0.73669, "offset_cm": 184, "value": "184 cm right-lateral …", "conf": "medium", "credit": "…" }],
  "gps": [{ "id": "J093", "name": "千丁 Senchō", "u": 0.385, "v": 0.753, "east_cm": 62.3, "north_cm": 61.7, "up_cm": -32.7,
            "model_east_cm": 0, "model_north_cm": 0, "miss_cm": 0, "source": "…" }],
  "model": { "summary": "one or two plain sentences", "params": { }, "gps_rms_miss_cm": 0 },
  "text": { "measured": "…", "drawn": "…", "caveat": "…" },
  "credits": ["…"]
}
```

- `field.nx`, `field.ny`: read them; do not assume 750. `max_mm` is the largest sideways movement anywhere in the field.
- `line.points`: the rupture as one polyline, north-east end first. `measured` is 1 where the radar sees the step, 0 where the line is
  known from the field survey only (draw solid and dashed, as the lab pages do). `offset_cm` is the total sideways offset across the
  line at that vertex, as used by the model (interpolated between sites; zero at the two ends).
- `line.runs`: the same line pre-cut into all-solid and all-dashed pieces.
- `sites`: the field-survey measurements the model is pinned to. These are the measured facts at the line.
- `gps`: stations with their measured movement (`east_cm`, `north_cm`, `up_cm`) and what the model gives at the same spot
  (`model_*`, `miss_cm` = horizontal distance between the two). The measured values are what the page draws as arrows.
- `model.summary`, `text.measured`, `text.drawn`, `text.caveat`: plain sentences the page shows as they are. The page types no
  numbers of its own.
- `credits`: lines to add to the page's Sources list.

The viewer was first built against a crude stand-in that followed this contract; `pipeline/slip.py` writes the real files.
