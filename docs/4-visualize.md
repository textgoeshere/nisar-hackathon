# Step 4: 3D visualisation

**Goal:** let a non-specialist *see* the boundary in the ground, and find a person's story on it.

Open `site/event.html?e=<slug>` (locally: `cd site && python3 -m http.server 8000`).

## What is drawn

[`site/js/viewer.js`](../site/js/viewer.js) (three.js, one custom shader):

- **Terrain** from the DEM, mildly exaggerated so relief reads at a 60 km scale (to ~8% of the
  scene width, capped at ×5).
- **Ground motion as extra height.** NISAR's line-of-sight motion is added to the terrain,
  exaggerated by default until the 99th-percentile motion is ~5% of the scene width (thousands of
  times: centimetres would otherwise be invisible over tens of kilometres). The slider changes it.
- **Satellite image** (Sentinel-2 composite) draped on the surface, so viewers recognise towns,
  rivers and fields.
- **Fringes:** the motion rewrapped every 10 cm into a colour cycle, blended over the image only
  where coherence is good and motion was measured. Dense fringes = steep change in motion = the
  boundary.

## Honest time

NISAR sees the ground once before and once after. The before → after slider **interpolates**
between those two states: it shows *how much* the ground moved, not how fast or in what order.
The page says so next to the slider.

## Shared coordinates

Every layer is on the same grid, so a point is one (u, v) pair (east and south fractions)
everywhere. Story pins are HTML elements re-projected from (u, v) onto the 3D surface every frame,
so they stay put as you orbit or change the exaggeration.

## Check before every push

`scripts/shot.sh 'event.html?e=kumamoto-quake' out.png` renders the page headlessly with
software WebGL and saves a screenshot.
