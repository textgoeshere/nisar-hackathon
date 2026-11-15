"""Establishing shots: for a story with no photo of its own, an openly licensed recent Wikimedia
Commons photo of the place it is about. Context, never evidence: the event page labels it
"Establishing shot ... not of the event".

    .venv/bin/python -m pipeline.establishing panama-quake [...]   # -> research/establishing/<slug>.json
    .venv/bin/python -m pipeline.establishing --all

For each story without a showable image or pixelated preview:

1. Commons geosearch within 1.5 km of the story's point (then 5 km if nothing usable);
2. else full-text search on the place name (first part of `place`, then with the next part).

Candidates must be CC BY / BY-SA / CC0 / public domain (no NC/ND), raster photos (no maps, logos,
diagrams, flags, arms, documents, portraits). Scored on distance, landscape shape, and age: photos
taken in the last ~10 years before the event are preferred. For an *affected* story a photo taken
after the event is never used (it might show the damage and pass as the event); for an
*unaffected* story the most recent wins. One pick per story, a file used once per event.

The output is plain JSON for review: delete an entry (or put `"rejected": true` on it) and it is
skipped; add `"pin": "File:..."` to force a specific Commons file on the next run. HTTP is cached
(pipeline.media.common.get), so re-runs are cheap.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import unquote

from .media.common import FetchError, get, is_open, km, norm
from .media.commons import API, _to_item
from .stories import show_image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "research" / "establishing"
PROPS = dict(prop="imageinfo|coordinates", iiprop="url|extmetadata|timestamp|size|mime", iiurlwidth=800,
             coprop="type", coprimary="all", colimit="max", format="json", formatversion=2)
BAD = re.compile(r"\b(map|maps|mapa|karte|carte|locator|location|logo|diagram|chart|graph|plan|flag|bandera|coat of arms|"
                 r"escudo|seal|emblem|wappen|portrait|retrato|document|scan|page|signature|poster|stamp|banknote|coin|"
                 r"screenshot|svg|icon|book|newspaper|cover|sketch|drawing|painting|insect|bird|moth|butterfly|beetle|"
                 r"spider|flower|orchid|specimen|selfie|damage|destroyed|collapsed|rubble|earthquake|flood|eruption|"
                 r"avalanche|wildfire|landslide|turtle|tortuga|animal|museum|pendant|pendente|ceramic|artifact|astronaut|"
                 r"ISS\d+|view of earth|view of|satellite|sentinel|landsat|coat of|turtles|animals|plants?|flora|fauna|cactus|"
                 r"cactaceae|disocactus|honey|miel|food|dish|fire|burn|burned|burnt|after|aftermath|ruins|salmon|fish|vase|vaso|"
                 r"pottery|whiskey|aerial photograph|tree|carbonatite|rock sample|mineral|puja|puza|festival)\b", re.I)
# Picks reviewed by eye and turned down (logos, people, near-duplicates): never offered again.
REJECT = {"File:Uki Kumamoto chapter.JPG", "File:Gugusan Pulau Anak Krakatau.2. 10042017.jpg"}
DOD = re.compile(r"^File:\d{6}-[A-Z]-")                          # military PR photos (ship visits, crews)
TAXON = re.compile(r"^File:[A-Z][a-z]+ [a-z]+( [a-z]+)?[ _(]*\d")      # iNaturalist-style species photos

# The main place each story is about, as Commons knows it (search terms, most specific first). The
# story's own `place` is a precise locator ("Dusun V (RT 21 and RT 33), Desa Aeramo, ...") and makes
# a poor search term. Stories not listed fall back to the first part of `place`.
PLACES = {
    "krakatau-01": ["Anak Krakatau"], "krakatau-02": ["Anak Krakatau"], "krakatau-03": ["Anak Krakatau", "Krakatoa", "Sunda Strait"],
    "krakatau-05": ["Anak Krakatau", "Krakatoa", "Sunda Strait"],
    "aspen-01": ["Pueblo Mountain Park", "Beulah, Colorado"], "aspen-02": ["Beulah, Colorado"],
    "aspen-03": ["Beulah, Colorado", "Wet Mountains"], "aspen-04": ["Wet Mountains"], "aspen-05": ["Rye, Colorado", "Wet Mountains"],
    "bangladesh-01": ["Rajnagar Upazila", "Moulvibazar"], "bangladesh-02": ["Rajnagar Upazila", "Moulvibazar"],
    "bangladesh-03": ["Manu River", "Moulvibazar"], "bangladesh-04": ["Kamarchak", "Rajnagar Upazila"],
    "flores-01": ["Aesesa", "Mbay", "Nagekeo"], "flores-02": ["Aeramo", "Mbay", "Nagekeo"], "flores-03": ["Wolowae", "Nagekeo"],
    "flores-04": ["Nangaroro", "Nagekeo"], "flores-05": ["Ende"],
    "fuego-01": ["Yepocapa", "Volcán de Fuego"], "fuego-02": ["Yepocapa", "Volcán de Fuego"],
    "fuego-03": ["Yepocapa", "Volcán de Fuego"], "fuego-04": ["Yepocapa", "Volcán de Fuego"],
    "fuego-05": ["Alotenango", "Volcán de Fuego"],
    "kumamoto-07": ["Uki, Kumamoto", "Uki"],
    "langtang-05": ["Rasuwagadhi", "Timure", "Bhote Koshi"],
    "little-01": ["Entiat River", "Entiat Valley"], "little-02": ["Entiat River", "Entiat Valley"],
    "little-03": ["Entiat River", "Entiat Valley"], "little-04": ["Entiat River", "Entiat Valley"],
    "panama-01": ["Búcaro", "Tonosí", "Los Santos Province"],
    "panama-04": ["Isla Cañas", "Isla de Cañas", "Tonosí", "Los Santos Province"], "panama-05": ["Macaracas"],
    "panama-06": ["Río Oria", "Pedasí"], "panama-07": ["Las Tablas"], "panama-08": ["Tonosí", "Los Santos Province"],
    "panama-09": ["Cambutal", "Tonosí", "Los Santos Province"],
    "venezuela-01": ["Morón, Carabobo", "Morón"], "venezuela-02": ["Tucacas"], "venezuela-03": ["Boca de Aroa", "Boca de Aroa"],
    "venezuela-04": ["Farriar", "Veroes"], "venezuela-05": ["San Felipe, Yaracuy"],
}


def _query(params) -> list[dict]:
    try:
        r = get(API, params | PROPS)
    except FetchError as e:
        print(f"    commons: {e}")
        return []
    return (r.get("query") or {}).get("pages", [])


def _cands(pages: list[dict], how: str) -> list[dict]:
    out = []
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        if ii.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
            continue
        it = _to_item(p, how)
        if it:
            out.append(it | {"_w": ii.get("width") or 0, "_h": ii.get("height") or 0, "_file": p["title"]})
    return out


def geosearch(lat, lon, r_m) -> list[dict]:
    return _cands(_query(dict(action="query", generator="geosearch", ggscoord=f"{lat}|{lon}", ggsradius=r_m,
                              ggslimit=100, ggsnamespace=6)), f"geosearch {r_m} m")


def search(q: str) -> list[dict]:
    return _cands(_query(dict(action="query", generator="search", gsrsearch=f"{q} filetype:bitmap", gsrnamespace=6,
                              gsrlimit=40)), f"search: {q}")


def category(q: str) -> list[dict]:
    """Files in the Commons category named after the place (best match of a category search)."""
    try:
        r = get(API, dict(action="query", list="search", srsearch=q, srnamespace=14, srlimit=5, format="json", formatversion=2))
    except FetchError:
        return []
    head = norm(q.split(",")[0])
    for h in (r.get("query") or {}).get("search", []):
        t = norm(h["title"].removeprefix("Category:"))
        if t == head or t.startswith(head + ",") or t.startswith(head + " ("):
            return _cands(_query(dict(action="query", generator="categorymembers", gcmtitle=h["title"], gcmtype="file",
                                      gcmlimit=200)), f"category: {h['title']}")
    return []


def by_title(title: str) -> list[dict]:
    return _cands(_query(dict(action="query", titles=title)), "pinned")


def place_queries(place: str) -> list[str]:
    """'Isla Cañas (village), Tonosí district, Los Santos' -> ['Isla Cañas Tonosí', 'Isla Cañas']."""
    parts = [re.sub(r"\([^)]*\)", "", p).strip() for p in re.split(r"[,;]", place)]
    parts = [re.sub(r"\b(OSM|town centre|city centre|village|hamlet|district|municipality|upazila|union|"
                    r"Kecamatan|Desa|Dusun|Kota|town|city)\b", "", p, flags=re.I).strip(" -/") for p in parts]
    parts = [re.sub(r"\s+", " ", p) for p in parts if len(p) > 2 and not re.search(r"\d", p)]
    qs = []
    if len(parts) >= 2:
        qs.append(f"{parts[0]} {parts[1]}")
    if parts:
        qs.append(parts[0])
    return qs


def usable(c: dict) -> bool:
    lic = norm(c.get("licence"))
    if not is_open(c.get("licence")) or "nc" in re.split(r"[\s-]+", lic) or "nd" in re.split(r"[\s-]+", lic):
        return False
    text = f"{c['title']} {c.get('_categories', '')}"
    return not BAD.search(text) and not TAXON.match(c["_file"]) and not DOD.match(c["_file"]) and c["_w"] >= 640 and c["_w"] >= c["_h"] and c["_file"] not in REJECT


def score(c: dict, story: dict, event_date: str) -> float | None:
    taken = c.get("date") or c.get("_uploaded")
    if (m := re.search(r"(?<!\d)(18|19|20)\d{2}(?!\d)", c["_file"])) and taken and m.group(0) < taken[:4]:
        taken = f"{m.group(0)}-01-01"                       # "... 1969 (flickr id).jpg": the year in the title
    c["date"] = taken
    ev = date.fromisoformat(event_date)
    if not taken or (ev - date.fromisoformat(taken)).days > 15 * 365.25:
        return None                                        # undated or older than ~15 years: not establishing
    if story["side"] == "affected" and taken and taken >= event_date:
        return None                                        # might show the event's damage: never
    s = 0.0
    if taken:
        age = (ev - date.fromisoformat(taken)).days / 365.25
        s += 3 - min(age, 15) / 5 if age >= 0 else (3.5 if story["side"] == "unaffected" else 0)
        if story["side"] == "unaffected":
            s += 1 - min(abs(age), 10) / 10               # unaffected: the most recent wins
    else:
        s -= 1.5
    if c.get("distance_m") is not None:
        s -= c["distance_m"] / 1000                        # 1 point per km
    elif c["_found_by"].startswith("search"):
        s -= 1.0                                           # name match only, location unknown
    ar = c["_w"] / max(1, c["_h"])
    s += 1.0 if 1.2 <= ar <= 2.2 else -1.0 if ar < 1 else 0
    return s


def stem(url: str) -> str:
    """Same picture, other crop or version: one key."""
    return re.sub(r"[\W_]*(cropped|crop|edit|edited|\d)?[\W_]*\.\w+$", "", norm(unquote(url.rsplit("/", 1)[-1])).replace("(cropped)", ""))


def about(c: dict, q: str, country: str) -> bool:
    """A full-text hit counts only if it names the place and is geotagged near it or names the country."""
    text = norm(f"{c['title']} {c['caption']} {c.get('_categories', '')}")
    if norm(q.split(",")[0]) not in text:
        return False
    return c.get("lat") is not None or norm(country) in text or any(norm(p) in text for p in q.split(",")[1:])


def find(story: dict, event_date: str, used: set[str], pin: str | None = None, country: str = "") -> dict | None:
    def dist(c):
        if c.get("lat") is not None:
            c["distance_m"] = round(km(story["lat"], story["lon"], c["lat"], c["lon"]) * 1000)
        else:
            c["distance_m"] = None
        return c

    if pin:
        rounds = [by_title(pin)]
    else:
        rounds = [lambda: geosearch(story["lat"], story["lon"], 2000)]
        for q in PLACES.get(story["id"], []):
            rounds += [lambda q=q: category(q), lambda q=q: [c for c in search(q) if about(c, q, country)]]
        for q in [] if story["id"] in PLACES else place_queries(story.get("place") or story["title"])[-1:]:
            rounds += [lambda q=q: [c for c in search(q) if about(c, q, country)]]   # unchecked name: no category
        rounds += [lambda: geosearch(story["lat"], story["lon"], 8000)]
    for r in rounds:
        cands = [dist(c) for c in (r if pin else r())]
        if not pin:
            cands = [c for c in cands if usable(c) and stem(c["page_url"]) not in used and c["page_url"] != story.get("page_url")
                     and (c["distance_m"] is None or c["distance_m"] <= 25000)
                     and (c["distance_m"] is not None or not c["_found_by"].startswith("geosearch"))]
        scored = [(s, c) for c in cands if (s := score(c, story, event_date)) is not None or pin]
        if scored:
            s, c = max(scored, key=lambda x: x[0] or 0)
            return {"title": c["_file"], "place": label(story, c), "thumb_url": c["thumb_url"], "page_url": c["page_url"],
                    "credit": c["credit"], "licence": c["licence"], "date": c.get("date") or c.get("_uploaded"),
                    "distance_m": c["distance_m"], "found_by": c["_found_by"], "description": c["caption"][:300]}
    return None


def label(story: dict, c: dict) -> str:
    """What the caption calls the place: the story's own spot when the photo is within 2 km of it,
    else the wider place the search was for."""
    if c["distance_m"] is not None and c["distance_m"] <= 2000:
        return short_place(story)
    found = c["_found_by"].split(": ", 1)
    q = re.sub(r"\s*\([^)]*\)", "", found[1].removeprefix("Category:")) if len(found) > 1 else None
    return q or (PLACES.get(story["id"]) or [short_place(story)])[0]


def short_place(story: dict) -> str:
    p = re.sub(r"\([^)]*\)", "", story.get("place") or "").split(",")[0].split(";")[0].strip()
    return re.sub(r"\s+", " ", p) or story["title"]


def needs(slug: str, it: dict) -> bool:
    """No image of its own: nothing showable, nothing to pixelate (pipeline.stories makes the final call:
    it attaches the establishing shot only when the story ends up with no image and no preview)."""
    return not show_image(it) and not it.get("image_url") and not it.get("preview_file")


def run(slug: str):
    research = json.loads((ROOT / "research" / "stories" / f"{slug}.json").read_text())
    meta = json.loads((ROOT / "site" / "events" / slug / "meta.json").read_text())
    event_date, country = meta["date"], meta.get("name", "").rsplit(",", 1)[-1].strip()
    path = OUT / f"{slug}.json"
    old = json.loads(path.read_text()) if path.exists() else {}
    out, used = {}, set()
    for it in research["items"]:
        o = old.get(it["id"])
        if o and (o.get("rejected") or (o.get("page_url") and not o.get("pin"))):
            out[it["id"]] = o                              # reviewed or already found: keep
            if o.get("page_url"):
                used.add(stem(o["page_url"]))
            continue
        if not needs(slug, it):
            continue
        e = find(it, event_date, used, (o or {}).get("pin"), country)
        if e:
            used.add(stem(e["page_url"]))
            out[it["id"]] = e
        print(f"  {it['id']:16} {it['side']:10} " + (f"{e['date'] or '?':10} {e['distance_m'] if e['distance_m'] is not None else '?':>6} m  "
                                                   f"{e['title'][:70]}  [{e['found_by']}]" if e else "none found"))
    OUT.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"{slug}: {sum('page_url' in v for v in out.values())} establishing shots -> {path.relative_to(ROOT)}")


def load(slug: str) -> dict:
    p = OUT / f"{slug}.json"
    return {k: v for k, v in json.loads(p.read_text()).items() if v.get("page_url") and not v.get("rejected")} if p.exists() else {}


if __name__ == "__main__":
    slugs = sys.argv[1:]
    if slugs == ["--all"]:
        slugs = [p.stem for p in sorted((ROOT / "research" / "stories").glob("*.json"))
                 if (ROOT / "site" / "events" / p.stem / "meta.json").exists()]
    for s in slugs:
        run(s)
