# Sideways slip (optional 3D effect, Kumamoto)

**What it shows.** NISAR measures one thing: how much nearer to or farther from the satellite the ground got. At Kumamoto the
fault slipped sideways, so drawing that measurement as height misleads (the plain north-west of the fault is drawn lifted; its GPS
station moved north-east and sank). With slip on, the 3D view instead tears the ground along the surface rupture: as the
before/after slider runs, each side slides along the line by its share of a movement field, hugely exaggerated, and height goes
back to terrain only. The movement comes from tape measurements across the break (Geological Survey of Japan) and GPS stations,
not from NISAR, and the caption says so. Every number and sentence about it is read from `slip.json`; the page types none.

**Data.** `site/events/<slug>/slip.json` + `slip.i16`, written by `pipeline/slip.py`; the contract is in
`docs/slip-contract.md`. Only Kumamoto has them. An event without `slip.json` ignores the switch.

**The URL switch.**

| URL | Result |
| --- | --- |
| no `slip` | the page as before: `slip.js` is never loaded, no extra request, same shaders, same DOM |
| `&slip=1` | a ticked "Sideways slip" checkbox; the effect on, the camera looking down on the line, skycam off |
| `&slip=0` | the checkbox, unticked; the page looks as before until it is ticked (no reload) |
| `&t=0.5` | with `slip` only: slider held at 0.5, autoplay loop and skycam off (repeatable screenshots) |

**What "on" draws.** Every layer (image, terrain, fringes, coherence) is looked up through `slipSrc(p)`, the place the ground now at
`p` came from, so the mesh never stretches and the tear is a clean edge. The field is stored twice (each side extended two cells
across the line) and the side is picked from a signed distance to the line, so linear filtering never mixes the sides. The line is
drawn red on the ground (solid where the radar sees the step, dashed where only the survey traces it), a 5 km grid moves with the
ground, white arrows show each GPS station's measured movement at the same exaggeration, and the "Motion exaggeration" slider
becomes the slip exaggeration (default: the largest movement is 3% of the scene's width; capped at twice that, because beyond it
the ground folds over itself where the offset changes quickly along the line).

While slip is on: the Fringes box is unticked (the fringes drown the slide; it is restored when slip goes off, and still works), the
satellite image holds the "after" picture, so the only thing that changes with the slider is the ground moving, and with `slip=1`
the view opens on the stretch of the line that moved at least half the largest offset.

**Known rough edges.** The grid shows small steps away from the line where the model switches which piece of the line a point is
nearest to. Pins that sit on the line ride with one side. The 5 km grid suits the default exaggeration: at the cap, a broken
east-west grid line lands close to its neighbour.

**The hooks** (find them all with `git grep -n "slip:\|SLIP"`):

- `site/js/slip.js`: everything else (loading, textures, shader chunk, checkbox, caption, arrows, camera, CSS).
- `site/js/viewer.js`: `createViewer(…, { slip })`. Without the option the `#ifdef SLIP` blocks are dropped by the preprocessor,
  `S(p)` is `p`, and the fragment shader's lookups use `q = vUv`, so the shaders behave exactly as before. `project()` moves pins
  and labels with their ground.
- `site/js/event.js`: the `SLIP` line reads the URL; `slip.js` is imported only when it is not `null`; `mount()` adds the UI; the
  exaggeration slider defers to `slip.exag()` while slip is on.

**Making it a setting or the default.** All of it hangs off one line in `event.js`:

```js
const SLIP = params.has("slip") ? params.get("slip") !== "0" : null;   // null = not offered, else starts on/off
```

- Default for earthquakes: `const SLIP = params.has("slip") ? params.get("slip") !== "0" : meta.kind === "quake" ? true : null;`
  (events without `slip.json` still ignore it).
- Remembered setting: add `slip: true` to `settings`, use `… : settings.slip`, and save it in the checkbox handler
  (`slip.set` in `slip.js`, or a `change` listener on `#slip` in `event.js`).

**Removing it.** Delete `site/js/slip.js` and this page; in `event.js` delete the lines marked `slip:` and the
`if (slip?.on) return slip.exag();` guard; in `viewer.js` delete the lines marked `slip:` and the two `#ifdef SLIP … #endif`
blocks, then turn `S(p)` back into `p`, `q` back into `vUv` and drop `* B0` (or keep the `#define S(p) (p)` and `#define B0 1.0` lines: they are harmless). Delete `pipeline/slip.py`, `tests/test_slip.py`, `research/slip/`, `docs/slip-contract.md` and the event's `slip.json` and `slip.i16`.
