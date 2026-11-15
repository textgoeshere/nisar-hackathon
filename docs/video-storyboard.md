# groundstory — 30-second presentation

Feedback revision, 15 November 2026. Implemented at [about.html](../site/about.html).
The product name is **groundstory**; the repository/Pages URL is unchanged. This remains an HTML
presentation, not an exported MP4. [Playback and capture](about.md).

## Current cut

Exactly 30 seconds, silent, 1920 × 1080 composition. Default paused. Final frame holds.
The header puts **Play the 30s video** beside the wordmark; there is no separate introductory heading.
All animation is driven by the seekable timeline, not uncontrolled CSS animation clocks.

| Time | Picture and action | Main message |
| --- | --- | --- |
| 0–4 | Schoolyard background drifts gently; two more GSJ field photos animate into the composition. Small place label and source strip. | Using NISAR orbital radar to understand human stories on the ground. |
| 4–5.5 | Animated repeat-pass diagram, moving echo waves and three progressively introduced signal cards. Includes the published-product explanation from How it works. One second shorter than the previous cut. | Repeated passes. Different signals. Ground evidence. |
| 5.5–7 | Four boxes: Find data → Clean & map → Ground stories → Visualize. Four short work bullets build underneath each. One second shorter than the previous cut. | Find. Process. Contextualize. Visualize. |
| 7–14.5 | Start top-down on Sentinel-2; overlay school and shrine accounts; remove those and introduce radar-interpretation cards; then smoothly tilt/orbit into the 3D terrain. | Bring it together to visualize. |
| 14.5–20 | Twelve actual DEM terrains rotate simultaneously. All are visible for 1.5 s, then highlight earthquakes, volcanoes, fires, floods, landslides and subsidence at 0.6 s each. Unselected scenes fade to 18%, but keep rotating. End with all visible again. | One repeatable pipeline. Many kinds of change. |
| 20–26 | Persistent split: **Findings** at left; **Future work** at right. The survey/GPS slip animation stays inside the right-hand panel, with its source and exaggeration continuously labelled. | Technical hypothesis support; partial volcanic results; combined techniques. Next: test radar-derived sideways motion. |
| 26–30 | Equal Explore and Create actions, retained through the final frame. The final Explore preview alone uses static thumbnails. | Explore the twelve events / Create your event using the operator guide. |

## Four stages and their animated bullets

1. **Find data:** research the event; check NISAR coverage; pick before + after; stream local windows.
2. **Clean & map:** correct the ionosphere; mask unreliable pixels; check a quiet baseline; align terrain + optical.
3. **Ground stories:** find primary sources; locate each account; sample radar at the site; human editorial review.
4. **Visualize:** drape Sentinel-2; colour the radar change; pin stories + explainers; reuse across event types.

The quick bullets are an overview, not a claim that all can be carefully read in 1.5 seconds.
The readable transcript and operator guide carry the detail.

## Evidence and wording

- The GSJ/AIST schoolyard, junction and shrine photos are report No. 5, photos 10–12. Named authors,
  original image links, compatible CC BY 4.0 terms and the CSS adaptation notice remain accessible.
  See [photo notes](../site/about/README.md).
- **94 cm school / 95 cm shrine** are independent field-survey offsets. They are not NISAR pixel values.
- Kumamoto's 30.7 cm event spread versus 6.9 cm quiet-baseline spread and 59% mask coverage come from
  its current metadata. They describe regional LOS measurements and processing coverage, not building damage.
- **Etna:** about **2.5 km²** of mapped lava-associated surface change, only a partial footprint.
  The already-incoherent lower flow is missed. This is not newly created coastline.
- **Anak Krakatau:** **26.5 ha** of radar-derived shoreline gain using dual-look, multi-pass GCOV,
  cross-checked with Sentinel-2. The official reported **32.8 ha** is provisional, and no published
  comparison polygon was found. Do not call the area ratio spatial accuracy or claim complete validation.
- **Hypothesis:** the technical connection between accounts and radar is demonstrated. A benefit to
  user understanding has not been tested. No comprehension-study success is implied.
- Dual-look shoreline differencing and sampling radar at located accounts are techniques combined in
  this project. No claim of global methodological novelty.
- **Future work:** recover sideways motion from radar offsets. The current animation uses a GSJ survey
  + GPS model, imperfect and exaggerated (factor derived from the model, currently ×1,300), not NISAR-derived
  sideways motion. The white arrow is the measured GPS step, not the model prediction. Grid: 5 km.
- Height in the hero and gallery is **terrain only**. LOS remains colour, never fictitious uplift.
  Gallery relief uses the existing ×1–5 exaggeration rule; plinths are illustrative, not geology.
  Tile spatial scales differ. Uncoloured/no-data cells do not prove unchanged ground.

## Delivery boundaries

- The gallery uses one shared WebGL context for all twelve real 3D scenes, not twelve separate renderers
  and not flat images rotated with CSS. Only the active shot is rendered; pausing releases animation work.
- Every required asset loads before playback. Two additional GSJ photographs currently load from their
  original public URLs; a source failure shows the reload/read-instead path rather than silently omitting them.
- Keep the team strip: Dancing With The SARs · Optical is nice but NISAR is nicer · Plymouth, UK.
- CREATE remains the documented developer workflow, conditional on coverage, setup and review. It is not
  an all-in-one creation app, and a new-event end-to-end run is not claimed.
- A constant-frame-rate MP4, native-device/fullscreen certification, independent comprehension study and
  fresh new-event pipeline build are separate work. Do not restart the stopped extended test sweep.
