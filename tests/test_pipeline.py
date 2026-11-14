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


def test_grid_uv():
    grid = Grid(32652, 631440.0, 3647360.0, 80.0, 750, 750)
    u, v = grid.uv(130.722, 32.682)
    assert 0.4 < u < 0.6 and 0.4 < v < 0.6


def test_image_licences():
    assert stories.show_image({"image_url": "u", "licence": "CC BY-SA 4.0"})
    assert stories.show_image({"image_url": "u", "licence": "Public domain (US Government)"})
    assert not stories.show_image({"image_url": "u", "licence": "news, link only"})
    assert not stories.show_image({"image_url": "u", "licence": "AIST GSJ web material (agency); link with credit"})
    assert not stories.show_image({"image_url": None, "licence": "CC BY 4.0"})
