"""
Open-Meteo API — free, no auth, no rate limits for non-commercial use.
Primary data source until IMD IP is whitelisted.
Docs: https://open-meteo.com/en/docs
"""
import requests
from config import OPENMETEO_FORECAST, OPENMETEO_HISTORICAL, OPENMETEO_FLOOD


def fetch_forecast(lat, lon, days=7):
    """
    Fetch daily weather forecast for a location (no API key needed).

    Returns daily temperature, rainfall, humidity, wind for `days` ahead.
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": ",".join([
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_sum",
            "rain_sum",
            "precipitation_probability_max",
            "windspeed_10m_max",
            "relative_humidity_2m_mean",
            "et0_fao_evapotranspiration",
        ]),
        "forecast_days": days,
        "timezone": "Asia/Kolkata",
    }
    try:
        resp = requests.get(OPENMETEO_FORECAST, params=params, timeout=15)
        resp.raise_for_status()
        return resp.json().get("daily", {})
    except Exception as e:
        print(f"[Open-Meteo] Forecast failed: {e}")
        return None


def fetch_historical(lat, lon, start_date, end_date):
    """
    Fetch historical weather (80+ years available).
    start_date / end_date: "YYYY-MM-DD"
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date,
        "end_date": end_date,
        "daily": ",".join([
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_sum",
            "rain_sum",
            "windspeed_10m_max",
            "relative_humidity_2m_mean",
        ]),
        "timezone": "Asia/Kolkata",
    }
    try:
        resp = requests.get(OPENMETEO_HISTORICAL, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json().get("daily", {})
    except Exception as e:
        print(f"[Open-Meteo] Historical failed: {e}")
        return None


def fetch_flood_forecast(lat, lon):
    """
    Fetch river discharge forecast from Open-Meteo Flood API (GloFAS data).
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "river_discharge",
        "forecast_days": 7,
    }
    try:
        resp = requests.get(OPENMETEO_FLOOD, params=params, timeout=15)
        resp.raise_for_status()
        return resp.json().get("daily", {})
    except Exception as e:
        print(f"[Open-Meteo] Flood forecast failed: {e}")
        return None


def compute_hazard_from_forecast(forecast_data):
    """
    Convert Open-Meteo forecast into hazard probabilities.
    Fallback logic when IMD is unavailable.
    """
    if not forecast_data:
        return {"flood": 0.0, "heatwave": 0.0, "drought": 0.0}

    temps_max = forecast_data.get("temperature_2m_max", [])
    precip = forecast_data.get("precipitation_sum", [])

    # Flood probability
    max_rain = max(precip) if precip else 0
    avg_rain = sum(precip) / len(precip) if precip else 0
    flood_prob = min(1.0, max_rain / 150 * 0.5 + avg_rain / 80 * 0.3)

    # Heatwave probability
    max_temp = max(temps_max) if temps_max else 0
    days_above_40 = sum(1 for t in temps_max if t and t >= 40)
    heat_prob = min(1.0,
        (max(0, max_temp - 38) / 12) * 0.5 +
        (days_above_40 / max(len(temps_max), 1)) * 0.5
    )

    # Drought probability
    dry_days = sum(1 for p in precip if p is not None and p < 1)
    total_rain = sum(p for p in precip if p is not None)
    drought_prob = min(1.0,
        (dry_days / max(len(precip), 1)) * 0.4 +
        max(0, 1 - total_rain / 20) * 0.3 +
        (max(0, max_temp - 35) / 15) * 0.3
    )

    return {
        "flood": round(flood_prob, 3),
        "heatwave": round(heat_prob, 3),
        "drought": round(drought_prob, 3),
    }
