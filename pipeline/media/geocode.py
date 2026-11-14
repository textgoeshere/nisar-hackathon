"""Nominatim forward / reverse geocoding (1 request per second, cached, User-Agent set in common)."""
from __future__ import annotations

from .common import FetchError, get, log

URL = "https://nominatim.openstreetmap.org"


def forward(q: str, bounds=None, lang="en") -> dict | None:
    """First hit for q, restricted to the grid bounds (lon0, lat0, lon1, lat1) when given."""
    p = {"q": q, "format": "jsonv2", "limit": 1, "accept-language": lang}
    if bounds:
        p |= {"viewbox": f"{bounds[0]},{bounds[3]},{bounds[2]},{bounds[1]}", "bounded": 1}
    try:
        r = get(f"{URL}/search", p)
    except FetchError as e:
        log(f"    nominatim {q!r}: {e}")
        return None
    if not r:
        return None
    h = r[0]
    return {"lat": float(h["lat"]), "lon": float(h["lon"]), "name": h.get("display_name", ""),
            "type": h.get("type"), "rank": h.get("place_rank")}


def reverse(lat: float, lon: float, zoom=16, lang="en") -> str | None:
    try:
        r = get(f"{URL}/reverse", {"lat": f"{lat:.5f}", "lon": f"{lon:.5f}", "format": "jsonv2", "zoom": zoom,
                                    "accept-language": lang})
    except FetchError:
        return None
    a = r.get("address") or {}
    parts = [a.get(k) for k in ("road", "neighbourhood", "quarter", "suburb", "village", "hamlet", "town", "city")]
    parts = [p for p in dict.fromkeys(parts) if p]
    return ", ".join(parts[:3]) or r.get("display_name")


def confidence(hit: dict) -> str:
    """Nominatim place_rank: >= 26 street/building, 17-25 village/suburb, below that a district."""
    rank = hit.get("rank") or 0
    return "high" if rank >= 28 else "medium" if rank >= 19 else "low"
