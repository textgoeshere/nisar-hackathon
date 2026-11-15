"""Mexico City: the edge of the sinking ground, from the sinking rate zeroed on stable terrain."""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from .common import Event, dp_simplify, nan_smooth, noise_estimate, span_years
from .contours import contour

SLUG = "mexico-city-subsidence"
STORY_ID_FOCUS = "mexico-01"
FOCUS_HALF_CELLS = (40, 72, 90)                        # rows above / below and columns either side of the Tlahuac story
FOCUS_LABEL = "Tláhuac and Valle de Chalco, 14 km across"
SIGNAL_SCALE = 0.01                                    # cm a year per count in signal.i16
TILT_SCALE = 6e-6                                      # per year per count in line.u8 (255 = 1 in 650 a year)
NOISE_TILT = 1 / 5600.0                                # tilt on stable ground at the 95th percentile (the plan's figure)
EDGE_LEVEL = -5.0                                      # cm a year, relative to stable ground: where "sinking" starts
MIN_LINE_KM = 2.0
MIN_LINE_KM_DASHED = 4.0                                # a contour with no solid stretch must be at least this long to be kept
MIN_SOLID_KM = 0.5
SHORT = {
    "mexico-01": "Cracked street, Tláhuac", "mexico-02": "Santa Catarina ridge", "mexico-03": "Church below street",
    "mexico-04": "Cathedral sinking", "mexico-05": "Angel: 14 steps added", "mexico-06": "UNAM: stable lava",
}


def focus_cells(ev: Event):
    from .common import shown_stories
    s = next(i for i in shown_stories(ev) if i["id"] == STORY_ID_FOCUS)
    r, c = ev.cell(s["nisar"]["u"], s["nisar"]["v"])
    up, down, side = FOCUS_HALF_CELLS
    return r - up, r + down, c - side, c + side


def make(ev: Event) -> dict:
    yrs = span_years(ev.meta)
    valid = ev.layers["valid"] > 0
    rate = ev.layers["los"].astype(float) / 10.0 / yrs
    dem = ev.layers["dem"].astype(float)
    cut_dem = np.percentile(dem, 85)
    stable = (dem >= cut_dem) & valid
    offset = float(np.median(rate[stable]))
    rel = np.where(valid, rate - offset, 0.0)
    sig = np.clip(np.round(rel / SIGNAL_SCALE), -32768, 32767).astype(np.int16)

    sm_raw = nan_smooth(rate, valid, 1.0)
    okm = np.isfinite(sm_raw)
    gy, gx = np.gradient(np.where(okm, sm_raw, 0.0), ev.dx * 100.0)
    inner = ndimage.binary_erosion(okm, structure=np.ones((3, 3)))        # gradient needs all eight neighbours measured
    tilt = np.where(inner, np.hypot(gx, gy), 0.0)           # per year
    raster = np.clip(np.round(tilt / TILT_SCALE), 0, 255).astype(np.uint8)
    clipped = int((tilt / TILT_SCALE > 255).sum())

    # the edge: the EDGE_LEVEL contour of the smoothed rate; solid where the tilt across it is above the noise floor
    sm2 = nan_smooth(rate, valid, 1.5) - offset
    w, h = ev.extent_m
    pts_all, runs = [], []
    for ring in contour(sm2, EDGE_LEVEL):
        length_km = len(ring) * ev.dx / 1000 * 1.1
        if length_km < MIN_LINE_KM:
            continue
        xy = np.column_stack([ring[:, 1] + 0.5, ring[:, 0] + 0.5]) * ev.dx          # metres east, south of the NW corner
        s = dp_simplify(xy, 30.0)
        uu, vv = s[:, 0] / w, s[:, 1] / h
        t = ndimage.map_coordinates(tilt, [vv * ev.ny - 0.5, uu * ev.nx - 0.5], order=1, mode="nearest")
        m = (t >= NOISE_TILT).astype(int)
        seg_len = np.hypot(np.diff(xy_s := s, axis=0)[:, 0], np.diff(xy_s, axis=0)[:, 1])
        solid_km = float(seg_len[(m[:-1] & m[1:]) > 0].sum() / 1000)
        if length_km < MIN_LINE_KM_DASHED and solid_km < MIN_SOLID_KM:
            continue                                      # a short, weak squiggle: noise in the hills, not an edge
        pts_all.append(np.column_stack([uu, vv, m]))
    if not pts_all:
        raise RuntimeError("no edge found")
    lines_json = []
    runs_json = []
    for i, P in enumerate(pts_all):
        # a segment between two points is measured if both ends are
        pts = [[round(float(a), 5), round(float(b), 5), int(c)] for a, b, c in P]
        lines_json.append({"id": f"edge-{i + 1}", "name": f"edge of the ground sinking faster than {abs(EDGE_LEVEL):.0f} cm a year", "points": pts})
        cur = [pts[0]]
        for a, b in zip(pts[:-1], pts[1:]):
            flag = int(a[2] and b[2])
            if len(cur) > 1 and cur_flag != flag:
                runs_json.append({"measured": bool(cur_flag), "points": [p[:2] for p in cur]})
                cur = [cur[-1]]
            cur.append(b)
            cur_flag = flag
        if len(cur) > 1:
            runs_json.append({"measured": bool(cur_flag), "points": [p[:2] for p in cur]})
    n_pts = sum(len(P) for P in pts_all)
    meas_frac = float(np.mean(np.concatenate([P[:, 2] for P in pts_all])))
    line_json = {"lines": lines_json, "runs": runs_json, "sites": [],
                 "notes": "points: [u, v, measured 0/1]; a run is solid where the tilt across the edge is above the noise floor (1 in 5,600 a year), dashed elsewhere."}

    # check numbers on the Tlahuac row, 480 m east of the story, against the ridge just west of it
    from .common import shown_stories
    s = next(i for i in shown_stories(ev) if i["id"] == STORY_ID_FOCUS)
    ri, ci = ev.cell(s["nisar"]["u"], s["nisar"]["v"])
    sm_sig = sm_raw - offset
    west = float(np.nanmean(sm_sig[ri, ci - 16:ci - 1]))
    east480 = float(sm_sig[ri, ci + 6])
    tw = tilt[ri - 4:ri + 5, ci - 4:ci + 5]
    checks = {"offset_cm_yr": round(offset, 2), "stable_cells": int(stable.sum()), "dem_p85_m": float(cut_dem),
              "rate_ridge_west_cm_yr": round(west, 1), "rate_480m_east_cm_yr": round(east480, 1),
              "east_minus_ridge_cm_yr": round(east480 - west, 1), "tilt_near_story_1_in": int(round(1 / float(tw.max()))),
              "tilt_p95_valid_1_in": int(round(1 / float(np.percentile(tilt[okm], 95)))),
              "edge_km": round(n_pts * 0.2, 1), "solid_fraction": round(meas_frac, 2), "raster_clipped_cells": clipped,
              "signal_min_cm_yr": round(float(rel[valid].min()), 1), "signal_p01_cm_yr": round(float(np.percentile(rel[valid], 1)), 1)}
    st = ev.meta["stats"]
    headline = {"value": f"{abs(st['max_sinking_cm_yr']):.0f} cm a year", "caption": "the fastest the ground sinks here, along the radar's line of sight",
                "source": "NISAR (provisional), figure as on the main page", "u": st["fastest_uv"][0], "v": st["fastest_uv"][1]}
    signal = {"file": "signal.i16", "dtype": "int16", "scale": SIGNAL_SCALE, "unit": "cm a year",
              "label": "Sinking rate (negative = away from the satellite)", "valid": f"../../../events/{SLUG}/valid.u8",
              "positive": "toward the satellite (rising); negative = sinking, along the line of sight, so true vertical sinking is a little more",
              "noise": round(noise_estimate(rel, valid), 1),
              "noise_method": "robust scatter of differences between neighbouring measured cells (includes real gradients)",
              "zero": {"method": "median rate over the highest 15% of the terrain (dem >= p85)", "offset_cm_yr": round(offset, 2),
                       "dem_p85_m": float(cut_dem), "cells": int(stable.sum()),
                       "meaning": "signal = (los / 10 / years) minus offset_cm_yr; years = pair[1] - pair[0] in days / 365.25",
                       "years": round(yrs, 4), "pair": ev.meta["nisar"]["pair"]}}
    line = {"kind": "bend", "name": "the edge of the sinking ground", "raster": "line.u8", "raster_scale": TILT_SCALE,
            "raster_unit": "per year (tilt: change in sinking rate per metre; 1 in N a year with N = 1 / (count * raster_scale))",
            "threshold": NOISE_TILT, "threshold_raw": int(round(NOISE_TILT / TILT_SCALE)), "valid": "line-valid.u8", "vector": "line.json",
            "edge_level_cm_yr": EDGE_LEVEL,
            "measured_means": "the sinking rate changes faster across the edge than the noise on stable ground (tilt above 1 in 5,600 a year)",
            "dashed_means": "the edge is there (the ground passes the -5 cm a year mark) but the rate changes too gently across it for the radar to tell from noise",
            "caveat": ("Not a crack or a fault: the contour where the smoothed sinking rate reaches 5 cm a year relative to stable ground. "
                       "The sharp bend near the Tláhuac story is short (about 1 km); most of the contour is gentle (dashed). Rates are zeroed on "
                       "the highest 15% of the terrain, which leaves the Sierra de Santa Catarina reading about +2 cm a year, so the "
                       "zero is uncertain by about 2 cm a year. Solid rings around cinder cones are probably steep-slope artifacts, not sinking. Contours "
                       "shorter than 4 km with less than 0.5 km of solid line were dropped as noise. Motion is along the radar's slanted view.")}
    return dict(signal=signal, signal_array=sig, raster=raster, raster_valid=inner.astype(np.uint8), line=line, line_json=line_json,
                headline=headline, checks=checks, tilt=tilt, rel=rel, short=SHORT,
                lines_uv=[P[:, :2] for P in pts_all], extra_site_ids=[], focus_label=FOCUS_LABEL,
                credits=["Radar: NISAR L2 GUNW (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC (28 chained pairs, track 19)"])
