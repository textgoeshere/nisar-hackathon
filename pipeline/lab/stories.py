"""Stories for lab.json: the event page's selection, each with its distance to the line, a radar sentence and a preset cut."""
from __future__ import annotations

import math
import re

import numpy as np
from scipy import ndimage

from .common import Event, make_cut, nearest_line, shown_stories

ON_LINE_M = 600.0
CUT_M = 5000.0


def _med(arr, valid, r, c, k=2):
    win = (slice(max(0, r - k), r + k + 1), slice(max(0, c - k), c + k + 1))
    v = arr[win][valid[win]]
    return float(np.median(v)) if len(v) >= 5 else None


def _disc_max(arr, r, c, rad):
    yy, xx = np.mgrid[-rad:rad + 1, -rad:rad + 1]
    fp = (yy ** 2 + xx ** 2) <= rad ** 2
    win_r = slice(max(0, r - rad), r + rad + 1)
    win_c = slice(max(0, c - rad), c + rad + 1)
    sub = arr[win_r, win_c]
    fpc = fp[(win_r.start - (r - rad)):(win_r.start - (r - rad)) + sub.shape[0], (win_c.start - (c - rad)):(win_c.start - (c - rad)) + sub.shape[1]]
    return float(sub[fpc].max())


def radar_sentence(ev: Event, prod: dict, uv) -> tuple[str, bool]:
    """One plain sentence about what the radar saw at (u, v); also whether it measured at that spot."""
    r, c = ev.cell(*uv)
    slug = ev.slug
    valid = ev.layers["valid"] > 0
    if slug == "kumamoto-quake":
        los = ev.layers["los"] / 10.0
        if valid[r, c]:
            step = prod["step"][r, c] if prod["covered"][r, c] else None
            m = float(los[r, c])
            s = f"Radar here: {abs(m):.1f} cm {'toward' if m >= 0 else 'away from'} the satellite"
            if step is not None:
                s += f"; up to {step:.0f} cm of change within 500 m"
            return s + ".", True
        return "No radar reading at this spot (the surface changed or the signal was lost).", False
    if slug == "mexico-city-subsidence":
        rel = prod["rel"]
        if valid[r, c]:
            x = _med(rel, valid, r, c)
            t = _disc_max(prod["tilt"], r, c, 6)
            s = f"Radar here: {x:+.1f} cm a year relative to stable ground"
            if t > 0:
                s += f"; the steepest change within 500 m is 1 in {round(1 / t, -2):,.0f} a year"
            return s + ".", True
        return "No radar reading at this spot (the surface changed or the signal was lost).", False
    coh, cd = prod["coh"], prod["cd"]
    mx = float(cd[max(0, r - 5):r + 6, max(0, c - 5):c + 6].max())
    s = f"Radar here: coherence {coh[r, c]:.2f}"
    s += "; the radar lost its match" if coh[r, c] < 0.2 else ""
    return s + f". Coherence loss reaches {mx:.2f} within 400 m.", bool(coh[r, c] >= 0.2)


def _digits(s: str) -> set[str]:
    return set(re.findall(r"\d+", s))


def build(ev: Event, prod: dict) -> list[dict]:
    lines = prod["lines_uv"]
    out = []
    items = shown_stories(ev)
    entries = []
    for k, it in enumerate(items):
        entries.append(dict(src=it, n=k + 1, kind="story", id=it["id"], title=it["title"], short=prod["short"][it["id"]],
                            u=it["nisar"]["u"], v=it["nisar"]["v"], side=it.get("side"), source_text=" ".join(str(it.get(f, "")) for f in ("title", "place", "caption", "what_it_shows"))))
    for sid in prod.get("extra_site_ids", []):
        s = next(x for x in prod["located"] if x["id"] == sid)
        entries.append(dict(src=None, n=None, kind="site", id=f"site-{sid}", title=s["label"], short=prod["site_short"][sid], u=s["u"], v=s["v"], side="affected",
                            source_text=f"{s['label']} {s['value']}", survey=s))
    for e in entries:
        if len(e["short"]) > 28:
            raise ValueError(f"short label too long: {e['short']!r}")
        extra = _digits(e["short"]) - _digits(e["source_text"])
        if extra:
            raise ValueError(f"number in short label not found in the story text: {e['short']!r} {extra}")
        u, v = e["u"], e["v"]
        near = nearest_line(ev, lines, u, v) if lines else None
        radar, measured = radar_sentence(ev, prod, (u, v))
        rec = {"id": e["id"], "n": e["n"], "kind": e["kind"], "title": e["title"], "short": e["short"], "side": e["side"],
               "u": round(u, 5), "v": round(v, 5), "measured_at_spot": measured}
        if near:
            dist, q, tan, _ = near
            on = dist <= ON_LINE_M
            centre = (u, v) if on else q
            rec |= {"on_line": on, "distance_m": int(round(dist, -1)) if dist >= 100 else int(round(dist)),
                    "nearest_line_uv": [round(q[0], 5), round(q[1], 5)], "cut": make_cut(ev, centre, tan, CUT_M),
                    "cut_through": "the story" if on else "the nearest point of the line"}
        else:
            rec |= {"on_line": None, "distance_m": None, "nearest_line_uv": None, "cut": None, "cut_through": None}
        rec["radar"] = radar
        if e["kind"] == "site":
            s = e["survey"]
            rec |= {"source": "field survey, GSJ", "value": s["value"], "location_confidence": s["conf"]}
        out.append(rec)
    return out
