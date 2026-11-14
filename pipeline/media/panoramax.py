"""Panoramax (api.panoramax.xyz) street-level pictures via its STAC search; no key needed."""
from __future__ import annotations

from datetime import date, timedelta

from .common import FetchError, bbox_around, get, item, km, log, parse_date

API = "https://api.panoramax.xyz/api/search"


def harvest(centres, ref: str | None, per_period=3, before_years=3) -> list[dict]:
    today = date.today().isoformat()
    if ref:
        r0 = (date.fromisoformat(ref) - timedelta(days=365 * before_years)).isoformat()
        periods = [("before", r0, ref), ("after", ref, today)]
    else:
        periods = [("unknown", "2014-01-01", today)]
    out = []
    for c in centres:
        b = bbox_around(c["lat"], c["lon"], 0.25 if c["tier"] == 1 else 0.4)
        for tag, t0, t1 in periods:
            try:
                r = get(API, {"bbox": ",".join(f"{v:.5f}" for v in b), "datetime": f"{t0}T00:00:00Z/{t1}T00:00:00Z",
                              "limit": 50})
            except FetchError as e:
                log(f"    panoramax {c['name'][:30]}: {e}")
                continue
            feats = r.get("features", [])
            for f in feats:
                lon, lat = f["geometry"]["coordinates"][:2]
                f["_d"] = km(lat, lon, c["lat"], c["lon"])
            for f in sorted(feats, key=lambda f: f["_d"])[:per_period]:
                lon, lat = f["geometry"]["coordinates"][:2]
                p = f.get("properties", {})
                lic = next((l.get("title", "") for l in f.get("links", []) if l.get("rel") == "license"), "")
                lic = lic.replace("License for this object (", "").rstrip(")").replace("-", " ", 1) or "CC BY-SA 4.0"
                who = ", ".join(pr.get("name", "") for pr in f.get("providers", []) if pr.get("name")) or "contributor"
                thumb = (f.get("assets", {}).get("thumb") or f.get("assets", {}).get("sd") or {}).get("href")
                out.append(item(source="panoramax", type="street", title=f"Street view {round(f['_d'] * 1000)} m from {c['name']}",
                                caption=f"Panoramax picture, heading {p.get('view:azimuth', '?')}°.", lat=lat, lon=lon,
                                loc_method="panoramax GPS", loc_confidence="high", date=parse_date(p.get("datetime")),
                                thumb_url=thumb, page_url=f"https://api.panoramax.xyz/#focus=pic&pic={f['id']}",
                                credit=f"{who} / Panoramax", licence=lic, _found_by=f"panoramax:{c['name']}",
                                _centre_tier=c["tier"]))
    return out
