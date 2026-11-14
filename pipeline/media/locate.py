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


def _hit(alias: str, text: str) -> bool:
    if re.search(r"[぀-ヿ一-鿿]", alias):        # CJK: substring match
        return alias in text
    return re.search(rf"(?<![\w]){re.escape(alias)}(?![\w])", text) is not None


def by_text(it: dict, gaz) -> bool:
    text = norm(f"{it.get('title', '')} {it.get('caption', '')} {it.get('_categories', '')}".replace("_", " "))
    for alias, p in gaz:
        if _hit(alias, text):
            it |= {"lat": p["lat"], "lon": p["lon"], "loc_method": f"text: {p['name']}",
                   "loc_confidence": CAP[p.get("conf", "low")], "_place": p}
            return True
    return False
