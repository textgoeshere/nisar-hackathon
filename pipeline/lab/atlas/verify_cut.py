"""Independent check of the cut numbers the Atlas page plots.

Usage: verify_cut.py <slug> <cut-data.json>
  cut-data.json is the text of <script id="cut-data"> from the page after a cut (see shoot.mjs).
Reads the same data files with numpy (nearest cell, no interpolation, its own crossing test) and compares:
 - the plotted samples (every 100 m) with the nearest-cell values, and where the gaps fall;
 - the crossings of the line;
 - the two side medians / the steepest 500 m that the sentence quotes.
"""
import json
import sys
from pathlib import Path

import numpy as np

root = Path(__file__).resolve().parents[3] / "site"
slug, dump = sys.argv[1], json.load(open(sys.argv[2]))
dd = root / "lab" / "data" / slug
lab = json.load(open(dd / "lab.json"))
g, sig = lab["grid"], lab["signal"]
nx, ny, dx = g["nx"], g["ny"], g["dx"]
raw = np.fromfile((dd / sig["file"]).resolve(), dtype="<i2" if sig["dtype"] == "int16" else "u1").reshape(ny, nx).astype(float) * sig["scale"]
valid = np.fromfile((dd / sig["valid"]).resolve(), dtype="u1").reshape(ny, nx) > 0 if sig["valid"] else np.ones((ny, nx), bool)

A = np.array([dump["A"][0] * nx, dump["A"][1] * ny]); B = np.array([dump["B"][0] * nx, dump["B"][1] * ny])
length = np.hypot(*(B - A)) * dx
n = max(2, round(length / 25) + 1)
t = np.linspace(0, 1, n)
X = A[0] + (B[0] - A[0]) * t; Y = A[1] + (B[1] - A[1]) * t
d = t * length
j = np.floor(X).astype(int); i = np.floor(Y).astype(int)
inside = (j >= 0) & (j < nx) & (i >= 0) & (i < ny)
v = np.full(n, np.nan)
ok = inside.copy(); ok[inside] = valid[i[inside], j[inside]]
v[ok] = raw[i[ok], j[ok]]

# plotted samples vs nearest-cell
diffs, gap_disagree, cmp_n = [], 0, 0
for dist, val in dump["samples"]:
    k = int(round(dist / 25))
    if k >= n: continue
    cmp_n += 1
    mine = v[k]
    if (val is None) != np.isnan(mine): gap_disagree += 1; continue
    if val is not None: diffs.append(abs(val - mine))
print(f"{slug}: stroke {length:.0f} m, {n} samples, {np.isnan(v).mean()*100:.0f}% without a reading")
print(f"  samples compared: {cmp_n}; gap/no-gap disagreements (bilinear vs nearest at cell edges): {gap_disagree}; "
      f"median |page - nearest| = {np.median(diffs):.2f}, max = {np.max(diffs):.2f} {sig['unit']}")

# crossings (independent segment test on line.json lines)
lj = json.load(open(dd / "line.json"))
cr = []
for ln in lj["lines"]:
    pts = [(p[0] * nx, p[1] * ny) for p in ln["points"]]
    if ln.get("closed"): pts.append(pts[0])
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        rx, ry, sx, sy = B[0] - A[0], B[1] - A[1], bx - ax, by - ay
        den = rx * sy - ry * sx
        if abs(den) < 1e-12: continue
        tt = ((ax - A[0]) * sy - (ay - A[1]) * sx) / den; uu = ((ax - A[0]) * ry - (ay - A[1]) * rx) / den
        if 0 <= tt <= 1 and 0 <= uu <= 1: cr.append(tt * length)
cr.sort()
print(f"  crossings, mine: {[round(c) for c in cr]}   page: {[round(c['d']) for c in dump['crossings']]}")

f = dump["facts"]
kind = lab["line"]["kind"]
med = lambda a: float(np.median(a[~np.isnan(a)])) if (~np.isnan(a)).any() else float("nan")
if "windows" in f:
    (l0, l1), (r0, r1) = f["windows"]
    L = v[(d >= l0) & (d <= l1)]; R = v[(d >= r0) & (d <= r1)]
    print(f"  side medians, mine (nearest cell): A {med(L):.2f}, B {med(R):.2f}, difference {med(R)-med(L):.2f}; page: A {f['a']:.2f}, B {f['b']:.2f}, difference {f['dv']:.2f} {sig['unit']}")
    print(f"  readings in windows: A {int((~np.isnan(L)).sum())} of {len(L)}, B {int((~np.isnan(R)).sum())} of {len(R)}")
elif "d_a" in f:
    ia, ib = int(round(f["d_a"] / 25)), int(round(f["d_b"] / 25))
    print(f"  steepest 500 m, page: {f['a']:.2f} -> {f['b']:.2f} ({f['dv']:.2f}) between {f['d_a']:.0f} and {f['d_b']:.0f} m; mine at the same places: {v[ia]:.2f} -> {v[ib]:.2f} ({v[ib]-v[ia]:.2f})")
    best = (0, 0, 0)
    k = 20
    for a in range(0, n - k):
        if np.isnan(v[a]) or np.isnan(v[a + k]): continue
        if abs(v[a + k] - v[a]) > abs(best[0]): best = (v[a + k] - v[a], d[a], d[a + k])
    print(f"  my own steepest 500 m over the whole stroke: {best[0]:.2f} between {best[1]:.0f} and {best[2]:.0f} m")
print("  text:", dump["text"])
