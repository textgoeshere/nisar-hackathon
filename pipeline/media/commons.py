"""Wikimedia Commons: geotagged files near the search centres (geosearch, namespace 6), files in
the event categories, and full-text search on the seed terms. Licence, author and dates come from
extmetadata; coordinates from the file's own geotag, else from a seed place named in its title or
description (see locate.py)."""
from __future__ import annotations

from .common import FetchError, get, item, log, parse_date, strip_html

API = "https://commons.wikimedia.org/w/api.php"
PROPS = dict(prop="imageinfo|coordinates", iiprop="url|extmetadata|timestamp", iiurlwidth=640, coprop="type",
             coprimary="all", format="json", formatversion=2)


def _query(params, max_pages=10) -> list[dict]:
    pages, cont = [], {}
    for _ in range(max_pages):
        try:
            r = get(API, params | PROPS | cont)
        except FetchError as e:
            log(f"    commons: {e}")
            break
        pages += (r.get("query") or {}).get("pages", [])
        if "continue" not in r:
            break
        cont = r["continue"]
    return pages


def _to_item(p: dict, how: str) -> dict | None:
    ii = (p.get("imageinfo") or [{}])[0]
    if not ii.get("url"):
        return None
    m = {k: strip_html(v.get("value")) for k, v in (ii.get("extmetadata") or {}).items()}
    mime_ok = ii["url"].split("?")[0].lower().rsplit(".", 1)[-1] in ("jpg", "jpeg", "png", "webp", "tif", "tiff", "gif", "webm", "ogv")
    if not mime_ok:
        return None
    title = p["title"].removeprefix("File:").rsplit(".", 1)[0]
    c = (p.get("coordinates") or [])
    lat = lon = None
    method = None
    if c:
        lat, lon, method = c[0]["lat"], c[0]["lon"], "commons geotag"
    lic = m.get("LicenseShortName") or m.get("License")
    taken = parse_date(m.get("DateTimeOriginal")) or parse_date(m.get("DateTime"))
    return item(source="commons", type="photo", title=title.replace("_", " "),
                caption=(m.get("ImageDescription") or "")[:600], lat=lat, lon=lon, loc_method=method,
                loc_confidence="high" if c else "low", date=taken, thumb_url=(ii.get("thumburl") or ii["url"]).split("?")[0],
                page_url=ii.get("descriptionurl"), _uploaded=(ii.get("timestamp") or "")[:10], credit=(m.get("Artist") or m.get("Credit") or "")[:200],
                licence=lic, _found_by=how, _categories=m.get("Categories", ""))


def geosearch(centres, radius_m=1000, limit=100) -> list[dict]:
    out = []
    for c in centres:
        pages = _query(dict(action="query", generator="geosearch", ggscoord=f"{c['lat']}|{c['lon']}",
                            ggsradius=radius_m, ggslimit=limit, ggsnamespace=6))
        out += [i for p in pages if (i := _to_item(p, f"geosearch:{c['name']}"))]
    return out


def category(cat: str, depth=1) -> list[dict]:
    out, seen, todo = [], set(), [(cat, 0)]
    while todo:
        c, dep = todo.pop()
        if c in seen:
            continue
        seen.add(c)
        out += [i for p in _query(dict(action="query", generator="categorymembers", gcmtitle=c, gcmtype="file",
                                       gcmlimit=200)) if (i := _to_item(p, f"category:{c}"))]
        if dep < depth:
            try:
                sub = get(API, dict(action="query", list="categorymembers", cmtitle=c, cmtype="subcat", cmlimit=100,
                                    format="json"))
                todo += [(x["title"], dep + 1) for x in sub["query"]["categorymembers"]]
            except FetchError:
                pass
    return out


def search(q: str, limit=50) -> list[dict]:
    pages = _query(dict(action="query", generator="search", gsrsearch=f"{q} filetype:bitmap", gsrnamespace=6,
                        gsrlimit=limit), max_pages=1)
    return [i for p in pages[:limit] if (i := _to_item(p, f"search:{q}"))]
