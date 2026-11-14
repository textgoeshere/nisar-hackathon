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


def search(q: str, sourcelang: str | None, start: str, end: str, maxrecords=150) -> list[dict]:
    query = q + (f" sourcelang:{sourcelang}" if sourcelang else "")
    try:
        r = get(API, {"query": query, "mode": "artlist", "format": "json", "maxrecords": maxrecords, "sort": "hybridrel",
                      "startdatetime": start.replace("-", "") + "000000", "enddatetime": end.replace("-", "") + "235959"},
                retries=4, timeout=60)
    except FetchError as e:
        log(f"    gdelt {q!r}: {e}")
        return []
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
STOP = {"Panamá", "Panama", "Venezuela", "México", "Mexico", "Japón", "Japan", "Los Santos", "Ciudad", "Gobierno", "La", "El"}


def geocode_titles(items: list[dict], bounds, lang: str, budget=40) -> int:
    """Nominatim-geocode place names in still-unlocated headlines, inside the grid only."""
    cache: dict[str, dict | None] = {}
    n = 0
    for it in items:
        if it.get("lat") is not None:
            continue
        names = ES_PLACE.findall(it["title"]) + JA_PLACE.findall(it["title"])
        for name in names:
            name = name.strip()
            if name in STOP or len(name) < 3:
                continue
            if name not in cache:
                if len(cache) >= budget:
                    break
                cache[name] = geocode.forward(name, bounds, lang)
            hit = cache[name]
            if hit and in_bounds(hit["lat"], hit["lon"], bounds) and (hit.get("rank") or 0) >= 16:
                it |= {"lat": hit["lat"], "lon": hit["lon"], "loc_method": f"nominatim: {name}", "loc_confidence": "low"}
                n += 1
                break
    return n
