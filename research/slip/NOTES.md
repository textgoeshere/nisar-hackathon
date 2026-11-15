# Kumamoto sideways slip: notes on the model

`python -m pipeline.slip kumamoto-quake` reads `kumamoto-quake.json` (GPS steps, with where each number came from), the line and
survey sites in `site/lab/data/kumamoto-quake/line.json`, and the grid in `site/events/kumamoto-quake/meta.json`.

## Choices (the survey and GPS do not settle these)
- **Sites used:** the 9 on-polyline, right-lateral ones. `gsj-11` (a 130 cm vertical step) and the sites placed only by town name are out.
- **Between sites:** straight interpolation of the taped offset along the line.
- **Ends:** smoothstep to zero over the last 2 km (`TAPER_M`). The sites within 2 km of an end (23, 25 and 17 cm) are therefore shown smaller than taped.
- **Direction:** the line's heading averaged over +-2.5 km (`SMOOTH_M`). Less smoothing fits J093's direction better (J093 is 10 degrees off with 2.5 km); more makes it worse.
- **Split and fade:** fitted to the 7 GPS stations that sit alongside the drawn line (G071 is 2.8 km past the end: reported, not fitted).
  Share of the offset taken by the north-west side, and one fade length shared by both sides. Both an exponential and an arctangent
  shape were fitted; they are nearly tied (9.1 and 9.2 cm RMS) and the smaller miss is kept. Variants with a fade length per side or
  a fitted reach gain under 1 cm and pin a parameter on its limit, so they are listed in `model.params.tried_rms_cm` and not used.
- **Far field:** a point far from the line sees the offset averaged over +-(its distance from the line) along the line (`REACH = 1`).
  Without this, the stations 17 to 34 km away project onto the ends of the line, where the offset is zero, and the fade cannot reach them.
  It does not extend the line: beyond a tip the field is still near zero close to the tip and only grows with distance.

## Known limits
- No change of sign beyond the tips (a finite fault gives the opposite sense off its ends along the strike): J701 (north-east of the tip, on the "north-west" side by the rule) comes out about 5 cm the wrong way.
- Vertical movement is not modelled (J093 sank 33 cm). `up_cm` is passed through for the page to quote.
- The GPS steps are the median of 7 days either side of the event, so they include early afterslip.
