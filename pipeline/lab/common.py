"""Shared helpers for the lab data layer: event loading, grid <-> (u, v) <-> lon/lat, polylines, hillshade, sea.

Conventions (same as the main site): u runs east from the grid's west edge and v runs south from its north
edge, both as fractions of the whole grid, so a cell (row i, column j) has its centre at
((j + 0.5) / nx, (i + 0.5) / ny).  Row 0 is north.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
from pyproj import Transformer
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
EVENTS = ROOT / "site" / "events"
OUT = ROOT / "site" / "lab" / "data"
CACHE = ROOT / "cache" / "lab"
SEEDS = ROOT / "research" / "media" / "seeds"


@dataclass
class Event:
    slug: str
    meta: dict
    layers: dict
    stories: dict

    @property
    def grid(self) -> dict:
        return self.meta["grid"]

    @property
    def nx(self) -> int:
        return self.grid["nx"]

    @property
    def ny(self) -> int:
        return self.grid["ny"]

    @property
    def dx(self) -> float:
        return self.grid["dx"]

    @property
    def extent_m(self) -> tuple[float, float]:
        """Width and height of the whole grid in metres."""
        return self.nx * self.dx, self.ny * self.dx

    def _tr(self):
        if not hasattr(self, "_t"):
            self._t = Transformer.from_crs(4326, self.grid["epsg"], always_xy=True)
        return self._t

    def lonlat_to_uv(self, lon, lat):
        x, y = self._tr().transform(lon, lat)
        g = self.grid
        return (np.asarray(x) - g["left"]) / (self.nx * self.dx), (g["top"] - np.asarray(y)) / (self.ny * self.dx)

    def uv_to_cr(self, u, v):
        """Continuous (column, row) in cell-centre index coordinates: the centre of cell j is j."""
        return np.asarray(u) * self.nx - 0.5, np.asarray(v) * self.ny - 0.5

    def cell(self, u: float, v: float) -> tuple[int, int]:
        """(row, column) of the cell that contains (u, v)."""
        return min(self.ny - 1, max(0, int(v * self.ny))), min(self.nx - 1, max(0, int(u * self.nx)))

    def uv_to_m(self, u, v):
        """Metres east and south of the grid's north-west corner."""
        w, h = self.extent_m
        return np.asarray(u) * w, np.asarray(v) * h

    def m_to_uv(self, x, y):
        w, h = self.extent_m
        return np.asarray(x) / w, np.asarray(y) / h

    def sample(self, arr: np.ndarray, u: float, v: float, fill=np.nan) -> float:
        """Bilinear sample of a grid-size array at (u, v)."""
        cx, cy = self.uv_to_cr(u, v)
        if not (-0.5 <= cx <= self.nx - 0.5 and -0.5 <= cy <= self.ny - 0.5):
            return fill
        return float(ndimage.map_coordinates(arr.astype(float), [[cy], [cx]], order=1, mode="nearest")[0])


def load_event(slug: str) -> Event:
    d = EVENTS / slug
    meta = json.loads((d / "meta.json").read_text())
    g = meta["grid"]
    layers = {}
    for k, f in meta["layers"].items():
        dt = np.int16 if f.endswith(".i16") else np.uint8
        a = np.fromfile(d / f, dtype=dt).reshape(g["ny"], g["nx"])
        if not a.size == g["nx"] * g["ny"]:
            raise ValueError(f"{slug}/{f}: wrong size")
        layers[k] = a
    stories = json.loads((d / "stories.json").read_text())
    return Event(slug, meta, layers, stories)


def shown_stories(ev: Event) -> list[dict]:
    """The stories the event page shows, in page order (same rule as site/js/event.js)."""
    items = [i for i in ev.stories["items"] if i.get("status") == "selected" and i.get("nisar", {}).get("inside") is not False]
    if not items:
        items = [i for i in ev.stories["items"] if i.get("status") != "rejected" and i.get("nisar", {}).get("inside") is not False]
    return sorted(items, key=lambda i: i.get("order") if i.get("order") is not None else 99)


def span_years(meta: dict) -> float:
    a, b = (date.fromisoformat(s) for s in meta["nisar"]["pair"])
    return (b - a).days / 365.25


def nan_smooth(a: np.ndarray, valid: np.ndarray, sigma: float, min_weight: float = 0.3) -> np.ndarray:
    """Gaussian smoothing that ignores unmeasured cells (NaN where fewer than min_weight of the kernel was measured)."""
    w = ndimage.gaussian_filter(valid.astype(float), sigma)
    s = ndimage.gaussian_filter(np.where(valid, a, 0.0), sigma) / np.maximum(w, 1e-6)
    return np.where(valid & (w > min_weight), s, np.nan)


# ---------- polylines ----------

def dp_simplify(pts: np.ndarray, eps: float) -> np.ndarray:
    """Douglas-Peucker on an (n, 2) array; eps in the array's own units. Iterative to stay clear of recursion limits."""
    n = len(pts)
    if n < 3:
        return pts
    keep = np.zeros(n, bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        p, q = pts[a], pts[b]
        seg = q - p
        L = math.hypot(*seg)
        mid = pts[a + 1:b]
        if L == 0:
            dist = np.hypot(*(mid - p).T)
        else:
            dist = np.abs(seg[0] * (mid[:, 1] - p[1]) - seg[1] * (mid[:, 0] - p[0])) / L
        k = int(np.argmax(dist))
        if dist[k] > eps:
            k += a + 1
            keep[k] = True
            stack += [(a, k), (k, b)]
    return pts[keep]


def polyline_length_m(ev: Event, pl) -> float:
    pts = np.asarray(pl, float)
    x, y = ev.uv_to_m(pts[:, 0], pts[:, 1])
    return float(np.hypot(np.diff(x), np.diff(y)).sum())


def densify(pts: np.ndarray, step: float) -> np.ndarray:
    """Insert points so no gap exceeds `step` (same units as pts); original vertices are kept."""
    out = [pts[0]]
    for a, b in zip(pts[:-1], pts[1:]):
        n = max(1, int(math.ceil(math.hypot(*(b - a)) / step)))
        for i in range(1, n + 1):
            out.append(a + (b - a) * i / n)
    return np.array(out)


def nearest_on_polylines(ev: Event, polylines: list[np.ndarray], u: float, v: float):
    """Closest point on any polyline to (u, v): returns (distance_m, (u, v) of that point, unit tangent in metres (east, south))."""
    w, h = ev.extent_m
    best = (float("inf"), None, None)
    p = np.array([u * w, v * h])
    for pl in polylines:
        P = np.asarray(pl, float)[:, :2] * [w, h]
        a, b = P[:-1], P[1:]
        ab = b - a
        L2 = np.maximum((ab ** 2).sum(1), 1e-9)
        t = np.clip(((p - a) * ab).sum(1) / L2, 0, 1)
        q = a + ab * t[:, None]
        d = np.hypot(*(q - p).T)
        k = int(np.argmin(d))
        if d[k] < best[0]:
            tan = ab[k] / math.sqrt(L2[k])
            best = (float(d[k]), (float(q[k][0] / w), float(q[k][1] / h)), tan)
    return best


def segments_cross(a, b, c, d) -> bool:
    def orient(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    o1, o2, o3, o4 = orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)
    return (o1 * o2 <= 0) and (o3 * o4 <= 0) and not (o1 == o2 == 0)


def cut_crosses(cut, polylines) -> bool:
    for pl in polylines:
        P = np.asarray(pl, float)
        for i in range(len(P) - 1):
            if segments_cross(cut[0], cut[1], P[i][:2], P[i + 1][:2]):
                return True
    return False


# ---------- relief and sea ----------

def hillshade(dem: np.ndarray, dx: float, z: float, az: float = 315.0, alt: float = 45.0, up: int = 2) -> np.ndarray:
    """Relief shading, 0..1, light from the north-west, at `up` times the grid. z = vertical exaggeration."""
    d = ndimage.gaussian_filter(dem.astype(float), 0.6)
    d = ndimage.zoom(d, up, order=3, mode="nearest")
    d = ndimage.gaussian_filter(d, 0.8)
    gy, gx = np.gradient(d * z, dx / up)           # gy: change per metre going south (down the rows)
    slope = np.arctan(np.hypot(gx, gy))
    # direction the surface faces: downhill (east, south) = (-gx, -gy); azimuth measured clockwise from north
    aspect = np.arctan2(-gx, gy)                   # clockwise from north: east component first, north component = +gy
    azr, altr = np.radians(az), np.radians(alt)
    hs = np.sin(altr) * np.cos(slope) + np.cos(altr) * np.sin(slope) * np.cos(azr - aspect)
    return np.clip(hs, 0, 1)


def sea_mask(ev: Event, min_cells: int = 1500) -> np.ndarray:
    """uint8 0/255 at grid size: open water.

    The DEM reads 0 m over the sea but also over coastal flats and reclaimed land, so sea = at or below 0 m AND no radar reading
    (water gives none), opened to drop speckle, keeping only connected bodies of at least min_cells (about 10 km2), then grown by
    two cells inside the below-0 m area to win back the edge the opening removed.
    """
    dem = ev.layers["dem"]
    low = dem <= 0
    cand = ndimage.binary_opening(low & (ev.layers["valid"] == 0), structure=np.ones((3, 3)))
    lab, n = ndimage.label(cand)
    if n == 0:
        return np.zeros(dem.shape, np.uint8)
    sizes = ndimage.sum(cand, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= min_cells])
    keep = ndimage.binary_dilation(keep, iterations=2) & low
    return (keep * 255).astype(np.uint8)


def write_json(path: Path, obj, indent=None) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":") if indent is None else None, indent=indent)
    path.write_text(s, encoding="utf-8")
    return len(s.encode("utf-8"))


def local_tangent(ev: Event, pl: np.ndarray, uv, radius_m: float = 700.0) -> np.ndarray:
    """Unit direction (east, south) of polyline `pl` around the point nearest `uv`, from the vertices within radius_m."""
    w, h = ev.extent_m
    P = np.asarray(pl, float)[:, :2] * [w, h]
    q = np.array(uv, float) * [w, h]
    d = np.hypot(*(P - q).T)
    sel = P[d <= radius_m]
    if len(sel) < 2:
        k = int(np.argmin(d))
        a, b = P[max(0, k - 1)], P[min(len(P) - 1, k + 1)]
        t = b - a
    else:
        c = sel - sel.mean(0)
        t = np.linalg.svd(c, full_matrices=False)[2][0]
    return t / (math.hypot(*t) or 1.0)


def nearest_line(ev: Event, lines: list[np.ndarray], u: float, v: float):
    """(distance_m, (u, v) of nearest point, unit tangent, polyline index) over a list of polylines in (u, v)."""
    d, q, _ = nearest_on_polylines(ev, lines, u, v)
    if q is None:
        return None
    best = None
    for i, pl in enumerate(lines):
        di, qi, _ = nearest_on_polylines(ev, [pl], u, v)
        if best is None or di < best[0]:
            best = (di, qi, i)
    t = local_tangent(ev, lines[best[2]], best[1])
    return best[0], best[1], t, best[2]


def make_cut(ev: Event, centre_uv, tangent, length_m: float = 5000.0):
    """A stroke of length_m through centre_uv square to `tangent` (east, south), clipped to the grid, A at the west/north end."""
    w, h = ev.extent_m
    n = np.array([-tangent[1], tangent[0]])             # normal in (east, south) metres
    if n[0] < -1e-9 or (abs(n[0]) < 1e-9 and n[1] > 0):
        n = -n
    c = np.array(centre_uv) * [w, h]
    half = length_m / 2
    ends = []
    for s in (-1, 1):
        k = half
        for _ in range(2):
            p = c + s * n * k
            if not (0 <= p[0] <= w and 0 <= p[1] <= h):
                # shrink to the grid edge
                ks = []
                for ax, lim in ((0, w), (1, h)):
                    if abs(n[ax]) > 1e-9:
                        for edge in (0, lim):
                            t = (edge - c[ax]) / (s * n[ax])
                            if t >= 0:
                                ks.append(t)
                k = min([half] + ks)
        p = c + s * n * k
        ends.append([round(float(p[0] / w), 5), round(float(p[1] / h), 5)])
    return ends


def profile(ev: Event, arr: np.ndarray, cut, valid: np.ndarray | None = None, step_m: float = 80.0) -> np.ndarray:
    """Nearest-cell samples of `arr` along a cut, one every step_m; NaN where `valid` is 0."""
    w, h = ev.extent_m
    a, b = np.array(cut[0]) * [w, h], np.array(cut[1]) * [w, h]
    n = max(2, int(np.hypot(*(b - a)) / step_m) + 1)
    out = []
    for t in np.linspace(0, 1, n):
        p = a + (b - a) * t
        r, c = ev.cell(p[0] / w, p[1] / h)
        out.append(np.nan if (valid is not None and not valid[r, c]) else float(arr[r, c]))
    return np.array(out)


def noise_estimate(arr: np.ndarray, valid: np.ndarray | None = None) -> float:
    """Robust cell-to-cell scatter: 1.4826 * median |difference between east neighbours| / sqrt(2)."""
    d = np.abs(np.diff(arr.astype(float), axis=1))
    if valid is not None:
        d = d[(valid[:, 1:] > 0) & (valid[:, :-1] > 0)]
    return float(1.4826 * np.median(d) / math.sqrt(2))
