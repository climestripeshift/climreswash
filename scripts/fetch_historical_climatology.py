"""
Fetch 85 years (1940-2024) of real historical daily rainfall + temperature per
district, from Open-Meteo's Historical Weather API (ERA5 reanalysis, CC-BY 4.0
via Copernicus/ECMWF -- see licensing note below), and reduce it to compact
per-district trend statistics: mean, decade trend, and a recent-vs-baseline
comparison. This is the long-term historical baseline layer ClimResWASH didn't
have -- the kind of decade-scale trend data institutional buyers (insurance,
banking, agri-finance) actually want, and what a comparable product
(ClimIntellio) markets as a core differentiator (their site claims IMD
1901-2024; this uses ERA5 1940-2024, 39 fewer years, but with unambiguous
licensing -- see note below).

LICENSING (read before using this commercially): Open-Meteo's underlying data
is ERA5, CC-BY 4.0 (Copernicus/ECMWF) -- genuinely free for commercial use and
redistribution with attribution. BUT Open-Meteo's own free API tier (used
here, no API key) is non-commercial-use only per their Terms
(open-meteo.com/en/terms) -- fine for this prototype/dev build, NOT fine to
serve to a paying customer. Before any commercial launch: either (a) get a
free Copernicus CDS account + API key and fetch ERA5 directly from the
primary source (zero cost, no tier restriction), or (b) buy an Open-Meteo
commercial subscription. Don't ship this fetch method to production as-is.

Granularity: district-level (735 districts, using india.json's centroids),
not per-hex -- both because Open-Meteo's free tier is capped at 10,000
calls/day (12,705 hexes wouldn't fit in one run; 735 districts easily does),
and because ClimIntellio's own stated granularity is block/district/state,
not raw-point -- district-level historical trend already matches what
institutional buyers in this space expect. Hexes inherit their district's
values via district_id, same join pattern NFHS-5 WASH data already uses
(state-level source enriching the finer hex grid).

Doesn't cache raw daily responses to disk (each is ~850KB x 735 districts =
~620MB, more than this machine's free disk headroom allows) -- fetches,
aggregates to annual summaries, computes trend stats, and discards the daily
series immediately. Resumable at the district level: the output file is
loaded and already-processed district_ids are skipped on re-run.

Output: client/public/data/district_historical_climatology.json --
district_id -> {
  rainfall_mean_mm, rainfall_trend_mm_decade, rainfall_cv,
  temp_mean_c, temp_trend_c_decade,
  hot_days_mean, hot_days_trend_days_decade,
  recent_vs_baseline_rainfall_pct, recent_vs_baseline_temp_c,
  years_covered
}

Run: python scripts/fetch_historical_climatology.py
"""
import json
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

import geopandas as gpd

ROOT = Path(__file__).resolve().parent.parent
INDIA_GEO = ROOT / "client/public/data/india.json"
OUT = ROOT / "client/public/data/district_historical_climatology.json"

START_DATE = "1940-01-01"
END_DATE = "2024-12-31"
HOT_DAY_THRESHOLD_C = 40.0
BASELINE_YEARS = (1940, 1969)   # first 30 years
RECENT_YEARS = (1995, 2024)     # most recent 30 years
# The archive endpoint's real rate limit is much stricter than Open-Meteo's advertised
# general-API figures (empirically: any concurrency, or even single sequential requests
# with a short gap, triggered sustained 429s) -- go fully sequential with a real gap
# between requests rather than guessing at a concurrency level that happens to work.
REQUEST_GAP_SECONDS = 3

URL_TMPL = (
    "https://archive-api.open-meteo.com/v1/archive"
    "?latitude={lat}&longitude={lon}&start_date={start}&end_date={end}"
    "&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=Asia%2FKolkata"
)


def fetch_daily(lat: float, lon: float, retries: int = 5) -> dict | None:
    url = URL_TMPL.format(lat=lat, lon=lon, start=START_DATE, end=END_DATE)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ClimResWASH/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                # The archive endpoint's real rate limit is much stricter than the
                # general API -- observed empirically (immediate 429s under any
                # concurrency, still 429 after a 10s cooldown). Back off hard.
                wait = 60 * (attempt + 1)
                print(f"    429 rate-limited, waiting {wait}s...", flush=True)
                time.sleep(wait)
            else:
                time.sleep(10 * (attempt + 1))
        except (urllib.error.URLError, OSError, ValueError):
            time.sleep(10 * (attempt + 1))
    return None


def linear_trend_per_decade(years: list[int], values: list[float]) -> float:
    """Simple OLS slope (units/year) x 10 -> units/decade. No numpy needed."""
    n = len(years)
    if n < 2:
        return 0.0
    mean_x = sum(years) / n
    mean_y = sum(values) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(years, values))
    den = sum((x - mean_x) ** 2 for x in years)
    if den == 0:
        return 0.0
    return (num / den) * 10


def summarize(daily: dict) -> dict | None:
    times = daily["daily"]["time"]
    precip = daily["daily"]["precipitation_sum"]
    tmax = daily["daily"]["temperature_2m_max"]

    by_year_precip: dict[int, float] = defaultdict(float)
    by_year_tmax: dict[int, list] = defaultdict(list)
    by_year_hotdays: dict[int, int] = defaultdict(int)

    for t, p, tx in zip(times, precip, tmax):
        year = int(t[:4])
        if p is not None:
            by_year_precip[year] += p
        if tx is not None:
            by_year_tmax[year].append(tx)
            if tx > HOT_DAY_THRESHOLD_C:
                by_year_hotdays[year] += 1

    years = sorted(y for y in by_year_precip if y in by_year_tmax)
    # drop first/last year if incomplete (partial calendar year at either end)
    years = [y for y in years if len(by_year_tmax[y]) > 300]
    if len(years) < 10:
        return None

    rainfall_series = [by_year_precip[y] for y in years]
    temp_series = [sum(by_year_tmax[y]) / len(by_year_tmax[y]) for y in years]
    hotdays_series = [by_year_hotdays[y] for y in years]

    rainfall_mean = sum(rainfall_series) / len(rainfall_series)
    rainfall_sd = (sum((v - rainfall_mean) ** 2 for v in rainfall_series) / len(rainfall_series)) ** 0.5
    rainfall_cv = round(rainfall_sd / rainfall_mean, 3) if rainfall_mean > 0 else 0.0

    def period_mean(series: list, target: tuple[int, int]) -> float | None:
        vals = [v for y, v in zip(years, series) if target[0] <= y <= target[1]]
        return sum(vals) / len(vals) if vals else None

    baseline_rain = period_mean(rainfall_series, BASELINE_YEARS)
    recent_rain = period_mean(rainfall_series, RECENT_YEARS)
    baseline_temp = period_mean(temp_series, BASELINE_YEARS)
    recent_temp = period_mean(temp_series, RECENT_YEARS)

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
    print(f"  {len(districts)} districts")

    result: dict[str, dict] = {}
    if OUT.exists():
        result = json.loads(OUT.read_text())
        print(f"  {len(result)} districts already processed, resuming...")

    todo = [
        (row["ID"], row["NAME"], row["centroid"].y, row["centroid"].x)
        for _, row in districts.iterrows()
        if row["ID"] not in result
    ]
    print(f"  {len(todo)} districts to fetch")

    done_count = len(result)
    for did, name, lat, lon in todo:
        daily = fetch_daily(lat, lon)
        done_count += 1
        if daily is None:
            print(f"  [{done_count}/{len(districts)}] {name}: FAILED", flush=True)
            time.sleep(REQUEST_GAP_SECONDS)
            continue
        summary = summarize(daily)
        if summary is None:
            print(f"  [{done_count}/{len(districts)}] {name}: no usable data", flush=True)
            time.sleep(REQUEST_GAP_SECONDS)
            continue
        result[did] = summary
        print(f"  [{done_count}/{len(districts)}] {name}: "
              f"rainfall {summary['rainfall_mean_mm']:.0f}mm ({summary['rainfall_trend_mm_decade']:+.1f}mm/decade), "
              f"temp {summary['temp_mean_c']:.1f}C ({summary['temp_trend_c_decade']:+.2f}C/decade)", flush=True)
        # Checkpoint every 10 districts in case of interruption
        if done_count % 10 == 0:
            OUT.write_text(json.dumps(result))
        time.sleep(REQUEST_GAP_SECONDS)

    OUT.write_text(json.dumps(result))
    import os
    print(f"\nDone. {len(result)}/{len(districts)} districts. Saved {OUT} ({os.path.getsize(OUT)/1024:.0f}KB)")


if __name__ == "__main__":
    main()
