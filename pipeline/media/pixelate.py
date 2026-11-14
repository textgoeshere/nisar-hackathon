"""Gently pixelated previews of news and agency images (David's decision: use them, pixelated,
clicking through to the attributed source).

We never host the original. The article's og:image (GDELT's `socialimage`, else the page's
og:image / twitter:image meta tag) is downloaded into cache/media/img/, shrunk to LONG px on the
long side and blown back up with nearest neighbour to DISPLAY px, so the scene reads but it is
clearly not a reproduction. Only the derivative goes into site/events/<slug>/media/.
"""
from __future__ import annotations

import hashlib
import io
import re

from .common import CACHE, FetchError, ROOT, _session, get, log

IMG_CACHE = CACHE.parent / "img"
LONG = 56            # blocks on the long side: recognisable, clearly not a reproduction
DISPLAY = 448        # px on the long side of the stored derivative (8x blocks)
GENERIC = re.compile(r"(ogp[-_]?image|/logo|logo[._-]|default[-_]?(og|share|image)|placeholder|/common/.*ogp|favicon|noimage)",
                     re.I)
OG = re.compile(r"""<meta[^>]+(?:property|name)\s*=\s*["'](?:og:image(?::url)?|twitter:image)["'][^>]*>""", re.I)
CONTENT = re.compile(r"""content\s*=\s*["']([^"']+)["']""", re.I)


def og_image(page_url: str) -> str | None:
    """The page's og:image (or twitter:image), from the cached HTML."""
    try:
        html = get(page_url, kind="text", retries=1, timeout=30)
    except FetchError:
        return None
    for tag in OG.findall(html or "")[:3]:
        m = CONTENT.search(tag)
        if m and m.group(1).startswith("http"):
            return m.group(1).replace("&amp;", "&")
    return None


def _download(url: str) -> bytes | None:
    k = hashlib.sha1(url.encode()).hexdigest()
    p = IMG_CACHE / k[:2] / k
    if p.exists():
        return p.read_bytes() or None                    # an empty file caches a failure
    p.parent.mkdir(parents=True, exist_ok=True)
    try:
        r = _session.get(url, timeout=30)
        body = r.content if r.status_code == 200 and r.headers.get("content-type", "").startswith("image") else b""
    except Exception:
        body = b""
    p.write_bytes(body)
    return body or None


def pixelate(data: bytes, long=LONG, display=DISPLAY):
    from PIL import Image
    im = Image.open(io.BytesIO(data))
    im = im.convert("RGB")
    w, h = im.size
    if min(w, h) < 120:                                   # icons and tracking pixels
        return None
    s = long / max(w, h)
    small = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.Resampling.BOX)
    k = max(1, display // long)
    return small.resize((small.width * k, small.height * k), Image.Resampling.NEAREST)


def preview(slug: str, it: dict) -> bool:
    """Make the pixelated preview for a news / agency item; sets preview_url and preview. True if made."""
    src = it.get("thumb_url") if it.get("thumb_url") and not GENERIC.search(it["thumb_url"]) else None
    if not src and it.get("page_url") and it["page_url"].startswith("http") and not it["page_url"].lower().endswith(".pdf"):
        src = og_image(it["page_url"])
        if src and GENERIC.search(src):
            src = None
    if not src:
        return False
    data = _download(src)
    if not data:
        return False
    try:
        im = pixelate(data)
    except Exception as e:                                 # not an image Pillow can read
        log(f"    preview {it['id']}: {type(e).__name__}")
        return False
    if im is None:
        return False
    rel = f"media/{it['id']}.png"
    out = ROOT / "site" / "events" / slug / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, optimize=True)
    it["preview_url"], it["preview"] = rel, "pixelated"
    return True


def clean(slug: str, keep: set[str]):
    """Remove derivatives of harvested items no longer in the harvest (story previews are kept)."""
    d = ROOT / "site" / "events" / slug / "media"
    for p in d.glob("*-*-*.png") if d.exists() else []:
        if re.search(r"-(gdel|vali)-[0-9a-f]{8}$", p.stem) and f"media/{p.name}" not in keep:
            p.unlink()

