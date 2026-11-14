# Step 2: rank candidates by NISAR coverage

**Goal:** keep only events NISAR actually imaged before *and* after.

```sh
.venv/bin/python -m pipeline.coverage      # writes site/data/coverage.json
```

## How it works

[`pipeline/cmr.py`](../pipeline/cmr.py) queries NASA's Common Metadata Repository (CMR), which is
public: no login is needed to search. For each event point it lists every GUNW interferogram and
GCOV backscatter granule whose footprint contains the point.

Each granule carries its orbit geometry: **track** (which orbit), **frame** (which slice along it)
and **direction** (ascending or descending). Granules sharing all three form a *stack*: the same
ground from the same angle every 12 days. Only images from one stack can be compared directly.

[`pipeline/coverage.py`](../pipeline/coverage.py) then scores each event:

| Event type | Needs | Why |
|---|---|---|
| Quake, volcano, landslide | A GUNW pair whose first pass is before the event and second pass after ("spanning") | The phase difference then contains the event's ground motion. Shorter spans are better: less unrelated change, higher coherence |
| Flood, fire | ≥2 GCOV passes before and after on one stack, ideally a pass within ~6 days of the event | A stable "normal" to compare against, and a look while the change is still there |
| Subsidence (ongoing) | A long chain of consecutive GUNW pairs on one stack | Slow motion only shows up when many 12-day steps are added up |

All tracks are considered. In research, Kumamoto showed nothing on its first track (coherence
0.08) and a clean bullseye on track 24.

## Result (14 Nov 2026)

12 of 21 candidates have usable coverage. The misses fall into two groups:

- **Too early:** the track's archive starts after the event (Mozambique in January, Morrill and
  Krasheninnikov in March).
- **Too recent:** provisional products lag the acquisition by ~3-4 weeks (Nagqu, Kīlauea, Mayon,
  Odisha, Toccoa in late October and November).

San Juan has a spanning interferogram but only one backscatter pass after the flood, and research
showed the water had drained by then.

Coverage is necessary, not sufficient: step 3 checks whether the signal is actually there.
