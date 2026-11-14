"""Mapillary street-level images near the search centres, captured before and after the event.

Graph API: graph.mapillary.com/images with a small bbox and captured-date bounds. The token comes
from MAPILLARY_TOKEN, which the gateway's HTTPS proxy fills in from an opaque sentinel; it is sent
in an `Authorization: OAuth` header and never logged or cached (common.get keys exclude headers).
Mapillary imagery is CC BY-SA 4.0. thumb_1024_url is a signed CDN link that expires: re-harvest
(or fetch by id) before publishing."""
from __future__ import annotations

from datetime import date, timedelta

from .common import FetchError, bbox_around, env_token, get, item, km, log, parse_date

API = "https://graph.mapillary.com/images"
FIELDS = "id,captured_at,geometry,thumb_1024_url,compass_angle,is_pano,creator,sequence"


def harvest(centres, ref: str | None, per_period=3, before_years=3) -> list[dict]:
    tok = env_token("MAPILLARY_TOKEN")
    if not tok:
        log("    mapillary: MAPILLARY_TOKEN not set, skipped")
        return []
    hdr = {"Authorization": f"OAuth {tok}"}
    today = date.today().isoformat()
    if ref:
        r0 = (date.fromisoformat(ref) - timedelta(days=365 * before_years)).isoformat()
        periods = [("before", r0, ref), ("after", ref, today)]
    else:
        periods = [("unknown", "2014-01-01", today)]
    out, failures = [], 0
    for c in centres:
        rad = 0.25 if c["tier"] == 1 else 0.4
        b = bbox_around(c["lat"], c["lon"], rad)
        for tag, t0, t1 in periods:
            try:
                r = get(API, {"bbox": ",".join(f"{v:.5f}" for v in b), "fields": FIELDS, "limit": 200,
                              "start_captured_at": f"{t0}T00:00:00Z", "end_captured_at": f"{t1}T00:00:00Z"},
                        headers=hdr, retries=3, max_age_days=1)   # thumb URLs are signed and expire
            except FetchError as e:
                failures += 1
                if failures <= 3:
                    log(f"    mapillary {c['name'][:30]} {tag}: {e}")
                continue
            imgs = r.get("data", [])
            for x in imgs:
                lon, lat = x["geometry"]["coordinates"]
                x["_d"] = km(lat, lon, c["lat"], c["lon"])
            # Nearest few, one per sequence, so they aren't all one drive-by.
            picked, seqs = [], set()
            for x in sorted(imgs, key=lambda x: x["_d"]):
                seq = x.get("sequence") or parse_date(x["captured_at"])
                if seq in seqs:
                    continue
                seqs.add(seq)
                picked.append(x)
                if len(picked) >= per_period:
                    break
            for x in picked:
                lon, lat = x["geometry"]["coordinates"]
                who = (x.get("creator") or {}).get("username") or "contributor"
                out.append(item(source="mapillary", type="street",
                                title=f"Street view {round(x['_d'] * 1000)} m from {c['name']}",
                                caption=f"Mapillary {'360° ' if x.get('is_pano') else ''}image, heading {round(x.get('compass_angle') or 0)}°.",
                                lat=lat, lon=lon, loc_method="mapillary GPS", loc_confidence="high",
                                date=parse_date(x["captured_at"]), thumb_url=x.get("thumb_1024_url"),
                                page_url=f"https://www.mapillary.com/app/?pKey={x['id']}", credit=f"{who} / Mapillary",
                                licence="CC BY-SA 4.0", _found_by=f"mapillary:{c['name']}", _centre_tier=c["tier"]))
    if failures:
        log(f"    mapillary: {failures} failed requests")
    return out
