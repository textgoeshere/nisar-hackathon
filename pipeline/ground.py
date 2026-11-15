"""Step 5c: split the "On the ground" context into facts, each tied to an area (a patch) of the event grid.

    .venv/bin/python -m pipeline.ground kumamoto-quake [more slugs...]

Input:  research/ground/<slug>.json   hand-curated facts, one per distinct claim about a region
        site/events/<slug>/meta.json  grid and NISAR layers
Output: site/events/<slug>/ground.json

Each research fact gives its area in the simplest form that fits the source text (lon/lat):

    {"line": [[lon, lat], ...], "width_km": 2}           a band centred on a trace
    {"line": [[lon, lat], ...], "offset_km": [1, 8]}     a band beside a trace: positive = left of the
                                                         line's direction (walk the line; left is left)
    {"circle": [lon, lat], "radius_km": 1.5}
    {"box": [west, south, east, north]}
    {"polygon": [[lon, lat], ...]}

We build the polygon in the grid's UTM projection, write it as GeoJSON (lon/lat) and in grid UV
(u west->east, v north->south, as the viewer and pipeline.stories use), and sample NISAR over every
pixel inside it: line-of-sight motion (mean, 5th/95th percentile and their spread, the **step**),
coherence and the share of measured pixels. Subsidence stacks report rates (cm/yr); flood and fire
events report backscatter change. A fact can carry a `check` the data must pass, e.g.
{"los_mean_cm": [10, 30]} or {"step_min": 10}; a failed check is printed and fails the test, so a fact
the data contradicts gets reworded or dropped rather than published.
"""
from __future__ import annotations

import json
import math
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.transform import from_origin
from scipy import ndimage

from .stories import layer, span_years

ROOT = Path(__file__).resolve().parent.parent
KINDS = {"boundary", "motion", "damage", "measurement", "context"}
SIDES = {"affected", "unaffected", None}


def _offset(pts: np.ndarray, d: float) -> np.ndarray:
    """Polyline `pts` (n x 2, metres) shifted `d` metres to its left, with mitred joins."""
    seg = np.diff(pts, axis=0)
    seg /= np.linalg.norm(seg, axis=1)[:, None]
    nrm = np.c_[-seg[:, 1], seg[:, 0]]                          # left normal per segment
    vn = np.vstack([nrm[:1], nrm[:-1] + nrm[1:], nrm[-1:]])
    vn /= np.linalg.norm(vn, axis=1)[:, None]
    cos = np.ones(len(pts))
    cos[1:-1] = np.maximum(0.3, np.einsum("ij,ij->i", vn[1:-1], nrm[1:]))
    return pts + vn * (d / cos)[:, None]


def _circle(c: np.ndarray, r: float, n: int = 48) -> np.ndarray:
    t = np.linspace(0, 2 * math.pi, n, endpoint=False)
    return c + r * np.c_[np.cos(t), np.sin(t)]


def ring_xy(shape: dict, fwd) -> np.ndarray:
    """The fact's area as a closed ring in projected metres."""
    if "circle" in shape:
        return _circle(np.array(fwd(*shape["circle"])), shape["radius_km"] * 1000)
    if "box" in shape:
        w, s, e, n = shape["box"]
        return np.array([fwd(w, n), fwd(e, n), fwd(e, s), fwd(w, s)])
    if "polygon" in shape:
        return np.array([fwd(*p) for p in shape["polygon"]])
    if "line" in shape:
        pts = np.array([fwd(*p) for p in shape["line"]], float)
        a, b = shape.get("offset_km") or (-shape["width_km"] / 2, shape["width_km"] / 2)
        if len(pts) == 1:
            raise ValueError("a line needs two or more vertices")
        return np.vstack([_offset(pts, a * 1000), _offset(pts, b * 1000)[::-1]])
    raise ValueError(f"unknown shape {shape}")


def stats(meta: dict, d: Path, mask: np.ndarray) -> dict:
    """NISAR over the patch."""
    out = {"pixels": int(mask.sum())}
    if not mask.any():
        return out
    L = meta["layers"]
    if "dbchange" in L:                                     # flood / fire: backscatter change
        ddb = layer(meta, d, "dbchange", "<i2")[mask] / 10.0
        ch = layer(meta, d, "change", np.uint8)[mask] / 255.0
        km2 = (meta["grid"]["dx"] / 1000) ** 2
        w = ddb[ddb != 0]
        if len(w):
            out["db_change_median"] = round(float(np.median(w)), 1)
        out["changed_pct"] = round(100 * float((ch > 0.5).mean()), 1)
        out["changed_km2"] = round(float((ch > 0.5).sum()) * km2, 2)
        return out
    los = layer(meta, d, "los", "<i2")[mask] / 10.0
    valid = layer(meta, d, "valid", np.uint8)[mask].astype(bool)
    coh = layer(meta, d, "coh", np.uint8)[mask] / 255.0
    out |= {"measured_pct": round(100 * float(valid.mean()), 1), "coherence_mean": round(float(coh.mean()), 2)}
    if "cohdrop" in L:
        drop = layer(meta, d, "cohdrop", np.uint8)[mask] / 255.0
        out["coherence_drop_pct"] = round(100 * float((drop > 0.3).mean()), 1)
    v = los[valid]
    if len(v) < 5:
        return out
    p5, p95 = np.percentile(v, [5, 95])
    out |= {"los_mean_cm": round(float(v.mean()), 1), "los_p5_cm": round(float(p5), 1),
            "los_p95_cm": round(float(p95), 1), "step_cm": round(float(p95 - p5), 1)}
    yrs = span_years(meta)
    if yrs:                                                 # subsidence: cumulative -> rate
        out |= {"rate_mean_cm_yr": round(float(v.mean()) / yrs, 1), "rate_fastest_cm_yr": round(float(p5) / yrs, 1)}
    return out


@lru_cache(maxsize=4)
def _newland(slug: str):
    """New-land events (pipeline.newland, GCOV backscatter on a 20 m grid): the gain mask and the
    new bright-at-sea cells, from the cached passes. None when the cache is missing."""
    from . import newland
    ev = next(e for e in json.loads((ROOT / "pipeline" / "candidates.json").read_text())["events"] if e["slug"] == slug)
    if not (newland.CACHE / f"{slug}-gcov.npz").exists():
        return None
    B = newland.fetch(ev)
    R = newland.analyse(ev, B, [])
    hh = np.nan_to_num(newland.gcov.db(B["hh"]), nan=-99) > -13
    pre = B["dates"] < ev["date"]
    sea = ~ndimage.binary_dilation(R["before"] | R["after"], iterations=3)
    new_at_sea = (hh[~pre].sum(0) >= 3) & (hh[pre].sum(0) <= 1) & sea
    dx = newland.DX
    tf = from_origin(B["x"][0] - dx / 2, B["y"][0] + dx / 2, dx, dx)
    return R["gain"], new_at_sea, tf, dx


def newland_stats(slug: str, ring: np.ndarray) -> dict:
    nl = _newland(slug)
    if nl is None:
        return {}
    gain, new_at_sea, tf, dx = nl
    m = rasterize([({"type": "Polygon", "coordinates": [np.vstack([ring, ring[:1]]).tolist()]}, 1)],
                  out_shape=gain.shape, transform=tf, dtype=np.uint8).astype(bool)
    return {"new_land_ha": round(float((gain & m).sum()) * dx ** 2 / 1e4, 1),
            "new_bright_cells_at_sea": int((new_at_sea & m).sum())}


def run_checks(check: dict, vals: dict) -> list[str]:
    """Return the failed checks. Keys: any `values` key: [lo, hi]; or step_min / measured_min / measured_max / coherence_max."""
    bad = []
    for k, want in (check or {}).items():
        if k == "step_min":
            ok = vals.get("step_cm", -1) >= want
        elif k == "measured_min":
            ok = vals.get("measured_pct", -1) >= want
        elif k == "measured_max":
            ok = vals.get("measured_pct", 101) <= want
        elif k == "coherence_max":
            ok = vals.get("coherence_mean", 9) <= want
        else:
            x = vals.get(k)
            ok = x is not None and want[0] <= x <= want[1]
        if not ok:
            bad.append(f"{k} {want}")
    return bad


def build(slug: str, write: bool = True) -> dict:
    d = ROOT / "site" / "events" / slug
    meta = json.loads((d / "meta.json").read_text())
    research = json.loads((ROOT / "research" / "ground" / f"{slug}.json").read_text())
    g = meta["grid"]
    fwd = Transformer.from_crs(4326, g["epsg"], always_xy=True).transform
    inv = Transformer.from_crs(g["epsg"], 4326, always_xy=True).transform
    W, H = g["nx"] * g["dx"], g["ny"] * g["dx"]
    transform = from_origin(g["left"], g["top"], g["dx"], g["dx"])
    facts, failed = [], {}
    for k, f in enumerate(research["facts"], 1):
        fid = f.get("id") or f"{slug}-g{k}"
        ring = ring_xy(f["shape"], fwd)
        u = (ring[:, 0] - g["left"]) / W
        v = (g["top"] - ring[:, 1]) / H
        if u.min() < 0 or u.max() > 1 or v.min() < 0 or v.max() > 1:
            print(f"  {fid}: patch runs off the frame; clipped to it")
            u, v = np.clip(u, 0, 1), np.clip(v, 0, 1)
            ring = np.c_[g["left"] + u * W, g["top"] - v * H]
        closed = np.vstack([ring, ring[:1]])
        geom = [({"type": "Polygon", "coordinates": [closed.tolist()]}, 1)]
        mask = rasterize(geom, out_shape=(g["ny"], g["nx"]), transform=transform, all_touched=True, dtype=np.uint8).astype(bool)
        if f.get("anchor"):
            anchor = fwd(*f["anchor"])
            au, av = (anchor[0] - g["left"]) / W, (g["top"] - anchor[1]) / H
        else:                                               # the patch pixel nearest its centroid
            inner = rasterize(geom, out_shape=mask.shape, transform=transform, dtype=np.uint8).astype(bool)
            iy, ix = np.nonzero(inner if inner.any() else mask)
            cy, cx = iy.mean(), ix.mean()
            n = np.argmin((iy - cy) ** 2 + (ix - cx) ** 2)
            au, av = (ix[n] + 0.5) / g["nx"], (iy[n] + 0.5) / g["ny"]
        vals = stats(meta, d, mask)
        if "new_land_ha" in meta["stats"]:                 # GCOV new land: the interferogram sees nothing here
            vals |= newland_stats(slug, ring)
        bad = run_checks(f.get("check"), vals)
        if bad:
            failed[fid] = bad
        lonlat = [[round(a, 5), round(b, 5)] for a, b in (inv(x, y) for x, y in closed)]
        facts.append({
            "id": fid, "title": f["title"], "text": f["text"], "kind": f["kind"], "side": f.get("side"),
            "patch": {"type": "Polygon", "coordinates": [lonlat]},
            "uv_polygon": [[round(float(a), 4), round(float(b), 4)] for a, b in zip(np.r_[u, u[:1]], np.r_[v, v[:1]])],
            "anchor": [round(float(au), 4), round(float(av), 4)],
            "values": vals, "source": f["source"]})
        nums = " ".join(f"{k2}={x}" for k2, x in vals.items() if k2 != "pixels")
        print(f"  {fid} {f['kind']:11} {str(f.get('side')):10} {'FAIL ' + str(bad) if bad else 'ok':6} {f['title'][:50]:50} {nums}")
    out = {"slug": slug, "facts": facts}
    if write:
        (d / "ground.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"{slug}: {len(facts)} facts" + (f", {len(failed)} failed checks" if failed else ""))
    return out | {"failed": failed}


if __name__ == "__main__":
    for s in sys.argv[1:]:
        build(s)
