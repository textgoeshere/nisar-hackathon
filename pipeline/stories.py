"""Step 5: place researched ground stories on the event grid and ask NISAR what it saw there.

    .venv/bin/python -m pipeline.stories kumamoto-quake

Input:  research/stories/<slug>.json    candidate stories and photos (see docs/5-stories.md)
        site/events/<slug>/media.json    step 5b: harvested media candidates (pipeline.media)
        research/editorial/<slug>.json   step 6: the human editor's selections and captions
                                         (`items` for stories, `media` for harvested media)
Output: site/events/<slug>/stories.json  stories + the selected media (`media`) + all media decisions
                                         (`media_status`, so the editor can reload them)

For each candidate we compute its (u, v) position on the event grid and sample the NISAR layers
in a small neighbourhood: line-of-sight motion, coherence, and the **local step**, the spread of
motion within ~500 m. A large step means the point sits on the boundary the hypothesis is about;
low coherence means the ground surface there was destroyed or changed.

Subsidence events store the fitted cumulative motion over the whole stack in los.i16, so for them
we report the **rate** (cm/yr): a 5x5 median at the point (as build_event's fastest-pixel stat, so
one bad pixel can't pose as the answer) and the fastest-sinking rate within the radius. A point on
the lakebed/hill edge (the Tláhuac crack) reads ~0 at the pixel and ~-13 cm/yr a few hundred
metres away; both numbers matter there.
"""
from __future__ import annotations

import json
import sys
from datetime import date
from functools import lru_cache
from pathlib import Path

import numpy as np

from .context import Grid

ROOT = Path(__file__).resolve().parent.parent


@lru_cache(maxsize=64)
def _layer(path: str, dtype: str, ny: int, nx: int) -> np.ndarray:
    return np.fromfile(path, dtype).reshape(ny, nx)


def layer(meta: dict, d: Path, name: str, dtype) -> np.ndarray:
    g = meta["grid"]
    return _layer(str(d / meta["layers"][name]), np.dtype(dtype).str, g["ny"], g["nx"])


def span_years(meta: dict) -> float | None:
    """Length of a subsidence stack in years (None for single-pair events)."""
    if meta.get("kind") != "subsidence":
        return None
    a, b = (date.fromisoformat(s) for s in meta["nisar"]["pair"])
    return (b - a).days / 365.25


def sample(meta: dict, d: Path, lon: float, lat: float, radius_m: float = 500) -> dict | None:
    g = meta["grid"]
    grid = Grid(g["epsg"], g["left"], g["top"], g["dx"], g["nx"], g["ny"])
    u, v = grid.uv(lon, lat)
    out = {"u": round(u, 4), "v": round(v, 4)}
    if not (0 <= u <= 1 and 0 <= v <= 1):
        return out | {"inside": False}
    los = layer(meta, d, "los", "<i2") / 10.0                                         # cm
    valid = layer(meta, d, "valid", np.uint8).astype(bool)
    coh = layer(meta, d, "coh", np.uint8) / 255.0
    i, j = min(g["ny"] - 1, int(v * g["ny"])), min(g["nx"] - 1, int(u * g["nx"]))
    r = max(1, int(radius_m / g["dx"]))
    win = (slice(max(0, i - r), i + r + 1), slice(max(0, j - r), j + r + 1))
    vals = los[win][valid[win]]
    out |= {"inside": True, "coherence": round(float(coh[i, j]), 2), "measured": bool(valid[i, j])}
    if "dbchange" in meta["layers"]:                       # flood / fire: backscatter change, not motion
        ddb = layer(meta, d, "dbchange", "<i2") / 10.0
        ch = layer(meta, d, "change", np.uint8) / 255.0
        w = ddb[win][ddb[win] != 0]
        out = {k: v for k, v in out.items() if k not in ("coherence", "measured")}
        if len(w):
            out["db_change"] = round(float(np.median(w)), 1)
        out["change"] = round(float(ch[win].mean()), 2)
        return out
    if valid[i, j]:
        out["motion_cm"] = round(float(los[i, j]), 1)
    if len(vals) >= 5:
        out["local_step_cm"] = round(float(np.percentile(vals, 95) - np.percentile(vals, 5)), 1)
    yrs = span_years(meta)
    if yrs:                                                # subsidence: report the sinking rate
        w5 = (slice(max(0, i - 2), i + 3), slice(max(0, j - 2), j + 3))
        near = los[w5][valid[w5]]
        if len(near) >= 5:
            out["motion_cm"] = round(float(np.median(near)), 1)
            out["rate_cm_yr"] = round(float(np.median(near)) / yrs, 1)
        if len(vals) >= 5:
            out["rate_fastest_cm_yr"] = round(float(np.percentile(vals, 5)) / yrs, 1)
    return out


def show_image(item: dict) -> bool:
    """Only openly licensed images are displayed; news and agency photos are linked, never hosted."""
    lic = (item.get("licence") or "").lower()
    if not item.get("image_url") or any(k in lic for k in ("link only", "link with credit", "no image", "news")):
        return False
    return any(k in lic for k in ("cc by", "cc0", "public domain", "attribution"))


# What the event page gets of a selected media item. thumb_url only for openly licensed images;
# news and agency images go out as their pixelated preview, linked to the source.
MEDIA_FIELDS = ("id", "source", "type", "title", "caption", "lat", "lon", "loc_method", "date", "when", "page_url", "credit",
                "licence", "showable", "preview_url", "preview", "approx", "tier", "nisar", "pair", "located")


def merge_media(d: Path, editorial: dict) -> tuple[list[dict], dict]:
    p = d / "media.json"
    dec = editorial.get("media", {})
    if not p.exists():
        return [], dec
    m = json.loads(p.read_text())
    pool = {i["id"]: i for i in m["items"]} | {u["id"]: u | {"unlocated": True} for u in m["unlocated"]}
    out = []
    for mid, e in dec.items():
        if e.get("status") != "selected":
            continue
        it = pool.get(mid)
        if it is None:
            print(f"  media {mid}: selected but no longer in the harvest (re-run pipeline.media or drop it)")
            continue
        pub = {k: it.get(k) for k in MEDIA_FIELDS if it.get(k) is not None}
        pub |= {"thumb_url": it.get("thumb_url") if it.get("showable") else None, "unlocated": bool(it.get("unlocated")),
                # an approximate location is never one side of a hit/spared pair
                "side": None if it.get("approx") or it.get("unlocated") else it.get("side_hint"),
                "editor_caption": e.get("caption"), "order": e.get("order"), "status": "selected"}
        out.append(pub)
    out.sort(key=lambda x: (x["order"] is None, x["order"] or 0))
    return out, dec


def story_previews(slug: str, items: list[dict]):
    """Link-only story photos (agency, news) get the same gently pixelated preview as harvested media."""
    from .media import pixelate
    for it in items:
        if it.get("image_url") and not it["show_image"]:
            x = {"id": it["id"], "thumb_url": it["image_url"], "page_url": it.get("page_url")}
            if pixelate.preview(slug, x):
                it["preview_url"], it["preview"] = x["preview_url"], x["preview"]


def build(slug: str):
    d = ROOT / "site" / "events" / slug
    meta = json.loads((d / "meta.json").read_text())
    research = json.loads((ROOT / "research" / "stories" / f"{slug}.json").read_text())
    ed_path = ROOT / "research" / "editorial" / f"{slug}.json"
    editorial = json.loads(ed_path.read_text()) if ed_path.exists() else {}
    items = []
    for it in research["items"]:
        s = sample(meta, d, it["lon"], it["lat"])
        e = editorial.get("items", {}).get(it["id"], {})
        items.append(it | {"nisar": s, "show_image": show_image(it),
                           "status": e.get("status", "candidate"), "caption": e.get("caption"), "order": e.get("order")})
    story_previews(slug, items)
    media, media_status = merge_media(d, editorial)
    out = {"slug": slug, "boundary": editorial.get("boundary") or research.get("boundary"), "items": items,
           "media": media, "media_status": media_status}
    (d / "stories.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    sel = sum(i["status"] == "selected" for i in items)
    print(f"{slug}: {len(items)} candidates, {sel} selected; media {len(media)} selected "
          f"({sum(i.get('preview') == 'pixelated' for i in items)} story photos with a pixelated preview)")
    for it in items:
        n = it["nisar"]
        if "change" in n:
            print(f"  {it['id']} {it['side']:10} {it['status']:9} dB {n.get('db_change', '-'):>6} change {n['change']:.2f}  {it['title'][:60]}")
            continue
        rate = f"rate {n.get('rate_cm_yr', '-'):>6} fastest {n.get('rate_fastest_cm_yr', '-'):>6} cm/yr " if "rate_fastest_cm_yr" in n else ""
        print(f"  {it['id']} {it['side']:10} {it['status']:9} motion {n.get('motion_cm', '-'):>6} step {n.get('local_step_cm', '-'):>6} "
              f"{rate}coh {n.get('coherence', '-')}  {it['title'][:60]}")


if __name__ == "__main__":
    from . import credits
    for s in sys.argv[1:]:
        build(s)
    if credits.write():                                       # per-event credits follow the picks
        print("CREDITS.md updated")
