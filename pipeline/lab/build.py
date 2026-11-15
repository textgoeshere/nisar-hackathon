"""Build the shared lab data for an event:  python -m pipeline.lab.build [slug ...]   (no slug = all three).

Writes site/lab/data/<slug>/ : lab.json, basemap.json, hillshade.png, sea.png, line.u8, line-valid.u8, line.json (+ signal.i16 for
Mexico City) and the two proof images.  OpenStreetMap comes from Overpass and is cached under cache/lab/overpass/.
"""
from __future__ import annotations

import json
import sys
import time

import numpy as np
from PIL import Image

from . import etna, kumamoto, mexico, osm, stories
from .common import OUT, Event, hillshade, load_event, sea_mask, write_json

MODULES = {m.SLUG: m for m in (kumamoto, mexico, etna)}
BASEMAP_BUDGET = 1_500_000
HILLSHADE_Z = {"kumamoto-quake": 2.0, "mexico-city-subsidence": 4.0, "etna-eruption": 3.0}
MINOR_TILES = {"kumamoto-quake": (3, 2), "mexico-city-subsidence": (3, 2), "etna-eruption": (2, 1)}


def focus_of(ev: Event, mod) -> dict:
    if hasattr(mod, "focus_cells"):
        r0, r1, c0, c1 = mod.focus_cells(ev)
    else:
        r0, r1, c0, c1 = mod.FOCUS_CELLS
    return {"u0": round(c0 / ev.nx, 5), "v0": round(r0 / ev.ny, 5), "u1": round(c1 / ev.nx, 5), "v1": round(r1 / ev.ny, 5),
            "label": mod.FOCUS_LABEL}


def write_basemap(ev: Event, focus: dict, out_dir) -> dict:
    main = osm.fetch(osm.main_query(ev.grid["bounds_lonlat"]), f"{ev.slug}-main")
    bounds = osm.window_bounds(ev, focus)
    minor = osm.minor_elements(bounds, ["unclassified", "residential"], ev.slug, MINOR_TILES[ev.slug])
    attempts = [(("unclassified", "residential"), 12.0), (("unclassified", "residential"), 20.0), (("unclassified", "residential"), 35.0),
                (("unclassified",), 12.0)]
    for classes, eps in attempts:
        vec = osm.build_vectors(ev, main, minor, focus, eps_m=10.0, eps_minor_m=eps, minor_classes=classes)
        data = osm.to_json(vec)
        n_min = sum(len(p) for p in data["roads"]["minor"])
        data = {"meta": {"source": "OpenStreetMap contributors, ODbL, via the Overpass API", "minor_roads_window": focus,
                         "minor_classes": list(classes), "simplify_m": {"main": 10.0, "minor": eps}, "decimals": 5,
                         "note": "minor roads only inside the focus window" + ("" if "residential" in classes else "; residential streets left out to stay under the size budget")}} | data
        size = len(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode())
        print(f"  basemap {ev.slug}: minor classes {classes}, eps {eps} m -> {size / 1e6:.2f} MB ({n_min} minor points)")
        if size <= BASEMAP_BUDGET:
            break
    else:
        print("  WARNING: basemap over budget even with residential dropped")
    write_json(out_dir / "basemap.json", data)
    data["_size"] = size
    return data["meta"] | {"bytes": size}


def build(slug: str):
    t0 = time.time()
    mod = MODULES[slug]
    ev = load_event(slug)
    out = OUT / slug
    out.mkdir(parents=True, exist_ok=True)
    print(f"[{slug}]")
    focus = focus_of(ev, mod)
    prod = mod.make(ev)
    # relief and sea
    hs = hillshade(ev.layers["dem"], ev.dx, HILLSHADE_Z[slug])
    Image.fromarray((hs * 255).round().astype(np.uint8), "L").save(out / "hillshade.png", optimize=True)
    sea = sea_mask(ev)
    Image.fromarray(sea, "L").save(out / "sea.png", optimize=True)
    # signal and line layers
    if "signal_array" in prod:
        prod["signal_array"].astype("<i2").tofile(out / "signal.i16")
    prod["raster"].astype(np.uint8).tofile(out / "line.u8")
    prod["raster_valid"].astype(np.uint8).tofile(out / "line-valid.u8")
    nb = write_json(out / "line.json", prod["line_json"])
    bm = write_basemap(ev, focus, out)
    st = stories.build(ev, prod)
    manifest = {
        "slug": slug, "name": ev.meta["name"], "kind": ev.meta["kind"], "date": ev.meta.get("date"),
        "grid": ev.grid, "focus": focus, "signal": prod["signal"],
        "line": prod["line"] | {"present": True},
        "headline": prod["headline"], "stories": st,
        "files": {"basemap": "basemap.json", "hillshade": "hillshade.png", "sea": "sea.png", "line_raster": "line.u8",
                  "line_valid": "line-valid.u8", "line_vector": "line.json", "proof_focus": "proof-focus.jpg", "proof_scene": "proof-scene.jpg"},
        "hillshade": {"file": "hillshade.png", "scale": 2, "light": "north-west, 45 degrees", "z": HILLSHADE_Z[slug], "flat_ground": 180},
        "sea": {"file": "sea.png", "present": bool(sea.any()), "share": round(float((sea > 0).mean()), 3)},
        "basemap": {"file": "basemap.json", "bytes": bm["bytes"], "minor_classes": bm["minor_classes"], "note": bm["note"]},
        "credits": prod["credits"] + ["Map data: © OpenStreetMap contributors (ODbL), via the Overpass API",
                                      "Relief: from the DEM in the event data (see the main CREDITS.md)"],
        "provisional": True,
        "checks": prod["checks"],
    }
    write_json(out / "lab.json", manifest, indent=1)
    print(f"  wrote {out} in {time.time() - t0:.0f} s")
    from . import proof
    proof.render(slug)
    return manifest


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    slugs = argv or list(MODULES)
    for s in slugs:
        if s not in MODULES:
            raise SystemExit(f"unknown slug {s}; choose from {', '.join(MODULES)}")
        build(s)


if __name__ == "__main__":
    main()
