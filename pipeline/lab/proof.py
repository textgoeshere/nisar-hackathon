"""Proof images drawn only from the files in site/lab/data/<slug>/ (the contract), to catch mirrored or shifted data.

  python -m pipeline.lab.proof [slug ...]
Writes proof-focus.jpg and proof-scene.jpg: relief, sea, the line raster tint, OpenStreetMap vectors, the line (solid where measured,
dashed where not), the stories (numbered) and survey sites (small diamonds).
"""
from __future__ import annotations

import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .common import OUT

WIDTH = 1000
ROAD = {"motorway": ((200, 90, 60), 3), "trunk": ((210, 120, 50), 3), "primary": ((190, 80, 80), 2), "secondary": ((120, 100, 90), 2),
        "tertiary": ((90, 90, 90), 1), "minor": ((140, 140, 140), 1)}


def _font(size):
    for p in ("/System/Library/Fonts/HelveticaNeue.ttc", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _dashed(d, pts, fill, width, dash=14, gap=9):
    acc, on = 0.0, True
    for (x1, y1), (x2, y2) in zip(pts[:-1], pts[1:]):
        seg = math.hypot(x2 - x1, y2 - y1)
        pos = 0.0
        while pos < seg:
            left = (dash if on else gap) - acc
            stp = min(left, seg - pos)
            if on and seg > 0:
                a, b = pos / seg, (pos + stp) / seg
                d.line([x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b], fill=fill, width=width)
            pos += stp
            acc += stp
            if acc >= (dash if on else gap) - 1e-6:
                on, acc = not on, 0.0


def render(slug: str):
    d0 = OUT / slug
    lab = json.loads((d0 / "lab.json").read_text())
    g = lab["grid"]
    nx, ny = g["nx"], g["ny"]
    hs = Image.open(d0 / lab["files"]["hillshade"]).convert("L")
    sea = np.asarray(Image.open(d0 / lab["files"]["sea"]).convert("L"))
    bm = json.loads((d0 / lab["files"]["basemap"]).read_text())
    lj = json.loads((d0 / lab["files"]["line_vector"]).read_text())
    raster = np.fromfile(d0 / lab["files"]["line_raster"], np.uint8).reshape(ny, nx)
    thr = lab["line"]["threshold_raw"]
    for name, box in (("focus", (lab["focus"]["u0"], lab["focus"]["v0"], lab["focus"]["u1"], lab["focus"]["v1"])), ("scene", (0, 0, 1, 1))):
        u0, v0, u1, v1 = box
        W = WIDTH
        H = int(round(W * (v1 - v0) * ny / ((u1 - u0) * nx)))
        # base: relief
        hw, hh = hs.size
        crop = hs.crop((int(u0 * hw), int(v0 * hh), int(round(u1 * hw)), int(round(v1 * hh)))).resize((W, H), Image.LANCZOS)
        base = np.asarray(crop).astype(float) / 255
        rgb = np.dstack([0.55 + 0.45 * base, 0.57 + 0.43 * base, 0.55 + 0.40 * base])
        # sea
        sc = Image.fromarray(sea).crop((int(u0 * nx), int(v0 * ny), int(round(u1 * nx)), int(round(v1 * ny)))).resize((W, H), Image.BILINEAR)
        s = np.asarray(sc).astype(float)[..., None] / 255
        rgb = rgb * (1 - s) + np.array([0.65, 0.80, 0.93]) * s
        # line raster tint
        rc = Image.fromarray(raster).crop((int(u0 * nx), int(v0 * ny), int(round(u1 * nx)), int(round(v1 * ny)))).resize((W, H), Image.BILINEAR)
        a = np.clip((np.asarray(rc).astype(float) - thr * 0.6) / max(1, thr * 1.6), 0, 1)[..., None] * 0.45
        rgb = rgb * (1 - a) + np.array([1.0, 0.75, 0.2]) * a
        im = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))
        dr = ImageDraw.Draw(im)

        def P(u, v):
            return ((u - u0) / (u1 - u0) * W, (v - v0) / (v1 - v0) * H)

        def poly(pl, fill, width):
            pts = [P(u, v) for u, v in pl]
            if any(-50 < x < W + 50 and -50 < y < H + 50 for x, y in pts):
                dr.line(pts, fill=fill, width=width)

        for pl in bm["coast"]:
            poly(pl, (40, 90, 150), 2)
        for k in ("river", "canal"):
            for pl in bm[k]:
                poly(pl, (70, 130, 200), 1 if k == "canal" else 2)
        for pl in bm["rail"]:
            poly(pl, (70, 70, 70), 1)
        for cls in ("minor", "tertiary", "secondary", "primary", "trunk", "motorway"):
            col, wd = ROAD[cls]
            for pl in bm["roads"][cls]:
                poly(pl, col, wd)
        f = _font(11)
        for p in bm["places"]:
            x, y = P(p["u"], p["v"])
            if 0 <= x < W and 0 <= y < H and p["kind"] in ("city", "town", "village"):
                dr.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(30, 30, 30))
                dr.text((x + 4, y - 6), (p["name_en"] or "·")[:18], fill=(30, 30, 30), font=f)
        # the line
        for run in lj["runs"]:
            pts = [P(u, v) for u, v in run["points"]]
            if run["measured"]:
                dr.line(pts, fill=(215, 20, 30), width=3, joint="curve")
            else:
                _dashed(dr, pts, (215, 20, 30), 2)
        # survey sites and stories
        for s_ in lj.get("sites", []):
            x, y = P(s_["u"], s_["v"])
            if 0 <= x < W and 0 <= y < H:
                dr.polygon([(x, y - 5), (x + 5, y), (x, y + 5), (x - 5, y)], outline=(0, 0, 0), fill=(255, 235, 120) if s_.get("on_polyline") else (230, 230, 230))
        ff = _font(13)
        for st in lab["stories"]:
            x, y = P(st["u"], st["v"])
            if not (0 <= x < W and 0 <= y < H):
                continue
            if st.get("cut"):
                (ax, ay), (bx, by) = P(*st["cut"][0]), P(*st["cut"][1])
                dr.line([ax, ay, bx, by], fill=(20, 20, 20), width=1)
            r = 9 if st["kind"] == "story" else 5
            dr.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255) if st["kind"] == "story" else (255, 235, 120), outline=(0, 0, 0), width=2)
            if st["n"]:
                dr.text((x, y), str(st["n"]), fill=(0, 0, 0), font=ff, anchor="mm")
        dr.rectangle([0, 0, W, 18], fill=(255, 255, 255))
        dr.text((4, 2), f"{slug} {name}: relief, sea, OSM, line (solid=measured, dashed=not), pins, cuts; orange = line raster", fill=(0, 0, 0), font=_font(12))
        path = d0 / f"proof-{name}.jpg"
        q = 82
        while True:
            im.save(path, quality=q, optimize=True)
            if path.stat().st_size < 380_000 or q <= 40:
                break
            q -= 8
        print(f"  proof {path.name}: {im.size}, {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    for s in sys.argv[1:] or ["kumamoto-quake", "mexico-city-subsidence", "etna-eruption"]:
        render(s)
