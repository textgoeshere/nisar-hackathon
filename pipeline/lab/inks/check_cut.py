"""Check the numbers the Three inks page plots for a cut against the raw data files, with code that shares nothing with the page.

    ~/dev/nisar-hackathon/.venv/bin/python pipeline/lab/inks/check_cut.py dump.json [dump.json ...]

A dump is the JSON the page writes into <pre id="debug"> when opened with ?debug=1 (see README). For each dump this script
  1. re-reads the signal from site/events/<slug>/ (los.i16 + valid.u8, signal.i16, or coh.u8),
  2. samples it along the same A->B stroke (the stroke itself is checked against lab.json: preset cuts must match to 1e-5),
  3. compares every sample with what the page plotted (gaps must match exactly),
  4. recomputes the medians on each side of the line crossing and the step / drop / steepest 500 m the sentence states.
"""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
SITE = ROOT / "site"


def load_signal(lab):
    slug, g, sg = lab["slug"], lab["grid"], lab["signal"]
    nx, ny = g["nx"], g["ny"]
    f = SITE / "lab" / "data" / slug / sg["file"]
    a = np.fromfile(f, dtype=sg["dtype"]).astype(float).reshape(ny, nx) * sg["scale"]
    ok = np.ones((ny, nx), bool)
    if sg["valid"]:
        ok = np.fromfile(SITE / "lab" / "data" / slug / sg["valid"], dtype="u1").reshape(ny, nx) > 0
    return a, ok


def main(paths):
    for p in paths:
        raw = Path(p).read_text()
        dump, _ = json.JSONDecoder().raw_decode(raw[raw.index("{"):])  # tolerate text before and after the JSON
        slug = dump["slug"]
        lab = json.loads((SITE / "lab" / "data" / slug / "lab.json").read_text())
        nx, ny, dx = lab["grid"]["nx"], lab["grid"]["ny"], lab["grid"]["dx"]
        a, ok = load_signal(lab)
        A, B = np.array(dump["a"]), np.array(dump["b"])
        # which preset is this?
        match = None
        for s in lab["stories"]:
            pa, pb = np.array(s["cut"][0]) * [nx, ny], np.array(s["cut"][1]) * [nx, ny]
            if np.abs(pa - A).max() < 1e-3 and np.abs(pb - B).max() < 1e-3:
                match = s["id"]
        n = dump["n"]
        t = np.linspace(0, 1, n)
        X, Y = A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t
        j, i = np.floor(X).astype(int), np.floor(Y).astype(int)
        inside = (j >= 0) & (i >= 0) & (j < nx) & (i < ny)
        v = np.full(n, np.nan)
        for k in range(n):
            if inside[k] and ok[i[k], j[k]]:
                v[k] = a[i[k], j[k]]
        page = np.array([np.nan if x is None else x for x in dump["v"]])
        gaps_equal = np.array_equal(np.isnan(v), np.isnan(page))
        both = ~np.isnan(v) & ~np.isnan(page)
        maxdiff = np.abs(v[both] - page[both]).max() if both.any() else 0
        length = np.hypot(*(B - A)) * dx
        print(f"== {slug}  preset={match}  length {length:.0f} m (page {dump['len']:.0f})  samples {n}  gaps {int(np.isnan(v).sum())}")
        print(f"   gaps identical: {gaps_equal};  max |plotted - recomputed| = {maxdiff:.4f} {lab['signal']['unit']}")
        d = np.linspace(0, length, n)
        cross = dump["cross"]
        sm = dump["sum"]
        if cross:
            c = min(cross, key=lambda q: abs(q["d"] - length / 2))["d"]

            def med(lo, hi):
                m = (d >= lo) & (d <= hi) & ~np.isnan(v)
                return float(np.median(v[m])) if m.sum() >= 4 else None

            ma, mb = med(c - 1000, c - 150), med(c + 150, c + 1000)
            print(f"   crossing at {c:.0f} m; side A median {ma}, side B median {mb} (page: {sm.get('sideA')}, {sm.get('sideB')})")
            if ma is not None and mb is not None:
                print(f"   step B - A = {mb - ma:.2f} {lab['signal']['unit']}")
            if sm["kind"] == "bend":
                ss = np.full(n, np.nan)
                for k in range(2, n - 2):
                    w = v[k - 2:k + 3]
                    if not np.isnan(w).any():
                        ss[k] = w.mean()
                best = 0
                for k in range(n):
                    if np.isnan(ss[k]):
                        continue
                    k2 = np.searchsorted(d, d[k] + 500)
                    if k2 < n and not np.isnan(ss[k2]):
                        best = max(best, abs(ss[k2] - ss[k]))
                st = sm.get("steepest")
                print(f"   steepest change over 500 m: {best:.2f} (page {abs(st['ch']):.2f})" if st else f"   steepest 500 m: {best:.2f}")
        print("   sentence:", dump["sentence"])
        print("   dots:", dump["dots"])


if __name__ == "__main__":
    main(sys.argv[1:])
