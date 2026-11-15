"""Loader check for site/lab/data/: opens every file each lab.json references and tests the contract.

  python -m pipeline.lab.check [slug ...]      (exit status 1 if anything is wrong)
"""
from __future__ import annotations

import json
import sys

import numpy as np
from PIL import Image

from .common import OUT, cut_crosses, load_event, shown_stories

SLUGS = ["kumamoto-quake", "mexico-city-subsidence", "etna-eruption"]
ROAD_CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary", "minor"]


def check(slug: str) -> list[str]:
    errs: list[str] = []
    d = OUT / slug
    try:
        lab = json.loads((d / "lab.json").read_text())
    except Exception as e:                                          # noqa: BLE001
        return [f"{slug}: cannot read lab.json: {e}"]
    g = lab["grid"]
    nx, ny = g["nx"], g["ny"]
    ev = load_event(slug)
    if g != ev.grid:
        errs.append("grid differs from the event's meta.json")

    def err(msg):
        errs.append(msg)

    def uv_ok(u, v, what):
        if not (isinstance(u, (int, float)) and isinstance(v, (int, float)) and 0 <= u <= 1 and 0 <= v <= 1):
            err(f"{what}: (u, v) = ({u}, {v}) outside 0..1")

    # files referenced by "files"
    for k, f in lab["files"].items():
        if not (d / f).is_file():
            err(f"files.{k}: {f} missing")
    # rasters
    def raster(rel, dtype):
        p = (d / rel).resolve()
        if not p.is_file():
            err(f"missing {rel}")
            return None
        a = np.fromfile(p, dtype)
        if a.size != nx * ny:
            err(f"{rel}: {a.size} values, grid needs {nx * ny}")
            return None
        return a.reshape(ny, nx)
    sig = lab["signal"]
    sa = raster(sig["file"], np.dtype(sig["dtype"]).newbyteorder("<"))
    if sig.get("valid"):
        raster(sig["valid"], np.uint8)
    lr = raster(lab["line"]["raster"], np.uint8)
    if lab["line"].get("valid"):
        raster(lab["line"]["valid"], np.uint8)
    for k, size in (("hillshade", (2 * nx, 2 * ny)), ("sea", (nx, ny))):
        im = Image.open(d / lab[k]["file"])
        if im.size != size or im.mode != "L":
            err(f"{lab[k]['file']}: {im.size} {im.mode}, expected {size} L")
    if sa is not None and sig["dtype"] == "int16" and not np.isfinite(sa.astype(float) * sig["scale"]).all():
        err("signal has non-finite values")
    # focus
    f = lab["focus"]
    if not (0 <= f["u0"] < f["u1"] <= 1 and 0 <= f["v0"] < f["v1"] <= 1):
        err(f"focus window {f} not inside 0..1")
    uv_ok(lab["headline"]["u"], lab["headline"]["v"], "headline")
    # basemap
    bm = json.loads((d / lab["files"]["basemap"]).read_text())
    size = (d / lab["files"]["basemap"]).stat().st_size
    if size > 1_500_000:
        err(f"basemap.json is {size / 1e6:.2f} MB, budget 1.5 MB")
    if list(bm["roads"]) != ROAD_CLASSES:
        err(f"basemap road classes {list(bm['roads'])}")
    n_out = 0
    for key in ("rail", "river", "canal", "coast"):
        for pl in bm[key]:
            n_out += sum(1 for u, v in pl if not (-0.01 <= u <= 1.01 and -0.01 <= v <= 1.01))
    for cls, pls in bm["roads"].items():
        for pl in pls:
            n_out += sum(1 for u, v in pl if not (-0.01 <= u <= 1.01 and -0.01 <= v <= 1.01))
            if len(pl) < 2:
                err("road polyline with fewer than 2 points")
    if n_out:
        err(f"{n_out} basemap points outside the grid by more than 1%")
    mid_out = 0
    pad = 0.02
    for pl in bm["roads"]["minor"]:
        if not any(f["u0"] - pad <= u <= f["u1"] + pad and f["v0"] - pad <= v <= f["v1"] + pad for u, v in pl):
            mid_out += 1
    if mid_out:
        err(f"{mid_out} minor roads do not touch the focus window")
    for p in bm["places"]:
        if not {"name", "name_en", "kind", "u", "v"} <= set(p):
            err(f"place missing fields: {p}")
    # line vector
    lj = json.loads((d / lab["files"]["line_vector"]).read_text())
    all_pts = set()
    for ln in lj["lines"]:
        if len(ln["points"]) < 2:
            err(f"line {ln['id']} has fewer than 2 points")
        for u, v, m in ln["points"]:
            uv_ok(u, v, f"line {ln['id']}")
            if m not in (0, 1):
                err(f"line {ln['id']}: measured flag {m}")
            all_pts.add((u, v))
    for run in lj["runs"]:
        for u, v in run["points"]:
            uv_ok(u, v, "run")
            if (u, v) not in all_pts:
                err("a run point is not a point of any line")
                break
    for s in lj.get("sites", []):
        uv_ok(s["u"], s["v"], f"site {s['id']}")
    # stories
    shown = [i["id"] for i in shown_stories(ev)]
    got = [s["id"] for s in lab["stories"] if s["kind"] == "story"]
    if shown != got:
        err(f"stories {got} differ from the event page's {shown}")
    for it in shown_stories(ev):
        if "lat" in it and "lon" in it:
            u, v = ev.lonlat_to_uv(it["lon"], it["lat"])
            s_ = next(x for x in lab["stories"] if x["id"] == it["id"])
            if abs(u - s_["u"]) > 0.003 or abs(v - s_["v"]) > 0.003:
                err(f"story {it['id']}: lab (u, v) = ({s_['u']}, {s_['v']}) but its lat/lon gives ({u:.4f}, {v:.4f})")
    ns = [s["n"] for s in lab["stories"] if s["kind"] == "story"]
    if ns != list(range(1, len(ns) + 1)):
        err(f"story numbers {ns}")
    polylines = [np.array([[u, v] for u, v, _ in ln["points"]]) for ln in lj["lines"]]
    n_cross = 0
    for s in lab["stories"]:
        uv_ok(s["u"], s["v"], f"story {s['id']}")
        if len(s["short"]) > 28:
            err(f"story {s['id']}: short label {len(s['short'])} characters")
        if not s.get("radar"):
            err(f"story {s['id']}: no radar sentence")
        if s.get("cut"):
            for p in s["cut"]:
                uv_ok(p[0], p[1], f"story {s['id']} cut")
            if not cut_crosses(s["cut"], polylines):
                err(f"story {s['id']}: cut does not cross the line")
            else:
                n_cross += 1
            L = np.hypot((s["cut"][1][0] - s["cut"][0][0]) * ev.extent_m[0], (s["cut"][1][1] - s["cut"][0][1]) * ev.extent_m[1])
            if L < 500:
                err(f"story {s['id']}: cut only {L:.0f} m long")
        elif lab["line"].get("present"):
            err(f"story {s['id']}: no cut although a line exists")
        if s.get("on_line") is not None and s["on_line"] != (s["distance_m"] <= 600):
            err(f"story {s['id']}: on_line {s['on_line']} but distance {s['distance_m']}")
    print(f"  {slug}: {len(lab['stories'])} stories ({n_cross} cuts cross the line), {len(lj['lines'])} line(s), basemap {size / 1e6:.2f} MB, "
          f"{sum(len(p) for p in bm['roads']['minor'])} minor-road points")
    return [f"{slug}: {e}" for e in errs]


def main(argv=None):
    slugs = (sys.argv[1:] if argv is None else argv) or SLUGS
    errs = []
    for s in slugs:
        errs += check(s)
    for e in errs:
        print("ERROR", e)
    print("FAILED" if errs else "all ok")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
