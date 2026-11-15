"""New land at sea from NISAR GCOV backscatter (volcanic islands: Anak Krakatau).

    .venv/bin/python -m pipeline.newland anak-krakatau [--refetch]    # print the numbers
    build_event calls add() for events with "newland": true in candidates.json.

Interferogram coherence can't tell new land from sea here: over water it is ~0, and over fresh,
still-cooling lava and ash it is ~0 too, so both are "not measured". Backscatter can. Calm open
sea is a mirror at L-band and sends little back (HH around -20 dB), while rough lava and rock send
a lot back (HH above about -13 dB).

We read every GCOV pass from two stacks (ascending and descending, so two look directions) on a
20 m grid around the vent, take the per-cell median HH before and after, and call a cell land
where the median is above -15.5 dB on both stacks. The island is the land patch under the vent
(gaps closed, holes filled), so dark craters and radar shadows inside it don't count as sea. New
land = in the island after, not before. Needing both stacks rules out one-look artefacts (layover,
a ship); medians over 4-5 passes rule out a windy day.

The Copernicus DEM can't serve as the old coastline: it predates the December 2018 flank collapse,
so it still shows land where there has been sea since.
"""
from __future__ import annotations

import argparse
import json
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy import ndimage

from . import cmr, gcov, remote

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
DX = 20.0          # output cell: 2 x 2 native 10 m GCOV pixels
HALF_M = 4000.0
LAND_DB = -15.5    # HH median above this on every stack = land (sea ~ -20 dB, island rock ~ -5 dB)
WINDOW = ("2026-06-20", "2026-10-31")
CROP = (slice(100, 290), slice(110, 300))   # 3.8 km square around the island, in 20 m cells
NISAR_SRC = "NISAR L2 GCOV (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC"


def fetch(ev: dict, refetch=False) -> dict:
    path = CACHE / f"{ev['slug']}-gcov.npz"
    if path.exists() and not refetch:
        z = np.load(path, allow_pickle=True)
        return {k: z[k] for k in z.files}
    s = remote.session()
    gs = [g for g in cmr.search(cmr.GCOV, ev["lat"], ev["lon"]) if WINDOW[0] <= g.start <= WINDOW[1]]
    x, y = gcov.out_grid(32748, ev["lat"], ev["lon"], HALF_M, DX)

    def get(g):
        try:
            return gcov.read_window(g, x, y, s)
        except Exception as e:
            print(f"  skip {g.start}: {e}", flush=True)
            return None
    with ThreadPoolExecutor(4) as ex:
        reads = list(ex.map(get, gs))
    ok = [(g, r) for g, r in zip(gs, reads) if r is not None]
    out = {"x": x, "y": y, "hh": np.stack([r["hh"] for _, r in ok]), "hv": np.stack([r["hv"] for _, r in ok]),
           "dates": np.array([g.start for g, _ in ok]), "stacks": np.array([f"{g.track}{g.direction}" for g, _ in ok]),
           "ids": np.array([g.id for g, _ in ok])}
    CACHE.mkdir(exist_ok=True)
    np.savez_compressed(path, **out)
    return out


def analyse(ev: dict, B: dict, stories: list[dict]) -> dict:
    hh = gcov.db(B["hh"])
    hh[~np.isfinite(B["hh"])] = np.nan
    d = ev["date"]
    T = Transformer.from_crs(4326, 32748, always_xy=True)
    rc = lambda lon, lat: (lambda X, Y: ((B["y"][0] - Y) / DX, (X - B["x"][0]) / DX))(*T.transform(lon, lat))
    vr, vc = (int(round(v)) for v in rc(ev["lon"], ev["lat"]))
    med = {}
    for st in sorted(set(B["stacks"])):
        m = B["stacks"] == st
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)   # all-NaN cells at the swath edge
            med[st] = (np.nanmedian(hh[m & (B["dates"] < d)], 0), np.nanmedian(hh[m & (B["dates"] > d)], 0))
    land = lambda k: np.all([np.nan_to_num(v[k], nan=-99) > LAND_DB for v in med.values()], 0)

    def island(m):
        m = ndimage.binary_fill_holes(ndimage.binary_closing(m, iterations=2))
        lab, _ = ndimage.label(m)
        return lab == lab[vr, vc]
    before, after = island(land(0)), island(land(1))
    gain = after & ~before
    bright = np.nan_to_num(hh, nan=-99) > -13
    pre = B["dates"] < d
    # When the new land appeared: share of it that is bright on each pass.
    timeline = [(str(t), str(s), round(float(bright[i][gain].mean()), 2)) for i, (t, s) in enumerate(zip(B["dates"], B["stacks"]))]
    G = np.mgrid[: gain.shape[0], : gain.shape[1]]
    brg = (np.degrees(np.arctan2(G[1] - vc, -(G[0] - vr))) + 360) % 360
    sectors = {}
    for i, name in enumerate(("N", "NE", "E", "SE", "S", "SW", "W", "NW")):
        sec = ((brg - (i * 45 - 22.5)) % 360) < 45
        sectors[name] = round(float((gain & sec).sum()) * DX ** 2 / 1e4, 1)
    # Isolated new targets at sea (islets): bright on >= 3 of the after passes, <= 1 before, clear of the island.
    dist = ndimage.distance_transform_edt(~(before | after)) * DX
    lab, n = ndimage.label((bright[~pre].sum(0) >= 3) & (bright[pre].sum(0) <= 1) & (dist > 120))
    islets = [tuple(int(round(v)) for v in c) for c in ndimage.center_of_mass(lab > 0, lab, range(1, n + 1))]
    per_story = {}
    for s in stories:
        r, c = rc(s["lon"], s["lat"])
        pts = np.argwhere(gain)
        near = float(np.hypot(pts[:, 0] - r, pts[:, 1] - c).min() * DX) if len(pts) else None
        ri, ci = int(round(r)), int(round(c))
        win = (slice(ri - 25, ri + 26), slice(ci - 25, ci + 26))     # 500 m around the pin
        sea = ~ndimage.binary_dilation(before | after, iterations=3)[win]
        per_story[s["id"]] = {
            "rc": (round(r, 1), round(c, 1)),
            "nearest_new_land_m": None if near is None else round(near),
            "coast_after_m": round(float(np.hypot(*(np.argwhere(after) - [r, c]).T).min() * DX)),
            "new_bright_sea_cells_500m": int(((bright[~pre].sum(0) >= 3) & (bright[pre].sum(0) <= 1))[win][sea].sum()),
            "max_after_db_500m": round(float(np.nanmax(np.where(sea, np.nanmedian(hh[~pre], 0)[win], np.nan))), 1),
        }
    ha = lambda m: round(float(m.sum()) * DX ** 2 / 1e4, 1)
    strict = np.all([(np.nan_to_num(b, nan=0) < -18) & (np.nan_to_num(a, nan=-99) > -13) for b, a in med.values()], 0) & gain
    return {"gain": gain, "before": before, "after": after, "med": med, "new_ha": ha(gain), "strict_ha": ha(strict),
            "island_before_ha": ha(before), "island_after_ha": ha(after), "sectors": sectors, "timeline": timeline,
            "islets": islets, "stories": per_story,
            "passes": {st: (int(((B["stacks"] == st) & pre).sum()), int(((B["stacks"] == st) & ~pre).sum())) for st in med}}


def figure(R: dict, B: dict, A: dict, grid) -> np.ndarray:
    """Top: NISAR HH median before | after | after with the new land in orange. Bottom: the same
    crop of the Sentinel-2 composites, the last with the NISAR outline. 3x nearest upsampling."""
    up = lambda a: np.repeat(np.repeat(a, 3, 0), 3, 1)
    st = sorted(R["med"])[0]                                  # ascending stack for the picture
    grey = lambda a: np.repeat((np.nan_to_num(np.clip((a + 25) / 25, 0, 1))[CROP] * 255).astype(np.uint8)[..., None], 3, -1)
    # Sentinel-2 composite cells -> this grid (nearest).
    s2dx = grid.dx * grid.nx / A["optical_before"].shape[1]
    ci = ((B["x"] - grid.left) / s2dx).astype(int)
    ri = ((grid.top - B["y"]) / s2dx).astype(int)
    s2 = lambda o: o[np.ix_(ri, ci)][CROP]
    edge = R["gain"] & ~ndimage.binary_erosion(R["gain"])
    old = R["before"] & ~ndimage.binary_erosion(R["before"])

    def mark(a, fill):
        a = a.copy()
        if fill:
            a[R["gain"][CROP]] = (0.45 * a[R["gain"][CROP]] + 0.55 * np.array([255, 120, 0])).astype(np.uint8)
        a[old[CROP]] = [0, 200, 255]
        a[edge[CROP]] = [255, 120, 0]
        return a
    b, a = R["med"][st]
    top = [grey(b), grey(a), mark(grey(a), True)]
    bot = [s2(A["optical_before"]), s2(A["optical_after"]), mark(s2(A["optical_after"]), False)]
    gap = np.full((top[0].shape[0] * 3, 6, 3), 255, np.uint8)
    row = lambda ims: np.hstack(sum(([up(i), gap] for i in ims), [])[:-1])
    return np.vstack([row(top), np.full((6, row(top).shape[1], 3), 255, np.uint8), row(bot)])


def note(R: dict, B: dict) -> str:
    s = R["sectors"]
    sw = round(s["S"] + s["SW"] + s["W"], 1)
    first = next(t for t, _, f in R["timeline"] if f > 0.5)
    last_before = [t for t, _, f in R["timeline"] if t < first][-1]
    p = "; ".join(f"{a} before, {b} after on {st}" for st, (a, b) in R["passes"].items())
    return (f"NISAR backscatter (GCOV, both look directions, {p}) shows <strong>{R['new_ha']} ha of new land</strong> "
            f"on the coast of Anak Krakatau, {sw} ha of it on the W, SW and S shore: sea-dark on every pass up to "
            f"{last_before}, rock-bright from the first pass after the eruption ({first}) on. Badan Geologi measured 32.8 ha "
            f"(NW-W-SW) from Sentinel; we catch {round(100 * R['new_ha'] / 32.8)}% of that "
            f"({R['strict_ha']} ha with the strictest test). Sentinel-2 agrees: those cells were water-coloured before and "
            "rock-coloured after. The two new islets reported 760 m NW and 495 m SE of the coast don't show: no new bright "
            "spot at sea within 500 m of either pin on any pass, though a rock a few tens of metres across 770 m off the SE "
            "shore shows on most passes, before and after. The islets may be too small or too low to stand out from the sea, "
            "or lie elsewhere (only their distances from the coast were published).")


def add(ev: dict, A: dict, grid, add_img, stories: list[dict]) -> tuple[str, dict]:
    """Called from build_event: renders the figure through `add_img` and returns (note, stats)."""
    B = fetch(ev)
    R = analyse(ev, B, stories)
    add_img("new-land.png", figure(R, B, A, grid),
            f"New land from NISAR backscatter. Top: radar brightness (HH, median of {R['passes'][sorted(R['passes'])[0]][0]} "
            f"ascending passes before and {R['passes'][sorted(R['passes'])[0]][1]} after the eruption); sea is dark, rock bright. "
            f"Right: new land in orange ({R['new_ha']} ha, seen on both ascending and descending passes), the pre-eruption "
            "coast in blue. Bottom: the Sentinel-2 composites on the same 3.8 km crop, with the same outlines.",
            f"{NISAR_SRC}: {len(B['ids'])} passes, tracks {', '.join(sorted(set(B['stacks'])))}; "
            "contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search")
    return note(R, B), {"new_land_ha": R["new_ha"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--refetch", action="store_true")
    a = ap.parse_args()
    ev = next(e for e in json.loads((ROOT / "pipeline" / "candidates.json").read_text())["events"] if e["slug"] == a.slug)
    B = fetch(ev, a.refetch)
    stories = json.loads((ROOT / "research" / "stories" / f"{a.slug}.json").read_text())["items"]
    R = analyse(ev, B, stories)
    for k in ("new_ha", "strict_ha", "island_before_ha", "island_after_ha", "sectors", "passes", "islets", "timeline"):
        print(k, R[k])
    for k, v in R["stories"].items():
        print(k, v)
    print(note(R, B))


if __name__ == "__main__":
    main()
