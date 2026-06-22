"""
Fetch 7-day weather forecast from Open-Meteo, compute per-hex risk using
formulas.py, generate alerts. Output: public/data/forecast_risk.json

Run: python scripts/compute_forecast.py
"""
import json
import math
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from risk.formulas import (
    compute_risk,
    drought_score,
    flood_sensitivity,
    heat_sensitivity,
    heatwave_score,
    pluvial_flood_score,
    wet_bulb_score,
)

ROOT      = Path(__file__).resolve().parent.parent
HEX_FILE  = ROOT / "client/public/data/india_hex_grid.geojson"
OUT_FILE  = ROOT / "client/public/data/forecast_risk.json"
API_URL   = "https://api.open-meteo.com/v1/forecast"
BATCH     = 50
SAMPLE_N  = 12   # use every Nth hex centroid as weather sample
ALERT_THRESHOLD = 1.0

LAND_USE_PARAMS = {
    "tree":     {"tree_pct": 75, "built_pct": 2,  "sand_pct": 20},
    "shrub":    {"tree_pct": 30, "built_pct": 3,  "sand_pct": 35},
    "grass":    {"tree_pct": 10, "built_pct": 5,  "sand_pct": 30},
    "crop":     {"tree_pct": 8,  "built_pct": 10, "sand_pct": 25},
    "built":    {"tree_pct": 5,  "built_pct": 70, "sand_pct": 15},
    "barren":   {"tree_pct": 1,  "built_pct": 2,  "sand_pct": 75},
    "water":    {"tree_pct": 0,  "built_pct": 0,  "sand_pct": 10},
    "wetland":  {"tree_pct": 15, "built_pct": 2,  "sand_pct": 10},
    "snow":     {"tree_pct": 0,  "built_pct": 0,  "sand_pct": 5},
    "mangrove": {"tree_pct": 60, "built_pct": 0,  "sand_pct": 15},
}
DEFAULT_PARAMS = {"tree_pct": 10, "built_pct": 10, "sand_pct": 30}


def estimate_slope(elev):
    if elev > 3000: return 25.0
    if elev > 1500: return 15.0
    if elev > 800:  return 8.0
    if elev > 300:  return 3.0
    if elev > 100:  return 1.0
    return 0.5


def estimate_dist_water(lu, elev):
    if lu in ("water", "wetland", "mangrove"): return 100.0
    if elev < 30:  return 500.0
    if elev < 100: return 1500.0
    if elev < 300: return 3000.0
    return 5000.0


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def main():
    print("Loading hex grid...")
    with open(HEX_FILE) as f:
        gj = json.load(f)
    features = gj["features"]
    total = len(features)
    print(f"  {total} hexes")

    # Compute centroids for all hexes
    centroids = []
    for feat in features:
        coords = feat["geometry"]["coordinates"][0]
        lon = sum(c[0] for c in coords) / len(coords)
        lat = sum(c[1] for c in coords) / len(coords)
        centroids.append((lat, lon))

    # Sample weather points (every Nth hex)
    sample_indices = list(range(0, total, SAMPLE_N))
    sample_lats = [centroids[i][0] for i in sample_indices]
    sample_lons = [centroids[i][1] for i in sample_indices]
    print(f"  {len(sample_indices)} weather sample points")

    # Fetch forecasts from Open-Meteo in batches
    print("Fetching 7-day forecasts from Open-Meteo...")
    weather: dict[int, dict] = {}  # sample_index → {day_idx: {temp, rain, rh, wind}}

    for b in range(0, len(sample_indices), BATCH):
        batch_idx = sample_indices[b:b + BATCH]
        lats = ",".join(f"{centroids[i][0]:.3f}" for i in batch_idx)
        lons = ",".join(f"{centroids[i][1]:.3f}" for i in batch_idx)

        try:
            r = requests.get(API_URL, params={
                "latitude": lats,
                "longitude": lons,
                "daily": "temperature_2m_max,precipitation_sum,relative_humidity_2m_mean,wind_speed_10m_max",
                "forecast_days": 7,
                "timezone": "Asia/Kolkata",
            }, timeout=30)
            r.raise_for_status()
            data = r.json()
            locations = data if isinstance(data, list) else [data]

            for j, loc in enumerate(locations):
                idx = batch_idx[j]
                daily = loc["daily"]
                days_data = []
                for d in range(len(daily["time"])):
                    days_data.append({
                        "temp": daily["temperature_2m_max"][d] or 35,
                        "rain": daily["precipitation_sum"][d] or 0,
                        "rh":   daily["relative_humidity_2m_mean"][d] or 50,
                        "wind": daily["wind_speed_10m_max"][d] or 5,
                        "date": daily["time"][d],
                    })
                weather[idx] = days_data

            batch_num = b // BATCH + 1
            total_batches = (len(sample_indices) + BATCH - 1) // BATCH
            print(f"  [{batch_num}/{total_batches}] {len(weather)} locations fetched")
        except Exception as e:
            print(f"  Batch {b//BATCH+1} failed: {e}")

        time.sleep(2)

    print(f"  {len(weather)} weather points fetched")

    # Map each hex to nearest weather sample
    print("Mapping hexes to nearest weather point...")
    hex_weather_idx = []
    for i, (lat, lon) in enumerate(centroids):
        best_idx = sample_indices[0]
        best_dist = 1e9
        for si in sample_indices:
            if si in weather:
                d = (centroids[si][0] - lat)**2 + (centroids[si][1] - lon)**2
                if d < best_dist:
                    best_dist = d
                    best_idx = si
        hex_weather_idx.append(best_idx)

    # Compute risk per hex per day
    print("Computing forecast risk per hex per day...")
    dates = []
    if weather:
        first_wx = next(iter(weather.values()))
        dates = [d["date"] for d in first_wx]
    n_days = len(dates)

    hex_risks: dict[str, list[float]] = {}
    hex_dominant: dict[str, list[str]] = {}
    alerts: list[dict] = []

    for i, feat in enumerate(features):
        p = feat["properties"]
        h3_id = p["h3_id"]
        elev = float(p.get("elevation_mean", 200) or 200)
        lu   = str(p.get("land_use", "crop") or "crop")
        ndvi = float(p.get("ndvi_mean", 0.3) or 0.3)

        params = LAND_USE_PARAMS.get(lu, DEFAULT_PARAMS)
        tree_pct  = max(params["tree_pct"], ndvi * 100 * 0.8)
        built_pct = params["built_pct"]
        sand_pct  = params["sand_pct"]
        slope     = estimate_slope(elev)
        dist_w    = estimate_dist_water(lu, elev)

        fs = flood_sensitivity(slope, sand_pct, built_pct, dist_w)
        hs = heat_sensitivity(tree_pct, built_pct, dist_w)

        d_exposure = float(p.get("district_exposure", 0.4) or 0.4)
        d_vuln = float(p.get("district_vulnerability", 0.5) or 0.5)
        exposure_10 = d_exposure * 10
        ac = max(0.1, 1 - d_vuln)

        lat, lon = centroids[i]
        wx_idx = hex_weather_idx[i]
        wx_days = weather.get(wx_idx, [])

        day_risks = []
        day_dominant = []

        for d in range(n_days):
            if d < len(wx_days):
                wx = wx_days[d]
                rain = wx["rain"]
                temp = wx["temp"]
                rh   = wx["rh"]
                wind = wx["wind"]
            else:
                rain, temp, rh, wind = 0, 35, 50, 5

            # ── Flood (from forecasted rainfall) ──
            flood_haz = pluvial_flood_score(rain, sand_pct, built_pct, slope)
            flood_r = compute_risk(flood_haz, exposure_10, fs, ac)

            # ── Heat (from forecasted temperature) ──
            threshold = 30.0 if elev > 800 else (37.0 if elev < 30 else 40.0)
            heat_haz = heatwave_score(temp, threshold, 3, built_pct, tree_pct, dist_w)
            heat_r = compute_risk(heat_haz, exposure_10, hs, ac)

            # ── Wet-bulb (from temp + humidity) ──
            wb_haz = wet_bulb_score(temp, rh)
            wb_r = compute_risk(wb_haz, exposure_10, hs, ac)

            # ── Flash flood (rainfall + steep terrain) ──
            ff_r = 0.0
            if slope > 3 and rain > 10:
                ff_haz = min(10.0, slope / 4 * 5 * (rain / 50))
                ff_sens = 0.4 * (slope / 30) + 0.3 * math.exp(-dist_w / 1500) + 0.3 * (1 - sand_pct / 100)
                ff_r = compute_risk(ff_haz, exposure_10, ff_sens, ac)

            # ── Cold wave (low temperature in winter-prone areas) ──
            cw_r = 0.0
            if temp < 15 and (lat > 22 or elev > 1500):
                cold_haz = min(10.0, max(0, (15 - temp) / 2))
                cold_sens = 0.4 * (1 - built_pct / 100) + 0.3 * min(1, elev / 3000) + 0.3 * max(0, (lat - 25) / 12)
                cw_r = compute_risk(cold_haz, exposure_10, cold_sens, ac)

            # ── Landslide (rain + steep slope) ──
            ls_r = 0.0
            if slope > 10 and rain > 20:
                ls_haz = min(10.0, (slope / 5) * (rain / 30) * (1.2 - ndvi))
                ls_sens = 0.4 * (slope / 30) + 0.3 * (1 - ndvi) + 0.3 * math.exp(-dist_w / 2000)
                ls_r = compute_risk(ls_haz, exposure_10, ls_sens, ac)

            # ── Fire (high temp + low humidity + dry vegetation) ──
            fire_r = 0.0
            if temp > 35 and rh < 30 and lu in ("tree", "shrub", "grass") and ndvi < 0.5:
                fire_haz = min(10.0, (temp - 35) / 5 * (30 - rh) / 30 * 5)
                fire_sens = 0.4 * (1 if lu in ("tree", "shrub") else 0.3) + 0.3 * (0.6 - ndvi) + 0.3 * (sand_pct / 100)
                fire_r = compute_risk(fire_haz, exposure_10, fire_sens, ac)

            risks = {
                "flood": flood_r, "heat": heat_r, "wetbulb": wb_r,
                "flashflood": ff_r, "coldwave": cw_r, "landslide": ls_r, "fire": fire_r,
            }
            max_r = max(risks.values())
            dominant = max(risks, key=risks.get)

            day_risks.append(round(max_r, 2))
            day_dominant.append(dominant)

            # Generate alert if above threshold
            if max_r >= ALERT_THRESHOLD and d <= 2:
                detail = {}
                if rain > 0: detail["rain_mm"] = round(rain, 1)
                if temp > 35 or dominant in ("heat", "wetbulb", "fire", "coldwave"):
                    detail["temp_c"] = round(temp, 1)
                if dominant == "wetbulb": detail["rh_pct"] = round(rh)
                if wind > 20: detail["wind_kmh"] = round(wind, 1)
                alerts.append({
                    "h3_id": h3_id,
                    "district": p.get("district_name", "Unknown"),
                    "state": p.get("state", "Unknown"),
                    "hazard": dominant,
                    "risk": round(max_r, 2),
                    "day": d,
                    "date": dates[d] if d < len(dates) else "",
                    **detail,
                })

        hex_risks[h3_id] = day_risks
        hex_dominant[h3_id] = day_dominant

    # Deduplicate: keep top alert per district per hazard per day
    district_alerts: dict[str, dict] = {}
    for a in sorted(alerts, key=lambda x: -x["risk"]):
        key = f"{a['district']}_{a['hazard']}_{a['day']}"
        if key not in district_alerts:
            district_alerts[key] = a
    final_alerts = sorted(district_alerts.values(), key=lambda x: (-x["risk"], x["day"]))[:100]

    # Save
    output = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "days": dates,
        "risk": hex_risks,
        "dominant": hex_dominant,
        "alerts": final_alerts,
    }

    print(f"\nSaving {OUT_FILE}...")
    with open(OUT_FILE, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    import os
    size_kb = os.path.getsize(OUT_FILE) // 1024
    print(f"Done. {size_kb} KB, {len(dates)} days, {len(final_alerts)} alerts")

    # Print top 10 alerts
    if final_alerts:
        print("\nTop alerts:")
        for a in final_alerts[:10]:
            detail = f"rain {a['rain_mm']}mm" if a["rain_mm"] else f"temp {a['temp_c']}°C"
            print(f"  Day {a['day']} ({a['date']}): {a['district']}, {a['state']} — "
                  f"{a['hazard']} risk {a['risk']} ({detail})")


if __name__ == "__main__":
    main()
