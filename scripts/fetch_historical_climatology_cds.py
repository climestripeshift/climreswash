"""
Production replacement for fetch_historical_climatology.py (which used
Open-Meteo's free tier -- hit an unrecoverable rate-limit wall on the archive
endpoint, made near-zero progress over several hours). Fetches ERA5
historical rainfall + temperature per district directly from Copernicus's
Climate Data Store, and produces the exact same output file, so no frontend
changes are needed.

SCOPE: 1995-2024 (30 years), not the full 1940-2024 (85 years) ERA5 offers.
The full-range run was started and left overnight -- CDS's queue took 9.5
HOURS to clear a single request (vs ~3 min in same-day testing), meaning 680
requests at that pace could take weeks with no reliable ETA. Cut to the most
recent 30 years (240 requests) to get a real, useful dataset shipped in a
bounded timeframe -- 30 years is still a genuine, credible climate baseline
(most commercial climate-risk products use a similar window), just shorter
than ERA5's full 85-year archive. Can be extended backward later by
re-running with an earlier start year; the accumulator is additive per-year,
nothing needs to be redone.

LICENSING: CDS's ERA5 data is CC-BY 4.0 (Copernicus/ECMWF) -- genuinely free
for commercial use and redistribution with attribution, no non-commercial
restriction like Open-Meteo's free tier had. This is the production-safe path.
Requires a free Copernicus CDS account + API key in ~/.cdsapirc, and accepting
the dataset's license once at https://cds.climate.copernicus.eu/datasets/
derived-era5-single-levels-daily-statistics (both already done this session).

ARCHITECTURE -- a completely different shape from the Open-Meteo version, and
much more efficient: instead of one request per district (735 requests, most
of which never got a turn), this fetches one full-India grid per (year,
quarter, variable) and extracts ALL 735 districts from it at once. Every
district gets data as each year completes, rather than a few districts
getting complete 85-year histories while most get none.

Chunk size was tuned empirically against CDS's actual behavior (not their
docs, which don't state hard limits): a 2-variable request timed out
in queue for 15+ min without even starting; a 1-variable/full-year request
intermittently stalled 30+ min; a 1-variable/1-quarter (~90 days) request
reliably completed in ~1-3 min. So: one variable, one quarter, per request.

30 years x 4 quarters x 2 variables = 240 requests. At ~2-3 min each in good
conditions this is several hours, but CDS's actual queue depth has proven
unpredictable (a single request took 9.5 hours overnight once) -- runs
unattended across sessions regardless. Resumable at the YEAR level:
district_annual_raw.json accumulates {district_id: {year: [rainfall_mm,
tmax_mean_c, hot_days]}}, and district_historical_climatology.json (the
file the frontend reads) is recomputed and rewritten after every completed
year from however many years are available so far -- so coverage quality
(trend confidence) grows smoothly for all 735 districts together, rather
than coverage breadth growing district-by-district while most have nothing.

Run: python scripts/fetch_historical_climatology_cds.py
"""
import json
import time
from collections import defaultdict
from pathlib import Path

import cdsapi
import geopandas as gpd
import numpy as np
import xarray as xr

ROOT = Path(__file__).resolve().parent.parent
INDIA_GEO = ROOT / "client/public/data/india.json"
RAW_OUT = ROOT / "data/raw/district_annual_raw.json"          # per-district-per-year accumulator (resumable state)
FINAL_OUT = ROOT / "client/public/data/district_historical_climatology.json"  # same file the frontend reads

YEARS = range(1995, 2025)
QUARTERS = [("01", "02", "03"), ("04", "05", "06"), ("07", "08", "09"), ("10", "11", "12")]
INDIA_AREA = [38, 68, 6, 98]  # N, W, S, E
HOT_DAY_THRESHOLD_C = 40.0
# 30-year window split into two 15-year halves -- there's no distant-past baseline
# available at this scope, so this compares the earlier vs later half of the same
# window rather than claiming an "1940s baseline" the data doesn't cover.
BASELINE_YEARS = (1995, 2009)
RECENT_YEARS = (2010, 2024)
DAYS = [f"{d:02d}" for d in range(1, 32)]

client = cdsapi.Client()


def fetch_quarter_grid(variable: str, stat: str, year: str, months: tuple[str, ...]) -> xr.Dataset:
    result = client.retrieve(
        "derived-era5-single-levels-daily-statistics",
        {
            "product_type": "reanalysis",
            "variable": [variable],
            "year": year,
            "month": list(months),
            "day": DAYS,
            "daily_statistic": stat,
            "time_zone": "utc+05:30",
            "frequency": "1_hourly",
            "area": INDIA_AREA,
        },
    )
    tmp_path = f"/tmp/cds_{variable}_{year}_{months[0]}.nc"
    result.download(tmp_path)
    ds = xr.open_dataset(tmp_path)
    Path(tmp_path).unlink(missing_ok=True)  # don't accumulate raw grids on disk
    return ds


def fetch_year_grid(variable: str, stat: str, year: int) -> xr.Dataset:
    """Fetch all 4 quarters for one variable/year and concatenate along time."""
    quarters = []
    for months in QUARTERS:
        for attempt in range(3):
            try:
                quarters.append(fetch_quarter_grid(variable, stat, str(year), months))
                break
            except Exception as e:
                print(f"      retry {attempt+1}/3 after error: {e}", flush=True)
                time.sleep(30 * (attempt + 1))
        else:
            raise RuntimeError(f"Failed to fetch {variable} {year} Q{months[0]} after 3 attempts")
    return xr.concat(quarters, dim="valid_time")


def nearest_grid_indices(lats: np.ndarray, lons: np.ndarray, district_lat: np.ndarray, district_lon: np.ndarray):
    """Vectorized nearest-neighbor grid lookup for all districts at once."""
    lat_idx = np.abs(lats[:, None] - district_lat[None, :]).argmin(axis=0)
    lon_idx = np.abs(lons[:, None] - district_lon[None, :]).argmin(axis=0)
    return lat_idx, lon_idx


def linear_trend_per_decade(years: list[int], values: list[float]) -> float:
    n = len(years)
    if n < 2:
        return 0.0
    mean_x = sum(years) / n
    mean_y = sum(values) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(years, values))
    den = sum((x - mean_x) ** 2 for x in years)
    return (num / den) * 10 if den else 0.0


def summarize_district(year_data: dict[int, list]) -> dict | None:
    years = sorted(year_data.keys())
    if len(years) < 5:
        return None
    rainfall_series = [year_data[y][0] for y in years]
    temp_series = [year_data[y][1] for y in years]
    hotdays_series = [year_data[y][2] for y in years]

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
        "hot_days_mean": round(sum(hotdays_series) / len(hotdays_series), 1),
        "hot_days_trend_days_decade": round(linear_trend_per_decade(years, hotdays_series), 2),
        "recent_vs_baseline_rainfall_pct": (
            round((recent_rain / baseline_rain - 1) * 100, 1) if baseline_rain and recent_rain else None
        ),
        "recent_vs_baseline_temp_c": (
            round(recent_temp - baseline_temp, 2) if baseline_temp is not None and recent_temp is not None else None
        ),
        "years_covered": len(years),
    }


def main():
    print(f"Loading {INDIA_GEO}...")
    districts = gpd.read_file(str(INDIA_GEO))
    districts["centroid"] = districts.geometry.centroid
    district_ids = districts["ID"].tolist()
    district_lat = districts["centroid"].y.values
    district_lon = districts["centroid"].x.values
    print(f"  {len(districts)} districts")

    RAW_OUT.parent.mkdir(parents=True, exist_ok=True)
    raw: dict[str, dict[str, list]] = json.loads(RAW_OUT.read_text()) if RAW_OUT.exists() else {}
    done_years = set()
    if raw:
        # a year counts as "done" once present for all districts
        sample = next(iter(raw.values()))
        done_years = {int(y) for y in sample.keys()}
    print(f"  {len(done_years)} years already fetched: {sorted(done_years) if done_years else 'none'}")

    for year in YEARS:
        if year in done_years:
            continue
        print(f"\n[{year}] fetching temperature (4 quarters)...", flush=True)
        t0 = time.time()
        temp_ds = fetch_year_grid("2m_temperature", "daily_maximum", year)
        print(f"  temperature done in {time.time()-t0:.0f}s")

        print(f"[{year}] fetching precipitation (4 quarters)...", flush=True)
        t0 = time.time()
        precip_ds = fetch_year_grid("total_precipitation", "daily_sum", year)
        print(f"  precipitation done in {time.time()-t0:.0f}s")

        lats = temp_ds.latitude.values
        lons = temp_ds.longitude.values
        lat_idx, lon_idx = nearest_grid_indices(lats, lons, district_lat, district_lon)

        t2m = temp_ds["t2m"].values - 273.15   # Kelvin -> Celsius
        tp = precip_ds["tp"].values * 1000.0   # meters -> mm

        for i, did in enumerate(district_ids):
            t_series = t2m[:, lat_idx[i], lon_idx[i]]
            p_series = tp[:, lat_idx[i], lon_idx[i]]
            t_series = t_series[~np.isnan(t_series)]
            p_series = p_series[~np.isnan(p_series)]
            if len(t_series) == 0 or len(p_series) == 0:
                continue
            annual_rainfall = float(np.sum(p_series))
            annual_tmax_mean = float(np.mean(t_series))
            hot_days = int(np.sum(t_series > HOT_DAY_THRESHOLD_C))
            raw.setdefault(did, {})[str(year)] = [round(annual_rainfall, 1), round(annual_tmax_mean, 2), hot_days]

        RAW_OUT.write_text(json.dumps(raw))
        print(f"[{year}] done, checkpointed ({len(raw)} districts have data)")

        # Recompute + rewrite the final output every year so coverage quality improves
        # for all districts together (not most-districts-empty-until-the-end)
        final = {}
        for did, year_data in raw.items():
            year_data_int = {int(y): v for y, v in year_data.items()}
            summary = summarize_district(year_data_int)
            if summary:
                final[did] = summary
        FINAL_OUT.write_text(json.dumps(final))
        print(f"[{year}] wrote {FINAL_OUT} ({len(final)} districts with a summary)")

    print("\nAll years done.")


if __name__ == "__main__":
    main()
