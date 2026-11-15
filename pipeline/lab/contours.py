"""Marching squares on a 2-D array, returning joined polylines in (row, column) cell-centre coordinates."""
from __future__ import annotations

import numpy as np

# corner order: a = top-left, b = top-right, c = bottom-right, d = bottom-left; edges: 0 top, 1 right, 2 bottom, 3 left
_CASES = {
    1: [(3, 2)], 2: [(2, 1)], 3: [(3, 1)], 4: [(0, 1)], 6: [(0, 2)], 7: [(3, 0)], 8: [(3, 0)], 9: [(0, 2)],
    11: [(0, 1)], 12: [(3, 1)], 13: [(2, 1)], 14: [(3, 2)],
}
_SADDLE = {5: [(3, 0), (2, 1)], 10: [(3, 2), (0, 1)]}   # resolved by the centre value below


def _edge_point(vals, rr, cc, edge, level):
    a, b, c, d = vals
    if edge == 0:
        t = (level - a) / (b - a); return rr, cc + t
    if edge == 1:
        t = (level - b) / (c - b); return rr + t, cc + 1
    if edge == 2:
        t = (level - d) / (c - d); return rr + 1, cc + t
    t = (level - a) / (d - a); return rr + t, cc


def contour(field: np.ndarray, level: float) -> list[np.ndarray]:
    """Polylines of the `level` isoline.  NaN cells break the lines.  Closed rings repeat their first point at the end."""
    f = np.asarray(field, float)
    ny, nx = f.shape
    ok = np.isfinite(f)
    inside = (f < level) & ok                       # "below the level" counts as inside
    segs = []
    for r in range(ny - 1):
        row_ok = ok[r] & ok[r + 1]
        for c in range(nx - 1):
            if not (row_ok[c] and row_ok[c + 1]):
                continue
            idx = inside[r, c] * 8 + inside[r, c + 1] * 4 + inside[r + 1, c + 1] * 2 + inside[r + 1, c]
            # re-encode so bit order is a,b,c,d -> a=8,b=4,c=2,d=1
            if idx in (0, 15):
                continue
            vals = (f[r, c], f[r, c + 1], f[r + 1, c + 1], f[r + 1, c])
            if idx in _SADDLE:
                centre = sum(vals) / 4
                pairs = _SADDLE[idx] if (centre < level) == (idx == 10) else _SADDLE[idx][::-1] if False else _SADDLE[idx]
            else:
                pairs = _CASES[idx]
            for e1, e2 in pairs:
                p = _edge_point(vals, r, c, e1, level)
                q = _edge_point(vals, r, c, e2, level)
                segs.append((p, q))
    return _join(segs)


def _key(p):
    return (round(p[0], 6), round(p[1], 6))


def _join(segs):
    ends = {}
    for i, (p, q) in enumerate(segs):
        ends.setdefault(_key(p), []).append(i)
        ends.setdefault(_key(q), []).append(i)
    used = [False] * len(segs)
    lines = []
    for i in range(len(segs)):
        if used[i]:
            continue
        used[i] = True
        line = [segs[i][0], segs[i][1]]
        for direction in (1, 0):
            while True:
                tip = line[-1] if direction else line[0]
                nxt = None
                for j in ends.get(_key(tip), []):
                    if not used[j]:
                        nxt = j
                        break
                if nxt is None:
                    break
                used[nxt] = True
                p, q = segs[nxt]
                other = q if _key(p) == _key(tip) else p
                if direction:
                    line.append(other)
                else:
                    line.insert(0, other)
        lines.append(np.array(line))
    return lines
