"""Pack the lab data for the Three inks page so that it loads fast.

    ~/dev/nisar-hackathon/.venv/bin/python pipeline/lab/inks/pack.py            # all three events
    ~/dev/nisar-hackathon/.venv/bin/python pipeline/lab/inks/pack.py etna-eruption

Reads  site/lab/data/<slug>/ (and the event layers it points to, in place).
Writes site/lab/inks/data/<slug>/grid.bin.gz   gzip of: int16 LE signal counts (ny*nx, -32768 = no reading),
                                                and, for events whose dots are the line raster, uint8 line (ny*nx, 255 = no reading)
       site/lab/inks/data/<slug>/base.json     the OpenStreetMap layers the poster draws (main roads, rail, water, coast, places)
       site/lab/inks/data/<slug>/relief.png    the hillshade at grid size (drawn as a faint pencil tint)
       site/lab/inks/data/<slug>/info.json     layer sizes and the NISAR pass dates the slider labels use

Nothing is smoothed, resampled or rounded except the basemap coordinates (4 decimals, about 4 m on the largest grid).
"""
import gzip
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
LAB = ROOT / "site" / "lab" / "data"
OUT = ROOT / "site" / "lab" / "inks" / "data"
EVENTS = ["kumamoto-quake", "mexico-city-subsidence", "etna-eruption"]
NODATA = -32768
KEEP_ROADS = {"rupture": ["motorway", "trunk", "primary"], "bend": ["motorway", "trunk", "primary"],
              "front": ["motorway", "primary", "secondary", "tertiary"]}
KEEP_PLACES = {"rupture": ["city", "town", "village", "suburb"], "bend": ["city", "town"], "front": ["town", "village"]}


def r4(pl):
    return [[round(u, 4), round(v, 4)] for u, v in pl]


def pack(slug):
    d = LAB / slug
    lab = json.loads((d / "lab.json").read_text())
    g, sig, line = lab["grid"], lab["signal"], lab["line"]
    nx, ny = g["nx"], g["ny"]
    dt = np.dtype(sig["dtype"]).newbyteorder("<")
    a = np.fromfile(d / sig["file"], dtype=dt).astype(np.int32)
    assert a.size == nx * ny, (a.size, nx, ny)
    if sig["valid"]:
        ok = np.fromfile(d / sig["valid"], dtype="u1") > 0
        a[~ok] = NODATA
    layers = [("signal", a.astype("<i2"))]
    if line["kind"] == "front":
        l = np.fromfile(d / line["raster"], dtype="u1")
        if line.get("valid"):
            l[np.fromfile(d / line["valid"], dtype="u1") == 0] = 255
        assert l.max() < 255 or line.get("valid") is None
        layers.append(("line", l))
    blob = b"".join(x.tobytes() for _, x in layers)
    out = OUT / slug
    out.mkdir(parents=True, exist_ok=True)
    (out / "grid.bin.gz").write_bytes(gzip.compress(blob, 9, mtime=0))

    bm = json.loads((d / "basemap.json").read_text())
    kind = line["kind"]
    base = {"roads": {k: [r4(p) for p in bm["roads"].get(k, [])] for k in KEEP_ROADS[kind]},
            "rail": [r4(p) for p in bm["rail"]], "river": [r4(p) for p in bm["river"]], "canal": [r4(p) for p in bm["canal"]],
            "coast": [r4(p) for p in bm["coast"]],
            "places": [{"name": p["name"], "name_en": p["name_en"], "kind": p["kind"], "u": round(p["u"], 4), "v": round(p["v"], 4)}
                       for p in bm["places"] if p["kind"] in KEEP_PLACES[kind]]}
    (out / "base.json").write_text(json.dumps(base, ensure_ascii=False, separators=(",", ":")))

    hs = Image.open(d / "hillshade.png").convert("L").resize((nx, ny), Image.LANCZOS)  # relief at the grid size, 8-bit grey
    hs.save(out / "relief.png", optimize=True)

    meta = json.loads((ROOT / "site" / "events" / slug / "meta.json").read_text())
    info = {"slug": slug, "nx": nx, "ny": ny, "layers": [n for n, _ in layers], "nodata": NODATA, "line_nodata": 255,
            "pair": meta["nisar"]["pair"], "stack": meta["nisar"]["stack"]}
    (out / "info.json").write_text(json.dumps(info))
    print(slug, "grid.bin.gz", (out / "grid.bin.gz").stat().st_size, "base.json", (out / "base.json").stat().st_size, "relief.png", (out / "relief.png").stat().st_size)


if __name__ == "__main__":
    for s in sys.argv[1:] or EVENTS:
        pack(s)
