"""The sideways-slip files for Kumamoto: they exist, follow briefs/slip-contract.md, and the model does what the survey and GPS say."""
import json

import numpy as np
import pytest

from pipeline import slip
from pipeline.lab.common import EVENTS, OUT, ROOT

SLUG = "kumamoto-quake"
DIR = EVENTS / SLUG
pytestmark = pytest.mark.skipif(not (DIR / "slip.json").exists(), reason="run python -m pipeline.slip kumamoto-quake")


@pytest.fixture(scope="module")
def man():
    return json.loads((DIR / "slip.json").read_text())


@pytest.fixture(scope="module")
def field(man):
    f = man["field"]
    raw = np.fromfile(DIR / "slip.i16", dtype="<i2")
    return raw.reshape(2, f["ny"], f["nx"]).astype(float)


@pytest.fixture(scope="module")
def line(man):
    grid = json.loads((DIR / "meta.json").read_text())["grid"]
    lab = json.loads((OUT / SLUG / "line.json").read_text())
    return slip.Line(lab, grid["nx"] * grid["dx"], grid["ny"] * grid["dx"]), grid


def cell(man, u, v):
    f = man["field"]
    return int(v * f["ny"]), int(u * f["nx"])


def test_files_match_the_contract(man, field):
    f = man["field"]
    assert (DIR / "slip.i16").stat().st_size == 2 * f["ny"] * f["nx"] * 2
    assert {"slug", "version", "field", "line", "sites", "gps", "model", "text", "credits"} <= man.keys()
    assert f["file"] == "slip.i16" and f["dtype"] == "int16" and f["bands"] == ["east_mm", "north_mm"]
    assert (f["nx"], f["ny"]) == tuple(json.loads((DIR / "meta.json").read_text())["grid"][k] for k in ("nx", "ny"))
    assert abs(np.hypot(field[0], field[1]).max() - f["max_mm"]) <= 1
    assert {"points", "runs", "length_km"} <= man["line"].keys() and all(len(p) == 4 for p in man["line"]["points"])
    assert set(man["text"]) == {"measured", "drawn", "caveat"} and all(man["text"][k].strip() for k in man["text"]) and man["model"]["summary"]
    assert man["credits"] and all({"id", "u", "v", "east_cm", "north_cm", "up_cm", "model_east_cm", "model_north_cm", "miss_cm"} <= g.keys() for g in man["gps"])


def test_only_sideways_sites_on_the_line_are_used(man):
    ids = {s["id"] for s in man["sites"]}
    assert "gsj-08" in ids and "gsj-11" not in ids                      # gsj-11 is a vertical step
    off_line = {s["id"] for s in json.loads((OUT / SLUG / "line.json").read_text())["sites"] if not s["on_polyline"]}
    assert not ids & off_line


def test_jump_across_the_line_is_the_surveyed_offset(man, field, line):
    ln, grid = line
    site = next(s for s in man["sites"] if s["id"] == "gsj-08")
    assert site["offset_cm"] == 184
    # the cell nearest the line on each side of the 184 cm site, from the field itself
    r0, c0 = cell(man, site["u"], site["v"])
    rr, cc = np.mgrid[r0 - 3:r0 + 4, c0 - 3:c0 + 4]
    xy = np.stack([(cc.ravel() + 0.5) * grid["dx"], (rr.ravel() + 0.5) * grid["dx"]], axis=1)
    s, d, side, T = ln.locate(xy)
    vec = field[:, rr.ravel(), cc.ravel()].T / 10
    near = {sd: np.argmin(np.where(side == sd, d, np.inf)) for sd in (1, -1)}
    jump = vec[near[1]] - vec[near[-1]]
    assert np.hypot(*jump) == pytest.approx(184, abs=3)
    # and the jump is along the line: its direction is the line's, pointing north-east
    assert jump @ [T[near[1], 0], -T[near[1], 1]] == pytest.approx(184, abs=3)


def test_field_closes_at_both_ends(man, field):
    for u, v, _, off in (man["line"]["points"][0], man["line"]["points"][-1]):
        assert off == 0
        r, c = cell(man, u, v)
        block = field[:, r - 2:r + 3, c - 2:c + 3]
        assert np.abs(block).max() <= 10                               # mm: nothing within two cells of an end


def test_north_west_side_moves_north_east(man, field):
    j = {g["id"]: g for g in man["gps"]}
    for gid, sign in (("J093", 1), ("J702", -1)):                       # J093 is north-west of the line, J702 south-east
        g = j[gid]
        assert sign * g["model_east_cm"] > 0 and sign * g["model_north_cm"] > 0
        e, n = field[:, (r := cell(man, g["u"], g["v"]))[0], r[1]]
        assert sign * e > 0 and sign * n > 0
        assert (e / 10, n / 10) == pytest.approx((g["model_east_cm"], g["model_north_cm"]), abs=2)   # grid cell vs the exact spot


def test_gps_come_from_the_input_file_and_model_miss_is_consistent(man):
    src = {s["id"]: s for s in json.loads((ROOT / "research" / "slip" / f"{SLUG}.json").read_text())["stations"]}
    assert {g["id"] for g in man["gps"]} == set(src)
    for g in man["gps"]:
        assert (g["east_cm"], g["north_cm"], g["up_cm"]) == (src[g["id"]]["east_cm"], src[g["id"]]["north_cm"], src[g["id"]]["up_cm"])
        assert g["miss_cm"] == pytest.approx(np.hypot(g["model_east_cm"] - g["east_cm"], g["model_north_cm"] - g["north_cm"]), abs=0.15)
    rms = np.sqrt(np.mean([g["miss_cm"] ** 2 for g in man["gps"]]))
    assert man["model"]["gps_rms_miss_cm"] == pytest.approx(rms, abs=0.2)


def test_far_station_beyond_the_line_end_is_reported_not_fixed(man):
    g071 = next(g for g in man["gps"] if g["id"] == "G071")
    assert g071["miss_cm"] > 30                                         # the line is not extended to chase it
    assert "biggest miss" in man["text"]["caveat"]


def test_slip_pipeline_is_deterministic(man):
    again = slip.build(SLUG)["doc"]
    assert again["field"]["max_mm"] == man["field"]["max_mm"] and again["gps"] == man["gps"]
