"""
Fetch ERA5 monthly-mean temperatures for India, 1991-2020 (WMO 30-yr normal).

Source: Copernicus CDS "ERA5 monthly averaged data on single levels" (CC-BY 4.0,
commercial use allowed with attribution). Needs a free CDS key in ~/.cdsapirc.

Variable: 2m_temperature, "monthly averaged by hour of day" product, at 06/09/12 UTC
(11:30 / 14:30 / 17:30 IST). The max-temperature parameters (mx2t) are not returned by the
monthly product, so the hottest of these afternoon hours stands in for the daily max (it
slightly understates it; the compute step's HOT_TAIL_C absorbs the difference).

Output: data/raw/era5_monthly_temp/era5_t2m_afternoon_1991_2020.nc (cached)

Run: python scripts/fetch_monthly_temp_climatology.py
"""
from pathlib import Path

import cdsapi

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data/raw/era5_monthly_temp"
OUT = OUT_DIR / "era5_t2m_afternoon_1991_2020.nc"

START_YEAR, END_YEAR = 1991, 2020
INDIA_AREA = [38, 68, 6, 98]  # N, W, S, E


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        print(f"cached: {OUT}")
        return
    client = cdsapi.Client()
    client.retrieve(
        "reanalysis-era5-single-levels-monthly-means",
        {
            "product_type": ["monthly_averaged_reanalysis_by_hour_of_day"],
            "variable": ["2m_temperature"],
            "year": [str(y) for y in range(START_YEAR, END_YEAR + 1)],
            "month": [f"{m:02d}" for m in range(1, 13)],
            "time": ["06:00", "09:00", "12:00"],
            "area": INDIA_AREA,
            "data_format": "netcdf",
        },
    ).download(str(OUT))
    print(f"saved {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
