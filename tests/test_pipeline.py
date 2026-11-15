import numpy as np

from pipeline import build_event, cmr, gunw, stories
from pipeline.context import Grid


def g(start, end, track=1):
    return cmr.Granule(id=f"{start}_{end}", url="https://x/y.h5", start=start, end=end,
                       track=track, frame=1, direction="A", bandwidth="40")


def test_parse_granule():
    item = {"umm": {
        "GranuleUR": "G1",
        "TemporalExtent": {"RangeDateTime": {"BeginningDateTime": "2026-07-21T20:29:00Z"}},
        "AdditionalAttributes": [
            {"Name": "TRACK_NUMBER", "Values": ["24"]}, {"Name": "FRAME_NUMBER", "Values": ["18"]},
            {"Name": "ASCENDING_DESCENDING", "Values": ["ASCENDING"]},
            {"Name": "REFERENCE_ZERO_DOPPLER_START_TIME", "Values": ["2026-07-21T20:29:00Z"]},
            {"Name": "SECONDARY_ZERO_DOPPLER_START_TIME", "Values": ["2026-08-14T20:28:58Z"]},
            {"Name": "RANGE_BANDWIDTH_CONCAT", "Values": ["40"]}],
        "RelatedUrls": [{"Type": "GET DATA", "URL": "https://nisar.asf.earthdatacloud.nasa.gov/a/G1.h5"}]}}
    x = cmr._parse(item)
    assert (x.track, x.frame, x.direction, x.start, x.end, x.days) == (24, 18, "A", "2026-07-21", "2026-08-14", 24)


def test_chain_follows_consecutive_shortest_pairs(monkeypatch):
    pairs = [g("2026-01-01", "2026-01-13"), g("2026-01-01", "2026-01-25"), g("2026-01-13", "2026-01-25"),
             g("2026-01-25", "2026-02-06"), g("2026-03-01", "2026-03-13")]
    monkeypatch.setattr(cmr, "search", lambda *a, **k: pairs)
    c = build_event.chain({"lat": 0, "lon": 0})
    assert [(x.start, x.end) for x in c] == [("2026-01-01", "2026-01-13"), ("2026-01-13", "2026-01-25"), ("2026-01-25", "2026-02-06")]


def test_display_surface_fades_over_gaps():
    los = np.full((60, 60), 0.2, np.float32)
    valid = np.zeros((60, 60), bool)
    valid[:, :20] = True
    s = gunw.display_surface(los, valid)
    assert abs(s[30, 5] - 0.2) < 0.01          # measured ground keeps its value
    assert abs(s[30, 55]) < 1e-3               # far from data the surface returns to zero, no plateau


def test_display_surface_flat_over_sea():
    los = np.full((60, 60), 0.05, np.float32)
    water = np.zeros((60, 60), bool)
    water[:, 30:] = True
    s = gunw.display_surface(los, ~water, water=water)
    assert np.abs(s[:, 30:]).max() == 0          # no motion is ever drawn over the sea
    assert abs(s[30, 5] - 0.05) < 0.005          # inland keeps its value


def test_volcano_footprint_needs_collapse_near_vent():
    grid = Grid(32633, 0.0, 8000.0, 80.0, 100, 100)
    x = (np.arange(100) + 0.5) * 80.0
    y = 8000.0 - (np.arange(100) + 0.5) * 80.0
    pre = np.full((100, 100), 0.85, np.float32)
    coh = pre.copy()
    coh[10:20, 10:20] = 0.1          # collapsed, near the vent: lava
    coh[60:70, 60:70] = 0.45         # sagged but still coherent: farmland, not lava
    coh[90:100, 0:10] = 0.1          # collapsed but beyond the documented run-out
    from pyproj import Transformer
    lon, lat = Transformer.from_crs(32633, 4326, always_xy=True).transform(1200.0, 6800.0)
    ev = {"kind": "volcano", "lat": lat, "lon": lon, "reach_km": 3}
    f, rule = build_event.change_footprint(ev, {"coh": coh, "coh_pre": pre, "dem": np.full((100, 100), 1000.0), "x": x, "y": y}, grid)
    assert (f[10:20, 10:20] > 0.5).all()
    assert (f[60:70, 60:70] == 0).all() and (f[90:, :10] == 0).all()
    assert "3 km" in rule


def test_grid_uv():
    grid = Grid(32652, 631440.0, 3647360.0, 80.0, 750, 750)
    u, v = grid.uv(130.722, 32.682)
    assert 0.4 < u < 0.6 and 0.4 < v < 0.6


def test_image_licences():
    assert stories.show_image({"image_url": "u", "licence": "CC BY-SA 4.0"})
    assert stories.show_image({"image_url": "u", "licence": "Public domain (US Government)"})
    assert not stories.show_image({"image_url": "u", "licence": "news, link only"})
    assert not stories.show_image({"image_url": "u", "licence": "AIST GSJ web material (agency); link with credit"})
    assert stories.show_image({"image_url": "u", "licence": "GSJ Terms of Use (CC BY 4.0 compatible)"})
    assert not stories.show_image({"image_url": None, "licence": "CC BY 4.0"})


# ---------- media harvest (step 5b): relevance and tiering ----------

from pipeline.media import __main__ as media  # noqa: E402

MMX1 = {"name": "NGL GNSS MMX1, AICM airport (old Texcoco lakebed)", "kind": "gnss", "lat": 19.4363, "lon": -99.0721}
ANGEL = {"name": "Ángel de la Independencia: 14 steps added since 1910", "kind": "offset", "lat": 19.4270, "lon": -99.1677}
GSJ8 = {"name": "GSJ photo 8: 氷川町宮原 road, 184 cm", "kind": "offset", "lat": 32.5800, "lon": 130.6800}


def _media(title, lat, lon, date, type="photo", source="commons", when="before"):
    return {"source": source, "type": type, "title": title, "caption": "", "lat": lat, "lon": lon, "date": date,
            "when": when, "loc_confidence": "high", "loc_method": "commons geotag", "_found_by": "geosearch:x",
            "nisar": {"local_step_cm": 1.0}}


def test_media_airliner_at_gnss_station_is_dropped():
    s = {"terms": {"match": ["hundi", "grieta", "sink", "subsid", "crack"]}, "ref_date": "2025-10-30"}
    plane = _media("Volaris A320-233, XA-VLG, named Stephany (15732700507)", 19.4365, -99.0725, "2014-11-17")
    assert not media.relevant(plane, s, "2025-10-30", [MMX1, ANGEL])          # near the anchor, not about the ground
    column = _media("Columna de la Independencia", 19.4271, -99.1676, "2011-12-25")
    assert media.relevant(column, s, "2025-10-30", [MMX1, ANGEL])             # the landmark itself: kept
    assert media.tier_of(column, s, [MMX1, ANGEL], [], 99, quake=False) == 1
    city = _media("Mexico - DF 2013 - panoramio (40)", 19.4271, -99.1676, "2013-01-01")
    assert not media.relevant(city, s, "2025-10-30", [MMX1, ANGEL])


def test_media_proximity_alone_is_not_tier_1():
    s = {"terms": {"match": ["fault", "crack", "断層"]}}
    a = [GSJ8]
    old = _media("Michinoeki Ryuhoku", 32.5801, 130.6801, "2019-05-01")
    assert media.tier_of(old, s, a, [], 99, quake=True) == 3
    hit = _media("Fault scarp across the road", 32.5801, 130.6801, "2026-08-02", when="after")
    assert media.tier_of(hit, s, a, [], 99, quake=True) == 1
    before = _media("Street view 20 m from GSJ photo 8", 32.5801, 130.6801, "2024-03-01", type="street", source="mapillary")
    after = _media("Street view 25 m from GSJ photo 8", 32.58012, 130.68012, "2026-09-01", type="street", source="mapillary",
                   when="after")
    far = _media("Street view", 32.70, 130.80, "2024-03-01", type="street", source="mapillary")
    for i, it in enumerate((before, after, far)):
        it["id"], it["tier"] = f"m{i}", media.tier_of(it, s, a, [], 99, quake=True)
    assert (before["tier"], after["tier"], far["tier"]) == (3, 1, 4)
    assert media.pair_streets([before, after, far]) == 1
    assert before["pair"] == "m1" and before["tier"] == 1 and "pair" not in far


def test_media_town_centroid_is_approximate_not_tier_1():
    s = {"terms": {"match": ["fault"]}}
    it = _media("Daños en Tonosí tras el sismo", 32.5801, 130.6801, "2026-08-02", when="after")
    it |= {"loc_confidence": "low", "loc_method": "text: Tonosí", "approx": True}
    assert media.tier_of(it, s, [GSJ8], [], 99, quake=True) == 4


def test_credits_complete_and_current():
    """CREDITS.md is canonical: it names every Python dependency and every script the site loads,
    and its per-event section matches what the site publishes."""
    import re
    from pathlib import Path
    from pipeline import credits
    root = Path(__file__).resolve().parent.parent
    text = (root / "CREDITS.md").read_text().lower()
    for pkg in (root / "requirements.txt").read_text().split():
        assert pkg.lower() in text, f"CREDITS.md does not credit {pkg}"
    for html in (root / "site").glob("*.html"):
        for lib, ver in re.findall(r"cdn\.jsdelivr\.net/npm/([\w.-]+)@([\d.]+)", html.read_text()):
            assert f"{lib}.js" in text or lib in text, f"CREDITS.md does not credit {lib} ({html.name})"
            assert ver in text, f"CREDITS.md has the wrong {lib} version (site loads {ver})"
    assert credits.render() == (root / "CREDITS.md").read_text(), "CREDITS.md is stale: run python -m pipeline.credits"
