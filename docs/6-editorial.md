# Step 6: human editorial layer

**Goal:** a person, not the pipeline, decides which stories are published and how they are told.

Research produces candidates; some are weakly located, some only loosely tied to the boundary, and
captions written by a researcher are not always right for the page. The editor:

1. Opens `site/editor.html?e=<slug>` (or picks the event in the nav). Three tabs:
   - **Stories**: the researched stories (`research/stories/<slug>.json`).
   - **Media candidates**: the step 5b harvest (`site/events/<slug>/media.json`): thumbnail (open
     licence), pixelated preview (news/agency) or "no preview" with a link (expired Mapillary links),
     title, source, licence, tier, before/after, side hint, location confidence, "approximate
     location", before/after pair, and **what NISAR measured there**. Filters: showable only (open
     licence or pixelated preview), tier ≤ N, source, before/after, status.
   - **Unlocated**: relevant photos and news the harvest couldn't place in the frame (some were placed
     by a town outside it); thumbnails where openly licensed. They can be selected too: they publish
     as cards without a pin.
2. Marks each one *selected*, *rejected* or *undecided*, sets an order, and optionally writes a
   caption in their own words. Decisions autosave in the browser.
3. Downloads the decisions and commits them as `research/editorial/<slug>.json`:
   `{"boundary": ..., "items": {<story id>: {status, caption, order}}, "media": {<media id>: {status, caption, order}}}`.
4. Runs `.venv/bin/python -m pipeline.stories <slug>` to merge them into the published
   `stories.json`: stories as before, plus `media` (the selected media, ordered, with credit, licence,
   link, NISAR sample, `editor_caption`; `thumb_url` only for open licences) and `media_status` (every
   media decision, so the editor reloads them in a fresh browser).

The event page shows only selected stories. Until an editor has reviewed an event, it shows the
non-rejected candidates with an "unreviewed" note. Selected media appear under "Photos and reports"
with lettered pins in 3D (none for unlocated items), credit, licence and a link to the source; news and
agency pictures as their pixelated preview, "approximate location" items with a neutral colour and
that label.

Git is the audit trail: every editorial decision is a commit with an author and a date.

Guidance for editors:

- Lead with **one clear pair either side of the line**: hit and spared, close together, both
  located with high confidence.
- Prefer stories where NISAR's numbers agree with the account (a large local step at a broken
  road; quiet ground at an intact one). When they disagree, say so in the caption or drop it.
- An "approximate location" item can illustrate a town's story but never stands as one side of a
  hit/spared pair: it was placed by the town it names, not where it was taken.
- A before/after street-view pair at an anchor is a good substitute when no photo of the damage exists.
- Respect licences and people (see step 5). News and agency images appear only as pixelated previews
  linked to their source.

## Before shipping

- **Re-harvest street views on the day you ship**:
  `.venv/bin/python -m pipeline.media <slug>`, then `.venv/bin/python -m pipeline.stories <slug>`,
  for every event with selected Mapillary items. Mapillary thumbnail URLs are signed and expire, so
  a published street view eventually shows "preview unavailable". The Mapillary cache entry
  lasts a day, so a re-harvest fetches fresh URLs. Your decisions are keyed by item
  id, so they survive the re-harvest.
