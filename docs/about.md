# groundstory presentation — playback and capture

[Watch the presentation](https://textgoeshere.github.io/nisar-hackathon/about.html).
Feedback revision: 15 November 2026. Product name: **groundstory**. URLs retain the existing repository slug.

## Implementation and cut

- Page/style: `site/about.html`, `site/about.css`.
- Playback and composition: `site/js/about.js`.
- Pure clock: `site/js/about-timeline.mjs`; exactly 30 s / 900 authored frames at 30 fps.
- Twelve-event gallery: `site/js/about-gallery.js`; one scissored WebGL canvas, twelve actual
  80-segment DEM meshes and existing radar/optical layers, not rotating flat screenshots.
- The existing viewer/slip shaders provide the hero and future-work prototype. The viewer's new
  optional `resize()` / `renderOnce()` methods let the presentation avoid rendering hidden terrain;
  its ordinary event-page auto-start behavior is unchanged.

Current timings: opening 0–4; repeated passes 4–5.5; four-stage contribution 5.5–7;
optical → stories → radar interpretation → 3D 7–14.5; rotating event gallery 14.5–20;
findings/future split 20–26; equal Explore/Create actions 26–30. [Shot-by-shot copy](video-storyboard.md).

The gallery initially shows all twelve terrains, then cycles six event types with explicit 160 ms fades.
Unselected terrains remain rotating at 18% opacity. Camera pose, entry animations, filters and slip are
functions of timeline time, so seeking does not depend on previous playback. The final frame holds.

## Viewing and recording

- The header's **Play the 30s video** button restarts playback beside the groundstory wordmark.
  There is no separate “The project, in 30 seconds” introductory block.
- Play/Pause, Replay, Restart, scrubber and Fullscreen remain. Keyboard: Space play/pause;
  ←/→ seek one second; R restart; F fullscreen. Inputs/buttons retain their native keys.
- Backgrounding the tab pauses playback. A paused presentation has no private render loop.
- Wait for **Ready**: photos, event data, twelve terrains and the survey/GPS model must all load.
  Failures expose reload and readable content instead of starting an incomplete presentation.
- [Clean capture](https://textgoeshere.github.io/nisar-hackathon/about.html?capture=1) hides page furniture
  and letterboxes the stage. Move the pointer to reveal controls; Space starts with controls hidden.
- Capture at a **1920 × 1080 viewport**. The page is silent. This is not a prerecorded/exported MP4.
- `?t=20` opens a paused deterministic frame. `?autoplay=1` starts after readiness unless `t` is set.
- `window.about.ready`, `about.state()`, `about.seek(seconds)`, `about.play()` and `about.pause()`
  remain the small capture interface. State includes the active gallery kind and fade progress.
- There are 900 authored 30 fps frames (`i/30`, i=0…899); real browser scheduling is not a certified
  constant-frame-rate encoding. Final screen recording/export remains a separate production step.

## Scientific boundaries and sources

- Hero/gallery height is terrain only, never LOS uplift. Gallery relief ×1–5, independent tile scales;
  decorative plinths do not encode geology. No-data is not proof of no change.
- GSJ photos 10–12: school, junction, shrine. Additional images load directly from GSJ; full attribution,
  terms and CSS adaptation statements are in the page, [photo notes](../site/about/README.md),
  [photo metadata](../site/about/photo-source.json) and canonical [credits](../CREDITS.md).
- The school’s 94 cm / shrine’s 95 cm are field-survey offsets, not satellite pixel values.
- Etna's ~2.5 km² mapped lava footprint is partial. The ~26.5 ha shoreline gain is **Anak Krakatau**,
  not Etna, and is a radar estimate rather than complete independent validation.
- Technical connection of stories and radar is demonstrated; improved comprehension is not user-tested.
- The right-hand future-work animation is a survey + GPS model, exaggerated and imperfect. Testing
  NISAR-derived sideways offsets is future work; the current model is not that result.

## Public documents

CREATE opens [the public operator guide](https://textgoeshere.github.io/nisar-hackathon/create.html),
not a creation app. It still requires source access, credentials, technical setup and review to operate.
A fresh end-to-end new-event build is not claimed. Full [credits](https://textgoeshere.github.io/nisar-hackathon/credits.html)
and the guide are generated from canonical Markdown, not hand-edited HTML:

    node scripts/render-public-docs.mjs [path/to/marked.esm.js]

The title, visible branding and generated OG site name are groundstory across the public pages.
Repository/source URLs are not renamed.

## Verification — this revision

The stopped extended QA sweep was **not resumed**. Focused checks only:

- JavaScript syntax and whitespace inspection passed.
- **12 targeted timeline checks passed** (about 0.1 s): exact cuts/all 900 frames, shorter method shots,
  ordered layer reveal, six type highlights and deterministic fades, six-second split-screen model,
  final hold, reversible seeking and zero LOS-as-height.
- Public-document renderer's built-in link/HTML/code/heading/table checks passed.
- Browser integration check: pending publication. The managed browser's policy does not allow the
  loopback preview, so no local-browser visual result is claimed.

Earlier-release full playback, phone-layout and 37-test results are historical (recorded at `f836df9`);
they are not new proof for this changed cut. No broad Python suite, real-phone GPU/touch matrix,
Safari/native fullscreen, constant-frame-rate export, new-event build or user comprehension study
was performed for this revision.
