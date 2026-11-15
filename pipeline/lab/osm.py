"""OpenStreetMap vectors for a lab event, fetched politely from Overpass and cached under cache/lab/overpass/.

One query for the whole scene (main roads, rail, rivers, canals, coast, places) and one for the focus window
(minor roads).  Every response is cached, so a rebuild makes no network calls.
"""
from __future__ import annotations

import hashlib
import json
import time
import urllib.parse
import urllib.request

import numpy as np

from .common import CACHE, Event, dp_simplify

UA = "nisar-hackathon-lab/0.1 (static NASA Space Apps site; one-off build, cached; contact via github.com/textgoeshere/nisar-hackathon)"
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]
PAUSE_S = 12

MAIN_HW = "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link"
CLASS = {"motorway": "motorway", "trunk": "trunk", "primary": "primary", "secondary": "secondary", "tertiary": "tertiary",
         "unclassified": "minor", "residential": "minor", "living_street": "minor"}


def _bbox(b):
    w, s, e, n = b
    return f"{s:.5f},{w:.5f},{n:.5f},{e:.5f}"


def main_query(bounds):
    bb = _bbox(bounds)
    return (f'[out:json][timeout:180];(way["highway"~"^({MAIN_HW})$"]({bb});way["railway"="rail"]({bb});'
            f'way["waterway"~"^(river|canal)$"]({bb});way["natural"="coastline"]({bb});'
            f'node["place"~"^(city|town|village|suburb)$"]({bb}););out geom;')


def minor_query(bounds, classes):
    bb = _bbox(bounds)
    return f'[out:json][timeout:180];way["highway"~"^({"|".join(classes)})$"]({bb});out geom;'


def fetch(query: str, name: str) -> dict:
    """Return the Overpass JSON for `query`, from cache if present.  Retries with backoff, tries the fallback endpoint."""
    d = CACHE / "overpass"
    d.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(query.encode()).hexdigest()[:10]
    path = d / f"{name}-{key}.json"
    if path.exists():
        return json.loads(path.read_text())
    last = None
    for attempt in range(4):
        for url in ENDPOINTS:
            try:
                req = urllib.request.Request(url + "?" + urllib.parse.urlencode({"data": query}), headers={"User-Agent": UA})
                raw = urllib.request.urlopen(req, timeout=100).read()
                data = json.loads(raw)
                if "elements" not in data:
                    raise ValueError("no elements: " + str(data)[:200])
                path.write_bytes(raw)
                print(f"  overpass {name}: {len(raw) // 1024} KB, {len(data['elements'])} elements via {url}")
                time.sleep(PAUSE_S)
                return data
            except Exception as e:                                    # noqa: BLE001 - report and retry
                last = e
                print(f"  overpass {name}: {url} failed: {e}")
                time.sleep(PAUSE_S)
        time.sleep(20 * (attempt + 1))
    raise RuntimeError(f"Overpass failed for {name}: {last}")


def _way_uv(ev: Event, el: dict) -> np.ndarray | None:
    geom = el.get("geometry")
    if not geom:
        return None
    u, v = ev.lonlat_to_uv([p["lon"] for p in geom], [p["lat"] for p in geom])
    return np.column_stack([u, v])


def _clip(pts: np.ndarray, margin=0.004):
    """Split a polyline into the pieces that lie inside the grid (with a small margin)."""
    ok = (pts[:, 0] >= -margin) & (pts[:, 0] <= 1 + margin) & (pts[:, 1] >= -margin) & (pts[:, 1] <= 1 + margin)
    out, cur = [], []
    for p, k in zip(pts, ok):
        if k:
            cur.append(p)
        elif cur:
            out.append(np.array(cur)); cur = []
    if cur:
        out.append(np.array(cur))
    return [c for c in out if len(c) >= 2]


# outside the focus window, short pieces of these classes are dropped (metres): at scene scale they are clutter and weight
MIN_LEN_OUTSIDE_M = {"motorway": 100.0, "primary": 150.0, "secondary": 300.0, "tertiary": 600.0, "river": 800.0, "canal": 1000.0}


def build_vectors(ev: Event, main: dict, minor: dict | None, focus: dict, eps_m: float = 10.0, eps_minor_m: float = 12.0,
                  minor_classes=("unclassified", "residential"), eps_scene_m: float = 20.0) -> dict:
    """Turn Overpass elements into the basemap.json structure (coordinates are not rounded here)."""
    w, h = ev.extent_m
    def simp(pts, eps):
        # simplify in metres (u and v have different metre scales if the grid is not square)
        m = pts * [w, h]
        s = dp_simplify(m, eps)
        return s / [w, h]
    roads = {k: [] for k in ("motorway", "trunk", "primary", "secondary", "tertiary", "minor")}
    rail, river, canal, coast, places = [], [], [], [], []
    seen = set()

    def add_way(el, minor_pass):
        t = el.get("tags", {})
        pts = _way_uv(ev, el)
        if pts is None or el["id"] in seen:
            return
        seen.add(el["id"])
        hw, ww = t.get("highway"), t.get("waterway")
        if hw:
            cls = CLASS.get(hw.replace("_link", ""))
            if cls is None:
                return
            if cls == "minor" and hw not in minor_classes:
                return
            target, eps = roads[cls], (eps_minor_m if cls == "minor" else eps_m)
        elif t.get("railway") == "rail":
            target, eps = rail, eps_m
        elif ww == "river":
            target, eps = river, eps_m
        elif ww == "canal":
            target, eps = canal, eps_m
        elif t.get("natural") == "coastline":
            target, eps = coast, eps_m
        else:
            return
        for piece in _clip(pts):
            if hw and CLASS.get(hw.replace("_link", "")) == "minor":
                # minor roads only inside the focus window: keep pieces whose midpoint is inside it
                mid = piece[len(piece) // 2]
                if not (focus["u0"] <= mid[0] <= focus["u1"] and focus["v0"] <= mid[1] <= focus["v1"]):
                    continue
            mid = piece[len(piece) // 2]
            inside = focus["u0"] <= mid[0] <= focus["u1"] and focus["v0"] <= mid[1] <= focus["v1"]
            s = simp(piece, eps if inside else max(eps, eps_scene_m))
            if len(s) < 2:
                continue
            if not inside:
                kind = cls if hw else ("rail" if target is rail else "river" if target is river else "canal" if target is canal else "")
                lim = MIN_LEN_OUTSIDE_M.get(kind, 0.0)
                if lim and float(np.hypot(*np.diff(s * [w, h], axis=0).T).sum()) < lim:
                    continue
            target.append(s)

    for el in main["elements"]:
        if el["type"] == "way":
            add_way(el, False)
        elif el["type"] == "node" and el.get("tags", {}).get("place") and el.get("tags", {}).get("name"):
            u, v = ev.lonlat_to_uv(el["lon"], el["lat"])
            if -0.002 <= u <= 1.002 and -0.002 <= v <= 1.002:
                t = el["tags"]
                places.append({"name": t["name"], "name_en": t.get("name:en") or t.get("int_name") or "", "kind": t["place"],
                               "u": float(u), "v": float(v)})
    if minor:
        for el in minor["elements"]:
            if el["type"] == "way":
                add_way(el, True)
    return {"roads": roads, "rail": rail, "river": river, "canal": canal, "coast": coast, "places": places}


def to_json(vec: dict, decimals: int = 5) -> dict:
    def r(pl):
        return [[round(float(x), decimals), round(float(y), decimals)] for x, y in pl]
    out = {"roads": {k: [r(p) for p in v] for k, v in vec["roads"].items()}}
    for k in ("rail", "river", "canal", "coast"):
        out[k] = [r(p) for p in vec[k]]
    out["places"] = [{**p, "u": round(p["u"], decimals), "v": round(p["v"], decimals)} for p in vec["places"]]
    return out


def window_bounds(ev: Event, focus: dict, pad: float = 0.0):
    """(west, south, east, north) in lon/lat of a focus window given in (u, v), as a rounded bounding box (stable cache key)."""
    from pyproj import Transformer
    g = ev.grid
    tr = Transformer.from_crs(g["epsg"], 4326, always_xy=True)
    w, h = ev.extent_m
    xs = [g["left"] + focus[k] * w for k in ("u0", "u1")]
    ys = [g["top"] - focus[k] * h for k in ("v0", "v1")]
    pts = [tr.transform(x, y) for x in xs for y in ys]
    lons, lats = zip(*pts)
    return (round(min(lons) - pad, 4), round(min(lats) - pad, 4), round(max(lons) + pad, 4), round(max(lats) + pad, 4))


def _tile_elements(b, classes, name, els, depth=0):
    """Fetch one tile; if Overpass keeps failing, split it into four and try those (up to two levels)."""
    try:
        d = fetch(minor_query(b, classes), name)
    except RuntimeError:
        if depth >= 2:
            raise
        w, s, e, n = b
        for i in range(2):
            for j in range(2):
                sub = (round(w + (e - w) * i / 2, 4), round(s + (n - s) * j / 2, 4),
                       round(w + (e - w) * (i + 1) / 2, 4), round(s + (n - s) * (j + 1) / 2, 4))
                _tile_elements(sub, classes, f"{name}{i}{j}", els, depth + 1)
        return
    for el in d["elements"]:
        els[(el["type"], el["id"])] = el


def minor_elements(bounds, classes, name: str, tiles=(3, 2)) -> dict:
    """Minor roads for a window, fetched as tiles (a single query for a city window times out), merged and de-duplicated."""
    w, s, e, n = bounds
    nx, ny = tiles
    els = {}
    for i in range(nx):
        for j in range(ny):
            b = (round(w + (e - w) * i / nx, 4), round(s + (n - s) * j / ny, 4),
                 round(w + (e - w) * (i + 1) / nx, 4), round(s + (n - s) * (j + 1) / ny, 4))
            _tile_elements(b, classes, f"{name}-minor-{i}{j}", els)
    return {"elements": list(els.values())}
