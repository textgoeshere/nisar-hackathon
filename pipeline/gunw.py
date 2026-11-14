"""Read ground motion and coherence for a window out of a NISAR GUNW interferogram.

An interferogram is the phase difference between two radar passes. After the processor removes
the orbit and topography contributions, what is left is mostly:

    phase = ground motion along the line of sight + ionosphere + troposphere + noise

We convert it to motion with  d = -λ/(4π) · (φ - φ_iono): a full 2π phase cycle is half a
wavelength (~12 cm) of motion, because the signal travels there and back. λ = c / centre frequency
(~24 cm for L-band). The product supplies an ionosphere phase screen, which we subtract.

Cleaning:
* `connectedComponents`: unwrapping works region by region; component 0 means "not unwrapped".
  Different components may be offset by whole cycles, so we keep only the largest one.
* `coherenceMagnitude` (0-1): how well the two passes still match. Low coherence means the surface
  itself changed (debris, lava, collapse, vegetation, water). It is a signal in its own right, so it
  is kept as a layer, but motion is only trusted where coherence ≥ 0.3.
* Motion is relative: the absolute phase offset is unknown, so we re-reference to the median of the
  window. Choose a window wider than the deforming area so the median sits on stable ground.
"""
from __future__ import annotations

import numpy as np
from pyproj import Transformer
from scipy import ndimage

from . import remote
from .cmr import Granule

C = 299_792_458.0
BASE = "science/LSAR/GUNW/grids/frequencyA"
MIN_COH = 0.3


def read_window(g: Granule, lat: float, lon: float, half_m: float, s=None) -> dict:
    f, rf = remote.open_h5(g.url, s or remote.session())
    with f:
        ui = f[f"{BASE}/unwrappedInterferogram"]
        hh = ui["HH"]
        epsg = int(hh["projection"].attrs["epsg_code"])
        xs, ys = hh["xCoordinates"][:], hh["yCoordinates"][:]
        cx, cy = Transformer.from_crs(4326, epsg, always_xy=True).transform(lon, lat)
        cols = np.flatnonzero(np.abs(xs - cx) <= half_m)
        rows = np.flatnonzero(np.abs(ys - cy) <= half_m)
        if not len(cols) or not len(rows):
            raise ValueError("event point outside this granule")
        win = (slice(rows[0], rows[-1] + 1), slice(cols[0], cols[-1] + 1))
        phase = hh["unwrappedPhase"][win].astype(np.float64)
        iono = hh["ionospherePhaseScreen"][win].astype(np.float64)
        coh = hh["coherenceMagnitude"][win].astype(np.float32)
        comp = hh["connectedComponents"][win]
        freq = float(f[f"{BASE}/centerFrequency"][()])
    lam = C / freq
    los = -lam / (4 * np.pi) * (phase - np.nan_to_num(iono))
    ok = np.isfinite(los) & (comp > 0) & (coh >= MIN_COH)
    if ok.any():
        labels, n = np.unique(comp[ok], return_counts=True)
        ok &= comp == labels[np.argmax(n)]
    los = np.where(ok, los, np.nan)
    los -= np.nanmedian(los)
    return {
        "los_m": los.astype(np.float32), "coh": np.nan_to_num(coh), "valid": ok,
        "x": xs[win[1]], "y": ys[win[0]], "epsg": epsg, "wavelength_m": lam,
        "bytes_read": rf.bytes_read,
    }


def fill(a: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Fill invalid pixels with the nearest valid value (for a continuous 3D surface; the
    validity mask is exported separately so the viewer can show what is measured)."""
    idx = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    return a[tuple(idx)]
