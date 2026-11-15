"""One-off: town and city names for the event pages' optional place-name labels.

Asks the OpenStreetMap Overpass API once per event (1 request per second, User-Agent set) for
place=city|town|village nodes inside the grid's lon/lat box and writes the largest few, with their
grid (u, v), to site/events/<slug>/places.json. The page picks at most three of them at runtime.

    .venv/bin/python scripts/places.py [slug ...]
"""
import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline.context import Grid  # noqa: E402

EVENTS = Path(__file__).resolve().parents[1] / "site" / "events"
URL = "https://overpass-api.de/api/interpreter"
UA = "nisar-hackathon-places/0.1 (NISAR hackathon research; dpdnolan.office@gmail.com)"
SIZE = {"city": 50000, "town": 10000, "village": 500}   # assumed population when OSM has none
KEEP = 8


def pop(tags):
    try:
        return int(str(tags.get("population", "0")).replace(",", "").replace(" ", "").split(";")[0].split(".")[0])
    except ValueError:
        return 0


def places(slug):
    meta = json.loads((EVENTS / slug / "meta.json").read_text())
    g = meta["grid"]
    grid = Grid(g["epsg"], g["left"], g["top"], g["dx"], g["nx"], g["ny"])
    w, s, e, n = g["bounds_lonlat"]
    box = f"({s},{w},{n},{e})"
    q = "[out:json][timeout:120];(" + "".join(f"node[place={k}][name]{box};" for k in SIZE) + ");out;"
    for wait in (10, 30, 0):  # Overpass is busy at times: back off and retry
        try:
            r = requests.post(URL, data={"data": q}, headers={"User-Agent": UA}, timeout=150)
            if r.ok or not wait:
                break
        except requests.RequestException:
            if not wait:
                raise
        time.sleep(wait)
    r.raise_for_status()
    out = []
    for el in r.json()["elements"]:
        t = el["tags"]
        u, v = grid.uv(el["lon"], el["lat"])
        if not (0.03 <= u <= 0.97 and 0.03 <= v <= 0.97):
            continue
        out.append({"name": t.get("name:en") or t["name"], "place": t["place"], "population": pop(t),
                    "lon": round(el["lon"], 5), "lat": round(el["lat"], 5), "u": round(u, 4), "v": round(v, 4)})
    out.sort(key=lambda p: p["population"] or SIZE[p["place"]], reverse=True)
    # Small villages only when there is nothing bigger in the scene.
    big = [p for p in out if p["place"] != "village" or p["population"] >= 3000]
    return (big or out)[:KEEP]


def main(slugs):
    slugs = slugs or json.loads((EVENTS / "index.json").read_text())
    for slug in slugs:
        time.sleep(1.1)
        try:
            ps = places(slug)
        except requests.RequestException as err:
            print(slug, "failed:", err)
            continue
        doc = {"source": "© OpenStreetMap contributors (ODbL 1.0), via the Overpass API", "places": ps}
        (EVENTS / slug / "places.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
        print(slug, [p["name"] for p in ps])


if __name__ == "__main__":
    main(sys.argv[1:])
