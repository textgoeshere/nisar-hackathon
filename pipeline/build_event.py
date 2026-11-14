"""Step 3: ingest and process one event into web-ready layers.

    .venv/bin/python -m pipeline.build_event kumamoto-quake [--refetch]

Stage A (network, cached in cache/<slug>.npz): NISAR window(s), DEM, Sentinel-2 composites.
Stage B (local): clean, classify, render images and write site/events/<slug>/.

Output files (all on one grid, row 0 = north):
  meta.json          grid, georeference, layer descriptions, provenance, stats
  dem.i16            terrain height, metres
  los.i16            line-of-sight ground motion, millimetres (gaps filled; see valid.u8)
  valid.u8           1 where motion was measured (coherent, unwrapped), else 0
  coh.u8             coherence x 255
  *.png / *.jpg      raw images: interferogram, coherence, optical before/after
"""
from __future__ import annotations

import argparse
import colorsys
import json
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from PIL import Image

from . import cmr, context, gunw, remote

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
SITE = ROOT / "site" / "events"
SNOWLINE_M = 3500    # landslide coherence-drop mask (Himalaya, late August)
CYCLE_M = 0.10        # one colour cycle in rendered interferograms = 10 cm of motion


def candidates() -> dict[str, dict]:
    return {e["slug"]: e for e in json.loads((ROOT / "pipeline" / "candidates.json").read_text())["events"]}


def pick_pairs(ev: dict) -> tuple[cmr.Granule, cmr.Granule | None]:
    """Shortest interferogram spanning the event (any stack), and the pair just before it on the
    same stack as a quiet baseline."""
    d = ev["date"]
    gs = cmr.search(cmr.GUNW, ev["lat"], ev["lon"])
    spanning = sorted((g for g in gs if g.start < d <= g.end), key=lambda g: (g.days, g.start))
    if not spanning:
        raise LookupError(f"{ev['slug']}: no interferogram spans {d}")
    co = spanning[0]
    pre = [g for g in gs if g.stack == co.stack and g.end <= co.start]
    return co, (pre[-1] if pre else None)


def chain(ev: dict) -> list[cmr.Granule]:
    """Consecutive interferograms on the best-covered stack: each pair starts where the last ended,
    taking the shortest pair from each start date, so the steps add up to a continuous record."""
    st = cmr.stacks(cmr.search(cmr.GUNW, ev["lat"], ev["lon"]))
    gs = next(iter(st.values()))
    by_start: dict[str, cmr.Granule] = {}
    for g in sorted(gs, key=lambda g: g.days):
        by_start.setdefault(g.start, g)
    out, day = [], min(by_start)
    while day in by_start:
        out.append(by_start[day])
        day = by_start[day].end
    return out


def fetch_chain(ev: dict, s) -> tuple[dict, dict]:
    """Subsidence: read every pair in the chain and fit one sinking rate per pixel.

    Adding up 12-day pairs also adds up each pair's ~0.5-1 cm of atmospheric and unwrapping noise,
    so a raw running total jitters. Subsidence from groundwater pumping is steady over a year, so we
    fit cumulative motion c(t) = rate x t by least squares through the origin and keep the rate.
    """
    from concurrent.futures import ThreadPoolExecutor
    pairs = chain(ev)
    half = ev["half_km"] * 1000
    print(f"  chain of {len(pairs)} pairs, {pairs[0].start} -> {pairs[-1].end} on T{pairs[0].track}", flush=True)

    def get(g):
        try:
            return gunw.read_window(g, ev["lat"], ev["lon"], half, s)
        except Exception as e:                               # a bad granule shouldn't sink the chain
            print(f"    skip {g.start}: {e}", flush=True)
            return None
    with ThreadPoolExecutor(4) as ex:
        reads = list(ex.map(get, pairs))
    good = [(g, r) for g, r in zip(pairs, reads) if r is not None]
    h = min(r["los_m"].shape[0] for _, r in good)
    w = min(r["los_m"].shape[1] for _, r in good)
    t0 = date.fromisoformat(good[0][0].start)
    days = np.array([(date.fromisoformat(g.end) - t0).days for g, _ in good], np.float64)
    cum = np.zeros((h, w)); seen = np.zeros((h, w)); stack = []
    for _, r in good:
        d = r["los_m"][:h, :w]
        cum = cum + np.nan_to_num(d)
        seen += np.isfinite(d)
        stack.append(cum.copy())
    stack = np.stack(stack)                                  # cumulative motion at each pair's end date
    rate = np.tensordot(days, stack, axes=1) / (days ** 2).sum()   # m/day
    resid = stack - rate[None] * days[:, None, None]
    valid = seen >= 0.8 * len(good)
    r0 = good[0][1]
    out = {"los": np.where(valid, rate * days[-1], np.nan).astype(np.float32),
           "coh": np.mean([r["coh"][:h, :w] for _, r in good], 0).astype(np.float32),
           "valid": valid, "x": r0["x"][:w], "y": r0["y"][:h],
           "rate_m_yr": (rate * 365.25).astype(np.float32), "cum": stack.astype(np.float32)}
    info = {"granules": [g.id for g, _ in good], "pair": [good[0][0].start, good[-1][0].end],
            "dates": [good[0][0].start] + [g.end for g, _ in good], "stack": list(good[0][0].stack),
            "epsg": r0["epsg"], "wavelength_m": r0["wavelength_m"],
            "fit_rms_cm": round(float(np.sqrt(np.nanmean(resid[:, valid] ** 2))) * 100, 2),
            "mb_read": round(sum(r["bytes_read"] for _, r in good) / 1e6, 1)}
    return out, info


def fetch(ev: dict, refetch=False) -> dict:
    path = CACHE / f"{ev['slug']}.npz"
    if path.exists() and not refetch:
        z = np.load(path, allow_pickle=True)
        return {k: z[k] for k in z.files} | {"info": z["info"].item()}
    CACHE.mkdir(exist_ok=True)
    s = remote.session()
    if ev["date"] is None:
        out, info = fetch_chain(ev, s)
        return _context(ev, out, info, path, date.fromisoformat(info["pair"][1]) - timedelta(days=60))
    half = ev["half_km"] * 1000
    co, pre = pick_pairs(ev)
    print(f"  interferogram {co.start} -> {co.end} on T{co.track} F{co.frame} {co.direction}", flush=True)
    a = gunw.read_window(co, ev["lat"], ev["lon"], half, s)
    out = {"los": a["los_m"], "coh": a["coh"], "valid": a["valid"], "x": a["x"], "y": a["y"]}
    info = {"granule": co.id, "pair": [co.start, co.end], "stack": list(co.stack), "epsg": a["epsg"],
            "wavelength_m": a["wavelength_m"], "mb_read": round(a["bytes_read"] / 1e6, 1)}
    if pre:
        print(f"  baseline      {pre.start} -> {pre.end}", flush=True)
        b = gunw.read_window(pre, ev["lat"], ev["lon"], half, s)
        h, w = min(a["los_m"].shape[0], b["los_m"].shape[0]), min(a["los_m"].shape[1], b["los_m"].shape[1])
        for k in ("los", "coh", "valid"):
            out[k] = out[k][:h, :w]
        out["x"], out["y"] = out["x"][:w], out["y"][:h]
        out["los_pre"], out["coh_pre"], out["valid_pre"] = b["los_m"][:h, :w], b["coh"][:h, :w], b["valid"][:h, :w]
        info |= {"pre_granule": pre.id, "pre_pair": [pre.start, pre.end], "mb_read": info["mb_read"] + round(b["bytes_read"] / 1e6, 1)}
    return _context(ev, out, info, path, date.fromisoformat(ev["date"]))


def _context(ev, out, info, path, ev_day):
    grid = context.Grid.from_centres(info["epsg"], out["x"], out["y"])
    print("  terrain", flush=True)
    out["dem"] = context.dem(grid)
    img = grid.scaled(grid.dx / 2) if grid.dx > 40 else grid      # optical at twice the radar resolution
    for tag, a0, a1 in (("before", ev_day - timedelta(days=75), ev_day - timedelta(days=1)),
                        ("after", ev_day + timedelta(days=1), ev_day + timedelta(days=45))):
        print(f"  sentinel-2 {tag}", flush=True)
        rgb, ids = context.sentinel2(img, a0.isoformat(), a1.isoformat())
        if rgb is not None:
            out[f"optical_{tag}"] = rgb
        info[f"optical_{tag}"] = {"window": [a0.isoformat(), a1.isoformat()], "scenes": ids}
    np.savez_compressed(path, **out, info=np.array(info, dtype=object))
    return out | {"info": info}


# ------------------------------------------------------------------ rendering helpers

def fringes(los: np.ndarray, coh: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Rewrap motion at CYCLE_M per colour cycle: hue = phase, brightness = coherence."""
    ph = np.mod(np.nan_to_num(los) / CYCLE_M, 1.0)
    rgb = np.array([colorsys.hsv_to_rgb(h, 0.85, 1.0) for h in np.linspace(0, 1, 256)])[(ph * 255).astype(int)]
    v = np.clip((coh - 0.1) / 0.6, 0.15, 1.0)[..., None]
    rgb = rgb * v
    rgb[~valid] = rgb[~valid] * 0.35 + 0.1
    return (rgb * 255).astype(np.uint8)


def grey(a: np.ndarray) -> np.ndarray:
    return (np.clip(a, 0, 1) * 255).astype(np.uint8)


def save_img(path: Path, a: np.ndarray, quality=88):
    im = Image.fromarray(a)
    if path.suffix == ".jpg":
        im.save(path, quality=quality)
    else:
        im.save(path, optimize=True)


def build(slug: str, refetch=False):
    ev = candidates()[slug]
    print(f"{slug}: fetching", flush=True)
    A = fetch(ev, refetch)
    info = A["info"]
    grid = context.Grid.from_centres(info["epsg"], A["x"], A["y"])
    out = SITE / slug
    out.mkdir(parents=True, exist_ok=True)

    los, valid, coh = A["los"], A["valid"].astype(bool), A["coh"]
    i16 = lambda a: np.clip(np.round(a * 1000), -32767, 32767).astype("<i2").tobytes()
    (out / "dem.i16").write_bytes(np.round(A["dem"]).astype("<i2").tobytes())
    # Measured motion (0 where not measured): what stories are sampled against.
    (out / "los.i16").write_bytes(i16(np.where(valid, np.nan_to_num(los), 0)))
    # Display surface: lightly smoothed motion that fades to zero over unmeasured ground (sea,
    # decorrelated patches), so gaps don't become cliffs under heavy exaggeration.
    (out / "surface.i16").write_bytes(i16(gunw.display_surface(los, valid)))
    (out / "valid.u8").write_bytes(valid.astype(np.uint8).tobytes())
    (out / "coh.u8").write_bytes(grey(coh).tobytes())
    layers = {"dem": "dem.i16", "los": "los.i16", "surface": "surface.i16", "valid": "valid.u8", "coh": "coh.u8"}
    if "coh_pre" in A:
        # Coherence drop: ground that matched itself before the event and stopped matching across
        # it. That is the footprint of a destroyed or buried surface (debris, lava, collapse).
        drop = np.clip(A["coh_pre"] - coh, 0, 1)
        if ev["kind"] == "landslide":
            # Above the seasonal snowline fresh snow also destroys coherence; keep valley ground only.
            drop = np.where(A["dem"] < SNOWLINE_M, drop, 0)
        (out / "cohdrop.u8").write_bytes(grey(drop).tobytes())
        layers["cohdrop"] = "cohdrop.u8"

    images = []
    def add(name, arr, caption, source):
        save_img(out / name, arr)
        images.append({"file": name, "caption": caption, "source": source})
    nisar = "NISAR L2 GUNW (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC"
    if "rate_m_yr" in A:
        span = f"{info['pair'][0]} → {info['pair'][1]}"
        src = f"{nisar}: {len(info['granules'])} chained interferograms, track {info['stack'][0]}"
        add("interferogram.png", fringes(los, coh, valid),
            f"Fitted line-of-sight motion over {span}, rewrapped at {CYCLE_M * 100:.0f} cm per colour cycle.", src)
        add("coherence.png", grey(coh), f"Mean coherence of the chained pairs, {span}.", src)
    else:
        add("interferogram.png", fringes(los, coh, valid),
            f"Interferogram spanning the event, {info['pair'][0]} → {info['pair'][1]}. One colour cycle = {CYCLE_M * 100:.0f} cm "
            "of line-of-sight motion; brightness = coherence; dim = not measured.", f"{nisar}: {info['granule']}")
        add("coherence.png", grey(coh), f"Coherence {info['pair'][0]} → {info['pair'][1]}. Dark = the surface changed.",
            f"{nisar}: {info['granule']}")
    if "los_pre" in A:
        add("interferogram-before.png", fringes(A["los_pre"], A["coh_pre"], A["valid_pre"].astype(bool)),
            f"Baseline interferogram before the event, {info['pre_pair'][0]} → {info['pre_pair'][1]}: what 'quiet' looks like.",
            f"{nisar}: {info['pre_granule']}")
    for tag in ("before", "after"):
        if f"optical_{tag}" in A:
            o = info[f"optical_{tag}"]
            add(f"optical-{tag}.jpg", A[f"optical_{tag}"],
                f"Sentinel-2 true colour, cloud-masked median of {len(o['scenes'])} scenes, {o['window'][0]} → {o['window'][1]}.",
                "Contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search")

    m = np.nan_to_num(los)[valid]
    stats = {"motion_range_cm": round(float(np.percentile(m, 98) - np.percentile(m, 2)) * 100, 1),
             "measured_pct": round(100 * float(valid.mean()), 1),
             "coherence_mean": round(float(coh.mean()), 2)}
    if "rate_m_yr" in A:
        r = np.where(valid, A["rate_m_yr"], np.nan)
        k = np.unravel_index(np.nanargmin(r), r.shape)
        stats |= {"max_sinking_cm_yr": round(float(-np.nanpercentile(r, 0.1)) * 100, 1), "fit_rms_cm": info["fit_rms_cm"],
                  "fastest_uv": [round((k[1] + 0.5) / grid.nx, 4), round((k[0] + 0.5) / grid.ny, 4)],
                  "fastest_series_cm": [0.0] + [round(float(c) * 100, 1) for c in A["cum"][:, k[0], k[1]]]}
    if "coh_pre" in A:
        stats["coherence_drop_pct"] = round(100 * float((drop > 0.3).mean()), 1)
    if "los_pre" in A:
        mp = np.nan_to_num(A["los_pre"])[A["valid_pre"].astype(bool)]
        stats["baseline_range_cm"] = round(float(np.percentile(mp, 98) - np.percentile(mp, 2)) * 100, 1)
    w, s_, e, n = grid.bounds_lonlat()
    meta = {
        "slug": slug, "name": ev["name"], "kind": ev["kind"], "date": ev["date"], "lat": ev["lat"], "lon": ev["lon"],
        "grid": {"epsg": grid.epsg, "left": grid.left, "top": grid.top, "dx": grid.dx, "nx": grid.nx, "ny": grid.ny,
                 "bounds_lonlat": [w, s_, e, n]},
        "layers": layers,
        "ground": "optical-after.jpg" if "optical_after" in A else ("optical-before.jpg" if "optical_before" in A else None),
        "nisar": info, "stats": stats, "images": images,
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    idx = SITE / "index.json"
    live = sorted(set(json.loads(idx.read_text()) if idx.exists() else []) | {slug})
    idx.write_text(json.dumps(live))
    print(f"{slug}: {grid.nx}x{grid.ny} @ {grid.dx:.0f} m, {info['mb_read']} MB read, {stats}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="+")
    ap.add_argument("--refetch", action="store_true")
    a = ap.parse_args()
    for s in a.slugs:
        build(s, a.refetch)
