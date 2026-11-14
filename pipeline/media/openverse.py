"""Openverse (api.openverse.org) text search over the seed queries.

Anonymous access: page_size <= 20, ~20 requests/min, and the API often answers 504 behind
Cloudflare, so common.get paces requests and retries with backoff. Openverse carries no
coordinates; we take them from the source page when it has them (Wikimedia Commons via its API,
Flickr from the photo page's embedded geo data), else locate.py matches seed places in the text."""
from __future__ import annotations

import re
import time
from urllib.parse import unquote

from . import commons
from .common import FetchError, get, item, log, parse_date

API = "https://api.openverse.org/v1/images/"


def _licence(r) -> str:
    lic = (r.get("license") or "").upper()
    if lic in ("CC0", "PDM"):
        return "CC0" if lic == "CC0" else "Public domain"
    return f"CC {lic.replace('-', '-')} {r.get('license_version') or ''}".strip()


def _flickr_geo(url: str) -> tuple[float, float] | None:
    try:
        html = get(url, kind="text", retries=1, timeout=30)
    except FetchError:
        return None
    m = re.search(r'"latitude":\s*(-?\d+\.\d+),\s*"longitude":\s*(-?\d+\.\d+)', html)
    if m and (float(m.group(1)), float(m.group(2))) != (0.0, 0.0):
        return float(m.group(1)), float(m.group(2))
    return None


_fails = 0          # consecutive failed queries; after 3 the service is treated as down for this run


def search(q: str, pages=2, deadline: float | None = None) -> list[dict]:
    """deadline (time.time()) skips the query once the caller's time budget is spent."""
    global _fails
    out = []
    if _fails >= 3 or (deadline and time.time() > deadline):
        return out
    for page in range(1, pages + 1):
        try:
            r = get(API, {"q": q, "page_size": 20, "page": page}, retries=3, timeout=30)
            _fails = 0
        except FetchError as e:
            _fails += 1
            log(f"    openverse {q!r} p{page}: {e}" + ("; giving up on Openverse for this run" if _fails >= 3 else ""))
            break
        for x in r.get("results", []):
            land = x.get("foreign_landing_url") or ""
            it = item(source="openverse", type="photo", title=x.get("title") or "",
                      caption=" ".join(t.get("name", "") for t in (x.get("tags") or [])[:15]),
                      thumb_url=x.get("thumbnail") or x.get("url"), page_url=land,
                      credit=f"{x.get('creator') or 'unknown'} via {x.get('source') or x.get('provider')}",
                      licence=_licence(x), date=None, _found_by=f"openverse:{q}", _provider=x.get("source"))
            if "commons.wikimedia.org" in land and "/wiki/File:" in land:
                it["_commons_title"] = unquote(land.split("/wiki/", 1)[1]).replace("_", " ")
            elif "flickr.com/photos/" in land:
                g = _flickr_geo(land)
                if g:
                    it |= {"lat": g[0], "lon": g[1], "loc_method": "flickr page geotag", "loc_confidence": "medium"}
            out.append(it)
        if r.get("page_count", 1) <= page:
            break
    # Commons-hosted hits: take geotag, licence and date from Commons itself (one batched query).
    titles = [i["_commons_title"] for i in out if i.get("_commons_title")]
    by_title = {}
    for k in range(0, len(titles), 40):
        for p in commons._query(dict(action="query", titles="|".join(titles[k:k + 40])), max_pages=1):
            ci = commons._to_item(p, "openverse")
            if ci:
                by_title[p["title"]] = ci
    for i in out:
        ci = by_title.get(i.get("_commons_title") or "")
        if ci:
            i |= {k: ci[k] for k in ("lat", "lon", "loc_method", "loc_confidence", "date", "licence", "credit", "caption", "thumb_url")
                  if ci.get(k)}
            i["date"] = i["date"] or parse_date(ci.get("date"))
    return out
