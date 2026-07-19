"""
Rajasthan case study: does natural recharge (rainfall) explain groundwater stress,
and does groundwater stress predict JJM tap-water scheme performance?

Uses only data already in the platform + methods already used elsewhere:
  - gw_stress_score   : WRIS observation-well depth proxy, already joined onto hexes
  - jjm_fhtc_pct       : JJM IMIS tap coverage, already joined onto hexes
  - rainfall           : REAL annual precipitation (Open-Meteo ERA5 archive API,
                          same free/no-key API already used by run_period_retrospective.py)
                          — not the extreme_rain_freq hazard-frequency proxy.

District centroids are the population-weighted mean of that district's hexes (h3
cell_to_latlng), so the rainfall sample point matches where people actually are.

No artificial-recharge component (MGNREGS) — out of scope per user direction.

Run: python scripts/compute_gw_rainfall_jjm_rajasthan.py
"""
import csv
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

import h3

ROOT = Path(__file__).resolve().parent.parent
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
GW_CSV = ROOT / "data/groundwater_district.csv"
CACHE_DIR = ROOT / "data/raw/rajasthan_rainfall"
OUT_JSON = ROOT / "reports/rajasthan_gw_rainfall_jjm.json"
OUT_MD = ROOT / "reports/rajasthan_gw_rainfall_jjm.md"
OUT_WEB_JSON = ROOT / "client/public/data/rajasthan_gw_rainfall_jjm.json"

CACHE_DIR.mkdir(parents=True, exist_ok=True)
OUT_JSON.parent.mkdir(parents=True, exist_ok=True)

YEARS = list(range(2015, 2025))  # 10 full calendar years
MONSOON_MONTHS = {6, 7, 8, 9}    # Jun-Sep — the recharge-driving window in India


def pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 3:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sx = sum((x - mx) ** 2 for x in xs) ** 0.5
    sy = sum((y - my) ** 2 for y in ys) ** 0.5
    return cov / (sx * sy) if sx > 0 and sy > 0 else None


def fetch_rainfall(lat: float, lon: float, district: str) -> dict:
    cache_path = CACHE_DIR / f"{district.replace(' ', '_')}.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text())

    params = {
        "latitude": round(lat, 3),
        "longitude": round(lon, 3),
        "start_date": f"{YEARS[0]}-01-01",
        "end_date": f"{YEARS[-1]}-12-31",
        "daily": "precipitation_sum",
        "timezone": "UTC",
    }
    url = "https://archive-api.open-meteo.com/v1/archive?" + urllib.parse.urlencode(params)
    print(f"  [API] {district:15s} {lat:.3f},{lon:.3f}", flush=True)

    req = urllib.request.Request(url, headers={"User-Agent": "ClimResWASH/1.0"})
    data = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                data = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 10 * (attempt + 1)
                print(f"    [rate-limit] waiting {wait}s...", flush=True)
                time.sleep(wait)
                if attempt == 3:
                    raise
            else:
                raise
    time.sleep(2)
    cache_path.write_text(json.dumps(data))
    return data


def annual_rainfall_stats(data: dict) -> dict:
    dates = data["daily"]["time"]
    rain = data["daily"]["precipitation_sum"]
    by_year: dict[int, float] = {}
    by_year_monsoon: dict[int, float] = {}
    for d, r in zip(dates, rain):
        if r is None:
            continue
        y = int(d[:4])
        m = int(d[5:7])
        by_year[y] = by_year.get(y, 0.0) + r
        if m in MONSOON_MONTHS:
            by_year_monsoon[y] = by_year_monsoon.get(y, 0.0) + r
    full_years = [y for y in YEARS if y in by_year]
    annual_mean = sum(by_year[y] for y in full_years) / len(full_years)
    monsoon_mean = sum(by_year_monsoon.get(y, 0.0) for y in full_years) / len(full_years)
    return {
        "annual_rainfall_mm": round(annual_mean, 1),
        "monsoon_rainfall_mm": round(monsoon_mean, 1),
        "monsoon_share_pct": round(100 * monsoon_mean / annual_mean, 1) if annual_mean else None,
    }


def main():
    hexes = json.load(HEX_PROPS.open())
    raj_hexes = [h for h in hexes if h.get("state") == "Rajasthan"]
    print(f"Rajasthan hexes: {len(raj_hexes)}")

    gw_rows = list(csv.DictReader(GW_CSV.open()))
    gw_lookup = {
        r["district"].strip().upper(): float(r["gw_stress_score"])
        for r in gw_rows
        if r["state"].strip().lower() == "rajasthan"
    }
    # Known WRIS/census spelling variants (WRIS source data truncates/misspells these)
    ALIASES = {"JALOR": "JALORE", "JHUNJHUNUN": "JHUNJHUNU", "SAWAI MADHOPUR": "SAWAI"}
    for hex_name, csv_name in ALIASES.items():
        if csv_name in gw_lookup:
            gw_lookup[hex_name] = gw_lookup[csv_name]

    by_district: dict[str, list[dict]] = {}
    for h in raj_hexes:
        by_district.setdefault(h["district_name"], []).append(h)

    districts = []
    for dname, hs in sorted(by_district.items()):
        pop = sum(h.get("population") or 0 for h in hs)
        if pop == 0:
            continue
        jjm_hs = [h for h in hs if h.get("jjm_fhtc_pct") is not None]
        jjm_pop = sum(h.get("population") or 0 for h in jjm_hs)
        jjm_w = (
            sum(h["jjm_fhtc_pct"] * (h.get("population") or 0) for h in jjm_hs) / jjm_pop
            if jjm_pop > 0 else None
        )
        lat_c = sum(h3.cell_to_latlng(h["h3_id"])[0] for h in hs) / len(hs)
        lon_c = sum(h3.cell_to_latlng(h["h3_id"])[1] for h in hs) / len(hs)

        gw_key = dname.strip().upper()
        gw_stress = gw_lookup.get(gw_key)
        if gw_stress is None:
            print(f"  [warn] no groundwater match for {dname!r} — skipping")
            continue

        rain_data = fetch_rainfall(lat_c, lon_c, dname)
        rain_stats = annual_rainfall_stats(rain_data)

        districts.append({
            "district": dname,
            "population": pop,
            "jjm_fhtc_pct": round(jjm_w, 1) if jjm_w is not None else None,
            "gw_stress_score": gw_stress,
            "lat": round(lat_c, 3),
            "lon": round(lon_c, 3),
            **rain_stats,
        })

    # ── Correlations ────────────────────────────────────────────────────────
    rain = [d["annual_rainfall_mm"] for d in districts]
    monsoon = [d["monsoon_rainfall_mm"] for d in districts]
    gw = [d["gw_stress_score"] for d in districts]

    jjm_rows = [d for d in districts if d["jjm_fhtc_pct"] is not None]
    n_missing_jjm = len(districts) - len(jjm_rows)
    jjm = [d["jjm_fhtc_pct"] for d in jjm_rows]
    rain_jjm = [d["annual_rainfall_mm"] for d in jjm_rows]
    gw_jjm = [d["gw_stress_score"] for d in jjm_rows]

    corr = {
        "rainfall_vs_gw_stress": round(pearson(rain, gw), 3),
        "monsoon_rainfall_vs_gw_stress": round(pearson(monsoon, gw), 3),
        "rainfall_vs_jjm_fhtc": round(pearson(rain_jjm, jjm), 3),
        "gw_stress_vs_jjm_fhtc": round(pearson(gw_jjm, jjm), 3),
        "n_districts_missing_jjm_data": n_missing_jjm,
    }

    districts.sort(key=lambda d: -d["gw_stress_score"])

    out = {
        "meta": {
            "n_districts": len(districts),
            "years": f"{YEARS[0]}-{YEARS[-1]}",
            "rainfall_source": "Open-Meteo ERA5 archive API (precipitation_sum), 10-yr mean at population-weighted district centroid",
            "gw_stress_source": "WRIS observation wells, depth-to-water-table proxy (data/groundwater_district.csv)",
            "jjm_source": "JJM IMIS J1 (jjm_district_fhtc.json), population-weighted across hexes per district",
            "scope": "natural recharge only — no artificial recharge (MGNREGS) component",
        },
        "correlations": corr,
        "districts": districts,
    }
    OUT_JSON.write_text(json.dumps(out, indent=2))
    OUT_WEB_JSON.write_text(json.dumps(out, indent=2))

    lines = [
        "# Rajasthan: Rainfall vs Groundwater Stress vs JJM Coverage",
        "",
        f"n={len(districts)} districts · rainfall = {YEARS[0]}-{YEARS[-1]} mean annual (Open-Meteo ERA5 archive, real precipitation_sum, not a hazard-frequency proxy)",
        "",
        "## Correlations",
        "",
        f"- r(annual rainfall, gw_stress) = **{corr['rainfall_vs_gw_stress']}**",
        f"- r(monsoon rainfall, gw_stress) = **{corr['monsoon_rainfall_vs_gw_stress']}**",
        f"- r(annual rainfall, JJM tap coverage) = **{corr['rainfall_vs_jjm_fhtc']}**",
        f"- r(gw_stress, JJM tap coverage) = **{corr['gw_stress_vs_jjm_fhtc']}**",
        "",
        "## District table (sorted by groundwater stress, worst first)",
        "",
        "| District | Pop | GW stress | JJM tap % | Annual rain mm | Monsoon rain mm | Monsoon share |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for d in districts:
        jjm_str = f"{d['jjm_fhtc_pct']:.1f}%" if d["jjm_fhtc_pct"] is not None else "— (no JJM data)"
        lines.append(
            f"| {d['district']} | {d['population']:,} | {d['gw_stress_score']:.2f} | {jjm_str} | "
            f"{d['annual_rainfall_mm']:.0f} | {d['monsoon_rainfall_mm']:.0f} | {d['monsoon_share_pct']:.0f}% |"
        )
    OUT_MD.write_text("\n".join(lines) + "\n")

    print()
    print("Correlations:", json.dumps(corr, indent=2))
    print(f"\nWrote {OUT_JSON}")
    print(f"Wrote {OUT_MD}")
    print(f"Wrote {OUT_WEB_JSON}")


if __name__ == "__main__":
    main()
