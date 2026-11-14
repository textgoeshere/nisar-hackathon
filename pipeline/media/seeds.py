"""Search seeds per event: research/media/seeds/<slug>.json.

Hand-written parts (from research/validation-sources.md and the stories' boundary text):
  anchors   tier 1: GNSS stations, field-measured offsets, graded damage points
  terms     tier 2: visible-displacement words in the local language and English
  places    tier 3: named places on the NISAR boundary
  context   tier 4: open queries

`resolve` fills coordinates for entries that only have a geocoding query `q` (Nominatim, bounded to
the grid) and adds `steps`: the strongest NISAR step locations found in the layers themselves
(and, for subsidence, the fastest-sinking spots), reverse-geocoded for a name. Resolved values are
written back into the seed file so the run is reproducible and reviewable.
"""
from __future__ import annotations

import json

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from .. import stories
from ..context import Grid
from . import geocode
from .common import ROOT, km, log

SEEDS = ROOT / "research" / "media" / "seeds"


def load(slug: str) -> dict:
    return json.loads((SEEDS / f"{slug}.json").read_text())


def save(slug: str, s: dict):
    (SEEDS / f"{slug}.json").write_text(json.dumps(s, indent=1, ensure_ascii=False) + "\n")


def step_spots(meta: dict, d, k=8, spacing_km=4.0) -> list[dict]:
    """Strongest local steps (5-95th percentile spread of motion within ~500 m) on a 640 m lattice."""
    g = meta["grid"]
    los = stories.layer(meta, d, "los", "<i2") / 10.0
    valid = stories.layer(meta, d, "valid", np.uint8).astype(bool)
    r, stride = max(1, int(500 / g["dx"])), 8
    a = np.where(valid, los, np.nan)
    win = sliding_window_view(a, (2 * r + 1, 2 * r + 1))[::stride, ::stride]
    flat = win.reshape(*win.shape[:2], -1)
    ok = np.isfinite(flat).mean(-1) >= 0.5
    with np.errstate(all="ignore"):
        step = np.nanpercentile(flat, 95, axis=-1) - np.nanpercentile(flat, 5, axis=-1)
    step = np.where(ok, step, -1)
    grid = Grid(g["epsg"], g["left"], g["top"], g["dx"], g["nx"], g["ny"])
    yrs = stories.span_years(meta)
    out = []
    for flat_i in np.argsort(step, axis=None)[::-1]:
        bi, bj = np.unravel_index(flat_i, step.shape)
        if step[bi, bj] <= 0 or len(out) >= k:
            break
        i, j = bi * stride + r, bj * stride + r
        lon, lat = _lonlat(grid, j, i)
        if any(km(lat, lon, o["lat"], o["lon"]) < spacing_km for o in out):
            continue
        s = float(step[bi, bj])
        out.append({"name": f"NISAR step {s / yrs if yrs else s:.0f} {'cm/yr' if yrs else 'cm'} within 500 m",
                    "lat": round(lat, 5), "lon": round(lon, 5), "conf": "low", "step_cm": round(s, 1)})
    return out


def fastest_spots(meta: dict, d, k=3, spacing_km=3.0) -> list[dict]:
    """Subsidence: the fastest-sinking places. As in build_event, "fastest" is the 0.5th percentile of
    the 5x5-median rate; anything faster is more likely unwrapping error, so we take spots between the
    0.5th and 2nd percentiles."""
    from scipy import ndimage
    g = meta["grid"]
    los = stories.layer(meta, d, "los", "<i2") / 10.0
    valid = stories.layer(meta, d, "valid", np.uint8).astype(bool)
    rate = np.where(valid, ndimage.median_filter(los, 5), np.nan) / stories.span_years(meta)
    lo, hi = np.nanpercentile(rate, [0.5, 2])
    band = np.where((rate >= lo) & (rate <= hi), rate, np.inf)
    grid = Grid(g["epsg"], g["left"], g["top"], g["dx"], g["nx"], g["ny"])
    out = []
    for flat_i in np.argsort(band, axis=None)[: int(np.isfinite(band).sum())]:
        i, j = np.unravel_index(flat_i, rate.shape)
        lon, lat = _lonlat(grid, j, i)
        if any(km(lat, lon, o["lat"], o["lon"]) < spacing_km for o in out):
            continue
        out.append({"name": f"NISAR fastest sinking {rate[i, j]:.0f} cm/yr", "lat": round(lat, 5), "lon": round(lon, 5),
                    "conf": "low", "rate_cm_yr": round(float(rate[i, j]), 1)})
        if len(out) >= k:
            break
    return out


def _lonlat(grid: Grid, j, i):
    from pyproj import Transformer
    t = Transformer.from_crs(grid.epsg, 4326, always_xy=True)
    x = grid.left + (j + 0.5) * grid.dx
    y = grid.top - (i + 0.5) * grid.dx
    return t.transform(x, y)


def resolve(slug: str, meta: dict, d, force=False) -> dict:
    s = load(slug)
    b = meta["grid"]["bounds_lonlat"]
    lang = s.get("lang", ["en"])[0]
    changed = False
    for group in ("anchors", "places"):
        for e in s.get(group, []):
            if e.get("lat") is not None or not e.get("q"):
                continue
            hit = geocode.forward(e["q"], b, lang)
            if hit:
                e |= {"lat": round(hit["lat"], 6), "lon": round(hit["lon"], 6), "geocoded": hit["name"][:120]}
                e.setdefault("conf", geocode.confidence(hit))
            else:
                e["geocoded"] = None
            changed = True
    if force or "steps" not in s:
        spots = step_spots(meta, d)
        if meta.get("kind") == "subsidence":
            spots += fastest_spots(meta, d)
        for p in spots:
            p["near"] = geocode.reverse(p["lat"], p["lon"], lang=lang)
        s["steps"] = spots
        changed = True
    if changed:
        save(slug, s)
    missing = [e["name"] for g in ("anchors", "places") for e in s.get(g, []) if e.get("lat") is None]
    if missing:
        log(f"  seeds: not geocoded: {missing}")
    return s


def centres(s: dict) -> list[dict]:
    """Search centres for the spatial harvesters, strongest tier first."""
    out = []
    for e in s.get("anchors", []):
        if e.get("lat") is not None:
            out.append({"name": e["name"], "lat": e["lat"], "lon": e["lon"], "tier": 1, "side": e.get("side")})
    for e in s.get("places", []) + s.get("steps", []):
        if e.get("lat") is not None:
            out.append({"name": e["name"], "lat": e["lat"], "lon": e["lon"], "tier": 3, "side": e.get("side")})
    return out
