"""Step 2: rank candidate events by NISAR before/after coverage.

For each candidate we ask CMR (public, no login) which NISAR granules cover the point, then score:

* quakes, volcanoes, landslides: is there a GUNW interferogram *spanning* the event (reference
  pass before, secondary pass after)? Shorter spans are better: less unrelated change, higher
  coherence. Every track is considered, since the same event can be clean on one track and
  decorrelated on another.
* floods, fires: GCOV backscatter passes before and after on one stack.
* subsidence (no event date): the length of the GUNW chain on the best stack.

Usage:  .venv/bin/python -m pipeline.coverage   -> site/data/coverage.json, ranked table on stdout
"""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

from . import cmr

ROOT = Path(__file__).resolve().parent.parent


def check(ev: dict, s: requests.Session) -> dict:
    out = {k: ev[k] for k in ("slug", "name", "kind", "date")}
    d = ev["date"]
    try:
        gunw = cmr.search(cmr.GUNW, ev["lat"], ev["lon"], s)
        gcov = cmr.search(cmr.GCOV, ev["lat"], ev["lon"], s)
    except requests.RequestException as e:
        return out | {"error": str(e)[:200], "score": 0}
    out["gunw_pairs"], out["gcov_passes"] = len(gunw), len({(g.stack, g.start) for g in gcov})
    if d is None:
        best = next(iter(cmr.stacks(gunw).values()), [])
        out["chain"] = {"pairs": len(best), "from": best[0].start if best else None, "to": best[-1].end if best else None}
        out["score"] = min(1.0, len(best) / 20)
        return out
    spanning = sorted((g for g in gunw if g.start < d <= g.end), key=lambda g: g.days)
    out["spanning"] = [{"stack": "T{}F{}{}".format(*g.stack), "pair": [g.start, g.end], "days": g.days} for g in spanning[:4]]
    st = cmr.stacks(gcov)
    best_gcov = {"before": 0, "after": 0}
    for key, gs in st.items():
        dates = sorted({g.start for g in gs})
        b, a = sum(x < d for x in dates), sum(x >= d for x in dates)
        if min(b, a) > min(best_gcov["before"], best_gcov["after"]):
            best_gcov = {"stack": "T{}F{}{}".format(*key), "before": b, "after": a,
                         "first_after": next((x for x in dates if x >= d), None)}
    out["gcov"] = best_gcov
    if ev["kind"] in ("quake", "volcano", "landslide"):
        out["score"] = (1.0 if spanning and spanning[0].days <= 12 else 0.7 if spanning else 0.0)
    else:
        lag = None
        if best_gcov.get("first_after"):
            from datetime import date
            lag = (date.fromisoformat(best_gcov["first_after"]) - date.fromisoformat(d)).days
        out["first_pass_lag_days"] = lag
        ok = best_gcov["before"] >= 2 and best_gcov["after"] >= 2
        out["score"] = (1.0 if ok and lag is not None and lag <= 6 else 0.6 if ok else 0.0)
    return out


def main():
    cands = json.loads((ROOT / "pipeline" / "candidates.json").read_text())["events"]
    s = requests.Session()
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(lambda e: check(e, s), cands))
    res.sort(key=lambda r: -r["score"])
    (ROOT / "site" / "data").mkdir(parents=True, exist_ok=True)
    (ROOT / "site" / "data" / "coverage.json").write_text(json.dumps(res, indent=1))
    for r in res:
        sp = r.get("spanning", [{}])
        sp = f"{sp[0].get('stack')} {sp[0].get('pair')}" if sp and sp[0] else "-"
        g = r.get("gcov", {})
        print(f"{r['score']:.1f}  {r['slug']:24} {r['kind']:10} {r['date'] or 'ongoing':10}  "
              f"GUNW span {sp:40} GCOV {g.get('before', '-')}/{g.get('after', '-')}  {r.get('error', '')}")


if __name__ == "__main__":
    main()
