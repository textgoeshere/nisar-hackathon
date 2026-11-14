"""Locate items that carry no coordinates by the seed places (and anchors) named in their text."""
from __future__ import annotations

import re

from .common import norm

CAP = {"high": "medium", "medium": "low", "low": "low"}   # a photo *of* a named place isn't *at* its point


def gazetteer(seeds: dict) -> list[tuple[str, dict]]:
    """(normalised alias, place) pairs, longest alias first so 'Isla Cañas' beats 'Cañas'."""
    out = []
    for p in seeds.get("places", []):
        if p.get("lat") is None:
            continue
        for a in [p["name"]] + p.get("aliases", []):
            a = norm(a)
            if len(a) >= 2:
                out.append((a, p))
    return sorted(out, key=lambda x: -len(x[0]))


def _hit(alias: str, text: str) -> int:
    """Position of alias in text, or -1."""
    if re.search(r"[぀-ヿ一-鿿]", alias):        # CJK: substring match
        return text.find(alias)
    m = re.search(rf"(?<![\w]){re.escape(alias)}(?![\w])", text)
    return m.start() if m else -1


def by_text(it: dict, gaz) -> bool:
    """Place an item at the seed place its title names first (then caption, then categories): "MOP
    reabre puente en Pedasí ... Tonosí" goes to Pedasí. Longer aliases win ties ('Isla Cañas' over 'Cañas')."""
    parts = [it.get("title", ""), it.get("caption", ""), it.get("_categories", "")]
    best = None
    for k, part in enumerate(parts):
        text = norm(str(part or "").replace("_", " "))
        for alias, p in gaz:                                 # longest alias first
            pos = _hit(alias, text)
            if pos >= 0 and (best is None or (k, pos) < best[0]):
                best = ((k, pos), p)
        if best:
            break
    if not best:
        return False
    p = best[1]
    it |= {"lat": p["lat"], "lon": p["lon"], "loc_method": f"text: {p['name']}",
           "loc_confidence": CAP[p.get("conf", "low")], "_place": p}
    return True
