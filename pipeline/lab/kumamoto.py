"""Kumamoto: the surface rupture as a step in ground motion, drawn through the located field-survey sites."""
from __future__ import annotations

import json
import re

import numpy as np
from scipy import ndimage

from .common import SEEDS, Event, densify, noise_estimate

SLUG = "kumamoto-quake"
FOCUS_CELLS = (500, 670, 190, 420)                     # rows r0..r1, columns c0..c1: Hikawa to Yatsushiro
FOCUS_LABEL = "Hikawa to Yatsushiro, 18 km across"
RADIUS = 6                                             # cells: 480 m
MIN_COVER = 0.25                                       # share of the disc that must be measured
SCALE = 0.2                                            # cm per count in line.u8
THRESHOLD_CM = 10.0                                    # a step this big counts as "radar sees the line"
REACH_M = 1000.0                                       # a line point is measured if the raster reaches the threshold within this
SITE_CONF_ON_LINE = ("medium", "high")                 # the polyline runs only through sites located at least this well
SHORT = {
    "kumamoto-01": "School playground: 94 cm", "kumamoto-02": "Shrine path: 95 cm", "kumamoto-03": "Viaduct dropped",
    "kumamoto-04": "Paper mill: nine died", "kumamoto-05": "Mall: floor collapsed", "kumamoto-06": "Castle walls down",
    "kumamoto-07": "Mall Uki: ceiling fell",
}


SITE_SHORT = {"gsj-07": "Paddy: 115 cm", "gsj-08": "Road: 184 cm", "gsj-09": "Road to paddy: 120 cm",
              "gsj-11": "Ground dropped: 130 cm"}


def step_raster(ev: Event):
    """Max minus min of measured motion (cm) within a 480 m radius; (step, covered mask)."""
    valid = ev.layers["valid"] > 0
    los = np.where(valid, ev.layers["los"].astype(float) / 10.0, np.nan)
    yy, xx = np.mgrid[-RADIUS:RADIUS + 1, -RADIUS:RADIUS + 1]
    fp = (yy ** 2 + xx ** 2) <= RADIUS ** 2
    mx = ndimage.maximum_filter(np.where(valid, los, -1e9), footprint=fp)
    mn = ndimage.minimum_filter(np.where(valid, los, 1e9), footprint=fp)
    cnt = ndimage.convolve(valid.astype(float), fp.astype(float), mode="constant")
    covered = cnt >= MIN_COVER * fp.sum()
    return np.where(covered, mx - mn, 0.0), covered


def survey_sites(ev: Event):
    """Field-survey offsets from the research seeds: (located sites, unlocated names), in grid (u, v)."""
    seed = json.loads((SEEDS / f"{SLUG}.json").read_text())
    located, unlocated = [], []
    for a in seed["anchors"]:
        if a.get("kind") != "offset":
            continue
        label = re.sub(r"^GSJ (photo \d+|第\d+報): ", "", a["name"])
        m = re.search(r"photo (\d+)", a["name"])
        sid = f"gsj-{int(m.group(1)):02d}" if m else "gsj-" + re.sub(r"\W+", "-", a["name"])[:20].strip("-")
        cm = re.findall(r"(\d+)\s*cm", a["name"])
        item = {"id": sid, "label": label, "value": a["value"], "offset_cm": int(cm[-1]) if cm else None,
                "conf": a.get("conf"), "credit": "Geological Survey of Japan (GSJ) field photo, via the research seeds"}
        if "lat" in a:
            u, v = ev.lonlat_to_uv(a["lon"], a["lat"])
            located.append(item | {"u": float(u), "v": float(v)})
        else:
            unlocated.append(item)
    return located, unlocated


def order_along_fault(sites):
    """Order by projection on the principal axis of the sites, north-east end first."""
    P = np.array([[s["u"], s["v"]] for s in sites])
    c = P - P.mean(0)
    ax = np.linalg.svd(c, full_matrices=False)[2][0]
    if ax[1] < 0:                                       # make the axis point south (towards Yatsushiro)
        ax = -ax
    return [sites[i] for i in np.argsort(c @ ax)]


def make(ev: Event) -> dict:
    step, covered = step_raster(ev)
    valid = ev.layers["valid"] > 0
    raster = np.clip(np.round(step / SCALE), 0, 255).astype(np.uint8)
    clipped = int((step / SCALE > 255).sum())

    located, unlocated = survey_sites(ev)
    for s in located:
        r, c = ev.cell(s["u"], s["v"])
        s["radar_step_cm"] = round(float(step[r, c]), 1) if covered[r, c] else None
        s["radar_measured"] = bool(valid[r, c])
        s["on_polyline"] = s["conf"] in SITE_CONF_ON_LINE
    core = order_along_fault([s for s in located if s["on_polyline"]])
    verts = np.array([[s["u"], s["v"]] for s in core])
    w, h = ev.extent_m
    dense_m = densify(verts * [w, h], 160.0)            # a point every 160 m or less, vertices kept
    dense = dense_m / [w, h]

    # a point is measured when the raster reaches the threshold within REACH_M of it
    rr = int(round(REACH_M / ev.dx))
    yy, xx = np.mgrid[-rr:rr + 1, -rr:rr + 1]
    fp = (yy ** 2 + xx ** 2) <= rr ** 2
    near_max = ndimage.maximum_filter(np.where(covered, step, 0.0), footprint=fp)
    meas = []
    for u, v in dense:
        r, c = ev.cell(u, v)
        meas.append(bool(near_max[r, c] >= THRESHOLD_CM))
    pts = [[round(float(u), 5), round(float(v), 5), int(m)] for (u, v), m in zip(dense, meas)]
    runs, cur = [], [pts[0]]
    for p in pts[1:]:
        if p[2] == cur[-1][2]:
            cur.append(p)
        else:
            runs.append(cur)
            cur = [cur[-1][:2] + [p[2]], p]            # share the join point so runs touch
    runs.append(cur)
    # a run's flag is the flag of the points after its first (the shared join point carries the next flag)
    line_json = {
        "lines": [{"id": "rupture", "name": "the surface rupture, through the field-survey sites", "points": pts}],
        "runs": [{"measured": bool(r[-1][2]), "points": [[p[0], p[1]] for p in r]} for r in runs],
        "sites": [{k: (round(v, 5) if k in ("u", "v") else v) for k, v in s.items()} for s in located],
        "unlocated": unlocated,
        "notes": "points: [u, v, measured 0/1]; runs: the same line cut into solid (measured) and dashed (not measured) pieces that touch end to end.",
    }
    dense_len_km = float(np.hypot(*np.diff(dense_m, axis=0).T).sum() / 1000)
    frac_meas = float(np.mean(meas))

    # check numbers
    by_id = {s["id"]: s for s in located}
    checks = {"step_at_184cm_site": by_id["gsj-08"]["radar_step_cm"], "step_at_school_94cm": by_id["gsj-10"]["radar_step_cm"],
              "line_km": round(dense_len_km, 1), "measured_fraction": round(frac_meas, 2), "raster_clipped_cells": clipped,
              "sites_on_polyline": [s["id"] for s in core], "sites_off_polyline": [s["id"] for s in located if not s["on_polyline"]]}
    biggest = max((s for s in located if s["offset_cm"]), key=lambda s: s["offset_cm"])
    los = np.where(valid, ev.layers["los"] / 10.0, np.nan)
    signal = {"file": f"../../../events/{SLUG}/los.i16", "dtype": "int16", "scale": 0.1, "unit": "cm",
              "label": "Motion toward the satellite", "valid": f"../../../events/{SLUG}/valid.u8",
              "positive": "toward the satellite", "noise": round(noise_estimate(ev.layers["los"] / 10.0, valid), 1),
              "noise_method": "robust scatter of differences between neighbouring measured cells; includes real gradients, so it is an upper-ish bound"}
    line = {"kind": "rupture", "name": "the rupture", "raster": "line.u8", "raster_scale": SCALE,
            "raster_unit": "cm within 500 m", "threshold": THRESHOLD_CM, "threshold_raw": int(THRESHOLD_CM / SCALE),
            "valid": "line-valid.u8", "vector": "line.json", "measured_reach_m": REACH_M,
            "measured_means": f"the radar sees a step of {THRESHOLD_CM:.0f} cm or more in ground motion within 1 km of this part of the line",
            "dashed_means": "the line is drawn from the field survey only: the radar has no reading, or sees less than "
                            f"{THRESHOLD_CM:.0f} cm of step, near this part of the line",
            "caveat": ("The line is straight segments between field-survey sites, not a trace of the break. The sites are placed by "
                       "place name (location confidence in line.json), good to about 1 km. Sites located only by town name (confidence "
                       "'low') are listed but left off the line. The line is not extended beyond the surveyed sites. Where the plain "
                       "gave no radar signal the line is dashed.")}
    headline = {"value": f"{biggest['offset_cm']} cm", "caption": "sideways, across one road", "source": "field survey, GSJ",
                "u": round(biggest["u"], 5), "v": round(biggest["v"], 5)}
    return dict(signal=signal, raster=raster, raster_valid=covered.astype(np.uint8), line=line, line_json=line_json,
                headline=headline, checks=checks, located=located, step=step, covered=covered, short=SHORT, site_short=SITE_SHORT,
                lines_uv=[dense], extra_site_ids=_extra_sites(located, ev), focus_label=FOCUS_LABEL,
                credits=["Radar: NISAR L2 GUNW (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC",
                         "Field offsets: Geological Survey of Japan (GSJ), AIST, 2026 Kumamoto earthquake field photos"])


def _extra_sites(located, ev):
    """Field-survey sites that make the line legible and are not already a story (> 400 m from every story): offsets of 100 cm or more."""
    from .common import shown_stories
    out = []
    st = [(s["nisar"]["u"], s["nisar"]["v"]) for s in shown_stories(ev)]
    w, h = ev.extent_m
    for s in located:
        if (s["offset_cm"] or 0) < 100 or not s["on_polyline"]:
            continue
        if min(np.hypot((s["u"] - u) * w, (s["v"] - v) * h) for u, v in st) > 400:
            out.append(s["id"])
    return out
