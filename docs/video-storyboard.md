# Thirty-second video storyboard

Working production brief, updated 15 November 2026. This is a storyboard, not a rendered video or an implemented recording page.

## Decisions

- **30 seconds; silent.** Captions carry the argument. Precise, accessible, selective rather than comprehensive.
- **Render from a page on the site**, then screen-record or export an MP4. Keep content and timing editable until capture. Default delivery: 1920 × 1080, 16:9, 30 fps, silent H.264 MP4; confirm the submission accepts these settings.
- **Kumamoto is the hero.** Anchor it to Ryuho Elementary School, story `kumamoto-01`, rather than three competing examples.
- **Explore and Create have equal prominence.** Create means the documented, developer-operated path from an event name to a details page, subject to coverage and an interpretable signal. A local/self-hosted creation UI is a stretch, not a prerequisite.
- **Claim:** we put measured ground change alongside sourced accounts from the people and places affected. Improved understanding is a hypothesis, not a demonstrated user-study result.
- Cuts by default. No camera motion except the short, explicitly specified reveal. No scrolling credits or thrown-card effect.
- Team/challenge/location become a compact identity strip, not a two-second reading test. Use the registered submission spelling: “Optical is nice but NISAR is nicer”; “Dancing With The SARs”; “Plymouth, UK”. Repo/product naming remains undecided; see [naming options](naming.md).

## Shot list — exactly 30 seconds

Quoted copy is the main caption, not narration. Secondary labels and credits are specified separately below. One main caption at a time; hold it steady.

| Time | Duration | Picture and action | Main on-screen copy | Purpose |
| --- | --- | --- | --- | --- |
| 00.0–04.0 | 4.0 s | Flat, tightly framed GSJ schoolyard photograph. Preserve enough school/building context to establish an everyday place; keep the broken ground and source arrows visible. Small place label: Kumamoto, Japan. No pan or zoom. | “What does ground change mean for everyday places?” | Human stakes and the question. |
| 04.0–06.5 | 2.5 s | Flat graphic of the two NISAR passes bracketing the earthquake, ending on the published GUNW input. Reuse the hero’s How it works content, not an unreadable screenshot of its paragraphs. | “Two NISAR passes reveal ground motion.” | NASA/ISRO data is central. |
| 06.5–09.0 | 2.5 s | Flat diagram: published phase/coherence → our corrected, masked map → located accounts. End on the Sentinel-2 before image at the same framing as the next shot. Icons carry the detail; no equations. | “We filter, map, and connect ground accounts.” | Distinguish our contribution from NASA/JPL processing. |
| 09.0–13.0 | 4.0 s | Tilt the flat optical image into the terrain view during 09.0–10.0 only; reveal the NISAR colour layer, then stop the camera. Keep the school location pinned. | “From orbit: the wider movement pattern.” | The spatial reveal, with a readable measurement legend. |
| 13.0–18.0 | 5.0 s | Same fixed map and pin; bring in one large, static schoolyard photo card beside it, connected to the location. Do not obscure the useful radar pattern. | “Field survey: the schoolyard was offset 94 cm.” | A sourced ground observation placed in its regional context. |
| 18.0–21.0 | 3.0 s | Cut to a 3 × 4 grid of the twelve event views. Prefer prepared stills; no twelve simultaneous camera moves. The hero occupies one tile. | “One pipeline. Twelve events.” | Breadth and repeatability, not twelve independent validations. |
| 21.0–26.0 | 5.0 s | Quiet, static layout: one map and its connected account, with room for the finding. | “We connect measured change to ground accounts.” | State the delivered capability. Secondary line: “Understanding benefit not yet tested.” |
| 26.0–30.0 | 4.0 s | Equal split screen; matching type size, contrast and area. Left: event-grid preview. Right: the creation guide, not a fictional app or a generic repo screenshot. Hold both destinations through the final frame. | Left: “EXPLORE · 12 events”. Right: “CREATE · Your event”. | Two equally important next actions. Qualifier on the Create side: “Guide · NISAR coverage required”. |

Do not add a separate conclusion, credits roll or title outside these intervals. The main captions total 52 words; place names, attribution and essential qualifiers add reading load too. If a silent phone-sized watch feels rushed, remove words rather than shrinking type.

## Hero evidence and scientific boundaries

**Why Kumamoto wins for this cut:** a regional radar pattern, an everyday place, and a visible, independently measured surface rupture. The schoolyard is more concrete than a general disaster montage. We do not need an unsupported “two homes, two outcomes” comparison.

- Event: `kumamoto-quake`, earthquake on **28 July 2026**, as recorded in [meta.json](../site/events/kumamoto-quake/meta.json). The event-spanning NISAR pair is **21 July–14 August 2026**; this is a before/after comparison, not live imagery or a recording of the earthquake happening.
- Ground anchor: `kumamoto-01` in [stories.json](../site/events/kumamoto-quake/stories.json), Ryuho Elementary School, Yatsushiro. Use that record’s location; it is approximately school-level positioning, not a surveyed coordinate for the exact crack.
- **94 cm is a ground-survey measurement of right-lateral offset**, not a NISAR pixel value, vertical displacement, or a measurement made by this team. [GSJ/AIST emergency field report, photo 10](https://www.gsj.jp/hazards/earthquake/kumamoto2026/kumamoto2026-02.html) explicitly gives the figure and the photograph date, **31 July 2026**. The report was checked on 15 November 2026.
- [Original schoolyard photograph](https://www.gsj.jp/hazards/earthquake/kumamoto2026/images/kumamoto2026-17.png). Use the original, not an enlarged pixelated preview. Credit the named GSJ/AIST authors and carry the source/terms in the linked credits. Mark a crop or translation as an adaptation if used.
- Radar legend: **“NISAR · line-of-sight motion”**; explain the colours as toward/away from the satellite, not upward/downward land movement. If showing the existing fringes, retain **“1 colour cycle = 10 cm”**. This is the project’s colour scale, not NISAR’s native phase-cycle displacement. Unmeasured areas must stay visibly unmeasured.
- The school photo and the NISAR layer provide complementary evidence at different scales and for different quantities. Do not present the photo as proof that the satellite measured the 94 cm offset, or infer building failure/casualties from the radar.

### Keep the new sideways-slip effect separate

The optional `?e=kumamoto-quake&slip=1` view is based on **field-survey offsets and GPS**, with an interpolated, exaggerated movement model. It is not a NISAR measurement. See [slip.md](slip.md) and [the model notes](../research/slip/NOTES.md).

**Default for this 30-second cut:** do not use the sideways-slip animation. Show terrain plus the NISAR colour layer, with LOS-as-height displacement disabled. In a purpose-built capture page, the existing viewer exposes `setLosExag(0)` and `setFringe(true)`; use an explicitly composed camera, not the unchanged event page’s default exaggerated motion. This preserves a 3D terrain reveal without depicting the radar’s slant-range measurement as physical uplift.

If the slip animation is substituted later, it needs a legible **“Survey + GPS model · motion exaggerated”** label and an explicit separation from the NISAR shot. It must replace existing time, not extend the runtime. Do not add it just because it is visually striking.

## Method, assets and attribution

- Compress How it works steps 1–3 into the first method shot: repeated passes and NASA/JPL’s published GUNW product. Do not imply we focused, co-registered or unwrapped the raw radar ourselves.
- Our shot selects from steps 3a, 4 and 5: reading the local window, correcting phase, filtering unreliable measurements, checking a quiet baseline, mapping the data, and locating sourced accounts. These are production notes, not a second paragraph to put on screen.
- Reuse `site/events/kumamoto-quake/{meta.json,stories.json,interferogram.png,optical-before.jpg,optical-after.jpg}` and the existing viewer. Use [site/events/index.json](../site/events/index.json) for the twelve-event count and grid; re-check the count before capture.
- Derive dates, names, credits and the selected story from the current data, not duplicated stale literals. Fixed editorial caption copy is fine; any numerical claim must have an identified source.
- Use a **static attribution strip** alongside the relevant imagery, not a scrolling ticker: NISAR/NASA/ISRO and ASF DAAC for radar; Copernicus Sentinel-2/ESA for optical; GSJ/AIST and the named authors for the field photograph; other displayed assets according to [CREDITS.md](../CREDITS.md). A generic strip does not replace asset-specific attribution requirements.
- The final page/guide must expose full credits through an accessible link. Settle the public repo name first, then use the final URLs; do not bake `nisar-hackathon` into the video as a permanent destination. The owner will change repository visibility; this document does not authorize doing that automatically.

## CREATE: minimum deliverable and stretch

The equally weighted Create CTA points directly to **[From an event name to a details page](create-event.md)**, not merely the repository root. It must explain the complete supported path:

1. Resolve a named event to a dated, sourced event and geographic extent.
2. Check NISAR coverage and choose an appropriate product/signal; explain when to stop or choose another event. Coverage alone does not guarantee an interpretable result.
3. Register the event and execute the supported processing route, with explicit prerequisites, credentials, manual edits and output files.
4. Add located, sourced ground accounts/media and make human editorial selections.
5. Generate the details page’s assets, update discovery/indexing as necessary, serve it locally and check credits and scientific caveats.

No claim that an arbitrary event name already works as a single CLI argument, that the existing static editor runs the data pipeline, or that no technical setup is needed. Release gate: someone follows the guide for a new event and reaches a working details page, or the limitations are made explicit before recording the CTA. An existing-event rebuild is a separate, weaker check.

**Stretch:** a local/server-hosted UI walking through event name → proposed date/extent → coverage decision → processing status → story review → details page. Reuse the documented pipeline. Keep Earthdata credentials server-side and out of pages, URLs and git. This is not a public, unauthenticated job runner, a requirement for the video, or an implemented feature. If it ships, the right CTA image may show the real flow instead of the guide.

## Capture and release checklist

- [ ] Build the recording page and its explicit 0–30 s timeline. This storyboard does not create that page.
- [ ] Preload images, data, fonts and the viewer before starting the clock; no network spinners or browser chrome in the capture.
- [ ] Fixed viewport and deterministic camera/scene state. Main captions roughly 52–64 px at 1080p; legends/qualifiers at least 28 px. Check actual phone-sized readability, not just font-size rules.
- [ ] Preserve no-data areas, source attribution, the distinction between LOS and field offset, and terrain-only height in the reveal.
- [ ] Read/watch once with no prior context and no audio. The viewer should identify the problem, our work, the result and both next actions.
- [ ] Verify the twelve-event grid and every displayed claim against current artifacts.
- [ ] Follow the creation guide through the promised path; do not label the stretch UI as shipped.
- [ ] After the owner publishes/renames the repository, verify both CTA destinations and full credits anonymously; update links, QR codes and repo screenshots together.
- [ ] Export exactly 30 seconds; inspect the complete playback, final hold, crop, frame rate and absence of audio. At 30 fps the timeline contains 900 frames.
