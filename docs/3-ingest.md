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

## 3.6 Other event types

**Subsidence (no event date).** One 12-day interferogram holds only millimetres of slow sinking.
[`build_event.chain`](../pipeline/build_event.py) links consecutive pairs on the best-covered stack
(each pair starts where the last ended), reads them all and adds them up. Each pair also carries
~0.5-1 cm of atmospheric and unwrapping noise, so the raw running total jitters. Groundwater-driven
subsidence is steady over a year, so we fit one rate per pixel (least squares through the origin)
and show rate x time; the scatter of the passes around the fit is reported. Pixels are trusted
where at least 80% of pairs were coherent. In the viewer only sinking is tinted and contoured
(every 5 cm, beyond 2 cm of sinking, about twice the fit scatter): an apparent rise of a couple of centimetres is within the fit's noise.

**Landslides and debris flows.** The signal is not motion but **coherence drop**: ground that
matched itself in the baseline pair and stopped matching across the event, because it was buried or
torn up. In high mountains fresh snow does the same, so ground above the seasonal snowline (3,500 m
for the Himalaya in late August) is masked. At 80 m posting a narrow debris channel in a steep
valley is near the limit of what NISAR resolves; for Langtang the Sentinel-2 image shows the
channel more clearly than the radar does.

**Volcanoes where motion isn't the signal.** If the event pair moves no more than the quiet
baseline pair (motion range < 1.5x baseline), the variation is atmosphere, not ground. The page
then shows the coherence drop instead (fresh lava, pyroclastic deposits), as for landslides. The
same happens when almost nothing unwraps: Anak Krakatau is a 2 km island in a scene that is 93%
sea, so no connected component survives, but coherence on the island still falls across the eruption.

**Floods and fires (backscatter, GCOV).** These read radar brightness, not phase.
[`pipeline/gcov.py`](../pipeline/gcov.py) reads HH and HV gamma-0 for the window and averages the
native 10-20 m pixels into 40 m cells, binning by coordinates because passes on one stack switch
between 20 MHz quad-pol and 40 MHz dual-pol modes with different pixel sizes.
[`build_event.pick_passes`](../pipeline/build_event.py) takes up to 3 passes before the event and
the first pass after (flood: water drains in days) or the first two (fire: scars last), on the
stack whose first post-event pass comes soonest. Medians across passes damp speckle.

- Flood: ground that was not water before (HH > -15 dB) and is dark after (HH < -15 dB, and at least
  3 dB darker). Water under crops or trees brightens HH instead (double bounce); that area is
  reported but not mapped, because rain-wet soil also brightens.
- Fire: HV (vegetation volume scattering) fell by more than 1.5 dB, ignoring ground that was
  already dark.

In monsoon floods every Sentinel-2 scene can be clouded out, so the draped ground image falls back
to the before composite, then to radar brightness.

## Pitfalls to remember (from research)

- Try every track: Kumamoto is decorrelated on one track and clean on another.
- GCOV (backscatter) tracks can alternate 20 and 40 MHz modes with different pixel sizes and a
  half-pixel offset: always regrid by coordinates, never by array index.
- Some passes come back blank (all zeros). Reject them before computing any change.
