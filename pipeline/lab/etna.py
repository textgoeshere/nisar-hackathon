"""Etna: the edge of the new lava, from where coherence was lost (cohdrop), kept only near the lava stories."""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from .common import Event, dp_simplify, noise_estimate, shown_stories
from .contours import contour

SLUG = "etna-eruption"
FOCUS_CELLS = (150, 250, 170, 300)                     # rows r0..r1, columns c0..c1: the Valle del Bove
FOCUS_LABEL = "Valle del Bove, 10 km across"
LAVA_STORIES = ("etna-01", "etna-02", "etna-03")       # stories that sit on or beside the new lava
LEVEL = 0.35                                           # coherence loss that counts as "the radar stopped matching itself"
STRONG = 0.5                                           # a patch whose loss never reaches this is drawn dashed
MIN_CELLS = 25                                         # smaller patches are dropped
NEAR_M = 2500.0                                        # patches must come within this of a lava story
SCALE = 1 / 255.0
SHORT = {"etna-01": "Lava front, Rocca Capra", "etna-02": "Rocca Capra ridge", "etna-03": "New vent, Monte Rittmann",
         "etna-04": "Zafferana: ash, not lava", "etna-05": "Voragine fissure"}


def make(ev: Event) -> dict:
    cd = ev.layers["cohdrop"].astype(float) / 255.0
    coh = ev.layers["coh"].astype(float) / 255.0
    raster = ev.layers["cohdrop"].astype(np.uint8)

    smooth = ndimage.gaussian_filter(cd, 0.7)
    mask = ndimage.binary_closing(smooth >= LEVEL, structure=np.ones((3, 3)))
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    peaks = ndimage.maximum(cd, lab, range(1, n + 1))
    w, h = ev.extent_m
    pins = [(s["nisar"]["u"] * w, s["nisar"]["v"] * h) for s in shown_stories(ev) if s["id"] in LAVA_STORIES]
    kept, dropped = [], []
    for i in range(n):
        if sizes[i] < MIN_CELLS:
            continue
        rr, cc = np.nonzero(lab == i + 1)
        x, y = (cc + 0.5) * ev.dx, (rr + 0.5) * ev.dx
        dmin = min(float(np.hypot(x - px, y - py).min()) for px, py in pins)
        rec = {"cells": int(sizes[i]), "peak": round(float(peaks[i]), 2), "row": int(rr.mean()), "col": int(cc.mean()),
               "near_story_m": int(dmin)}
        (kept if dmin <= NEAR_M else dropped).append((i + 1, rec))
    keep_ids = [i for i, _ in kept]
    region = np.isin(lab, keep_ids)
    field = np.where(ndimage.binary_dilation(region, iterations=2), smooth, 0.0)
    lines_json, runs_json, lines_uv = [], [], []
    k = 0
    for ring in contour(-field, -LEVEL):
        if len(ring) < 6:
            continue
        xy = np.column_stack([ring[:, 1] + 0.5, ring[:, 0] + 0.5]) * ev.dx
        s = dp_simplify(xy, 25.0)
        uu, vv = s[:, 0] / w, s[:, 1] / h
        cell_lab = lab[np.clip(((vv * ev.ny).astype(int)), 0, ev.ny - 1), np.clip((uu * ev.nx).astype(int), 0, ev.nx - 1)]
        # the patch this ring belongs to: the kept label seen most often within 2 cells of its points
        pk = 0.0
        for (j, rec) in kept:
            m_ = ndimage.binary_dilation(lab == j, iterations=2)
            hit = m_[np.clip(((vv * ev.ny).astype(int)), 0, ev.ny - 1), np.clip((uu * ev.nx).astype(int), 0, ev.nx - 1)].mean()
            if hit > 0.8:
                pk = max(pk, rec["peak"])
        flag = int(pk >= STRONG)
        k += 1
        pts = [[round(float(a), 5), round(float(b), 5), flag] for a, b in zip(uu, vv)]
        lines_json.append({"id": f"front-{k}", "name": "edge of a patch of lost coherence", "closed": True, "peak_coherence_loss": round(pk, 2), "points": pts})
        runs_json.append({"measured": bool(flag), "points": [p[:2] for p in pts]})
        lines_uv.append(np.column_stack([uu, vv]))
    line_json = {"lines": lines_json, "runs": runs_json, "sites": [], "patches_kept": [r for _, r in kept], "patches_dropped": [r for _, r in dropped][:30],
                 "notes": "points: [u, v, measured 0/1]; closed rings. Solid = a patch where coherence loss reaches 0.5; dashed = a patch that never does."}

    # footprint width near the lava-front story: the cross-flow width of the strong core
    checks = {"patches_kept": [r for _, r in kept], "patches_dropped_n": len(dropped), "rings": len(lines_json),
              "kept_cells": int(region.sum()), "kept_area_km2": round(float(region.sum()) * (ev.dx / 1000) ** 2, 2),
              "coh_at_front_story": None, "cohdrop_pct": [round(float(np.percentile(cd, p)), 2) for p in (50, 90, 99)]}
    for s in shown_stories(ev):
        r, c = ev.cell(s["nisar"]["u"], s["nisar"]["v"])
        checks[f"cd_{s['id']}"] = round(float(cd[max(0, r - 5):r + 6, max(0, c - 5):c + 6].max()), 2)
        if s["id"] == "etna-01":
            checks["coh_at_front_story"] = round(float(coh[r, c]), 2)
    headline = {"value": f"{ev.meta['stats']['coherence_drop_pct']}%", "caption": "of the scene lost its radar match (coherence drop), per the main page",
                "source": "NISAR (provisional)", "u": None, "v": None}
    # headline position: the strongest kept patch's centre
    best = max(kept, key=lambda t: t[1]["peak"] * t[1]["cells"])[1]
    headline["u"], headline["v"] = round((best["col"] + 0.5) / ev.nx, 5), round((best["row"] + 0.5) / ev.ny, 5)
    signal = {"file": f"../../../events/{SLUG}/coh.u8", "dtype": "uint8", "scale": SCALE, "unit": "coherence (0 to 1)",
              "label": "Radar coherence across the event", "valid": None, "positive": "1 = the surface looks the same in both passes",
              "noise": round(noise_estimate(coh * 255) / 255, 2),
              "noise_method": "robust scatter of differences between neighbouring cells (includes real gradients)"}
    line = {"kind": "front", "name": "the edge of the new lava", "raster": "line.u8", "raster_scale": SCALE,
            "raster_unit": "coherence lost, 0 to 1 (a copy of cohdrop.u8)", "threshold": LEVEL, "threshold_raw": int(round(LEVEL * 255)),
            "valid": None, "vector": "line.json",
            "measured_means": "a patch where coherence loss reaches 0.5: the radar clearly stopped matching itself there",
            "dashed_means": "a patch of coherence loss above 0.35 that never reaches 0.5: possible lava, possible noise",
            "caveat": ("Coherence loss is not lava: snow, ash, vegetation and steep slopes also break the match. The outline is the 0.35 contour of "
                       "the coherence loss (lightly smoothed), kept only for patches of 25 cells or more within 2.5 km of the three stories that sit "
                       "on the new lava. Dropped: the radial streaks on the north-east and south flanks, which follow gullies and are not tied to any "
                       "story. The outline covers the vent area at Monte Rittmann and the flow's upper reach (about 4.4 km long, loss up to 0.8) but "
                       "does not reach the lava-front story: the faint tongue toward it (a few cells, about 400 m wide, loss only 0.2 to 0.4) is "
                       "below the 0.35 contour, so that story is off the line by about 1.4 km.")}
    return dict(signal=signal, raster=raster, raster_valid=np.ones(raster.shape, np.uint8), line=line, line_json=line_json,
                headline=headline, checks=checks, short=SHORT, lines_uv=lines_uv, extra_site_ids=[], focus_label=FOCUS_LABEL,
                credits=["Radar: NISAR L2 GUNW (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC"], region=region, cd=cd, coh=coh)
