"""Kumamoto: how far the ground either side of the surface rupture slid sideways (the movement field the 3D page animates).

    python -m pipeline.slip kumamoto-quake

Writes site/events/<slug>/slip.i16 and slip.json as briefs/slip-contract.md describes. The radar cannot supply this: one pass
only sees motion toward or away from the satellite. So the field is built from the ground survey and GPS alone:

  1. the jump across the line at each field-survey site is the taped sideways offset, interpolated along the line between
     sites and closed to zero at both ends;
  2. each side moves parallel to the line (smoothed over a few km), the north-west side north-east, the south-east side
     south-west, sharing the offset by a fitted fraction;
  3. the movement fades with distance from the line by a fitted rule (the better of an exponential and an arctangent shape).

Inputs: site/lab/data/<slug>/line.json (pipeline/lab/kumamoto.py), research/slip/<slug>.json (GPS), events/<slug>/meta.json.
"""
from __future__ import annotations

import json
import math
import sys

import numpy as np
from pyproj import Transformer
from scipy.optimize import least_squares

from .lab.common import EVENTS, OUT, ROOT

SMOOTH_M = 2500.0                  # line direction: chord over +-2.5 km, so the straight segments between sites do not kink the field
TAPER_M = 2000.0                   # the offset closes to zero over this distance at each end of the line (a drawing choice)
LOS = (0.678, 0.188, 0.711)        # unit vector from the ground to the satellite at the scene centre: east, north, up
FADES = {                          # both are 1 at the line, so the jump across it is the full offset
    "exponential": lambda d, L: np.exp(-d / L),
    "arctangent": lambda d, L: (2 / np.pi) * np.arctan2(L, d),     # the shape a locked fault gives; falls to half at d = L
}


class Line:
    """The rupture polyline in metres (east, south of the grid's north-west corner) with a smoothed direction at each vertex."""

    def __init__(self, lab, W, H):
        self.uv = np.array([p[:2] for p in lab["lines"][0]["points"]])
        self.xy = self.uv * [W, H]
        self.seg = np.diff(self.xy, axis=0)
        self.seglen = np.hypot(*self.seg.T)
        self.arc = np.concatenate([[0], np.cumsum(self.seglen)])
        self.length = self.arc[-1]
        # one direction per vertex, pointing north-east: the chord between the points SMOOTH_M either side along the line
        self.tan = np.zeros((len(self.xy), 2))
        for i, s in enumerate(self.arc):
            a = np.searchsorted(self.arc, s - SMOOTH_M)
            b = min(len(self.xy) - 1, np.searchsorted(self.arc, s + SMOOTH_M))
            v = self.xy[a] - self.xy[b]
            v = v if v[1] < 0 else -v                                 # (east, south): north-east has south < 0
            self.tan[i] = v / np.hypot(*v)

    def locate(self, p):
        """Per point (metres east, south): distance along the line, distance from it, side (+1 north-west) and direction there."""
        best = np.full(len(p), np.inf)
        s, k, f = np.zeros(len(p)), np.zeros(len(p), int), np.zeros(len(p))
        for i in range(len(self.seg)):
            t = np.clip(((p - self.xy[i]) @ self.seg[i]) / self.seglen[i] ** 2, 0, 1)
            d = np.hypot(*(p - (self.xy[i] + t[:, None] * self.seg[i])).T)
            m = d < best
            best[m], s[m], k[m], f[m] = d[m], self.arc[i] + t[m] * self.seglen[i], i, t[m]
        T = self.tan[k] * (1 - f[:, None]) + self.tan[k + 1] * f[:, None]
        T /= np.hypot(*T.T)[:, None]
        w = p - (self.xy[k] + f[:, None] * self.seg[k])                # from the nearest line point to p
        side = np.where(T[:, 1] * w[:, 0] - T[:, 0] * w[:, 1] >= 0, 1.0, -1.0)   # left of a north-east heading is north-west
        return s, best, side, T

    def offset_cm(self, s, site_s, site_cm):
        """Total sideways offset across the line at distance s along it: interpolated between sites, closed at both ends."""
        t = np.clip(np.minimum(s, self.length - s) / TAPER_M, 0, 1)
        return np.interp(s, site_s, site_cm) * t * t * (3 - 2 * t)      # smoothstep


def movement(par, fade, share, geo):
    """Movement in mm (east, north) from a fit vector and the located points (s, d, side, T, offset_cm)."""
    s, d, side, T, off = geo
    nw = side > 0
    a, Lnw, Lse = share(par)
    amount = np.where(nw, a * fade(d, Lnw), (1 - a) * fade(d, Lse)) * off * 10
    along = side * amount                                              # north-west side goes north-east, south-east side goes south-west
    return np.stack([along * T[:, 0], along * -T[:, 1]], axis=1)


def fit(geo, truth_cm, fade):
    """Least squares on the GPS vectors; returns {name: (params, rms_cm, rule)} for the variants (2 or 3 free parameters)."""
    variants = {"share + one fade length": (lambda p: (p[0], p[1], p[1]), [0.7, 8000.0]),
                "share + a fade length per side": (lambda p: (p[0], p[1], p[2]), [0.7, 8000.0, 8000.0])}
    out = {}
    for name, (rule, x0) in variants.items():
        lo, hi = [0.0] + [500.0] * (len(x0) - 1), [1.0] + [200000.0] * (len(x0) - 1)
        starts = [[x0[0]] + [L * m for L in x0[1:]] for m in (0.3, 1.0, 3.0)]   # a few starts: the problem is small and not convex
        res = [least_squares(lambda x: (movement(x, fade, rule, geo) / 10 - truth_cm).ravel(), x, bounds=(lo, hi)) for x in starts]
        r = min(res, key=lambda r: r.cost)
        out[name] = (r.x, float(np.sqrt(np.mean(np.sum((movement(r.x, fade, rule, geo) / 10 - truth_cm) ** 2, axis=1)))), rule)
    return out


def half_km(shape, L):
    return (L if shape == "arctangent" else L * math.log(2)) / 1000


def build(slug: str = "kumamoto-quake") -> dict:
    meta = json.loads((EVENTS / slug / "meta.json").read_text())
    grid = meta["grid"]
    lab = json.loads((OUT / slug / "line.json").read_text())
    gps_in = json.loads((ROOT / "research" / "slip" / f"{slug}.json").read_text())
    nx, ny, dx = grid["nx"], grid["ny"], grid["dx"]
    W, H = nx * dx, ny * dx
    line = Line(lab, W, H)

    # Survey sites on the line. gsj-11 is a vertical step, and sites placed only by town name are off the polyline: neither enters.
    sites = [x for x in lab["sites"] if x["on_polyline"] and "right-lateral" in x["value"]]
    ss, _, _, _ = line.locate(np.array([[x["u"] * W, x["v"] * H] for x in sites]))
    order = np.argsort(ss)
    site_s, site_cm = ss[order], np.array([sites[i]["offset_cm"] for i in order], float)

    tr = Transformer.from_crs(4326, grid["epsg"], always_xy=True)
    st = gps_in["stations"]
    xy = np.array([[tr.transform(g["lon"], g["lat"])[0] - grid["left"], grid["top"] - tr.transform(g["lon"], g["lat"])[1]] for g in st])
    s, d, side, T = line.locate(xy)
    gps_geo = (s, d, side, T, line.offset_cm(s, site_s, site_cm))
    truth = np.array([[g["east_cm"], g["north_cm"]] for g in st])
    used = np.array([not g.get("beyond_line_end") for g in st])        # G071 sits beyond the drawn end: it is reported, not fitted
    sub = tuple(x[used] for x in gps_geo)

    tried = {}                                                         # (fade shape, variant) -> (params, rms of the fitted stations, rule)
    for shape, fade in FADES.items():
        for name, r in fit(sub, truth[used], fade).items():
            tried[shape, name] = r
    (shape, variant), (par, fit_rms, rule) = min(tried.items(), key=lambda kv: kv[1][1])
    fade = FADES[shape]
    a, Lnw, Lse = rule(par)

    # the field, on cell centres
    jj, ii = np.meshgrid(np.arange(nx), np.arange(ny))
    cells = np.stack([(jj.ravel() + 0.5) * dx, (ii.ravel() + 0.5) * dx], axis=1)
    cs, cd, cside, cT = line.locate(cells)
    field = movement(par, fade, rule, (cs, cd, cside, cT, line.offset_cm(cs, site_s, site_cm)))
    bands = np.stack([field[:, 0].reshape(ny, nx), field[:, 1].reshape(ny, nx)])
    (EVENTS / slug / "slip.i16").write_bytes(np.round(bands).astype("<i2").tobytes())
    max_mm = int(np.round(np.hypot(*bands)).max())

    # GPS table
    mod = movement(par, fade, rule, gps_geo) / 10
    miss = np.hypot(*(mod - truth).T)
    gps = []
    for g, (u, v), m, ms in zip(st, xy / [W, H], mod, miss):
        gps.append({"id": g["id"], "name": g["name"], "u": round(float(u), 5), "v": round(float(v), 5), "east_cm": g["east_cm"],
                    "north_cm": g["north_cm"], "up_cm": g["up_cm"], "model_east_cm": round(float(m[0]), 1), "model_north_cm": round(float(m[1]), 1),
                    "miss_cm": round(float(ms), 1),
                    "source": "Nevada Geodetic Laboratory daily positions (GSI GEONET station); step computed for this project, median of 7 days either side"})
    rms_all = float(np.sqrt(np.mean(miss ** 2)))
    rms_fit = float(np.sqrt(np.mean(miss[used] ** 2)))
    worst = int(np.argmax(miss))
    gdist = {g["id"]: float(x) / 1000 for g, x in zip(st, d)}

    vertex_cm = line.offset_cm(line.arc, site_s, site_cm)
    measured = [int(p[2]) for p in lab["lines"][0]["points"]]
    big = max(sites, key=lambda x: x["offset_cm"])
    mags = [math.hypot(g["east_cm"], g["north_cm"]) for g in st]
    j093 = next(g for g in st if g["id"] == "J093")
    short = lambda g: g["name"].split()[-1]
    fades = " and ".join(f"{h:.0f} km" for h in sorted({round(half_km(shape, L)) for L in (Lnw, Lse)}))
    far = 20000.0
    far_pct = f"{100 * float(fade(far, Lnw)):.0f}%" if Lnw == Lse else f"{100 * float(fade(far, Lnw)):.0f}% on the north-west side and {100 * float(fade(far, Lse)):.0f}% on the south-east"
    beyond = next((i for i, g in enumerate(st) if g.get("beyond_line_end")), None)    # a station past the end of the drawn line
    why = " (past the end of the drawn line, where the break was found only by town name)" if st[worst].get("beyond_line_end") else ""
    gap = ""
    if beyond is not None and beyond != worst:
        g = gps[beyond]
        gap = (f" At {short(st[beyond])} the ground moved {math.hypot(g['east_cm'], g['north_cm']):.0f} cm, {gdist[g['id']]:.1f} km past the end of the drawn line, "
               f"and the model shows {math.hypot(g['model_east_cm'], g['model_north_cm']):.0f} cm: the line was not extended to cover it.")
    text = {
        "measured": (f"Field teams from the Geological Survey of Japan taped the sideways offset across the break at {len(sites)} places along it, "
                     f"from {min(site_cm):.0f} cm to {max(site_cm):.0f} cm (the largest, {big['offset_cm']} cm, on a road at Miyahara). "
                     f"GPS stations on the ground measured how far the land moved at {len(st)} points around the break, "
                     f"from {min(mags):.0f} cm to {max(mags):.0f} cm, the most at {short(j093)}, {gdist['J093']:.1f} km north-west of it."),
        "drawn": (f"Everything between those points is filled in by a rule. The two sides slide past each other by exactly the surveyed offset at each place, "
                  f"and by a straight-line blend between places. The offset shrinks to nothing over the last {TAPER_M / 1000:.0f} km at each end of the line, so the tear closes. "
                  f"Each side moves along the line, the north-west side north-east and the south-east side south-west. The north-west side takes {100 * a:.0f}% of the offset and the other side the rest. "
                  f"The movement fades with distance from the line, to half its size at {fades} and to {far_pct} of its size at 20 km. "
                  f"The share and the fading were fitted to the {int(used.sum())} GPS stations along the drawn line."),
        "caveat": (f"NISAR did not measure this movement. One radar pass only sees ground moving toward or away from the satellite, so it cannot say which way along the ground the two sides slid. "
                   f"This picture comes from the survey and the GPS. The model is {rms_fit:.0f} cm away from the GPS on average at the {int(used.sum())} stations it was fitted to, "
                   f"and the biggest miss over all {len(st)} is {miss[worst]:.0f} cm at {short(st[worst])}{why}.{gap} "
                   "Up-and-down movement is not drawn."),
    }
    summary = (f"The ground either side of the break slid past each other by the offset the survey taped at {len(sites)} places, shared {100 * a:.0f}% / {100 * (1 - a):.0f}% "
               f"between the north-west and south-east sides and fading with distance as the GPS suggests.")
    doc = {
        "slug": slug, "version": 1,
        "field": {"file": "slip.i16", "dtype": "int16", "nx": nx, "ny": ny, "bands": ["east_mm", "north_mm"], "max_mm": max_mm},
        "line": {"points": [[float(u), float(v), m, round(float(c), 1)] for (u, v), m, c in zip(line.uv, measured, vertex_cm)],
                 "runs": [{"measured": r["measured"], "points": [p[:2] for p in r["points"]]} for r in lab["runs"]],
                 "length_km": round(line.length / 1000, 1)},
        "sites": [{k: x[k] for k in ("id", "label", "u", "v", "offset_cm", "value", "conf", "credit")} for x in sites],
        "gps": gps,
        "model": {"summary": summary,
                  "params": {"fade_shape": shape, "variant": variant, "share_nw": round(float(a), 3), "fade_m_nw": round(float(Lnw)), "fade_m_se": round(float(Lse)),
                             "fade_note": "exponential: exp(-d/L); arctangent: (2/pi)*atan(L/d); both 1 at the line",
                             "tip_taper_m": TAPER_M, "direction_smoothing_m": SMOOTH_M,
                             "gps_rms_miss_fitted_cm": round(fit_rms, 1),
                             "tried": {f"{k[0]}, {k[1]}": round(v[1], 1) for k, v in tried.items()}},
                  "gps_rms_miss_cm": round(rms_all, 1)},
        "text": text,
        "credits": [f"Field offsets: Geological Survey of Japan (GSJ), 2026 Kumamoto earthquake field survey: sideways offsets taped across the rupture at {len(sites)} sites.",
                    "GPS: Nevada Geodetic Laboratory daily station positions (steps computed for this project) for GSI GEONET stations, Geospatial Information Authority of Japan."],
    }
    (EVENTS / slug / "slip.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1))

    # the line-of-sight check, for the report only: the movement step across the 184 cm site, projected on the satellite direction
    b = next(x for x in sites if x["id"] == big["id"])
    p = np.array([[b["u"] * W, b["v"] * H]])
    pT = line.locate(p)[3]
    side_move = {}
    for sd in (1, -1):
        q = p + sd * np.array([-pT[0, 1], pT[0, 0]])                   # 1 m across the line (along its normal), either side
        qs, qd, qside, qT = line.locate(q)
        side_move[int(qside[0])] = movement(par, fade, rule, (qs, qd, qside, qT, line.offset_cm(qs, site_s, site_cm)))[0] / 10
    return {"doc": doc, "tried": tried, "rms_fit": rms_fit, "jump_cm": side_move[1] - side_move[-1], "site": big,
            "radar_step_cm": b.get("radar_step_cm"), "used": used}


def main(slug: str):
    r = build(slug)
    doc = r["doc"]
    print(f"wrote {EVENTS / slug / 'slip.json'}, max {doc['field']['max_mm']} mm, {len(doc['sites'])} sites, line {doc['line']['length_km']} km")
    for k, v in r["tried"].items():
        print(f"  tried {k[0]:12s} {k[1]:32s} fitted RMS miss {v[1]:5.1f} cm  params {np.round(v[0], 3).tolist()}")
    print("  chosen:", doc["model"]["params"]["fade_shape"], "|", doc["model"]["params"]["variant"])
    for g in doc["gps"]:
        print(f"  {g['id']} measured E {g['east_cm']:+6.1f} N {g['north_cm']:+6.1f} | model E {g['model_east_cm']:+6.1f} N {g['model_north_cm']:+6.1f} | miss {g['miss_cm']}")
    print(f"  RMS miss: all {len(doc['gps'])} stations {doc['model']['gps_rms_miss_cm']} cm; fitted {int(r['used'].sum())} {r['rms_fit']:.1f} cm")
    j = r["jump_cm"]
    los = j[0] * LOS[0] + j[1] * LOS[1]
    print(f"  jump at {r['site']['id']}: E {j[0]:+.1f} N {j[1]:+.1f} cm ({math.hypot(*j):.1f} cm) -> along the line of sight {abs(los):.1f} cm; radar step {r['radar_step_cm']} cm")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "kumamoto-quake")
