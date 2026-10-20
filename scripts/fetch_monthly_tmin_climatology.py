"""
Fetch ERA5 monthly-mean 2 m temperature at 00:00 UTC (05:30 IST, around sunrise = near the daily
minimum) for India, 1991-2020. compute_coldwave_4d.py uses it as the monthly-mean daily minimum.

The max/min temperature parameters (mn2t/mx2t) are not returned by the monthly product, so the
sunrise-hour mean stands in for the daily minimum (it runs ~0.5-1.5 C above the true minimum; the
cold-day uplift in the compute step absorbs part of that).

Source: Copernicus CDS "ERA5 monthly averaged data on single levels" (CC-BY 4.0, commercial use
allowed with attribution). Needs a free CDS key in ~/.cdsapirc.

Output: data/raw/era5_monthly_temp/era5_t2m_dawn_1991_2020.nc (cached; re-runs skip it)

Run: python scripts/fetch_monthly_tmin_climatology.py
"""
from pathlib import Path

import cdsapi

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data/raw/era5_monthly_temp"
OUT = OUT_DIR / "era5_t2m_dawn_1991_2020.nc"

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
            "product_type": ["monthly_averaged_reanalysis_by_hour_of_day"],
            "variable": ["2m_temperature"],
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
