"""Shared plumbing for the 4-D hazard layers (compute_heat_4d.py, compute_flood_4d.py,
compute_drought_4d.py): bilinear sampling of an ERA5 grid at a hex, the status bands, and
writing one score file per scenario/horizon plus index.json with all-India and per-state
aggregates. Each hazard script supplies only its per-hex, per-month score function.

Output layout (client/public/data/<hazard>_4d/), read by client/src/pages/Hazard4DPage.tsx:
  index.json                 h3 ids, scenarios, horizons, warming tables, bands, aggregates
  {scenario}_{horizon}.json  {"score": [[12 ints, tenths of a point] per hex, index order]}
"""
import json
import math
import sys
from pathlib import Path

import netCDF4
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent / "risk"))
from scenarios import HORIZONS, SCENARIO_LABELS, WARMING, combos  # noqa: E402

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
# score bands -> status label
BANDS = [(0.5, "none"), (2.5, "low"), (5.0, "moderate"), (7.5, "high"), (10.01, "extreme")]
HIGH = 5.0    # score at/above which a hex counts as "high or extreme"
MEDIUM = 2.5  # score at/above which a hex counts as "moderate or above" (ThinkHazard-style Medium class)
NO_ESTIMATE = -1  # stored score (tenths) for a hex/month with no estimate because an input is missing


def sample_bilinear(lats, lons, field, lat, lon):
    # lats descending in CDS output
    i = np.interp(lat, lats[::-1], np.arange(len(lats))[::-1])
    j = np.interp(lon, lons, np.arange(len(lons)))
    i0, j0 = int(math.floor(i)), int(math.floor(j))
    i1, j1 = min(i0 + 1, len(lats) - 1), min(j0 + 1, len(lons) - 1)
    di, dj = i - i0, j - j0
    v = (field[i0, j0] * (1 - di) * (1 - dj) + field[i1, j0] * di * (1 - dj)
         + field[i0, j1] * (1 - di) * dj + field[i1, j1] * di * dj)
    return float(v)


_DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def load_precip_monthly(nc_path: Path):
    """ERA5 total precipitation climatology. Returns (lats, lons, precip[12, nlat, nlon] in mm/month)."""
    ds = netCDF4.Dataset(nc_path)
    lats = np.array(ds["latitude"][:])
    lons = np.array(ds["longitude"][:])
    tv = "valid_time" if "valid_time" in ds.variables else "time"
    t = netCDF4.num2date(ds[tv][:], ds[tv].units, only_use_cftime_datetimes=False)
    months = np.array([x.month for x in t])
    data = np.ma.filled(ds["tp"][:], np.nan).astype("float64") * 1000.0  # m/day -> mm/day
    clim = np.stack([np.nanmean(data[months == m], axis=0) * _DAYS_IN_MONTH[m - 1] for m in range(1, 13)])
    return lats, lons, clim


def rain_season(lats, lons, precip, lat, lon, flood_days):
    """Per-hex rainfall seasonality: (share[12], heavy_days[12] or None).
    share = monthly precipitation / wettest month (0-1); heavy_days = the hex's annual >50 mm days
    (flood_days_per_year, CHIRPS) spread over months in proportion to monthly precipitation.
    heavy_days is None when flood_days is MISSING (not recorded): callers must treat that as
    'no estimate', not as zero heavy-rain days (audit finding, 20 Oct 2026)."""
    pm = [max(0.0, sample_bilinear(lats, lons, precip[m], lat, lon)) for m in range(12)]
    peak, total = max(pm), sum(pm)
    share = [v / peak if peak > 0 else 0.0 for v in pm]
    if flood_days is None:
        return share, None
    return share, [flood_days * v / total if total > 0 else 0.0 for v in pm]


def _valid(row) -> bool:
    return min(row) >= 0  # NO_ESTIMATE hexes carry -1 in every month


def _aggregate(scores, pops, idx, kids=None):
    """Aggregate over the hexes of idx that HAVE an estimate; report how much of the group that is.
    kids = children under 5 per hex (UNICEF CCRI counts exposed children); absolute people counts are
    returned next to the shares so scenarios can be compared as 'people exposed' (DRR practice)."""
    idx = list(idx)
    all_pop = float(sum(pops[i] for i in idx))
    valid = [i for i in idx if _valid(scores[i])]
    kids = kids if kids is not None else [0.0] * len(pops)
    cov = {"pct_hexes": round(100.0 * len(valid) / len(idx), 1) if idx else 0.0,
           "pct_pop": round(100.0 * sum(pops[i] for i in valid) / all_pop, 1) if all_pop > 0 else
                      (round(100.0 * len(valid) / len(idx), 1) if idx else 0.0)}
    if not valid:
        return {"coverage": cov, "no_estimate": True}
    idx = valid
    p = np.array([pops[i] for i in idx], dtype=float)
    k = np.array([kids[i] for i in idx], dtype=float)
    sc = np.array([scores[i] for i in idx], dtype=float) / 10
    w = p if p.sum() > 0 else np.ones(len(idx))
    worst = sc.max(axis=1)  # each hex's own worst month (what the "worst month" map shows)
    cov["pop_total"] = int(round(all_pop))
    cov["pop_covered"] = int(round(p.sum()))
    cov["children_u5_covered"] = int(round(k.sum()))
    return {
        "coverage": cov,
        "hottest_month": {  # key name shared by every hazard
            "pop_weighted_mean": round(float(np.average(worst, weights=w)), 2),
            "pct_hexes_high_or_extreme": round(float((worst >= HIGH).mean() * 100), 1),
            "pct_pop_high_or_extreme": round(float(w[worst >= HIGH].sum() / w.sum() * 100), 1),
            "people_high": int(round(p[worst >= HIGH].sum())),
            "people_medium_or_above": int(round(p[worst >= MEDIUM].sum())),
            "children_u5_high": int(round(k[worst >= HIGH].sum())),
            "children_u5_medium_or_above": int(round(k[worst >= MEDIUM].sum())),
        },
        "pop_weighted_mean": [round(float(np.average(sc[:, m], weights=w)), 2) for m in range(12)],
        "pct_hexes_high_or_extreme": [round(float((sc[:, m] >= HIGH).mean() * 100), 1) for m in range(12)],
        "pct_pop_high_or_extreme": [round(float(w[sc[:, m] >= HIGH].sum() / w.sum() * 100), 1) for m in range(12)],
        "people_high": [int(round(p[sc[:, m] >= HIGH].sum())) for m in range(12)],
        "children_u5_high": [int(round(k[sc[:, m] >= HIGH].sum())) for m in range(12)],
    }


def write_layer(out_dir: Path, props: list, pops: list, states: list, score_fn,
                extra_index: dict, notes: str):
    """score_fn(hex_index, scenario, horizon_label, hot_extreme_warming_c) -> 12 ints (tenths)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    index = {
        "h3_ids": [p["h3_id"] for p in props],
        "months": MONTHS,
        "scenarios": SCENARIO_LABELS,
        "horizons": HORIZONS,
        "warming_c": WARMING,
        **extra_index,
        "bands": [{"lt": hi, "status": n} for hi, n in BANDS],
        "score_scale": 10,
        "aggregates": {},
        "notes": notes,
    }
    kids = [p.get("pop_children_under_5") or 0.0 for p in props]
    by_state: dict[str, list[int]] = {}
    for i, st in enumerate(states):
        by_state.setdefault(st, []).append(i)
    for ssp, hz, dt in combos():
        key = f"{ssp}_{hz}"
        scores = [score_fn(i, ssp, hz, dt) for i in range(len(props))]
        if "coverage" not in index:  # the missing-input mask is the same in every scenario
            index["coverage"] = {k: v for k, v in _aggregate(scores, pops, range(len(props)), kids)["coverage"].items()}
        (out_dir / f"{key}.json").write_text(json.dumps({"score": scores}, separators=(",", ":")))
        index["aggregates"][key] = {
            "india": _aggregate(scores, pops, range(len(props)), kids),
            "states": {s: _aggregate(scores, pops, ix, kids) for s, ix in by_state.items() if s},
        }
        h = index["aggregates"][key]["india"]["hottest_month"]
        print(f"  {key:>18}: worst-month pop-weighted mean {h['pop_weighted_mean']:.2f}, "
              f"{h['pct_pop_high_or_extreme']:.1f}% of people high/extreme")
    (out_dir / "index.json").write_text(json.dumps(index, separators=(",", ":")))
    total = sum(f.stat().st_size for f in out_dir.glob("*.json")) / 1e6
    print(f"Saved {out_dir} ({total:.1f} MB total)")
