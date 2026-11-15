import json
from pathlib import Path

import numpy as np
import pytest
from pyproj import Transformer

from pipeline import ground

ROOT = Path(__file__).resolve().parent.parent
SLUGS = sorted(p.stem for p in (ROOT / "research" / "ground").glob("*.json"))


def _inside(pt, poly):
    x, y = pt
    n, c = len(poly), False
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def test_band_beside_a_line_is_on_its_left():
    fwd = lambda lon, lat: (lon, lat)                       # identity "projection": metres = degrees
    ring = ground.ring_xy({"line": [[0, 0], [1000, 0]], "offset_km": [0.1, 0.5]}, fwd)
    assert ring[:, 1].min() == pytest.approx(100) and ring[:, 1].max() == pytest.approx(500)
    circ = ground.ring_xy({"circle": [0, 0], "radius_km": 1}, fwd)
    assert np.allclose(np.hypot(*circ.T), 1000)


def test_checks():
    v = {"los_mean_cm": 17.0, "step_cm": 22.0, "measured_pct": 40}
    assert ground.run_checks({"los_mean_cm": [10, 30], "step_min": 15}, v) == []
    assert ground.run_checks({"los_mean_cm": [-30, -5], "measured_min": 70}, v) == ["los_mean_cm [-30, -5]", "measured_min 70"]


@pytest.mark.parametrize("slug", SLUGS)
def test_ground_facts(slug):
    out = ground.build(slug, write=False)
    assert out["failed"] == {}, out["failed"]               # every fact agrees with the NISAR data
    meta = json.loads((ROOT / "site" / "events" / slug / "meta.json").read_text())
    g = meta["grid"]
    fwd = Transformer.from_crs(4326, g["epsg"], always_xy=True).transform
    assert 3 <= len(out["facts"]) <= 8
    for f in out["facts"]:
        assert f["id"].startswith(slug + "-g") and len(f["title"]) <= 60 and f["text"]
        assert f["kind"] in ground.KINDS and f["side"] in ground.SIDES and f["source"]
        ring = f["patch"]["coordinates"][0]
        assert f["patch"]["type"] == "Polygon" and ring[0] == ring[-1] and len(ring) == len(f["uv_polygon"])
        assert all(0 <= u <= 1 and 0 <= v <= 1 for u, v in f["uv_polygon"])
        assert _inside(f["anchor"], f["uv_polygon"][:-1])
        for (lon, lat), (u, v) in zip(ring[::7], f["uv_polygon"][::7]):     # lon/lat and uv are one polygon
            x, y = fwd(lon, lat)
            assert abs((x - g["left"]) / (g["nx"] * g["dx"]) - u) < 2e-3 and abs((g["top"] - y) / (g["ny"] * g["dx"]) - v) < 2e-3
        assert f["values"]["pixels"] > 0
    published = ROOT / "site" / "events" / slug / "ground.json"
    assert json.loads(published.read_text())["facts"] == json.loads(json.dumps(out["facts"]))  # rebuilt
