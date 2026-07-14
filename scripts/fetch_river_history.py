"""
Fetch 40-year historical discharge from GloFAS ERA5 (via Open-Meteo flood API)
for all India river monitoring points.

Computes per-point:
  - Annual mean discharge (1984-2024) → linear trend
  - Monthly climatology → peak/dry season, seasonality ratio
  - Flow regime: perennial / seasonal / intermittent
  - El Niño sensitivity (monsoon discharge in EN vs normal years)
  - Historical percentiles (p10, p50, p90)

Outputs: client/public/data/river_history.json
Run:     python scripts/fetch_river_history.py
"""
import json, time, math, urllib.request, urllib.parse
from datetime import datetime
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).parent.parent
OUT  = ROOT / "client/public/data/river_history.json"

# River monitoring points — same set as fetch_river_forecast.py
# Placed on main river channels; GloFAS model snaps to nearest river cell
RIVER_POINTS = [
    # GANGA
    (29.95, 78.10, "Ganga",       "Haridwar"),
    (27.18, 78.00, "Yamuna",      "Etawah"),
    (26.46, 80.35, "Ganga",       "Kanpur"),
    (25.45, 81.89, "Ganga",       "Prayagraj"),
    (25.30, 82.98, "Ganga",       "Varanasi"),
    (25.58, 85.10, "Ganga",       "Patna"),
    (25.37, 86.47, "Ganga",       "Bhagalpur"),
    (24.20, 88.35, "Ganga",       "Farakka"),
    (22.90, 88.40, "Hooghly",     "Hooghly"),
    # YAMUNA
    (30.60, 77.80, "Yamuna",      "Dehradun"),
    (28.66, 77.23, "Yamuna",      "Delhi"),
    (27.50, 77.68, "Yamuna",      "Mathura"),
    # GHAGHRA / GANDAK / KOSI
    (27.57, 81.60, "Ghaghra",     "Bahraich"),
    (26.77, 83.40, "Ghaghra",     "Gorakhpur"),
    (26.47, 84.46, "Gandak",      "Champaran"),
    (26.90, 87.17, "Kosi",        "Supaul"),
    # BRAHMAPUTRA / BARAK
    (27.48, 94.90, "Brahmaputra", "Dibrugarh"),
    (26.33, 92.77, "Brahmaputra", "Nagaon"),
    (26.08, 89.87, "Brahmaputra", "Dhubri"),
    (24.82, 92.80, "Barak",       "Cachar"),
    # MAHANADI
    (21.90, 83.20, "Mahanadi",    "Raigarh"),
    (20.47, 85.88, "Mahanadi",    "Cuttack"),
    # GODAVARI
    (19.96, 73.80, "Godavari",    "Nashik"),
    (17.97, 79.60, "Godavari",    "Karimnagar"),
    (16.78, 81.80, "Godavari",    "Konaseema"),
    # KRISHNA / KAVERI
    (17.67, 73.97, "Krishna",     "Satara"),
    (16.52, 80.61, "Krishna",     "Krishna"),
    (12.43, 76.57, "Kaveri",      "Mysuru"),
    (10.77, 79.12, "Kaveri",      "Thanjavur"),
    # NARMADA / TAPI
    (22.87, 78.57, "Narmada",     "Mandla"),
    (22.17, 75.78, "Narmada",     "Khargone"),
    (21.78, 73.02, "Narmada",     "Bharuch"),
    (21.17, 72.83, "Tapi",        "Surat"),
    # SABARMATI / DAMODAR
    (23.00, 72.57, "Sabarmati",   "Gandhinagar"),
    (23.37, 87.50, "Damodar",     "Paschim Bardhaman"),
    # TUNGABHADRA / PERIYAR / BHIMA
    (15.17, 76.83, "Tungabhadra", "Koppal"),
    (10.22, 76.62, "Periyar",     "Ernakulam"),
    (17.37, 76.82, "Bhima",       "Solapur"),
    # PUNJAB RIVERS
    (30.93, 75.85, "Sutlej",      "Ludhiana"),
    (31.52, 74.52, "Beas",        "Amritsar"),
    (32.10, 75.80, "Ravi",        "Pathankot"),
    # CHAMBAL / SON / BETWA
    (25.98, 76.57, "Chambal",     "Morena"),
    (25.18, 83.98, "Son",         "Rohtas"),
    (25.47, 78.57, "Betwa",       "Jhansi"),
    # SOUTH
    (9.92,  78.12, "Vaigai",      "Madurai"),
    (14.47, 77.65, "Pennar",      "Anantapuramu"),
    # INDUS / JHELUM
    (34.08, 77.58, "Indus",       "Leh"),
    (33.72, 74.87, "Jhelum",      "Baramulla"),
]

HIST_START = "1984-01-01"
HIST_END   = "2024-12-31"

# ENSO classification for India monsoon impact (June-September)
# El Niño years: India monsoon typically suppressed (-8% to -15% below normal)
# Source: IMD/NOAA ENSO records
EL_NINO_YEARS = {1987, 1992, 1994, 1997, 2002, 2004, 2006, 2009, 2015, 2018, 2023}
LA_NINA_YEARS = {1988, 1989, 1999, 2000, 2007, 2008, 2010, 2011, 2020, 2021, 2022}
MONSOON_MONTHS = {6, 7, 8, 9}  # June-September


def fetch_history(lat, lon, retries=3):
    params = urllib.parse.urlencode({
        "latitude": lat, "longitude": lon,
        "daily": "river_discharge",
        "start_date": HIST_START,
        "end_date": HIST_END,
    })
    url = f"https://flood-api.open-meteo.com/v1/flood?{params}"
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=40) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 15 * (attempt + 1)
                print(f"(429 rate-limit, waiting {wait}s)", end=" ", flush=True)
                time.sleep(wait)
                continue
            return {"error": f"HTTP {e.code}: {e.reason}"}
        except Exception as e:
            return {"error": str(e)}
    return {"error": "429 after retries"}


def linear_trend(xs, ys):
    """Returns (slope, r2) via least squares."""
    n = len(xs)
    if n < 2:
        return 0.0, 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    ssxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    ssx  = sum((x - mx) ** 2 for x in xs)
    ssy  = sum((y - my) ** 2 for y in ys)
    if ssx == 0:
        return 0.0, 0.0
    slope = ssxy / ssx
    r2    = (ssxy ** 2) / (ssx * ssy) if ssy > 0 else 0.0
    return slope, r2


def percentile(vals, p):
    s = sorted(vals)
    idx = (len(s) - 1) * p / 100
    lo, hi = int(idx), min(int(idx) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (idx - lo)


def analyse(dates, discharges):
    """Compute all analytics from raw daily time series."""
    # Group by year and month
    by_year_month = defaultdict(lambda: defaultdict(list))
    for dt, val in zip(dates, discharges):
        if val is None or val < 0:
            continue
        year = int(dt[:4])
        month = int(dt[5:7])
        by_year_month[year][month].append(val)

    years = sorted(by_year_month.keys())
    if len(years) < 5:
        return None

    # Annual means
    annual_means = {}
    for yr in years:
        vals = [v for m_vals in by_year_month[yr].values() for v in m_vals]
        if vals:
            annual_means[yr] = sum(vals) / len(vals)

    # Monthly climatology across all years
    monthly_clim = {}
    for month in range(1, 13):
        all_vals = [v for yr in years for v in by_year_month[yr].get(month, [])]
        monthly_clim[month] = sum(all_vals) / len(all_vals) if all_vals else 0.0

    # Linear trend on annual means
    yr_list = sorted(annual_means.keys())
    mn_list = [annual_means[yr] for yr in yr_list]
    slope, r2 = linear_trend(yr_list, mn_list)
    overall_mean = sum(mn_list) / len(mn_list) if mn_list else 1.0

    # % change per decade
    pct_per_decade = (slope * 10 / overall_mean * 100) if overall_mean > 0 else 0.0

    # Trend class
    if pct_per_decade < -5 and r2 > 0.1:
        trend = "declining"
    elif pct_per_decade > 5 and r2 > 0.1:
        trend = "increasing"
    else:
        trend = "stable"

    # Flow regime: based on driest month vs annual mean
    min_monthly = min(monthly_clim.values())
    max_monthly = max(monthly_clim.values())
    dry_ratio    = min_monthly / overall_mean if overall_mean > 0 else 0

    if dry_ratio < 0.05:
        flow_regime = "intermittent"   # nearly dries up
    elif dry_ratio < 0.25:
        flow_regime = "seasonal"       # significant seasonality
    else:
        flow_regime = "perennial"      # always flowing

    # Peak and dry month (1-indexed)
    peak_month = max(monthly_clim, key=monthly_clim.get)
    dry_month  = min(monthly_clim, key=monthly_clim.get)

    # Seasonality ratio (how spiky is the annual cycle)
    seasonality = (max_monthly / min_monthly) if min_monthly > 0 else 99.0

    # El Niño sensitivity: compare JJAS discharge in EN vs neutral years
    en_vals, ln_vals, neutral_vals = [], [], []
    for yr in years:
        monsoon = [v for m in MONSOON_MONTHS for v in by_year_month[yr].get(m, [])]
        if not monsoon:
            continue
        mean_jjas = sum(monsoon) / len(monsoon)
        if yr in EL_NINO_YEARS:
            en_vals.append(mean_jjas)
        elif yr in LA_NINA_YEARS:
            ln_vals.append(mean_jjas)
        else:
            neutral_vals.append(mean_jjas)

    neutral_mean = sum(neutral_vals) / len(neutral_vals) if neutral_vals else overall_mean
    en_ratio  = (sum(en_vals) / len(en_vals) / neutral_mean) if en_vals and neutral_mean > 0 else 1.0
    ln_ratio  = (sum(ln_vals) / len(ln_vals) / neutral_mean) if ln_vals and neutral_mean > 0 else 1.0

    # Sensitivity class
    en_drop_pct = (1 - en_ratio) * 100
    if en_drop_pct > 20:
        enso_sensitivity = "high"
    elif en_drop_pct > 8:
        enso_sensitivity = "medium"
    else:
        enso_sensitivity = "low"

    # Historical percentiles (from all daily values)
    all_vals = [v for v in discharges if v is not None and v >= 0]
    p10 = round(percentile(all_vals, 10), 1) if len(all_vals) > 10 else 0
    p50 = round(percentile(all_vals, 50), 1) if len(all_vals) > 10 else 0
    p90 = round(percentile(all_vals, 90), 1) if len(all_vals) > 10 else 0

    # Recent decade mean vs early decade (stress indicator)
    early = [annual_means[yr] for yr in yr_list if yr <= 1994]
    recent = [annual_means[yr] for yr in yr_list if yr >= 2014]
    early_mean  = sum(early) / len(early)   if early  else overall_mean
    recent_mean = sum(recent) / len(recent) if recent else overall_mean
    decadal_change_pct = ((recent_mean - early_mean) / early_mean * 100) if early_mean > 0 else 0

    return {
        "annual_means":       {str(k): round(v, 1) for k, v in annual_means.items()},
        "monthly_clim":       {str(k): round(v, 1) for k, v in monthly_clim.items()},
        "trend":              trend,
        "pct_per_decade":     round(pct_per_decade, 1),
        "r2":                 round(r2, 3),
        "flow_regime":        flow_regime,
        "peak_month":         peak_month,
        "dry_month":          dry_month,
        "seasonality_ratio":  round(min(seasonality, 99.0), 1),
        "enso_sensitivity":   enso_sensitivity,
        "en_ratio":           round(en_ratio, 3),
        "ln_ratio":           round(ln_ratio, 3),
        "en_drop_pct":        round(en_drop_pct, 1),
        "p10": p10, "p50": p50, "p90": p90,
        "overall_mean":       round(overall_mean, 1),
        "early_mean":         round(early_mean, 1),
        "recent_mean":        round(recent_mean, 1),
        "decadal_change_pct": round(decadal_change_pct, 1),
        "years_of_data":      len(yr_list),
    }


def main():
    print(f"Fetching 40-year discharge history for {len(RIVER_POINTS)} points...")
    print(f"  Period: {HIST_START} to {HIST_END} (GloFAS ERA5)\n")

    # Resume from existing output if available
    existing = {}
    if OUT.exists():
        try:
            prev = json.loads(OUT.read_text())
            for p in prev.get("points", []):
                existing[f"{p['river']}|{p['location']}"] = p
            print(f"  Resuming: {len(existing)} points already fetched\n")
        except Exception:
            pass

    results = list(existing.values())
    errors  = 0

    for i, (lat, lon, river, location) in enumerate(RIVER_POINTS):
        key = f"{river}|{location}"
        if key in existing:
            print(f"  [{i+1:2d}/{len(RIVER_POINTS)}] {river} @ {location}... (cached)")
            continue

        print(f"  [{i+1:2d}/{len(RIVER_POINTS)}] {river} @ {location}...", end=" ", flush=True)
        data = fetch_history(lat, lon)

        if "error" in data:
            print(f"ERROR: {data['error']}")
            errors += 1
            time.sleep(2)
            continue

        daily = data.get("daily", {})
        dates = daily.get("time", [])
        discs = daily.get("river_discharge", [])

        if not discs or all(d is None for d in discs):
            print("no data")
            continue

        stats = analyse(dates, discs)
        if stats is None:
            print("insufficient data")
            continue

        # Skip points not on a real river channel in the GloFAS model
        if stats["p50"] < 20:
            print(f"skip (p50={stats['p50']} m³/s, not on main channel)")
            continue

        pt = {"lat": lat, "lon": lon, "river": river, "location": location, **stats}
        results.append(pt)
        print(f"{stats['trend']:10s}  {stats['pct_per_decade']:+.1f}%/dec  "
              f"{stats['flow_regime']:12s}  ENSO: {stats['enso_sensitivity']:6s}  "
              f"p50={stats['p50']} m³/s")

        # Save incrementally so we can resume on rate-limit failure
        _save(results)
        time.sleep(1.0)  # conservative: historical queries are heavier

    print(f"\nCompleted: {len(results)} points ({errors} errors)")

    # Summary
    trends = defaultdict(int)
    regimes = defaultdict(int)
    sensitivities = defaultdict(int)
    for r in results:
        trends[r["trend"]] += 1
        regimes[r["flow_regime"]] += 1
        sensitivities[r["enso_sensitivity"]] += 1

    print(f"\nTrend summary:    {dict(trends)}")
    print(f"Flow regime:      {dict(regimes)}")
    print(f"ENSO sensitivity: {dict(sensitivities)}")

    # Most stressed rivers
    declining = [r for r in results if r["trend"] == "declining"]
    declining.sort(key=lambda x: x["pct_per_decade"])
    print(f"\nMost declining rivers:")
    for r in declining[:5]:
        print(f"  {r['river']:15s} @ {r['location']:20s}  {r['pct_per_decade']:+.1f}%/dec  "
              f"recent={r['recent_mean']:.0f} vs early={r['early_mean']:.0f} m³/s")

    _save(results)
    import os
    print(f"\nSaved: {OUT} ({os.path.getsize(OUT)//1024}KB)")


def _save(results):
    out = {
        "generated": datetime.now().isoformat() + "Z",
        "period": {"start": HIST_START, "end": HIST_END},
        "source": "GloFAS ERA5 via Open-Meteo flood API",
        "enso_note": "El Niño sensitivity = JJAS monsoon discharge ratio vs neutral years",
        "points": results,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
