"""
4-D cold-wave status layer: hex (lat, lon) x month-of-year x climate scenario x horizon.

IMD cold-wave criteria: minimum temperature <= 10 C in the plains (<= 0 C in hills) AND 4.5 C or more
below normal. The legacy engine channel used only latitude and elevation (no temperature at all).

Inputs
  data/raw/era5_monthly_temp/era5_t2m_dawn_1991_2020.nc  (fetch_monthly_tmin_climatology.py)
  client/public/data/india_hex_props.json                 (elevation_mean, population, state)

Method (per hex, per month)
  1. Monthly-mean 2 m temperature at 00 UTC (05:30 IST, around sunrise = near the daily minimum),
     1991-2020, sampled at the hex centroid (bilinear).
  2. formulas.coldwave_hazard_seasonal(tmin, elevation, warming): a cold night = tmin - 4.5 C
     (the IMD departure) warmed by the scenario, scored 1 point per C below the elevation-smooth
     threshold (10 C plains -> 0 C hills between 500 and 1,500 m), soft-compressed above 8.
     Warming REDUCES cold-wave hazard.

ASSUMPTIONS (flagged)
  * The dawn-hour mean runs ~0.5-1.5 C above the true daily minimum, so absolute scores are slightly
    low; the 4.5 C uplift is the IMD criterion, applied to every hex.
  * Hills that are always below threshold (Ladakh, high Himalaya) score high all winter; they are
    adapted, which belongs in the risk formula's adaptive capacity, not here.
  * Cold nights warm by the MEAN warming (AR6: at least as fast; uniform AR6 table, uncalibrated).
  * Cold-wave days and spell length need daily data; this is the monthly climatology.

Run: python scripts/compute_coldwave_4d.py
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
from formulas import COLD_TAIL_C, coldwave_hazard_seasonal  # noqa: E402
from hazard_4d_common import sample_bilinear, write_layer  # noqa: E402
from scenarios import WARMING, mean_warming  # noqa: E402

NC = ROOT / "data/raw/era5_monthly_temp/era5_t2m_dawn_1991_2020.nc"
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
OUT_DIR = ROOT / "client/public/data/coldwave_4d"


def load_dawn_climatology():
    """Returns lats, lons, tmin[12, nlat, nlon] (deg C): mean over years of the 00 UTC monthly mean."""
    ds = netCDF4.Dataset(NC)
    tv = "valid_time" if "valid_time" in ds.variables else "time"
    t = netCDF4.num2date(ds[tv][:], ds[tv].units, only_use_cftime_datetimes=False)
    months = np.array([x.month for x in t])
    data = np.ma.filled(ds["t2m"][:], np.nan).astype("float64") - 273.15
    clim = np.stack([np.nanmean(data[months == m], axis=0) for m in range(1, 13)])
    return np.array(ds["latitude"][:]), np.array(ds["longitude"][:]), clim


def main():
    print("Loading ERA5 dawn temperature...")
    lats, lons, tmin = load_dawn_climatology()
    props = json.loads(HEX_PROPS.read_text())
    print(f"  {len(props)} hexes")

    hex_t, hex_elev = [], []
    for p in props:
        lat, lon = h3.cell_to_latlng(p["h3_id"])
        hex_t.append([sample_bilinear(lats, lons, tmin[m], lat, lon) for m in range(12)])
        e = p.get("elevation_mean")
        hex_elev.append(200.0 if e is None else e)

    def score_fn(i, ssp, hz, _hot):
        dt = mean_warming(ssp, hz) if ssp != "baseline" else 0.0
        return [round(coldwave_hazard_seasonal(hex_t[i][m], hex_elev[i], dt) * 10) for m in range(12)]

    write_layer(OUT_DIR, props, [p.get("population") or 0.0 for p in props], [p.get("state") or "" for p in props],
                score_fn,
                {"mean_warming_c": {s: {h: mean_warming(s, h) for h in hs} for s, hs in WARMING.items()},
                 "cold_tail_c": COLD_TAIL_C,
                 "month_note": "Cold night of each month: ERA5 1991-2020 dawn temperature minus 4.5 C (IMD departure), against 10 C plains / 0 C hills."},
                "ERA5 dawn temperature -> IMD cold-wave thresholds (10 C plains, 0 C hills, smooth in elevation); "
                "AR6-derived uniform warming reduces the hazard; see compute_coldwave_4d.py")


if __name__ == "__main__":
    main()
