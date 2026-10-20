"""
4-D drought status layer: hex (lat, lon) x month-of-year x climate scenario x horizon.

Month m = the 3-MONTH rainfall window ending in that month (Aug = Jun-Aug), the window used by
SPI-3 drought monitors. Same file layout as heat_4d/ and flood_4d/ (see hazard_4d_common.py).

Inputs
  data/raw/era5_monthly_precip/era5_tp_1991_2020.nc   (fetch_monthly_precip_climatology.py; ALL years)
  client/public/data/india_hex_props.json              (population, state)

Method
  1. From the 30 yearly values of each 3-month window (ERA5 total precipitation), per grid cell and
     calendar month: coefficient of variation (CV) and the window's share of annual rain.
  2. Sample both at the hex centroid (bilinear).
  3. Hazard = formulas.drought_hazard_seasonal(cv, share, mean_warming): the shortfall of a
     1-in-10-year dry window vs normal (gamma, Wilson-Hilferty), weighted by how much of the
     year's rain that window carries relative to the hex's wettest 3-month window. Warming raises CV 5 %/C and lowers net water supply 1 %/C.

ASSUMPTIONS (flagged)
  * Meteorological drought only (rain shortfall). Groundwater, soil moisture, reservoirs and
    irrigation are not modelled; WASH water-scarcity impacts come in through the risk formula.
  * The climate-change terms (+5 %/C variability, -1 %/C net supply) are uncalibrated engineering
    choices; the score scale is anchored on IMD deficit classes (25 % moderate, 50 % severe);
    warming is the approximate uniform AR6 table.
  * Years: 1991-2020 (30; 29 for the Jan/Feb windows that need the previous year).

Run: python scripts/compute_drought_4d.py
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
from formulas import (  # noqa: E402
    DROUGHT_SUPPLY_PER_C, DROUGHT_VARIABILITY_PER_C, drought_hazard_seasonal,
)
from hazard_4d_common import sample_bilinear, write_layer  # noqa: E402
from scenarios import WARMING, mean_warming  # noqa: E402

NC = ROOT / "data/raw/era5_monthly_precip/era5_tp_1991_2020.nc"
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
OUT_DIR = ROOT / "client/public/data/drought_4d"
DAYS = np.array([31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
MIN_ANNUAL_MM = 1.0  # below this a cell is treated as rainless (no drought hazard)


def window_stats():
    """Returns lats, lons, cv[12, nlat, nlon], share[12, nlat, nlon] of 3-month rain windows."""
    ds = netCDF4.Dataset(NC)
    lats = np.array(ds["latitude"][:])
    lons = np.array(ds["longitude"][:])
    tv = "valid_time" if "valid_time" in ds.variables else "time"
    t = netCDF4.num2date(ds[tv][:], ds[tv].units, only_use_cftime_datetimes=False)
    years = sorted({x.year for x in t})
    order = np.argsort([x.year * 12 + x.month for x in t])
    tp = np.ma.filled(ds["tp"][:], np.nan).astype("float64")[order] * 1000.0  # mm/day
    n = len(years) * 12
    assert tp.shape[0] == n, f"expected {n} monthly steps, got {tp.shape[0]}"
    monthly = tp * np.tile(DAYS, len(years))[:, None, None]                      # mm per month
    win = np.full_like(monthly, np.nan)
    win[2:] = monthly[2:] + monthly[1:-1] + monthly[:-2]                         # 3-month totals ending t
    annual = np.stack([np.nanmean(monthly[m::12], axis=0) for m in range(12)]).sum(axis=0)
    cv = np.zeros((12,) + annual.shape)
    share = np.zeros_like(cv)
    for m in range(12):
        w = win[m::12]
        mean = np.nanmean(w, axis=0)
        std = np.nanstd(w, axis=0, ddof=1)
        ok = (annual > MIN_ANNUAL_MM) & (mean > MIN_ANNUAL_MM)
        cv[m] = np.where(ok, std / np.where(mean > 0, mean, 1), 0.0)
        share[m] = np.where(annual > MIN_ANNUAL_MM, mean / np.where(annual > 0, annual, 1), 0.0)
    return lats, lons, cv, share


def main():
    print("Computing 3-month rainfall variability from ERA5...")
    lats, lons, cv, share = window_stats()
    props = json.loads(HEX_PROPS.read_text())
    print(f"  {len(props)} hexes")

    hex_cv, hex_share = [], []
    for p in props:
        lat, lon = h3.cell_to_latlng(p["h3_id"])
        hex_cv.append([max(0.0, sample_bilinear(lats, lons, cv[m], lat, lon)) for m in range(12)])
        hex_share.append([max(0.0, sample_bilinear(lats, lons, share[m], lat, lon)) for m in range(12)])

    def score_fn(i, ssp, hz, _hot):
        dt = mean_warming(ssp, hz) if ssp != "baseline" else 0.0
        peak = max(hex_share[i])
        return [round(drought_hazard_seasonal(hex_cv[i][m], hex_share[i][m], peak, dt) * 10) for m in range(12)]

    write_layer(OUT_DIR, props, [p.get("population") or 0.0 for p in props], [p.get("state") or "" for p in props],
                score_fn,
                {"mean_warming_c": {s: {h: mean_warming(s, h) for h in hs} for s, hs in WARMING.items()},
                 "variability_per_c": DROUGHT_VARIABILITY_PER_C, "supply_loss_per_c": DROUGHT_SUPPLY_PER_C,
                 "month_note": "Each month is the 3-month rainfall window ending in that month (Aug = Jun-Aug), as in SPI-3."},
                "1-in-10-yr 3-month rainfall shortfall (ERA5 1991-2020) x seasonal relevance; "
                "AR6-derived uniform warming; see compute_drought_4d.py")


if __name__ == "__main__":
    main()
