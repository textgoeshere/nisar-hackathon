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

from . import cmr, context, gcov, gunw, remote

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
SITE = ROOT / "site" / "events"
SNOWLINE_M = 3500    # landslide coherence-drop mask (Himalaya, late August)
CYCLE_M = 0.10        # one colour cycle in rendered interferograms = 10 cm of motion
BACKSCATTER = ("flood", "fire")   # events read from GCOV backscatter, not interferogram phase
GCOV_DX = 40.0        # output cell for backscatter: averages 4-16 native pixels, damping speckle
MIN_PATCH = 10        # smallest mapped change patch, in cells (10 x 40 m cells = 1.6 ha)


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


def pick_passes(ev: dict) -> tuple[list[cmr.Granule], list[cmr.Granule]]:
    """Backscatter passes on one stack: up to 3 before the event (a stable 'normal') and, after it,
    the first pass for a flood (water drains within days) or the first two for a fire (scars last).
    A fire's "after" passes start at `after_from` when set: big fires grow for weeks, and a pass from
    the first days only sees a fraction of the final scar.
    The stack whose first post-event pass comes soonest wins; ties go to the larger stack."""
    d = ev["date"]
    d_after = ev.get("after_from", d)
    best = None
    for st, gs in cmr.stacks(cmr.search(cmr.GCOV, ev["lat"], ev["lon"])).items():
        pre = [g for g in gs if g.start < d][-3:]
        post = [g for g in gs if g.start >= d_after][: 1 if ev["kind"] == "flood" else 2]
        if len(pre) < 2 or not post:
            continue
        key = (date.fromisoformat(post[0].start) - date.fromisoformat(d_after)).days
        if best is None or key < best[0]:
            best = (key, pre, post)
    if not best:
        raise LookupError(f"{ev['slug']}: no stack with 2 passes before and 1 after {d}")
    return best[1], best[2]


def fetch_backscatter(ev: dict, s) -> tuple[dict, dict]:
    """Flood / fire: median HH and HV backscatter before and after, on a 40 m grid."""
    from concurrent.futures import ThreadPoolExecutor
    pre, post = pick_passes(ev)
    print(f"  backscatter T{pre[0].track} F{pre[0].frame} {pre[0].direction}: before {[g.start for g in pre]}, after {[g.start for g in post]}", flush=True)
    # Projection from the first pass; the whole stack shares it.
    f, _ = remote.open_h5(pre[-1].url, s)
    with f:
        epsg = int(f[gcov.BASE]["projection"][()])
    x, y = gcov.out_grid(epsg, ev["lat"], ev["lon"], ev["half_km"] * 1000, GCOV_DX)
    with ThreadPoolExecutor(4) as ex:
        reads = list(ex.map(lambda g: gcov.read_window(g, x, y, s), pre + post))
    # Drop blank passes (all zeros or no data): one of them once turned a whole fire window into "burn".
    def blank(r):
        v = r["hh"][np.isfinite(r["hh"])]
        return v.size == 0 or np.median(gcov.db(v)) < -50
    keep = [not blank(r) for r in reads]
    if not all(keep):
        print(f"  dropped blank passes: {[g.start for g, k in zip(pre + post, keep) if not k]}", flush=True)
    pre, b = [g for g, k in zip(pre, keep) if k], [r for r, k in zip(reads, keep) if k][: sum(keep[: len(pre)])]
    post, a = [g for g, k in zip(post, keep[len(keep) - len(post):]) if k], [r for r, k in zip(reads[len(reads) - len(post):], keep[len(keep) - len(post):]) if k]
    if not b or not a:
        raise LookupError(f"{ev['slug']}: no usable backscatter passes on one side")
    med = lambda rs, p: np.nanmedian(np.stack([r[p] for r in rs]), axis=0).astype(np.float32)
    out = {"hh_before": med(b, "hh"), "hv_before": med(b, "hv"), "hh_after": med(a, "hh"), "hv_after": med(a, "hv"),
           "hv_after_each": np.stack([r["hv"] for r in a]).astype(np.float32), "x": x, "y": y}
    info = {"granules": [g.id for g in pre + post], "passes_before": [g.start for g in pre],
            "passes_after": [g.start for g in post], "pair": [pre[-1].start, post[0].start],
            "stack": list(pre[0].stack), "epsg": epsg, "mb_read": round(sum(r["bytes_read"] for r in reads) / 1e6, 1)}
    return out, info


def backscatter_change(kind: str, A: dict) -> tuple[np.ndarray, np.ndarray]:
    """Strength (0-1) of the event signal per cell, and where both before and after were seen.

    Flood: ground that was not water before (HH above -15 dB) and is dark after (open water reflects
    the pulse away), scored by how far HH fell. Fire: HV (vegetation volume) fell more than 2 dB below
    the pre-fire median on one after-pass and stays more than 1.5 dB down on every after-pass (a burn
    doesn't recover in weeks; one dark pass alone is wet ground or speckle). Already-dark ground
    (water, bare rock) is excluded. Smoothed 3x3 first, as the spike validated against perimeters.
    """
    from scipy import ndimage
    hb, ha, vb, va = (gcov.db(A[k]) for k in ("hh_before", "hh_after", "hv_before", "hv_after"))
    seen = np.isfinite(A["hh_before"]) & np.isfinite(A["hh_after"])
    if kind == "flood":
        c = np.clip((hb - ha - 3) / 6, 0, 1) * (ha < -15) * (hb > -15)
    else:
        each = A["hv_after_each"] if "hv_after_each" in A else [A["hv_after"]]
        sm = lambda a: gcov.db(ndimage.uniform_filter(np.nan_to_num(a), 3))
        vbs = sm(A["hv_before"])
        drops = np.stack([vbs - sm(a) for a in each])
        lo, hi = drops.min(0), drops.max(0)
        # 0.5 (the "hit" cut) at the 1.5 dB floor; full strength by 3 dB.
        c = np.clip(0.5 + (lo - 1.5) / 3, 0, 1) * (lo > 1.5) * (hi > 2) * (vb > -20)
    c = ndimage.median_filter(np.where(seen, np.nan_to_num(c), 0), 3)
    # Minimum mapping unit: neighbouring cells share speckle and smoothing, so a few hit cells together
    # are not independent evidence. Drop connected hit patches smaller than MIN_PATCH cells.
    lab, n = ndimage.label(c > 0.5)
    small = np.bincount(lab.ravel(), minlength=n + 1) < MIN_PATCH
    small[0] = False
    c[small[lab]] = 0
    return c.astype(np.float32), seen


def composite(hh: np.ndarray, hv: np.ndarray) -> np.ndarray:
    """Standard dual-pol false colour: R = HH, G = HV, B = HH/HV. Water black, vegetation green,
    built-up and bare ground magenta-white."""
    r = np.clip((gcov.db(hh) + 22) / 22, 0, 1)
    g = np.clip((gcov.db(hv) + 30) / 24, 0, 1)
    bl = np.clip((gcov.db(hh) - gcov.db(hv)) / 15, 0, 1)
    rgb = np.stack([r, g, bl], -1)
    rgb[~np.isfinite(hh)] = 0.1
    return (np.nan_to_num(rgb) * 255).astype(np.uint8)


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
    if ev["kind"] in BACKSCATTER:
        out, info = fetch_backscatter(ev, s)
        return _context(ev, out, info, path, date.fromisoformat(ev["date"]))
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
    img = grid.scaled(grid.dx / 2) if grid.dx >= 40 else grid      # optical at twice the radar resolution
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


def ground_image(A: dict) -> np.ndarray | None:
    """Draped ground: Sentinel-2 after the event, cloud holes filled from the before composite and,
    for backscatter events, then from radar brightness (monsoon floods are often clouded out in
    every optical scene). Returns None when there is nothing at all."""
    opt = [A[k] for k in ("optical_after", "optical_before") if k in A]
    if not opt and "hh_before" not in A:
        return None
    if opt:
        g = opt[0].copy()
        for o in opt[1:]:
            hole = g.sum(-1) == 0
            g[hole] = o[hole]
    if "hh_before" in A:
        r = np.clip((gcov.db(A["hh_before"]) + 25) / 25, 0, 1)
        radar = (np.nan_to_num(np.stack([r * 0.85, r * 0.9, r], -1)) * 255).astype(np.uint8)
        if not opt:
            return radar
        f = g.shape[0] // radar.shape[0]
        radar = np.kron(radar, np.ones((f, f, 1), np.uint8))[: g.shape[0], : g.shape[1]]
        hole = g.sum(-1) == 0
        g[hole] = radar[hole]
    return g


def build(slug: str, refetch=False):
    ev = candidates()[slug]
    print(f"{slug}: fetching", flush=True)
    A = fetch(ev, refetch)
    info = A["info"]
    grid = context.Grid.from_centres(info["epsg"], A["x"], A["y"])
    out = SITE / slug
    out.mkdir(parents=True, exist_ok=True)

    if ev["kind"] in BACKSCATTER:
        return build_backscatter(ev, A, info, grid, out)
    los, valid, coh = A["los"], A["valid"].astype(bool), A["coh"]
    i16 = lambda a: np.clip(np.round(a * 1000), -32767, 32767).astype("<i2").tobytes()
    (out / "dem.i16").write_bytes(np.round(A["dem"]).astype("<i2").tobytes())
    # Measured motion (0 where not measured): what stories are sampled against.
    (out / "los.i16").write_bytes(i16(np.where(valid, np.nan_to_num(los), 0)))
    # Display surface: lightly smoothed motion that fades to zero over unmeasured ground (sea,
    # decorrelated patches), so gaps don't become cliffs under heavy exaggeration.
    (out / "surface.i16").write_bytes(i16(gunw.display_surface(los, valid, sigma=3.0 if "rate_m_yr" in A else 1.5)))
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
    stats = {"measured_pct": round(100 * float(valid.mean()), 1), "coherence_mean": round(float(coh.mean()), 2)}
    if len(m):
        stats["motion_range_cm"] = round(float(np.percentile(m, 98) - np.percentile(m, 2)) * 100, 1)
    if "rate_m_yr" in A:
        # A 5x5 median keeps single-pixel unwrapping errors from posing as the fastest-sinking spot.
        from scipy import ndimage
        r = np.where(valid, ndimage.median_filter(np.nan_to_num(A["rate_m_yr"]), 5), np.nan)
        # "Fastest" = the 0.5th percentile, as in the spike: the single extreme pixel overstated it 2x.
        p05 = float(np.nanpercentile(r, 0.5))
        k = np.unravel_index(np.nanargmin(np.abs(r - p05)), r.shape)
        stats |= {"max_sinking_cm_yr": round(-p05 * 100, 1), "fit_rms_cm": info["fit_rms_cm"],
                  "fastest_uv": [round(float(k[1] + 0.5) / grid.nx, 4), round(float(k[0] + 0.5) / grid.ny, 4)],
                  "fastest_series_cm": [0.0] + [round(float(c) * 100, 1) for c in A["cum"][:, k[0], k[1]]]}
    if "coh_pre" in A:
        stats["coherence_drop_pct"] = round(100 * float((drop > 0.3).mean()), 1)
    if "los_pre" in A:
        mp = np.nan_to_num(A["los_pre"])[A["valid_pre"].astype(bool)]
        if len(mp): stats["baseline_range_cm"] = round(float(np.percentile(mp, 98) - np.percentile(mp, 2)) * 100, 1)
    # Nothing (or almost nothing) unwrapped, e.g. a small island in open sea: the coherence change
    # is the only signal, so the page shows it like a landslide (no motion, change tint).
    # Same when the event pair moved no more than the quiet baseline pair: what varies is atmosphere,
    # and the event's footprint is the coherence change (lava, pyroclastic deposits).
    still = stats["measured_pct"] < 5 or (
        "baseline_range_cm" in stats and stats.get("motion_range_cm", 0) < 1.5 * stats["baseline_range_cm"])
    write_meta(ev, grid, out, layers, A, info, stats, images, still)


def write_meta(ev, grid, out, layers, A, info, stats, images, still=False):
    slug = ev["slug"]
    g = ground_image(A)
    if g is not None:
        save_img(out / "ground.jpg", g)
    w, s_, e, n = grid.bounds_lonlat()
    meta = {
        "slug": slug, "name": ev["name"], "kind": ev["kind"], "date": ev["date"], "lat": ev["lat"], "lon": ev["lon"],
        "grid": {"epsg": grid.epsg, "left": grid.left, "top": grid.top, "dx": grid.dx, "nx": grid.nx, "ny": grid.ny,
                 "bounds_lonlat": [w, s_, e, n]},
        "layers": layers,
        "ground": "ground.jpg" if (out / "ground.jpg").exists() else None,
        "nisar": info, "stats": stats, "images": images,
    }
    if still:
        meta["still"] = True
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    idx = SITE / "index.json"
    live = sorted(set(json.loads(idx.read_text()) if idx.exists() else []) | {slug})
    idx.write_text(json.dumps(live))
    print(f"{slug}: {grid.nx}x{grid.ny} @ {grid.dx:.0f} m, {info['mb_read']} MB read, {stats}")


def build_backscatter(ev, A, info, grid, out):
    """Flood / fire page. There is no motion: the surface is terrain only and the event shows as a
    tint where backscatter changed (layer `change`). los/valid/coh are written as zeros so the
    viewer and story sampler keep one file layout."""
    change, seen = backscatter_change(ev["kind"], A)
    z16 = np.zeros((grid.ny, grid.nx), "<i2").tobytes()
    (out / "dem.i16").write_bytes(np.round(A["dem"]).astype("<i2").tobytes())
    for f in ("los.i16", "surface.i16"):
        (out / f).write_bytes(z16)
    (out / "valid.u8").write_bytes(np.zeros((grid.ny, grid.nx), np.uint8).tobytes())
    (out / "coh.u8").write_bytes(np.zeros((grid.ny, grid.nx), np.uint8).tobytes())
    (out / "change.u8").write_bytes(grey(change).tobytes())
    # Backscatter change in dB (x10, int16) for the story sampler: HH for floods, HV for fires.
    p = "hh" if ev["kind"] == "flood" else "hv"
    ddb = gcov.db(A[f"{p}_after"]) - gcov.db(A[f"{p}_before"])
    (out / "dbchange.i16").write_bytes(np.round(np.nan_to_num(np.where(seen, ddb, 0)) * 10).astype("<i2").tobytes())
    layers = {"dem": "dem.i16", "los": "los.i16", "surface": "surface.i16", "valid": "valid.u8", "coh": "coh.u8",
              "change": "change.u8", "dbchange": "dbchange.i16"}
    images = []
    def add(name, arr, caption, source):
        save_img(out / name, arr)
        images.append({"file": name, "caption": caption, "source": source})
    nisar = "NISAR L2 GCOV (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC"
    src = f"{nisar}: {len(info['granules'])} passes, track {info['stack'][0]}"
    pb, pa = info["passes_before"], info["passes_after"]
    add("backscatter-before.jpg", composite(A["hh_before"], A["hv_before"]),
        f"Radar backscatter before, median of {len(pb)} passes ({pb[0]} → {pb[-1]}). Red = HH, green = HV, blue = HH/HV: "
        "water is black, vegetation green, buildings and bare ground pink-white.", src)
    add("backscatter-after.jpg", composite(A["hh_after"], A["hv_after"]),
        f"Radar backscatter after ({', '.join(pa)}), same colours.", src)
    what = "newly dark (open water)" if ev["kind"] == "flood" else "lost vegetation backscatter (HV), i.e. burnt"
    add("change.png", grey(change), f"Change: bright = ground that {what} between the passes.", src)
    for tag in ("before", "after"):
        if f"optical_{tag}" in A:
            o = info[f"optical_{tag}"]
            add(f"optical-{tag}.jpg", A[f"optical_{tag}"],
                f"Sentinel-2 true colour, cloud-masked median of {len(o['scenes'])} scenes, {o['window'][0]} → {o['window'][1]}.",
                "Contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search")
    cell_km2 = grid.dx ** 2 / 1e6
    hit = change > 0.5
    stats = {"measured_pct": round(100 * float(seen.mean()), 1), "change_pct": round(100 * float(hit[seen].mean()), 1),
             "change_km2": round(float(hit.sum()) * cell_km2, 1),
             "median_db_change": round(float(np.median(ddb[hit & seen])), 1) if (hit & seen).any() else None}
    if ev["kind"] == "flood":
        # Water under vegetation brightens HH (double bounce): reported, not mapped.
        hb, ha = gcov.db(A["hh_before"]), gcov.db(A["hh_after"])
        stats["brightened_km2"] = round(float(((ha - hb > 3) & seen).sum()) * cell_km2, 1)
    write_meta(ev, grid, out, layers, A, info, stats, images)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="+")
    ap.add_argument("--refetch", action="store_true")
    a = ap.parse_args()
    for s in a.slugs:
        build(s, a.refetch)
