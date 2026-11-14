"""Step 5: place researched ground stories on the event grid and ask NISAR what it saw there.

    .venv/bin/python -m pipeline.stories kumamoto-quake

Input:  research/stories/<slug>.json    candidate stories and photos (see docs/5-stories.md)
        editorial/<slug>.json            step 6: the human editor's selections and captions
Output: site/events/<slug>/stories.json

For each candidate we compute its (u, v) position on the event grid and sample the NISAR layers
in a small neighbourhood: line-of-sight motion, coherence, and the **local step**, the spread of
motion within ~500 m. A large step means the point sits on the boundary the hypothesis is about;
low coherence means the ground surface there was destroyed or changed.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

from .context import Grid

ROOT = Path(__file__).resolve().parent.parent


def sample(meta: dict, d: Path, lon: float, lat: float, radius_m: float = 500) -> dict | None:
    g = meta["grid"]
    grid = Grid(g["epsg"], g["left"], g["top"], g["dx"], g["nx"], g["ny"])
    u, v = grid.uv(lon, lat)
    out = {"u": round(u, 4), "v": round(v, 4)}
    if not (0 <= u <= 1 and 0 <= v <= 1):
        return out | {"inside": False}
    shape = (g["ny"], g["nx"])
    los = np.fromfile(d / meta["layers"]["los"], "<i2").reshape(shape) / 10.0          # cm
    valid = np.fromfile(d / meta["layers"]["valid"], np.uint8).reshape(shape).astype(bool)
    coh = np.fromfile(d / meta["layers"]["coh"], np.uint8).reshape(shape) / 255.0
    i, j = min(g["ny"] - 1, int(v * g["ny"])), min(g["nx"] - 1, int(u * g["nx"]))
    r = max(1, int(radius_m / g["dx"]))
    win = (slice(max(0, i - r), i + r + 1), slice(max(0, j - r), j + r + 1))
    vals = los[win][valid[win]]
    out |= {"inside": True, "coherence": round(float(coh[i, j]), 2), "measured": bool(valid[i, j])}
    if "dbchange" in meta["layers"]:                       # flood / fire: backscatter change, not motion
        ddb = np.fromfile(d / meta["layers"]["dbchange"], "<i2").reshape(shape) / 10.0
        ch = np.fromfile(d / meta["layers"]["change"], np.uint8).reshape(shape) / 255.0
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
    return out


def show_image(item: dict) -> bool:
    """Only openly licensed images are displayed; news and agency photos are linked, never hosted."""
    lic = (item.get("licence") or "").lower()
    if not item.get("image_url") or any(k in lic for k in ("link only", "link with credit", "no image", "news")):
        return False
    return any(k in lic for k in ("cc by", "cc0", "public domain", "attribution"))


def build(slug: str):
    d = ROOT / "site" / "events" / slug
    meta = json.loads((d / "meta.json").read_text())
    research = json.loads((ROOT / "research" / "stories" / f"{slug}.json").read_text())
    ed_path = ROOT / "editorial" / f"{slug}.json"
    editorial = json.loads(ed_path.read_text()) if ed_path.exists() else {}
    items = []
    for it in research["items"]:
        s = sample(meta, d, it["lon"], it["lat"])
        e = editorial.get("items", {}).get(it["id"], {})
        items.append(it | {"nisar": s, "show_image": show_image(it),
                           "status": e.get("status", "candidate"), "caption": e.get("caption"), "order": e.get("order")})
    out = {"slug": slug, "boundary": editorial.get("boundary") or research.get("boundary"), "items": items}
    (d / "stories.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    sel = sum(i["status"] == "selected" for i in items)
    print(f"{slug}: {len(items)} candidates, {sel} selected")
    for it in items:
        n = it["nisar"]
        if "change" in n:
            print(f"  {it['id']} {it['side']:10} {it['status']:9} dB {n.get('db_change', '-'):>6} change {n['change']:.2f}  {it['title'][:60]}")
            continue
        print(f"  {it['id']} {it['side']:10} {it['status']:9} motion {n.get('motion_cm', '-'):>6} step {n.get('local_step_cm', '-'):>6} "
              f"coh {n.get('coherence', '-')}  {it['title'][:60]}")


if __name__ == "__main__":
    for s in sys.argv[1:]:
        build(s)
