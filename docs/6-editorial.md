# Step 6: human editorial layer

**Goal:** a person, not the pipeline, decides which stories are published and how they are told.

Research produces candidates; some are weakly located, some only loosely tied to the boundary, and
captions written by a researcher are not always right for the page. The editor:

1. Opens `site/editor.html?e=<slug>`. Each candidate shows its photo (if licensed), the research
   summary, its source and licence, and **what NISAR measured at that spot**.
2. Marks each one *selected*, *rejected* or *undecided*, sets an order, and optionally writes a
   caption in their own words. Decisions autosave in the browser.
3. Downloads the decisions and commits them as `editorial/<slug>.json`.
4. Runs `.venv/bin/python -m pipeline.stories <slug>` to merge them into the published
   `stories.json`.

The event page shows only selected stories. Until an editor has reviewed an event, it shows the
non-rejected candidates with an "unreviewed" note.

Git is the audit trail: every editorial decision is a commit with an author and a date.

Guidance for editors:

- Lead with **one clear pair either side of the line**: hit and spared, close together, both
  located with high confidence.
- Prefer stories where NISAR's numbers agree with the account (a large local step at a broken
  road; quiet ground at an intact one). When they disagree, say so in the caption or drop it.
- Respect licences and people (see step 5).
