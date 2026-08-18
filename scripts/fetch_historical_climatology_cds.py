"""
Production replacement for fetch_historical_climatology.py (which used
Open-Meteo's free tier -- hit an unrecoverable rate-limit wall on the archive
endpoint, made near-zero progress over several hours). Fetches ERA5
historical rainfall + temperature directly from Copernicus's Climate Data
Store, extracted PER HEX (all 12,705 of them), not per district.

Per-hex, not per-district: each CDS request already returns a full-India
0.25° grid regardless of how many points get sampled from it afterwards --
so extracting 12,705 hex centroids instead of 735 district centroids costs
ZERO additional API requests, same 240 total. district_historical_
climatology.json (district-level, committed in an earlier version) is
superseded by hex_historical_climatology.json, keyed directly by h3_id --
also removes the need for the district_id join the district-level version
required, hexes merge straight onto the map by their own key.

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

Chunk size was tuned empirically against CDS's actual behavior (not their
docs, which don't state hard limits): a 2-variable request timed out
in queue for 15+ min without even starting; a 1-variable/full-year request
intermittently stalled 30+ min; a 1-variable/1-quarter (~90 days) request
reliably completed in ~1-3 min in same-day testing. So: one variable, one
quarter, per request -- temperature (daily_maximum) and precipitation
(daily_sum) fetched separately since they need different daily statistics.

30 years x 4 quarters x 2 variables = 240 requests. At ~2-3 min each in good
conditions this is several hours, but CDS's actual queue depth has proven
unpredictable (a single request took 9.5 hours overnight once) -- runs
unattended across sessions regardless. Resumable at the YEAR level:
hex_annual_raw.json accumulates {h3_id: {year: [rainfall_mm, tmax_mean_c,
hot_days]}} (not committed -- large, regenerable), and
hex_historical_climatology.json (the file the frontend reads) is recomputed
and rewritten after every completed year from however many years are
available so far -- so coverage quality (trend confidence) grows smoothly
for all 12,705 hexes together, rather than coverage breadth growing one
point at a time while most have nothing.

Run: python scripts/fetch_historical_climatology_cds.py
"""
import json
import time
from pathlib import Path

import cdsapi
import h3
import numpy as np
import xarray as xr

ROOT = Path(__file__).resolve().parent.parent
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
RAW_OUT = ROOT / "data/raw/hex_annual_raw.json"                          # per-hex-per-year accumulator (resumable state, not committed)
FINAL_OUT = ROOT / "client/public/data/hex_historical_climatology.json"  # the file the frontend reads

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


def nearest_grid_indices(lats: np.ndarray, lons: np.ndarray, point_lat: np.ndarray, point_lon: np.ndarray):
    """Vectorized nearest-neighbor grid lookup for all points at once."""
    lat_idx = np.abs(lats[:, None] - point_lat[None, :]).argmin(axis=0)
    lon_idx = np.abs(lons[:, None] - point_lon[None, :]).argmin(axis=0)
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


def summarize_hex(year_data: dict[int, list]) -> dict | None:
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
    print(f"Loading {HEX_PROPS}...")
    props = json.loads(HEX_PROPS.read_text())
    h3_ids = [p["h3_id"] for p in props]
    hex_lat = np.array([h3.cell_to_latlng(h)[0] for h in h3_ids])
    hex_lon = np.array([h3.cell_to_latlng(h)[1] for h in h3_ids])
    print(f"  {len(h3_ids)} hexes")

    RAW_OUT.parent.mkdir(parents=True, exist_ok=True)
    raw: dict[str, dict[str, list]] = json.loads(RAW_OUT.read_text()) if RAW_OUT.exists() else {}
    done_years = set()
    if raw:
        # a year counts as "done" once present for any hex (all hexes get the same years,
        # written together each pass)
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
        lat_idx, lon_idx = nearest_grid_indices(lats, lons, hex_lat, hex_lon)

        t2m = temp_ds["t2m"].values - 273.15   # Kelvin -> Celsius
        tp = precip_ds["tp"].values * 1000.0   # meters -> mm

        for i, h3_id in enumerate(h3_ids):
            t_series = t2m[:, lat_idx[i], lon_idx[i]]
            p_series = tp[:, lat_idx[i], lon_idx[i]]
            t_series = t_series[~np.isnan(t_series)]
            p_series = p_series[~np.isnan(p_series)]
            if len(t_series) == 0 or len(p_series) == 0:
                continue
            annual_rainfall = float(np.sum(p_series))
            annual_tmax_mean = float(np.mean(t_series))
            hot_days = int(np.sum(t_series > HOT_DAY_THRESHOLD_C))
            raw.setdefault(h3_id, {})[str(year)] = [round(annual_rainfall, 1), round(annual_tmax_mean, 2), hot_days]

        RAW_OUT.write_text(json.dumps(raw, separators=(",", ":")))
        print(f"[{year}] done, checkpointed ({len(raw)} hexes have data)")

        # Recompute + rewrite the final output every year so coverage quality improves
        # for all hexes together (not most-hexes-empty-until-the-end)
        final = {}
        for h3_id, year_data in raw.items():
            year_data_int = {int(y): v for y, v in year_data.items()}
            summary = summarize_hex(year_data_int)
            if summary:
                final[h3_id] = summary
        FINAL_OUT.write_text(json.dumps(final, separators=(",", ":")))
        import os
        print(f"[{year}] wrote {FINAL_OUT} ({len(final)} hexes with a summary, "
              f"{os.path.getsize(FINAL_OUT)/1024/1024:.1f}MB)")

    print("\nAll years done.")


if __name__ == "__main__":
    main()
