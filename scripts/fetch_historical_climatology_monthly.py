"""
Historical climate trend layer -- third and final iteration of this pipeline.
Supersedes fetch_historical_climatology.py (Open-Meteo, hit an unrecoverable
rate-limit wall) and fetch_historical_climatology_cds.py (CDS daily-statistics
dataset, technically reliable but queued for anywhere from 90 seconds to 9.5+
hours per request with no way to predict which, because a full year of daily
data per request pushed against CDS's undocumented cost/queue limits).

The fix: use CDS's "ERA5 monthly averaged data on single levels" dataset
instead of the daily-statistics one. It can serve the ENTIRE 1940-2024 range
(the full 85 years ERA5 offers, not an artificially shortened window), both
variables, all of India, in ONE request -- tested and confirmed: ~3 minutes,
not hours or days. 85 years of monthly data is still tiny (~50-60MB)
compared to what a single year of DAILY data cost against CDS's per-request
limits, which is almost certainly why CDS's queue treats it so much more
favorably.

TRADE-OFF: monthly averages can't reproduce the "extreme heat days > 40C"
count a daily-resolution fetch could have (needs daily max temperature; this
dataset only has monthly mean temperature). Dropped from the output rather
than faked from a coarser proxy. Rainfall trend, rainfall reliability (CV),
temperature trend, and the recent-vs-baseline comparison are all still
computed correctly -- annual rainfall total = sum over 12 months of
(monthly-mean daily rate x days in that month); annual mean temperature =
mean of the 12 monthly means (a standard climatological metric in its own
right, arguably more standard than a daily-max-based version would be).

Per-hex, not per-district: this dataset request has the SAME India-grid
shape as the daily-statistics one did, so sampling all 12,705 hex centroids
instead of a handful of district centroids costs nothing extra -- it's the
same single request either way.

OUTPUTS:
  - hex_historical_climatology.json: per-hex trend summary (mean, trend,
    CV, recent-vs-baseline) computed over the full 85-year record -- what
    the static map layers read.
  - hex_climate_timelapse.json: per-hex, per-YEAR raw annual rainfall (mm)
    and mean temperature (C) -- what the animated timelapse control reads.
    Shared "years" array plus two parallel per-hex value arrays (not an
    array of {year, value} objects) to keep the file size down: 12,705
    hexes x 85 years x 2 variables as bare numbers, positional by index
    into the shared years list. Lazy-loaded client-side, only fetched if
    someone actually opens the timelapse control.

LICENSING: CC-BY 4.0 (Copernicus/ECMWF), same as the daily dataset -- free
for commercial use and redistribution with attribution.

Run: python scripts/fetch_historical_climatology_monthly.py
"""
import calendar
import json
import zipfile
from pathlib import Path

import cdsapi
import h3
import numpy as np
import xarray as xr

ROOT = Path(__file__).resolve().parent.parent
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
SUMMARY_OUT = ROOT / "client/public/data/hex_historical_climatology.json"
TIMELAPSE_OUT = ROOT / "client/public/data/hex_climate_timelapse.json"
TMP_DOWNLOAD = Path("/tmp/cds_monthly_85yr.nc")
TMP_EXTRACT_DIR = Path("/tmp/cds_monthly_85yr_extracted")

START_YEAR, END_YEAR = 1940, 2024   # full ERA5 range -- the earlier 30-year cut was only
# ever necessary for the daily-statistics dataset's per-request cost limits; the
# monthly-means dataset fetches all 85 years in a single ~3min request, tested and
# confirmed, so there's no reason to stay limited to 30
INDIA_AREA = [38, 68, 6, 98]  # N, W, S, E
BASELINE_YEARS = (1940, 1969)
RECENT_YEARS = (1995, 2024)


def fetch_monthly_means() -> Path:
    if TMP_DOWNLOAD.exists():
        print(f"  using cached download {TMP_DOWNLOAD}")
        return TMP_DOWNLOAD
    client = cdsapi.Client()
    result = client.retrieve(
        "reanalysis-era5-single-levels-monthly-means",
        {
            "product_type": ["monthly_averaged_reanalysis"],
            "variable": ["2m_temperature", "total_precipitation"],
            "year": [str(y) for y in range(START_YEAR, END_YEAR + 1)],
            "month": [f"{m:02d}" for m in range(1, 13)],
            "time": ["00:00"],
            "area": INDIA_AREA,
            "data_format": "netcdf",
        },
    )
    result.download(str(TMP_DOWNLOAD))
    return TMP_DOWNLOAD


def load_datasets(zip_path: Path) -> tuple[xr.Dataset, xr.Dataset]:
    TMP_EXTRACT_DIR.mkdir(exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(TMP_EXTRACT_DIR)
    temp_ds = precip_ds = None
    for f in TMP_EXTRACT_DIR.glob("*.nc"):
        ds = xr.open_dataset(f)
        if "t2m" in ds:
            temp_ds = ds
        elif "tp" in ds:
            precip_ds = ds
    if temp_ds is None or precip_ds is None:
        raise RuntimeError(f"Expected t2m and tp datasets, found: {list(TMP_EXTRACT_DIR.glob('*.nc'))}")
    return temp_ds, precip_ds


def linear_trend_per_decade(years: list[int], values: list[float]) -> float:
    n = len(years)
    if n < 2:
        return 0.0
    mean_x = sum(years) / n
    mean_y = sum(values) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(years, values))
    den = sum((x - mean_x) ** 2 for x in years)
    return (num / den) * 10 if den else 0.0


def summarize(rainfall_by_year: dict[int, float], temp_by_year: dict[int, float]) -> dict:
    years = sorted(rainfall_by_year.keys())
    rainfall_series = [rainfall_by_year[y] for y in years]
    temp_series = [temp_by_year[y] for y in years]

    rainfall_mean = sum(rainfall_series) / len(rainfall_series)
    rainfall_sd = (sum((v - rainfall_mean) ** 2 for v in rainfall_series) / len(rainfall_series)) ** 0.5
    rainfall_cv = round(rainfall_sd / rainfall_mean, 3) if rainfall_mean > 0 else 0.0

    def period_mean(series, target):
        vals = [v for y, v in zip(years, series) if target[0] <= y <= target[1]]
        return sum(vals) / len(vals) if vals else None

    baseline_rain, recent_rain = period_mean(rainfall_series, BASELINE_YEARS), period_mean(rainfall_series, RECENT_YEARS)
    baseline_temp, recent_temp = period_mean(temp_series, BASELINE_YEARS), period_mean(temp_series, RECENT_YEARS)

    return {
        "rainfall_mean_mm": round(rainfall_mean, 1),
        "rainfall_trend_mm_decade": round(linear_trend_per_decade(years, rainfall_series), 2),
        "rainfall_cv": rainfall_cv,
        "temp_mean_c": round(sum(temp_series) / len(temp_series), 2),
        "temp_trend_c_decade": round(linear_trend_per_decade(years, temp_series), 3),
        "recent_vs_baseline_rainfall_pct": (
            round((recent_rain / baseline_rain - 1) * 100, 1) if baseline_rain and recent_rain else None
        ),
        "recent_vs_baseline_temp_c": (
            round(recent_temp - baseline_temp, 2) if baseline_temp is not None and recent_temp is not None else None
        ),
        "years_covered": len(years),
    }


def main():
    print(f"Fetching ERA5 monthly means, {START_YEAR}-{END_YEAR}, India, temp + precip (one request)...")
    zip_path = fetch_monthly_means()
    print(f"  downloaded {zip_path.stat().st_size / 1024 / 1024:.1f}MB")

    print("Extracting...")
    temp_ds, precip_ds = load_datasets(zip_path)

    lats = temp_ds.latitude.values
    lons = temp_ds.longitude.values
    times = temp_ds.valid_time.values

    print(f"Loading {HEX_PROPS}...")
    props = json.loads(HEX_PROPS.read_text())
    h3_ids = [p["h3_id"] for p in props]
    hex_lat = np.array([h3.cell_to_latlng(h)[0] for h in h3_ids])
    hex_lon = np.array([h3.cell_to_latlng(h)[1] for h in h3_ids])
    print(f"  {len(h3_ids)} hexes")

    lat_idx = np.abs(lats[:, None] - hex_lat[None, :]).argmin(axis=0)
    lon_idx = np.abs(lons[:, None] - hex_lon[None, :]).argmin(axis=0)

    t2m = temp_ds["t2m"].values - 273.15   # Kelvin -> Celsius, shape (n_months, lat, lon)
    tp = precip_ds["tp"].values * 1000.0   # meters/day -> mm/day, shape (n_months, lat, lon)

    days_in_month = np.array([
        calendar.monthrange(int(str(t)[:4]), int(str(t)[5:7]))[1] for t in times
    ])
    years_arr = np.array([int(str(t)[:4]) for t in times])
    all_years = list(range(START_YEAR, END_YEAR + 1))

    print("Extracting + aggregating per hex...")
    summary_result = {}
    timelapse_rainfall: dict[str, list] = {}
    timelapse_temp: dict[str, list] = {}
    for i, h3_id in enumerate(h3_ids):
        t_series = t2m[:, lat_idx[i], lon_idx[i]]
        p_series = tp[:, lat_idx[i], lon_idx[i]]
        if np.isnan(t_series).all() or np.isnan(p_series).all():
            continue

        rainfall_by_year: dict[int, float] = {}
        temp_by_year: dict[int, list] = {}
        for m in range(len(times)):
            y = int(years_arr[m])
            rainfall_by_year[y] = rainfall_by_year.get(y, 0.0) + float(p_series[m]) * days_in_month[m]
            temp_by_year.setdefault(y, []).append(float(t_series[m]))
        temp_by_year_mean = {y: sum(v) / len(v) for y, v in temp_by_year.items()}

        summary_result[h3_id] = summarize(rainfall_by_year, temp_by_year_mean)
        timelapse_rainfall[h3_id] = [round(rainfall_by_year.get(y, 0.0)) for y in all_years]
        timelapse_temp[h3_id] = [round(temp_by_year_mean.get(y, 0.0), 1) for y in all_years]

    SUMMARY_OUT.write_text(json.dumps(summary_result, separators=(",", ":")))
    import os
    print(f"\nSaved {SUMMARY_OUT} ({os.path.getsize(SUMMARY_OUT)/1024/1024:.1f}MB)")

    timelapse_payload = {"years": all_years, "rainfall": timelapse_rainfall, "temp": timelapse_temp}
    TIMELAPSE_OUT.write_text(json.dumps(timelapse_payload, separators=(",", ":")))
    print(f"Saved {TIMELAPSE_OUT} ({os.path.getsize(TIMELAPSE_OUT)/1024/1024:.1f}MB)")

    print(f"\n{len(summary_result)}/{len(h3_ids)} hexes")
    vals = [v["rainfall_mean_mm"] for v in summary_result.values()]
    print(f"  rainfall_mean_mm: {min(vals):.0f} - {max(vals):.0f}, national mean {sum(vals)/len(vals):.0f}")
    vals = [v["temp_trend_c_decade"] for v in summary_result.values()]
    print(f"  temp_trend_c_decade: {min(vals):.2f} - {max(vals):.2f}, national mean {sum(vals)/len(vals):.2f}")


if __name__ == "__main__":
    main()
