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
torn up. A raw drop (> 0.3) does not work on a monsoon valley floor: coherence there is only ~0.4
even before the event. At Langtang it lit up only alpine slopes at 3,100-3,400 m and nothing on the
debris corridor. [`build_event.change_footprint`](../pipeline/build_event.py) therefore maps a
coherence loss averaged over 3x3 cells: a fall of more than 0.1, to below 0.3. It counts only on
valley floors (within 100 m of the lowest ground within 1 km, since debris flows run in channels)
and below 3,000 m (higher valley floors hold monsoon snow and meltwater). The across pair is the
shorter one, so it should match *better* than the baseline, which makes a loss meaningful. Checked
against the Copernicus EMS EMSR927 and HOT extents, 73% of the mapped patches lie within 500 m of
the mapped debris, and about a third of the EMS debris area is caught. The corridor is patchy:
80 m posting in a narrow, steep valley is near what NISAR resolves.

**Volcanoes where motion isn't the signal.** If the event pair moves no more than the quiet
baseline pair (motion range < 1.5x baseline), the variation is atmosphere, not ground. The page
then shows the coherence drop instead (fresh lava, pyroclastic deposits), as for landslides. The
same happens when almost nothing unwraps: Anak Krakatau is a 2 km island in a scene that is 93%
sea, so no connected component survives, but coherence on the island still falls across the eruption.

A raw drop also fires on farmland and forest whose coherence merely sags (0.85 to 0.45). At Etna a
third of the drop pixels sat below the lowest lava front, towards the coastal towns; at Fuego 40%
sat on the neighbouring volcanoes. For volcanoes with a `reach_km` in `candidates.json` (the
documented run-out from the vent), the footprint requires coherence to **collapse**, as under fresh
lava or deposits: a fall of more than 0.3 to below 0.25, within `reach_km` of the event point. The
result: Etna maps 2.5 km² at 1,800-3,000 m (the upper flow field; the lower flow down to 1,309 m
was already poorly coherent and is missed). At Fuego, 69% of the mapped change lies inside the
EMSR912 pyroclastic-flow and ash-fall deposits. Each event's `note` in `candidates.json` states
what was checked and what is missed, and goes into `meta.json`.

**Water.** Radar measures no motion over the sea. The 3D display surface
(`gunw.display_surface`) is exactly flat where DEM <= 0 and fades to zero within 4 cells of the
shore. Before this, smoothing spilled coastal motion out to sea, and at Flores the exaggerated view
showed it as a deforming seabed.

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

Both maps get a 3x3 median filter and a minimum mapping unit: connected change patches smaller than
10 cells (1.6 ha) are dropped (`MIN_PATCH`). Neighbouring cells share speckle and smoothing, so they
are not independent evidence, and a few together can be chance. The reported areas are mapped areas,
not significance tests; don't describe them as "statistically significant". Dropping the small
patches cost the fires under 0.5 points of perimeter overlap (Aspen Acres 13.2% → 12.7% caught,
Little Giant 20.1% → 19.8%) and cut the area mapped outside the perimeter (0.63% → 0.60%,
0.15% → 0.10%).

**New land at sea (volcanic islands, `"newland": true`).** At Anak Krakatau coherence is ~0 over
both the sea and the fresh lava, so it can't say where the coast grew. Backscatter can: calm sea is
radar-dark (HH ~ -20 dB) and rock bright (~ -5 dB). [`pipeline/newland.py`](../pipeline/newland.py)
reads every GCOV pass June-October from both stacks (ascending track 10, descending track 119) on a
20 m grid, takes the median HH per stack before and after, calls land > -15.5 dB on both stacks,
and keeps the land patch under the vent (gaps closed, holes filled, so a dark crater isn't sea).
New land = island after minus island before: **26.5 ha**, nearly all on the W-SW-S shore, dark on
every pass to 2 Sep and bright from the first pass after the eruption (6 Sep) on; Sentinel-2 shows
the same cells water-coloured before (99%) and not after (11%). Badan Geologi's figure is 32.8 ha.
The two reported islets don't show (no new bright cell within 500 m of either pin). The Copernicus
DEM can't stand in for the old coast: it predates the 2018 flank collapse. The north flank also went
~5 dB darker on both stacks after the eruption (land, likely a fresh ash cover), so "island after"
is smaller than "before": only the gain is used. The result is a figure (`new-land.png`) and the
page note; the 3D layers are unchanged.

In monsoon floods every Sentinel-2 scene can be clouded out, so the draped ground image falls back
to the before composite, then to radar brightness.

## Pitfalls to remember (from research)

- Try every track: Kumamoto is decorrelated on one track and clean on another.
- GCOV (backscatter) tracks can alternate 20 and 40 MHz modes with different pixel sizes and a
  half-pixel offset: always regrid by coordinates, never by array index.
- Some passes come back blank (all zeros). Reject them before computing any change.
