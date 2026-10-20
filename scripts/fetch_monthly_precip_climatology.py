"""
Fetch ERA5 monthly-mean total precipitation for India, 1991-2020 (WMO 30-yr normal).

Source: Copernicus CDS "ERA5 monthly averaged data on single levels" (CC-BY 4.0, commercial
use allowed with attribution). Needs a free CDS key in ~/.cdsapirc.
Variable: total_precipitation = mean daily rate in m/day for each month; compute_flood_4d.py
turns it into the seasonal shape (month / wettest month) used for flood seasonality.

Output: data/raw/era5_monthly_precip/era5_tp_1991_2020.nc (cached; re-runs skip it)

Run: python scripts/fetch_monthly_precip_climatology.py
"""
from pathlib import Path

import cdsapi

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data/raw/era5_monthly_precip"
OUT = OUT_DIR / "era5_tp_1991_2020.nc"

START_YEAR, END_YEAR = 1991, 2020
INDIA_AREA = [38, 68, 6, 98]  # N, W, S, E


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        print(f"cached: {OUT}")
        return
    cdsapi.Client().retrieve(
        "reanalysis-era5-single-levels-monthly-means",
        {
            "product_type": ["monthly_averaged_reanalysis"],
            "variable": ["total_precipitation"],
            "year": [str(y) for y in range(START_YEAR, END_YEAR + 1)],
            "month": [f"{m:02d}" for m in range(1, 13)],
            "time": ["00:00"],
            "area": INDIA_AREA,
            "data_format": "netcdf",
        },
    ).download(str(OUT))
    print(f"saved {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
