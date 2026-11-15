"""Thin lines from a scalar field: non-maximum suppression of a gradient magnitude, hysteresis, and tracing to polylines."""
from __future__ import annotations

from collections import deque

import numpy as np
from scipy import ndimage

N8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def nms_ridges(field: np.ndarray, valid: np.ndarray, sigma_dir: float = 0.0):
    """Magnitude of the gradient of `field` (NaN-free where valid), thinned to its crest across the gradient direction.

    Returns (magnitude, crest mask).  Gradient units are field units per cell.
    """
    f = np.where(valid, field, 0.0)
    gy, gx = np.gradient(f)
    mag = np.hypot(gx, gy)
    mag = np.where(valid, mag, 0.0)
    ny, nx = mag.shape
    ux, uy = gx / np.maximum(mag, 1e-12), gy / np.maximum(mag, 1e-12)
    yy, xx = np.mgrid[0:ny, 0:nx].astype(float)
    a = ndimage.map_coordinates(mag, [yy + uy, xx + ux], order=1, mode="nearest")
    b = ndimage.map_coordinates(mag, [yy - uy, xx - ux], order=1, mode="nearest")
    crest = (mag >= a) & (mag >= b) & (mag > 0)
    return mag, crest


def hysteresis(crest: np.ndarray, mag: np.ndarray, lo: float, hi: float) -> np.ndarray:
    cand = crest & (mag >= lo)
    lab, n = ndimage.label(cand, structure=np.ones((3, 3)))
    if n == 0:
        return cand
    peak = ndimage.maximum(mag, lab, range(1, n + 1))
    ok = np.zeros(n + 1, bool)
    ok[1:] = np.asarray(peak) >= hi
    return ok[lab]


def _bfs_far(adj, start, allowed):
    prev = {start: None}
    dq = deque([start])
    last = start
    while dq:
        p = dq.popleft()
        last = p
        for q in adj[p]:
            if q in allowed and q not in prev:
                prev[q] = p
                dq.append(q)
    return last, prev


def trace_paths(mask: np.ndarray, min_cells: int = 8) -> list[list[tuple[int, int]]]:
    """Trace an 8-connected thin mask into paths (lists of (row, col)): repeatedly take the longest path of each component."""
    pts = set(zip(*np.nonzero(mask)))
    adj = {p: [(p[0] + dr, p[1] + dc) for dr, dc in N8 if (p[0] + dr, p[1] + dc) in pts] for p in pts}
    remaining = set(pts)
    paths = []
    while remaining:
        seed = next(iter(remaining))
        # component of the seed among remaining
        comp = {seed}
        dq = deque([seed])
        while dq:
            p = dq.popleft()
            for q in adj[p]:
                if q in remaining and q not in comp:
                    comp.add(q)
                    dq.append(q)
        allowed = set(comp)
        while allowed:
            s = next(iter(allowed))
            a, _ = _bfs_far(adj, s, allowed)
            b, prev = _bfs_far(adj, a, allowed)
            path = []
            p = b
            while p is not None:
                path.append(p)
                p = prev[p]
            if len(path) >= min_cells:
                paths.append(path)
            allowed -= set(path)
            # drop stubs that cannot form a path any more
            allowed = {p for p in allowed if any(q in allowed for q in adj[p])} if len(allowed) < min_cells else allowed
            if len(allowed) < min_cells:
                break
        remaining -= comp
    return paths


def smooth_path(path, k: int = 5) -> np.ndarray:
    P = np.asarray(path, float)
    if len(P) < k + 2:
        return P
    pad = k // 2
    ext = np.vstack([P[0] * 2 - P[pad:0:-1], P, P[-1] * 2 - P[-2:-pad - 2:-1]])
    ker = np.ones(k) / k
    return np.column_stack([np.convolve(ext[:, i], ker, mode="valid") for i in range(2)])
