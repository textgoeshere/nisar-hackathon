"""Find NISAR granules with NASA's Common Metadata Repository (CMR).

CMR is public: no login is needed to search. Each NISAR granule carries its orbit geometry in
`AdditionalAttributes` (track, frame, ascending/descending) and, for interferograms, the reference
and secondary acquisition times. Granules that share (track, frame, direction) form a *stack*: the
same patch of ground seen from the same angle every 12 days, which is what makes before/after
comparisons valid.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

import requests

CMR = "https://cmr.earthdata.nasa.gov/search/granules.umm_json"
GUNW = "NISAR_L2_GUNW_PROVISIONAL_V1"   # geocoded unwrapped interferograms: ground motion + coherence
GCOV = "NISAR_L2_GCOV_PROVISIONAL_V1"   # geocoded backscatter: surface brightness per polarisation


@dataclass(frozen=True)
class Granule:
    id: str
    url: str          # HTTPS download (HDF5)
    start: str        # ISO date of the (reference) acquisition
    end: str          # ISO date of the secondary acquisition (GUNW) or same as start (GCOV)
    track: int
    frame: int
    direction: str    # "A" or "D"
    bandwidth: str    # range bandwidth in MHz ("20", "40", ...): sets pixel size and noise floor

    @property
    def stack(self) -> tuple[int, int, str]:
        return (self.track, self.frame, self.direction)

    @property
    def days(self) -> int:
        from datetime import date
        return (date.fromisoformat(self.end) - date.fromisoformat(self.start)).days


def _attrs(umm: dict) -> dict[str, str]:
    return {a["Name"]: a["Values"][0] for a in umm.get("AdditionalAttributes", []) if a.get("Values")}


def _parse(item: dict) -> Granule | None:
    u = item["umm"]
    a = _attrs(u)
    url = next((r["URL"] for r in u.get("RelatedUrls", [])
                if r.get("Type") == "GET DATA" and r["URL"].startswith("https") and r["URL"].endswith(".h5")), None)
    if not url:
        return None
    ref = a.get("REFERENCE_ZERO_DOPPLER_START_TIME") or u["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"]
    sec = a.get("SECONDARY_ZERO_DOPPLER_START_TIME") or ref
    return Granule(
        id=u["GranuleUR"], url=url, start=ref[:10], end=sec[:10],
        track=int(a.get("TRACK_NUMBER", -1)), frame=int(a.get("FRAME_NUMBER", -1)),
        direction=a.get("ASCENDING_DESCENDING", "?")[:1],
        bandwidth=a.get("RANGE_BANDWIDTH_CONCAT", a.get("FREQUENCY_A_RANGE_BANDWIDTH", "?")),
    )


def search(short_name: str, lat: float, lon: float, session: requests.Session | None = None) -> list[Granule]:
    """All granules of a collection whose footprint contains (lat, lon), oldest first.

    Reprocessed duplicates (same stack and dates) are collapsed to the last one CMR returns.
    """
    s = session or requests.Session()
    out: dict[tuple, Granule] = {}
    headers = {}
    while True:
        r = s.get(CMR, params={"short_name": short_name, "point": f"{lon},{lat}", "page_size": 2000},
                  headers=headers, timeout=60)
        r.raise_for_status()
        for item in r.json()["items"]:
            g = _parse(item)
            if g:
                out[(g.stack, g.start, g.end, g.bandwidth)] = g
        nxt = r.headers.get("CMR-Search-After")
        if not nxt:
            break
        headers = {"CMR-Search-After": nxt}
    return sorted(out.values(), key=lambda g: (g.start, g.end))


def stacks(granules: list[Granule]) -> dict[tuple, list[Granule]]:
    """Group granules by (track, frame, direction), largest stack first."""
    by = defaultdict(list)
    for g in granules:
        by[g.stack].append(g)
    return dict(sorted(by.items(), key=lambda kv: -len(kv[1])))
