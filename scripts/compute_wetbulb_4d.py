"""
4-D wet-bulb (humid heat) status layer: hex (lat, lon) x month-of-year x climate scenario x horizon.

Wet-bulb temperature combines heat and humidity: above ~31-35 C the body cannot shed heat by
sweating, so humid places (Kolkata, Mumbai, the east coast, the Gangetic plain in monsoon) are
dangerous at air temperatures that the dry-heat layer scores as harmless.

Inputs
  data/raw/era5_monthly_temp/era5_t2m_afternoon_1991_2020.nc   (fetch_monthly_temp_climatology.py)
  data/raw/era5_monthly_temp/era5_d2m_afternoon_1991_2020.nc   (fetch_monthly_dewpoint_climatology.py)
  client/public/data/india_hex_props.json                       (population, state)

Method (per hex, per month)
  1. Monthly-mean 2 m temperature T and dewpoint Td at each of three afternoon hours
     (06/09/12 UTC = 11:30/14:30/17:30 IST), 1991-2020, sampled at the hex centroid (bilinear).
  2. formulas.wet_bulb_hazard_best_hour(pairs, mean_warming): for EACH hour's (T, Td) pair, Magnus relative humidity, warming added
     to T at constant relative humidity, Stull (2011) wet-bulb, +2 C for the month's hottest humid
     day, then the engine's 28 C -> 0 / 35 C -> 10 mapping, soft-compressed above 8; the month's
     score is the maximum over the three hours.

ASSUMPTIONS (flagged)
  * The 28 C floor and 35 C ceiling are the existing engine mapping. They are an OPEN decision in the
    hex-grid milestones (practical danger starts near 31 C wet-bulb), so absolute levels will move
    when the rebuild settles the threshold.
  * Hot-day uplift (+2 C wet-bulb, ~2 sigma of day-to-day variability) and constant-RH warming are
    uncalibrated; warming is the approximate
    uniform AR6 table (mean warming, not the larger hot-day warming used for heat).
  * Monthly means, not daily extremes: a daily 1-in-10-year humid heat event is not resolved.

Run: python scripts/compute_wetbulb_4d.py
"""
import json
import sys
from pathlib import Path

import h3
import netCDF4
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts" / "risk"))
from formulas import WB_HOT_TAIL_C, wet_bulb_hazard_best_hour  # noqa: E402
from hazard_4d_common import sample_bilinear, write_layer  # noqa: E402
from scenarios import WARMING, mean_warming  # noqa: E402

T_NC = ROOT / "data/raw/era5_monthly_temp/era5_t2m_afternoon_1991_2020.nc"
D_NC = ROOT / "data/raw/era5_monthly_temp/era5_d2m_afternoon_1991_2020.nc"
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
OUT_DIR = ROOT / "client/public/data/wetbulb_4d"


def _clim(path, var):
    """Returns lats, lons, field[12, 3, nlat, nlon] (deg C) averaged over years per (month, hour)."""
    ds = netCDF4.Dataset(path)
    tv = "valid_time" if "valid_time" in ds.variables else "time"
    t = netCDF4.num2date(ds[tv][:], ds[tv].units, only_use_cftime_datetimes=False)
    months = np.array([x.month for x in t])
    hours = np.array([x.hour for x in t])
    data = np.ma.filled(ds[var][:], np.nan).astype("float64") - 273.15
    hs = sorted(set(hours))
    out = np.stack([np.stack([np.nanmean(data[(months == m) & (hours == h)], axis=0) for h in hs]) for m in range(1, 13)])
    return np.array(ds["latitude"][:]), np.array(ds["longitude"][:]), out


def main():
    print("Loading ERA5 afternoon temperature and dewpoint...")
    lats, lons, T = _clim(T_NC, "t2m")
    lats2, lons2, Td = _clim(D_NC, "d2m")
    assert np.allclose(lats, lats2) and np.allclose(lons, lons2) and T.shape == Td.shape, "T/Td grids differ"
    nh = T.shape[1]  # afternoon hours (3)
    props = json.loads(HEX_PROPS.read_text())
    print(f"  {len(props)} hexes")

    # per hex, per month: the (T, Td) pair at EACH afternoon hour; the score is the worst hour's wet-bulb
    # (the hour with the highest air temperature is not always the one with the highest wet-bulb)
    hex_pairs = []
    for p in props:
        lat, lon = h3.cell_to_latlng(p["h3_id"])
        hex_pairs.append([[(sample_bilinear(lats, lons, T[m, h], lat, lon), sample_bilinear(lats, lons, Td[m, h], lat, lon))
                           for h in range(nh)] for m in range(12)])

    def score_fn(i, ssp, hz, _hot):
        dt = mean_warming(ssp, hz) if ssp != "baseline" else 0.0
        return [round(wet_bulb_hazard_best_hour(hex_pairs[i][m], dt) * 10) for m in range(12)]

    write_layer(OUT_DIR, props, [p.get("population") or 0.0 for p in props], [p.get("state") or "" for p in props],
                score_fn,
                {"mean_warming_c": {s: {h: mean_warming(s, h) for h in hs} for s, hs in WARMING.items()},
                 "hot_tail_c": WB_HOT_TAIL_C,
                 "month_note": "Hot, humid afternoon of each month: ERA5 1991-2020 afternoon temperature and dewpoint, +2 C wet-bulb hot day."},
                "ERA5 afternoon T and dewpoint -> Stull wet-bulb, 28->35 C scale; AR6-derived uniform warming at constant RH; "
                "see compute_wetbulb_4d.py")


if __name__ == "__main__":
    main()
