"""Shared plumbing for the media harvesters: a polite cached HTTP client, item construction and
location helpers.

Every response is cached under cache/media/http/ (keyed by URL + params, secrets excluded), so a
re-run is fast and doesn't hammer the services. Delete the cache to re-harvest.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import time
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import requests

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "cache" / "media" / "http"
UA = "nisar-hackathon-media/0.1 (NISAR hackathon research; dpdnolan.office@gmail.com)"
SECRET_PARAMS = {"access_token", "token", "key"}

# Minimum seconds between requests per host (service usage policies).
MIN_INTERVAL = {"nominatim.openstreetmap.org": 1.1, "api.gdeltproject.org": 8.0, "api.openverse.org": 3.1,
                "overpass-api.de": 2.0}
_last: dict[str, float] = {}
_session = requests.Session()
_session.headers["User-Agent"] = UA


class FetchError(Exception):
    pass


def _key(url: str, params: dict | None, data) -> str:
    p = {k: v for k, v in (params or {}).items() if k not in SECRET_PARAMS}
    return hashlib.sha1(json.dumps([url, p, data], sort_keys=True, default=str).encode()).hexdigest()


def get(url: str, params: dict | None = None, *, data=None, headers: dict | None = None, kind="json",
        retries=4, timeout=45, cache=True, max_age_days: float | None = None):
    """GET (or POST when data is given) with disk cache, per-host pacing and exponential backoff on
    429 / 5xx / timeouts. Returns parsed JSON (kind="json") or text. Raises FetchError when out of retries."""
    k = _key(url, params, data)
    path = CACHE / k[:2] / f"{k}.json"
    if cache and path.exists():
        if max_age_days is None or time.time() - path.stat().st_mtime < max_age_days * 86400:
            body = json.loads(path.read_text())
            if body.get("ok"):
                return body["body"]
    host = urlsplit(url).netloc
    err = None
    for attempt in range(retries + 1):
        wait = MIN_INTERVAL.get(host, 0.2) - (time.time() - _last.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last[host] = time.time()
        try:
            r = (_session.post(url, params=params, data=data, headers=headers, timeout=timeout) if data is not None
                 else _session.get(url, params=params, headers=headers, timeout=timeout))
        except requests.RequestException as e:
            err = f"{type(e).__name__}"
        else:
            if r.status_code == 200:
                try:
                    body = r.json() if kind == "json" else r.text
                except ValueError:
                    err = "bad json: " + r.text[:120].replace("\n", " ")
                else:
                    if cache:
                        path.parent.mkdir(parents=True, exist_ok=True)
                        path.write_text(json.dumps({"ok": True, "url": url, "body": body}, ensure_ascii=False))
                    return body
            elif r.status_code in (429, 500, 502, 503, 504, 520, 522, 524):
                err = f"HTTP {r.status_code}"
                ra = r.headers.get("Retry-After")
                if ra and ra.isdigit():
                    time.sleep(min(int(ra), 60))
                elif r.status_code == 429:
                    time.sleep((20 if "gdelt" in host else 10) * (attempt + 1))
            else:
                raise FetchError(f"HTTP {r.status_code} {host}: {r.text[:160]!r}")
        time.sleep(min(2 ** attempt * 2, 40))
    raise FetchError(f"{host}: {err} after {retries + 1} tries")


# ---------- text / dates / geometry ----------

def norm(s: str | None) -> str:
    s = unicodedata.normalize("NFKC", s or "").lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip()


def strip_html(s: str | None) -> str:
    s = re.sub(r"<[^>]+>", " ", "" if s is None else str(s))
    s = s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'")
    return re.sub(r"\s+", " ", s).strip()


def parse_date(s) -> str | None:
    """Best-effort ISO date (YYYY-MM-DD) from the many formats the sources use."""
    if s is None or s == "":
        return None
    if isinstance(s, (int, float)):                         # epoch ms (Mapillary)
        return datetime.fromtimestamp(s / 1000, timezone.utc).date().isoformat()
    s = strip_html(str(s))
    m = re.search(r"(\d{4})[-:/.](\d{1,2})[-:/.](\d{1,2})", s)
    if m:
        y, mo, d = map(int, m.groups())
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            return None
    m = re.match(r"(\d{4})(\d{2})(\d{2})T", s)               # GDELT seendate 20261012T101500Z
    if m:
        return date(*map(int, m.groups())).isoformat()
    m = re.search(r"\b(19|20)\d{2}\b", s)
    return f"{m.group(0)}-01-01" if m else None


def when(d: str | None, ref: str | None) -> str:
    if not d or not ref:
        return "unknown"
    return "before" if d < ref else "after"


def km(lat1, lon1, lat2, lon2) -> float:
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2 +
         math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 12742 * math.asin(math.sqrt(a))


def bbox_around(lat, lon, r_km) -> tuple[float, float, float, float]:
    dlat = r_km / 111.0
    dlon = r_km / (111.0 * max(0.1, math.cos(math.radians(lat))))
    return lon - dlon, lat - dlat, lon + dlon, lat + dlat


def in_bounds(lat, lon, b) -> bool:
    return lat is not None and lon is not None and b[0] <= lon <= b[2] and b[1] <= lat <= b[3]


def canon_url(u: str | None) -> str:
    if not u:
        return ""
    s = urlsplit(u.strip())
    q = "&".join(p for p in s.query.split("&") if p and not re.match(r"(utm_|fbclid|ref=|amp)", p))
    path = s.path.rstrip("/").replace("/amp/", "/")
    return urlunsplit(("https", s.netloc.lower().removeprefix("www.").removeprefix("m."), path, q, ""))


def item(**kw) -> dict:
    """An item with every output field present (the CLI fills nisar, tier and side_hint later)."""
    base = dict(id=None, source=None, type="photo", title="", caption="", lat=None, lon=None, loc_method=None,
                loc_confidence="low", date=None, when="unknown", thumb_url=None, page_url=None, credit=None,
                licence=None, showable=False, tier=4, side_hint=None)
    return base | kw


OPEN_LICENCES = ("cc0", "cc-by", "cc by", "public domain", "pdm", "pd-", "attribution")


def is_open(licence: str | None) -> bool:
    """Openly licensed for display. NC/ND variants are open but restricted: display them only
    unmodified and non-commercially, so they count as showable; news never does."""
    lic = norm(licence)
    if not lic or any(k in lic for k in ("link only", "news", "all rights", "copyright", "©")):
        return False
    return any(k in lic for k in OPEN_LICENCES)


def log(*a):
    print(*a, flush=True)


def env_token(name: str) -> str | None:
    return os.environ.get(name) or None
