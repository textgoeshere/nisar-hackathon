"""Step 5b: harvest geolocated media candidates for an event, for the editor to triage.

    .venv/bin/python -m pipeline.media kumamoto-quake [more slugs] [--only commons,openverse,...]

Input:  research/media/seeds/<slug>.json   search seeds (see seeds.py; resolved in place)
        research/stories/<slug>.json       hand-researched items, carried over as source "research"
        site/events/<slug>/meta.json + layers
Output: research/media/<slug>.json         array of items (docs/5b-media.md)
        research/media/unlocated/<slug>.json relevant hits not placed in the frame
        site/events/<slug>/media.json      both, for the editor; media/*.png pixelated news/agency previews
"""
from __future__ import annotations

import difflib
import hashlib
import json
import os
import re
import sys
import time
from collections import Counter
from datetime import date, timedelta
from urllib.parse import urlsplit

from .. import stories
from . import commons, gdelt, locate, mapillary, openverse, panoramax, pixelate, seeds
from .common import ROOT, canon_url, in_bounds, is_open, item, km, log, norm, when

SOURCES = ["research", "validation", "commons", "openverse", "mapillary", "panoramax", "gdelt"]
PRIORITY = {s: k for k, s in enumerate(SOURCES)}         # who wins a duplicate
EVENT_WORDS = ["地震", "震災", "被害", "earthquake", "quake", "damage", "terremoto", "sismo", "daños", "danos", "colaps",
               "derrumb", "hundimiento", "subsidence", "sinking"]
OUT = ROOT / "research" / "media"
OPENVERSE_BUDGET_S = int(os.environ.get("MEDIA_OPENVERSE_BUDGET_S", 420))


def research_items(slug: str) -> list[dict]:
    p = ROOT / "research" / "stories" / f"{slug}.json"
    if not p.exists():
        return []
    out = []
    for r in json.loads(p.read_text())["items"]:
        lic = r.get("licence") or ""
        news = any(k in lic.lower() for k in ("news", "report", "link"))
        out.append(item(source="research", type="news" if news and not r.get("image_url") else "photo",
                        title=r["title"], caption=r.get("what_it_shows", ""), lat=r["lat"], lon=r["lon"],
                        loc_method=f"research: {r.get('place', '')}"[:160], loc_confidence=r.get("confidence") or "medium",
                        date=r.get("date"), thumb_url=r.get("image_url") or None, page_url=r.get("page_url"),
                        credit=r.get("credit"), licence=lic, side_hint=r.get("side"), _research_id=r["id"],
                        _showable=stories.show_image(r)))
    return out


def anchor_items(s: dict) -> list[dict]:
    out = []
    for a in s.get("anchors", []):
        if a.get("lat") is None:
            continue
        # A seed may carry its own open licence (GSJ field photos: GSJ Terms of Use, CC BY 4.0
        # compatible); then the photo is shown, not pixelated.
        lic = a.get("licence") or "data / report, link with credit"
        photo = bool(a.get("image")) and is_open(lic)
        out.append(item(source="validation", type="photo" if photo else "damage" if a["kind"] == "damage" else "measurement",
                        title=a["name"], caption=a.get("value", ""), lat=a["lat"], lon=a["lon"],
                        loc_method=a.get("geocoded") and f"nominatim: {a['q']}" or "validation-sources.md",
                        loc_confidence=a.get("conf", "high" if a["kind"] == "gnss" else "medium"),
                        thumb_url=a.get("image"), page_url=a.get("page_url") or a.get("image"), credit=a.get("credit"),
                        licence=lic, side_hint=a.get("side"), tier=1, _anchor=a))
    return out


# Words that make an older photo near an anchor a "before" view of the ground or the landmark there,
# not a plane at the airport station or a skyline. Latin words match at a word start, CJK anywhere.
GROUND_WORDS = ["road", "street", "pavement", "sidewalk", "bridge", "church", "cathedral", "temple", "shrine", "monument",
                "column", "stairs", "steps", "well", "paddy", "rice field", "levee", "embankment", "school", "riverbank",
                "calle", "avenida", "carretera", "camino", "banqueta", "acera", "puente", "iglesia", "templo", "catedral",
                "parroquia", "monumento", "columna", "escalinata", "escalon", "pozo", "suelo", "terreno", "dique", "道路",
                "水田", "田んぼ", "橋", "神社", "寺", "学校", "堤防", "鳥居", "石垣"]
LANDMARK_STOP = {"gnss", "geonet", "station", "airport", "aeropuerto", "photo", "historical", "below", "level", "added",
                 "since", "steps", "street", "value", "published", "building", "buildings", "damaged", "destroyed",
                 "surface", "rupture", "sideways", "fissure", "sinking", "crack", "trench", "foundations", "lifted",
                 "field", "paddy", "schoolyard", "vertical", "largest", "offset", "track", "right-lateral"}


def _text(it: dict) -> str:
    return norm(f"{it['title']} {it['caption']} {it.get('_categories', '')}".replace("_", " "))


def _has(text: str, words) -> bool:
    for w in words:
        w = norm(w)
        if re.search(r"[぀-ヿ一-鿿]", w):
            if w in text:
                return True
        elif re.search(rf"(?<![a-z0-9]){re.escape(w)}", text):
            return True
    return False


def about_event(text: str, s: dict) -> bool:
    return any(norm(w) in text for w in EVENT_WORDS + s["terms"]["match"])


def news_worth_listing(it: dict, s: dict) -> bool:
    """An unplaced headline earns a row in the Unlocated tab only if it names a seed place or a
    ground effect: not death tolls, aid flights, politics or other countries' quakes."""
    names = [p["name"] for p in s.get("places", []) + s.get("anchors", []) if p.get("name")]
    names = [n for n in names if len(norm(n)) >= 4]
    return _has(norm(it["title"]), s["terms"]["match"] + names)


def near_anchors(it: dict, anchors, r_km=0.3) -> list[dict]:
    if it.get("lat") is None:
        return []
    return [a for a in anchors if km(it["lat"], it["lon"], a["lat"], a["lon"]) < r_km]


def landmark(text: str, near: list[dict]) -> bool:
    """Text names the landmark at a nearby offset/damage anchor (its name's distinctive words or its
    aliases): "Columna de la Independencia" at the Ángel, "LaSantisimaChurchDF" at the Santísima.
    GNSS stations have no landmark: a photo at one is about the ground or about nothing."""
    for a in near:
        if a.get("kind") == "gnss":
            continue
        toks = [norm(x) for x in a.get("aliases", [])]
        for t in re.split(r"[^\w]+", norm(a["name"])):
            if re.search(r"[぀-ヿ一-鿿]", t) and len(t) >= 2:
                toks.append(t)
            elif len(t) >= 5 and not t.isdigit() and t not in LANDMARK_STOP:
                toks.append(t)
        if any(t and (t in text or t in text.replace(" ", "")) for t in toks):
            return True
    return False


def is_quake(s: dict, ref: str | None) -> bool:
    return bool(ref) and s.get("ref_date") is None            # subsidence seeds carry a ref_date instead


def relevant(it: dict, s: dict, ref: str | None, anchors) -> bool:
    """Keep a Commons/Openverse hit only if it is about the event or the ground, not any old photo nearby."""
    text = _text(it)
    how = it.get("_found_by", "")
    if is_quake(s, ref):                                      # drop older events' photos (Kumamoto 2016)
        d = it.get("date") or ""
        up = it.get("_uploaded") or ""
        if not how.startswith("geosearch") and ((d and d < ref) or (up and up < ref)):
            return False
    if how.startswith("category") or about_event(text, s):
        return True
    if is_quake(s, ref) and (it.get("date") or "") >= ref:
        return True                                            # anything shot there after the event
    # An older photo survives only right at an anchor, and only as a "before" view of the ground or
    # the landmark: not airliners at the airport GNSS station, not generic city shots.
    near = near_anchors(it, anchors)
    return bool(near) and (_has(text, GROUND_WORDS + s["terms"]["match"]) or landmark(text, near))


def tier_of(it: dict, s: dict, anchors, places, step_thr, quake: bool) -> int:
    """1 = at an anchor AND evidently about the event there; 2 = text names a visible displacement;
    3 = on the boundary (near an anchor, boundary place or NISAR step); 4 = context.
    Proximity alone never makes tier 1. Street views carry no text, so they reach tier 1 only when
    shot after the event at an anchor; before-views top out at 3 (pairs are lifted by the caller)."""
    if it["source"] == "validation":
        return 1
    text = norm(f"{it['title']} {it['caption']} {it.get('_categories', '')}")
    street = it["type"] == "street"                          # street titles name the centre, not the scene
    precise = it["loc_confidence"] in ("high", "medium") and not it.get("approx")
    near = near_anchors(it, anchors) if precise else []
    if near:
        # A GNSS station shows nothing on the ground, so an after-view there is not tier 1.
        ground = [a for a in near if a.get("kind") != "gnss"]
        if quake and ((not street and (about_event(text, s) or it.get("_found_by", "").startswith("category")))
                      or (it["when"] == "after" and ground)):
            return 1
        if not quake and not street and (_has(text, s["terms"]["match"]) or landmark(text, near)):
            return 1                                           # subsidence: any date, if it shows the sinking
    if not street and any(norm(t) in text for t in s["terms"]["match"]):
        return 2
    # Tier 3 needs a real position: an item pinned to a town centroid by its caption says nothing
    # about whether it sits on the boundary.
    if not precise:
        return 4
    n = it["nisar"]
    if (n.get("local_step_cm") or 0) >= step_thr or near_anchors(it, anchors) or any(
            km(it["lat"], it["lon"], p["lat"], p["lon"]) < 1.0 for p in places
            if not p.get("outside") and (p.get("conf") != "low" or "step_cm" in p)):
        return 3
    return 4


def pair_streets(items: list[dict], r_km=0.05) -> int:
    """Before and after street views of the same spot (within 50 m) become a pair: both keep the
    after view's tier, and each names the other in `pair`."""
    st = [i for i in items if i["type"] == "street"]
    after = [i for i in st if i["when"] == "after"]
    cand = sorted(((km(b["lat"], b["lon"], a["lat"], a["lon"]), b, a) for b in st if b["when"] == "before" for a in after),
                  key=lambda x: x[0])
    n = 0
    for d, b, a in cand:
        if d >= r_km or b.get("pair") or a.get("pair"):
            continue
        b["pair"], a["pair"] = a["id"], b["id"]
        b["pair_m"] = a["pair_m"] = round(d * 1000)
        b["tier"] = a["tier"]
        n += 1
    return n


def side_of(it: dict, meta: dict, s: dict) -> str | None:
    if it.get("side_hint"):
        return it["side_hint"]
    for src in (it.get("_anchor"), it.get("_place")):
        if src and src.get("side"):
            return src["side"]
    n = it["nisar"]
    if meta["kind"] == "subsidence" and n.get("rate_cm_yr") is not None:
        return "affected" if n["rate_cm_yr"] <= -5 else "unaffected" if n["rate_cm_yr"] >= -1 else None
    near = [(km(it["lat"], it["lon"], p["lat"], p["lon"]), p) for p in s.get("places", []) + s.get("anchors", [])
            if p.get("lat") is not None and p.get("side")]
    near = [x for x in near if x[0] < 0.5]
    return min(near, key=lambda x: x[0])[1]["side"] if near else None


def dedupe(items: list[dict]) -> list[dict]:
    items = sorted(items, key=lambda i: (PRIORITY[i["source"]], -len(i.get("caption") or "")))
    seen_url, kept = set(), []
    for it in items:
        u = canon_url(it.get("page_url")) or canon_url(it.get("thumb_url"))
        if it["source"] == "validation":                     # several stations cite one PDF
            u = f"{u}#{it['title']}"
        if u and u in seen_url:
            continue
        t = norm(it["title"])
        if any(km(it["lat"], it["lon"], k["lat"], k["lon"]) < 0.03 and
               difflib.SequenceMatcher(None, t, norm(k["title"])).ratio() > 0.9 and it["type"] == k["type"] for k in kept):
            continue
        seen_url.add(u)
        kept.append(it)
    return kept


def harvest(slug: str, only: set[str] | None = None):
    d = ROOT / "site" / "events" / slug
    meta = json.loads((d / "meta.json").read_text())
    b = meta["grid"]["bounds_lonlat"]
    s = seeds.resolve(slug, meta, d)
    ref = meta.get("date") or s.get("ref_date")
    lang = s.get("lang", ["en"])[0]
    anchors = [a for a in s["anchors"] if a.get("lat") is not None]
    places = [p for p in s["places"] + s.get("steps", []) if p.get("lat") is not None]
    centres = seeds.centres(s)
    gaz = locate.gazetteer(s)
    use = lambda name: only is None or name in only
    raw: list[dict] = []
    stats = {}

    def run(name, fn):
        if not use(name):
            return
        log(f"  {name} ...")
        try:
            got = fn()
        except Exception as e:                               # one broken source shouldn't sink the run
            log(f"  {name}: FAILED {type(e).__name__}: {e}")
            got = []
        stats[name] = len(got)
        log(f"  {name}: {len(got)} raw")
        raw.extend(got)

    run("research", lambda: research_items(slug))
    run("validation", lambda: anchor_items(s))

    def _commons():
        got = commons.geosearch(centres, radius_m=600)
        for c in s.get("commons_categories", []):
            got += commons.category(c, depth=1)
        for q in s["terms"]["local"] + s["terms"]["en"][:4] + s["context"]:
            got += commons.search(q, limit=40)
        return got
    run("commons", _commons)

    def _openverse():
        got = []
        where = s.get("openverse_place") or s["context"][0]
        deadline = time.time() + OPENVERSE_BUDGET_S          # Openverse often takes minutes per query
        qs = s["context"][:3] + [f"{t} {where}" for t in s["terms"]["en"][:2]] + s["terms"]["local"][:2]
        for q in qs:
            got += openverse.search(q, pages=1, deadline=deadline)
        if time.time() > deadline:
            log(f"    openverse: time budget ({OPENVERSE_BUDGET_S} s) spent; later queries skipped")
        return got
    run("openverse", _openverse)

    run("mapillary", lambda: mapillary.harvest(centres, ref if s.get("ref_date") is None else s["ref_date"]))
    run("panoramax", lambda: panoramax.harvest(centres, ref if s.get("ref_date") is None else s["ref_date"]))

    def _gdelt():
        if s.get("news_span"):
            t0, t1 = s["news_span"]
        else:
            t0 = ref
            t1 = min(date.today(), date.fromisoformat(ref) + timedelta(days=s.get("news_window_days") or 60)).isoformat()
        got = []
        for g in s.get("gdelt", []):
            got += gdelt.search(g["query"], g.get("sourcelang"), t0, t1)
        return got
    run("gdelt", _gdelt)

    # Locate what came without coordinates, then keep only relevant items inside the grid.
    unloc = [i for i in raw if i.get("lat") is None]
    for it in unloc:
        locate.by_text(it, gaz)
    news = [i for i in raw if i["source"] == "gdelt"]
    n_geo = gdelt.geocode_titles(news, b, lang) if news else 0
    items, dropped, unlocated = [], Counter(), []
    placed = sum(1 for i in unloc if i.get("lat") is not None)

    def keep_unlocated(it, why=None):
        unlocated.append({k: it.get(k) for k in ("source", "type", "title", "caption", "date", "page_url", "thumb_url",
                                                 "credit", "licence")} | {"found_by": it.get("_found_by"), "located": why})

    for it in raw:
        if it.get("lat") is None:
            dropped[f"{it['source']}: not located"] += 1
            if it["source"] == "gdelt" and not news_worth_listing(it, s):
                dropped["gdelt: unlocated, off-topic headline"] += 1
            elif it["source"] == "gdelt" or (it["source"] in ("commons", "openverse") and relevant(it, s, ref, anchors)):
                keep_unlocated(it)
            continue
        if not in_bounds(it["lat"], it["lon"], b):
            dropped[f"{it['source']}: outside grid"] += 1
            p = it.get("_place") or {}
            if p.get("outside") and (it["source"] == "gdelt" or relevant(it, s, ref, anchors)):
                keep_unlocated(it, f"{p['name']}, outside the NISAR frame")     # the editor can still pick it
            continue
        if it["source"] in ("commons", "openverse") and not relevant(it, s, ref, anchors):
            dropped[f"{it['source']}: not relevant"] += 1
            continue
        n = stories.sample(meta, d, it["lon"], it["lat"])
        if not n.get("inside"):
            dropped[f"{it['source']}: outside grid"] += 1
            continue
        it["nisar"] = {k: n[k] for k in ("u", "v", "motion_cm", "local_step_cm", "coherence", "measured", "rate_cm_yr",
                                         "rate_fastest_cm_yr") if k in n}
        items.append(it)
    items = dedupe(items)
    step_thr = 0.5 * max((p.get("step_cm") or 0) for p in s.get("steps", [{}]))
    quake = is_quake(s, ref)
    for it in items:
        key = canon_url(it.get("page_url")) or f"{it['title']}{it['lat']:.4f}"
        it["id"] = it.pop("_research_id", None) or f"{slug.split('-')[0]}-{it['source'][:4]}-{hashlib.sha1(key.encode()).hexdigest()[:8]}"
        it["when"] = when(it.get("date"), ref)
        # Located only by a town name / centroid (or researched as approximate): kept, captioned
        # "approximate location", never one side of a hit/spared pair at a precise spot.
        it["approx"] = it["loc_confidence"] == "low"
        it["tier"] = tier_of(it, s, anchors, places, step_thr, quake)
        it["side_hint"] = side_of(it, meta, s)
        it["showable"] = bool(it.pop("_showable", None)) if it["source"] == "research" else (
            it["type"] in ("photo", "street") and bool(it.get("thumb_url")) and is_open(it.get("licence")))
        it["found_by"] = it.get("_found_by") or it["source"]
        if not it.get("credit") and it.get("page_url"):
            it["credit"] = urlsplit(it["page_url"]).netloc.removeprefix("www.")
    n_pairs = pair_streets(items)
    # News and link-only agency images: a gently pixelated preview, linked to the source.
    n_prev = 0
    for it in items:
        if not it["showable"] and it["source"] in ("gdelt", "validation") and (it.get("thumb_url") or it["type"] == "news"):
            n_prev += pixelate.preview(slug, it)
    pixelate.clean(slug, {i["preview_url"] for i in items if i.get("preview_url")})
    for it in items:
        for k in [k for k in it if k.startswith("_")]:
            del it[k]
        it["lat"], it["lon"] = round(it["lat"], 6), round(it["lon"], 6)
    items.sort(key=lambda i: (i["tier"], not i["showable"], PRIORITY[i["source"]], -(i["nisar"].get("local_step_cm") or 0)))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{slug}.json").write_text(json.dumps(items, indent=1, ensure_ascii=False) + "\n")
    # Relevant hits we couldn't place in the frame: listed in the editor's Unlocated tab.
    seen = set()
    unlocated = [u for u in unlocated if not (canon_url(u["page_url"]) in seen or seen.add(canon_url(u["page_url"])))]
    for u in unlocated:
        u["id"] = f"{slug.split('-')[0]}-unl-{hashlib.sha1((canon_url(u['page_url']) or u['title']).encode()).hexdigest()[:8]}"
        u["showable"] = u["type"] == "photo" and bool(u.get("thumb_url")) and is_open(u.get("licence"))
    (OUT / "unlocated").mkdir(exist_ok=True)
    (OUT / "unlocated" / f"{slug}.json").write_text(json.dumps(unlocated, indent=1, ensure_ascii=False) + "\n")
    publish(slug, items, unlocated)
    log(f"{slug}: {len(items)} items -> research/media/{slug}.json  (raw {len(raw)}; placed by text {placed}; "
        f"geocoded {n_geo}; street pairs {n_pairs}; pixelated previews {n_prev})")
    for k, v in sorted(dropped.items()):
        log(f"  dropped {k}: {v}")
    report(slug, items)
    return items


def publish(slug: str, items: list[dict], unlocated: list[dict]):
    """site/events/<slug>/media.json: the candidates the editor triages (step 6). Research items are
    left out: they are the stories, edited in the Stories tab."""
    out = {"slug": slug, "items": [i for i in items if i["source"] != "research"], "unlocated": unlocated}
    (ROOT / "site" / "events" / slug / "media.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


def report(slug: str, items: list[dict]):
    c = Counter((i["source"]) for i in items)
    log("  by source: " + ", ".join(f"{k} {v}" for k, v in sorted(c.items())))
    log("  by tier:   " + ", ".join(f"{k}: {v}" for k, v in sorted(Counter(i["tier"] for i in items).items())))
    log("  showable:  " + ", ".join(f"{k} {v}" for k, v in Counter("yes" if i["showable"] else "no" for i in items).items())
        + f"; approx {sum(i['approx'] for i in items)}; pixelated {sum(i.get('preview') == 'pixelated' for i in items)}")
    t = Counter((i["source"], i["tier"], i["showable"]) for i in items)
    log("  source x tier x showable: " + "; ".join(f"{s}/t{tr}/{'show' if sh else 'link'} {n}" for (s, tr, sh), n in sorted(t.items())))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    only = None
    for a in sys.argv[1:]:
        if a.startswith("--only="):
            only = set(a.split("=", 1)[1].split(","))
    for slug in args:
        harvest(slug, only)
