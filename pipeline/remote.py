"""Read a small window out of a multi-gigabyte NISAR HDF5 file without downloading it.

NISAR granules are 1-5 GB, but an event needs a ~40-80 km window. HDF5 stores datasets in chunks,
so h5py only touches the bytes it needs, provided it is handed a file-like object that turns
`read()` calls into HTTP Range requests. Two details matter:

* Auth: ASF wants an Earthdata Login bearer token, then redirects to a pre-signed CloudFront/S3
  URL. The signed URL must be fetched **without** the Authorization header, or it is rejected.
  We resolve the redirect once per file and reuse the signed URL for every range read.
* Block size: reads are latency-bound (many small requests), so we fetch aligned blocks and cache
  them. ~512 KB blocks keep the bytes read close to what is needed; 4 MB blocks read ~10x more.
"""
from __future__ import annotations

import io
import os
import threading

import requests

BLOCK = 512 * 1024


def session() -> requests.Session:
    tok = os.environ.get("EARTHDATA_TOKEN")
    if not tok:
        raise SystemExit("Set EARTHDATA_TOKEN to an Earthdata Login bearer token (urs.earthdata.nasa.gov > Generate Token).")
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {tok}"
    s.mount("https://", requests.adapters.HTTPAdapter(pool_maxsize=16, max_retries=3))
    return s


def signed_url(url: str, s: requests.Session) -> str:
    """Follow ASF's redirect once and return the pre-signed URL."""
    r = s.get(url, allow_redirects=False, timeout=60)
    while r.is_redirect:
        url = r.headers["Location"]
        if "earthdatacloud.nasa.gov" in url or "asf.alaska.edu" in url:
            r = s.get(url, allow_redirects=False, timeout=60)
        else:
            break
    r.close()
    return url


class RangeFile(io.RawIOBase):
    """Seekable read-only file over HTTP Range requests, with an aligned block cache."""

    def __init__(self, url: str, s: requests.Session, block: int = BLOCK):
        self.url = signed_url(url, s)
        self.plain = requests.Session()           # no Authorization header on the signed URL
        self.plain.mount("https://", requests.adapters.HTTPAdapter(pool_maxsize=16, max_retries=3))
        self.block = block
        self.cache: dict[int, bytes] = {}
        self.pos = 0
        self.bytes_read = 0
        self.lock = threading.Lock()
        r = self.plain.get(self.url, headers={"Range": "bytes=0-0"}, timeout=60)
        r.raise_for_status()
        self.size = int(r.headers["Content-Range"].split("/")[1])

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos

    def seek(self, off, whence=io.SEEK_SET):
        self.pos = {io.SEEK_SET: off, io.SEEK_CUR: self.pos + off, io.SEEK_END: self.size + off}[whence]
        return self.pos

    def _block(self, i: int) -> bytes:
        with self.lock:
            if i in self.cache:
                return self.cache[i]
        a = i * self.block
        b = min(self.size, a + self.block) - 1
        r = self.plain.get(self.url, headers={"Range": f"bytes={a}-{b}"}, timeout=120)
        r.raise_for_status()
        with self.lock:
            self.cache[i] = r.content
            self.bytes_read += len(r.content)
        return r.content

    def readinto(self, buf) -> int:
        n = min(len(buf), self.size - self.pos)
        if n <= 0:
            return 0
        out, got = memoryview(buf), 0
        while got < n:
            i, o = divmod(self.pos + got, self.block)
            chunk = self._block(i)[o:o + n - got]
            out[got:got + len(chunk)] = chunk
            got += len(chunk)
        self.pos += n
        return n


def open_h5(url: str, s: requests.Session):
    import h5py
    rf = RangeFile(url, s)
    return h5py.File(io.BufferedReader(rf, BLOCK), "r"), rf
