"""Read backscatter for a window out of a NISAR GCOV granule, onto a fixed output grid.

GCOV is radar brightness, not phase: how much of the pulse the ground sends back, per
polarisation, terrain-corrected (gamma-0). Two polarisations are on every pass:

* **HH** (sent and received horizontal). Open water is a mirror and sends almost nothing back, so
  a flood shows as ground that went dark. Water under trees or crops does the opposite: trunk and
  water form a corner reflector and HH gets brighter ("double bounce").
* **HV** (sent horizontal, received vertical). Depolarisation comes mostly from volume scattering
  in leaves and branches, so HV tracks vegetation. A burn scar shows as HV that dropped.

Single passes are speckled (random interference between scatterers in a pixel). We average the
native pixels into coarser output cells and take medians over several passes, which damps speckle
without blurring edges much at 40 m.

Passes on one stack can come in different modes (e.g. 20 MHz quad-pol and 40 MHz dual-pol), with
different native pixel sizes, so each pass is binned onto the same output grid by coordinates.
"""
from __future__ import annotations

import numpy as np
from pyproj import Transformer

from . import remote
from .cmr import Granule

BASE = "science/LSAR/GCOV/grids/frequencyA"


def out_grid(epsg: int, lat: float, lon: float, half_m: float, dx: float):
    """Cell centres of a square output window around the event, snapped to dx."""
    cx, cy = Transformer.from_crs(4326, epsg, always_xy=True).transform(lon, lat)
    cx, cy = round(cx / dx) * dx, round(cy / dx) * dx
    n = int(round(2 * half_m / dx))
    x = cx - half_m + dx * (np.arange(n) + 0.5)
    y = cy + half_m - dx * (np.arange(n) + 0.5)               # row 0 = north
    return x, y


def read_window(g: Granule, x: np.ndarray, y: np.ndarray, s=None) -> dict:
    """Mean HH and HV gamma-0 (linear power) per output cell; NaN where the pass has no data."""
    dx = x[1] - x[0]
    f, rf = remote.open_h5(g.url, s or remote.session())
    with f:
        grp = f[BASE]
        xs, ys = grp["xCoordinates"][:], grp["yCoordinates"][:]
        epsg = int(grp["projection"][()])
        cols = np.flatnonzero((xs >= x[0] - dx / 2) & (xs < x[-1] + dx / 2))
        rows = np.flatnonzero((ys <= y[0] + dx / 2) & (ys > y[-1] - dx / 2))
        if not len(cols) or not len(rows):
            raise ValueError("window outside this granule")
        win = (slice(rows[0], rows[-1] + 1), slice(cols[0], cols[-1] + 1))
        bands = {p: grp[f"{p}{p}"][win].astype(np.float64) for p in ("HH", "HV")}
        mask = grp["mask"][win]
    # Output cell index of each native pixel, then sum and count per cell.
    ci = np.floor((xs[cols] - (x[0] - dx / 2)) / dx).astype(int)
    ri = np.floor(((y[0] + dx / 2) - ys[rows]) / dx).astype(int)
    idx = (ri[:, None] * len(x) + ci[None, :]).ravel()
    ok = ((mask > 0) & (mask < 255)).ravel()                 # 0 = invalid, 255 = fill
    out = {"epsg": epsg, "bytes_read": rf.bytes_read}
    for p, a in bands.items():
        a = a.ravel()
        good = ok & np.isfinite(a) & (a > 0)
        tot = np.bincount(idx[good], a[good], minlength=len(x) * len(y))
        cnt = np.bincount(idx[good], minlength=len(x) * len(y))
        out[p.lower()] = np.where(cnt >= 4, tot / np.maximum(cnt, 1), np.nan).reshape(len(y), len(x)).astype(np.float32)
    return out


def db(a: np.ndarray) -> np.ndarray:
    return 10 * np.log10(np.maximum(a, 1e-6))
