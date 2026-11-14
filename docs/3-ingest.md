# Step 3: ingest and process

**Goal:** turn a multi-gigabyte NISAR file into a few megabytes of clean, web-ready layers for one
event, on one grid, alongside terrain and optical context.

```sh
export EARTHDATA_TOKEN=...                              # urs.earthdata.nasa.gov > Generate Token
.venv/bin/python -m pipeline.build_event kumamoto-quake # ~5-15 min, cached in cache/
```

## 3.1 Pick the interferograms

[`build_event.pick_pairs`](../pipeline/build_event.py) chooses:

- the **shortest interferogram spanning the event**, on any stack. Short spans keep coherence high
  and leave less room for unrelated change (rain, crops, snow);
- the **pair just before it on the same stack**, as a baseline: what "quiet" looks like on that
  ground with that geometry. Showing both side by side is the honest test that the signal is the
  event and not noise.

For Kumamoto: 21 Jul → 14 Aug 2026 on track 24, frame 18, ascending (24 days, because one 12-day
acquisition was missing), with 9 → 21 Jul as baseline.

## 3.2 Read only the window

NISAR granules are 1-5 GB. [`pipeline/remote.py`](../pipeline/remote.py) gives h5py a file-like
object that turns reads into HTTP Range requests, so only the HDF5 chunks covering the window are
downloaded. Kumamoto (a 60 km window from two interferograms) reads **54 MB** instead of ~4 GB.

Details that matter:

- ASF authenticates with an Earthdata **bearer token**, then redirects to a pre-signed URL. The
  signed URL must be requested *without* the Authorization header.
- Reads are latency-bound. Fetch aligned ~512 KB blocks and cache them; 4 MB blocks read ~10x
  more data for the same window.

## 3.3 From phase to ground motion

See [`pipeline/gunw.py`](../pipeline/gunw.py). The interferogram's unwrapped phase φ is, after the
processor removes orbit and topography, mostly ground motion along the radar's line of sight (LOS)
plus atmosphere and noise:

- **Motion:** d = −λ/(4π) · (φ − φ_iono). A full 2π cycle is half a wavelength (~12 cm) of
  motion, because the signal goes there and back. λ = c / centre frequency ≈ 24 cm.
- **Ionosphere:** the product includes an estimated ionospheric phase screen; subtract it.
- **Unwrapping regions:** `connectedComponents` labels regions unwrapped independently; they can
  be offset by whole cycles from each other. Keep the largest; component 0 is "not unwrapped".
- **Coherence ≥ 0.3:** below that the phase is mostly noise. Coherence is kept as its own layer,
  because *loss* of coherence is a signal: the surface was destroyed or rearranged.
- **Reference:** the absolute offset is unknown, so motion is relative to the window's median.
  Make the window wider than the deforming area so the median sits on stable ground.

LOS motion is one component of the 3D motion: toward or away from a satellite looking sideways
from ~35-45° off vertical. Horizontal fault slip shows up only partly.

## 3.4 Context on the same grid

[`pipeline/context.py`](../pipeline/context.py) reprojects everything onto the NISAR window's own
UTM grid, so a point has the same (u, v) position in every layer:

- **Terrain:** Copernicus GLO-30 DEM (public COGs on AWS Open Data).
- **Optical:** Sentinel-2 L2A from the Element 84 Earth Search STAC API. Per-pixel median of the
  clearest dates before and after the event, with cloud, shadow and cirrus masked using the scene
  classification layer (SCL). Rendered at twice the radar resolution.

## 3.5 Outputs

Written to `site/events/<slug>/`: binary layers (DEM, LOS in mm, validity, coherence), raw images
(interferogram rewrapped at 10 cm per colour cycle, coherence, baseline interferogram, optical
before/after) and `meta.json` with the grid, provenance (granule IDs, scenes) and stats.

## Result: Kumamoto

| | Event pair (21 Jul → 14 Aug) | Baseline pair (9 → 21 Jul) |
|---|---|---|
| Spread of LOS motion (2nd-98th percentile) | **30.7 cm** | 6.9 cm |
| Area measured (coherent, unwrapped) | 59% | |

The event signal is about 4.5 times the background, and concentrates along the Hinagu fault
south-west of Kumamoto city.

## Pitfalls to remember (from research)

- Try every track: Kumamoto is decorrelated on one track and clean on another.
- GCOV (backscatter) tracks can alternate 20 and 40 MHz modes with different pixel sizes and a
  half-pixel offset: always regrid by coordinates, never by array index.
- Some passes come back blank (all zeros). Reject them before computing any change.
