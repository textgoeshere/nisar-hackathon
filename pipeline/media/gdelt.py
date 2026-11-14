"""News via the GDELT DOC 2.0 API (mode=artlist), one request per 5 s as GDELT asks.

Articles are located by the places named in their titles: seed places first (locate.py), then
other place names extracted from the title and geocoded with Nominatim inside the grid. News is
always link-only: we keep the headline, outlet and URL, never host the photo."""
from __future__ import annotations

import re

from . import geocode
from .common import FetchError, get, in_bounds, item, log, parse_date

API = "https://api.gdeltproject.org/api/v2/doc/doc"
LANG = {"spanish": "es", "japanese": "ja", "english": "en"}


_fails = 0          # consecutive rate-limited queries; after 2 GDELT is skipped for the run


def search(q: str, sourcelang: str | None, start: str, end: str, maxrecords=150) -> list[dict]:
    global _fails
    if _fails >= 2:
        log(f"    gdelt {q!r}: skipped (rate-limited twice in a row)")
        return []
    query = q + (f" sourcelang:{sourcelang}" if sourcelang else "")
    try:
        r = get(API, {"query": query, "mode": "artlist", "format": "json", "maxrecords": maxrecords, "sort": "hybridrel",
                      "startdatetime": start.replace("-", "") + "000000", "enddatetime": end.replace("-", "") + "235959"},
                retries=2, timeout=60)
    except FetchError as e:
        _fails += 1
        log(f"    gdelt {q!r}: {e}")
        return []
    _fails = 0
    if isinstance(r, str) or not isinstance(r, dict):
        return []
    out = []
    for a in r.get("articles", []):
        out.append(item(source="gdelt", type="news", title=a.get("title", ""), caption=f"{a.get('domain')} ({a.get('language')})",
                        date=parse_date(a.get("seendate")), thumb_url=a.get("socialimage") or None, page_url=a.get("url"),
                        credit=a.get("domain"), licence="news, link only", _found_by=f"gdelt:{q}"))
    return out


# Place-name candidates in a headline that the seed gazetteer doesn't know.
ES_PLACE = re.compile(r"\b(?:en|de|del|desde|hacia|a)\s+((?:[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)(?:\s+(?:de\s+|del\s+|la\s+)?[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+){0,3})")
JA_PLACE = re.compile(r"([一-鿿]{1,5}(?:市|町|村|区))")
STOP = {"Panamá", "Panama", "Venezuela", "México", "Mexico", "Japón", "Japan", "Los Santos", "Ciudad", "Gobierno", "La", "El", "Azuero",
        "Veraguas", "Herrera", "Coclé", "Carabobo", "Yaracuy", "Falcón", "Kumamoto", "Kyushu"}   # regions, not places


# Nominatim hit types that are settlements. Anything else (a street called "Puebla" or "Oruro" in
# Mexico City, a stadium, a house) is a false friend.
SETTLEMENT = {"city", "town", "village", "hamlet", "suburb", "neighbourhood", "quarter", "locality", "municipality",
              "isolated_dwelling", "borough", "city_district"}


def geocode_titles(items: list[dict], bounds, lang: str, budget=40, text=lambda it: it["title"]) -> int:
    """Nominatim-geocode place names in still-unlocated headlines, inside the grid only. Photo
    captions are matched against the seed gazetteer only (locate.py): free geocoding of captions
    put Bolivian and colonial-history pictures on Mexico City streets."""
    cache: dict[str, dict | None] = {}
    n = 0
    for it in items:
        if it.get("lat") is not None:
            continue
        t = text(it)
        names = ES_PLACE.findall(t) + JA_PLACE.findall(t)
        for name in names:
            name = name.strip()
            if name in STOP or len(name) < 3:
                continue
            if name not in cache:
                if len(cache) >= budget:
                    break
                cache[name] = geocode.forward(name, bounds, lang)
            hit = cache[name]
            if (hit and in_bounds(hit["lat"], hit["lon"], bounds) and (hit.get("rank") or 0) >= 16
                    and hit.get("type") in SETTLEMENT):
                it |= {"lat": hit["lat"], "lon": hit["lon"], "loc_method": f"nominatim: {name}", "loc_confidence": "low"}
                n += 1
                break
    return n
