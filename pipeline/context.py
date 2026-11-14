"""Context layers on the event grid: terrain (Copernicus DEM) and optical imagery (Sentinel-2).

Everything for an event lives on **one grid**: the NISAR window in its native UTM projection.
Terrain, optical images, radar layers and the ground-story pins all share it, so a point is the
same (u, v) fraction (u east, v south) in every view. Reprojecting once, here, keeps the viewer
trivial.

* Terrain: Copernicus GLO-30 DEM (30 m), public COGs on AWS Open Data. Tiles are 1°x1°.
* Optical: Sentinel-2 L2A from the Element 84 Earth Search STAC catalogue. A single scene is
  often cloudy, so we take a per-pixel median of the clearest few scenes, masking clouds, cloud
  shadow and snow-like haze with the scene classification layer (SCL).
"""
from __future__ import annotations

import math
import os
from dataclasses import dataclass

import numpy as np
import rasterio
import requests
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject, transform_bounds

os.environ.setdefault("GDAL_CURL_CA_BUNDLE", os.environ.get("CURL_CA_BUNDLE", ""))
# Public AWS Open Data buckets need no credentials; reach them directly rather than through any
# HTTPS-inspecting proxy (GDAL's curl can reject a proxy's re-signed certificates).
os.environ["NO_PROXY"] = ",".join(filter(None, [os.environ.get("NO_PROXY"), ".amazonaws.com"]))
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF")

STAC = "https://earth-search.aws.element84.com/v1/search"
DEM_URL = ("https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM/"
           "Copernicus_DSM_COG_10_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM.tif")


@dataclass(frozen=True)
class Grid:
    epsg: int
    left: float     # west edge (m)
    top: float      # north edge (m)
    dx: float       # pixel size (m)
    nx: int
    ny: int

    @classmethod
    def from_centres(cls, epsg, x, y):
        dx = float(abs(x[1] - x[0]))
        return cls(epsg, float(x.min()) - dx / 2, float(y.max()) + dx / 2, dx, len(x), len(y))

    @property
    def transform(self):
        return from_origin(self.left, self.top, self.dx, self.dx)

    @property
    def crs(self):
        return f"EPSG:{self.epsg}"

    def scaled(self, dx: float) -> "Grid":
        return Grid(self.epsg, self.left, self.top, dx, round(self.nx * self.dx / dx), round(self.ny * self.dx / dx))

    def bounds_lonlat(self):
        return transform_bounds(self.crs, "EPSG:4326", self.left, self.top - self.ny * self.dx,
                                self.left + self.nx * self.dx, self.top)

    def uv(self, lon: float, lat: float) -> tuple[float, float]:
        from pyproj import Transformer
        x, y = Transformer.from_crs(4326, self.epsg, always_xy=True).transform(lon, lat)
        return ((x - self.left) / (self.nx * self.dx), (self.top - y) / (self.ny * self.dx))


def dem(grid: Grid) -> np.ndarray:
    w, s, e, n = grid.bounds_lonlat()
    out = np.full((grid.ny, grid.nx), np.nan, np.float32)
    for la in range(math.floor(s), math.floor(n) + 1):
        for lo in range(math.floor(w), math.floor(e) + 1):
            url = DEM_URL.format(ns="N" if la >= 0 else "S", lat=abs(la), ew="E" if lo >= 0 else "W", lon=abs(lo))
            try:
                src = rasterio.open("/vsicurl/" + url)
            except rasterio.RasterioIOError:
                continue                                    # ocean tiles don't exist
            with src:
                tile = np.full_like(out, np.nan)
                reproject(rasterio.band(src, 1), tile, dst_transform=grid.transform, dst_crs=grid.crs,
                          resampling=Resampling.bilinear, dst_nodata=np.nan)
            out = np.where(np.isnan(out), tile, out)
    return np.nan_to_num(out, nan=0.0)                       # sea level where no tile


CLOUDY = {0, 1, 3, 8, 9, 10}   # SCL: no data, saturated, cloud shadow, cloud medium/high, cirrus


def sentinel2(grid: Grid, start: str, end: str, max_scenes: int = 6) -> tuple[np.ndarray | None, list[str]]:
    """Cloud-masked median true-colour composite (uint8 RGB) on `grid`, and the scene ids used."""
    w, s, e, n = grid.bounds_lonlat()
    r = requests.post(STAC, json={
        "collections": ["sentinel-2-l2a"], "bbox": [w, s, e, n], "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lt": 60}}, "limit": 100}, timeout=60)
    r.raise_for_status()
    feats = sorted(r.json()["features"], key=lambda f: f["properties"]["eo:cloud_cover"])
    # Group by date so every MGRS tile of a pass is used together and the window is covered.
    by_day: dict[str, list] = {}
    for f in feats:
        by_day.setdefault(f["properties"]["datetime"][:10], []).append(f)
    days = list(by_day)[:max_scenes]
    stack, used = [], []
    for d in days:
        rgb = np.zeros((3, grid.ny, grid.nx), np.uint8)
        ok = np.zeros((grid.ny, grid.nx), bool)
        for f in by_day[d]:
            try:
                with rasterio.open("/vsicurl/" + f["assets"]["visual"]["href"]) as src:
                    t = np.zeros_like(rgb)
                    for b in range(3):
                        reproject(rasterio.band(src, b + 1), t[b], dst_transform=grid.transform, dst_crs=grid.crs,
                                  resampling=Resampling.average, dst_nodata=0)
                with rasterio.open("/vsicurl/" + f["assets"]["scl"]["href"]) as src:
                    scl = np.zeros((grid.ny, grid.nx), np.uint8)
                    reproject(rasterio.band(src, 1), scl, dst_transform=grid.transform, dst_crs=grid.crs,
                              resampling=Resampling.nearest, dst_nodata=0)
            except rasterio.RasterioIOError:
                continue
            good = ~np.isin(scl, list(CLOUDY)) & (t.sum(0) > 0)
            rgb[:, good] = t[:, good]
            ok |= good
            used.append(f["id"])
        stack.append(np.where(ok, rgb, np.nan).astype(np.float32) if ok.any() else None)
    stack = [x for x in stack if x is not None]
    if not stack:
        return None, used
    med = np.nanmedian(np.stack(stack), axis=0)
    return np.nan_to_num(med, nan=0).clip(0, 255).astype(np.uint8).transpose(1, 2, 0), used
