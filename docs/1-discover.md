# Step 1: discover candidate events

**Goal:** a list of recent news events that should leave a mark NISAR can see.

## What NISAR can see

NISAR is an L-band (24 cm wavelength) synthetic aperture radar. It images the ground day and night,
through cloud, every 12 days. Two kinds of product matter here:

- **Interferograms (GUNW):** compare the radar *phase* of two passes. Phase changes when the ground
  moves toward or away from the satellite, so an interferogram maps ground motion to about a
  centimetre. Where the surface itself is destroyed or rearranged (landslide debris, new lava,
  collapsed buildings), the two passes stop matching and **coherence** drops. Both are signals.
- **Backscatter (GCOV):** how bright the ground is to the radar. Open water is dark (a mirror that
  reflects the beam away), forests are bright (volume scattering), and burnt canopy darkens.

So the events worth looking for are those that **move the ground or change its surface over an
area larger than a few pixels** (40-160 m): earthquakes, volcanic eruptions, landslides and debris
flows, subsidence, large floods and large fires.

## Method

1. Breadth-first news searches per hazard type for the NISAR archive window (provisional products
   from late 2025; most tracks from June 2026).
2. For each event, record name, type, approximate latitude/longitude, date and a window size big
   enough to hold the whole footprint (quakes 30-40 km half-width, volcanoes 15 km).
3. Don't filter on data yet; that's step 2.

The result is [`pipeline/candidates.json`](../pipeline/candidates.json): 21 events, Jan-Nov 2026.
This list was assembled during pre-hackathon research (allowed under the Space Apps rules) and is
the seed for the build.

## Lessons from the research

- News coordinates are fine for quakes and volcanoes (big footprints) but **fail for fires**: a
  town name can be 20 km from the burn. For fires use official perimeters (WFIGS/NIFC in the US,
  FIRMS hotspots elsewhere).
- Floods need a radar pass **while the water is still there**. A flash flood that drains within a
  week can fall between passes.
