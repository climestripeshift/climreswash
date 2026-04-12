"""
ClimResWASH Early Warning System — Flask API
Runs on port 8080 alongside the main Node.js app (port 5000).
"""
import sys
import os

# Ensure imports resolve relative to this file's directory
sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask, request, jsonify
from flask_cors import CORS
import json

from models.short_term_model import ShortTermPredictor
from models.long_term_model import LongTermPronenessModel
from models.wash_recommender import recommend_technologies
from data.openmeteo_fetcher import fetch_forecast, compute_hazard_from_forecast
from data.imd_fetcher import (
    fetch_district_warnings,
    parse_warning_to_hazards,
    fetch_district_rainfall,
)
from data.cgwb_fetcher import get_district_gw_depth, get_district_gw_trend

app = Flask(__name__)
CORS(app)

short_term = ShortTermPredictor()
long_term = LongTermPronenessModel()

_dir = os.path.dirname(__file__)
with open(os.path.join(_dir, "quick_measures.json"), "r") as f:
    QUICK_MEASURES = json.load(f)


# ============================================================
# ENDPOINTS
# ============================================================

@app.route("/")
def home():
    return jsonify({
        "service": "ClimResWASH Early Warning System",
        "version": "1.0",
        "status": "running",
        "endpoints": {
            "GET /api/short-term/<district_id>": "Short-term hazard prediction (IMD → Open-Meteo fallback). Add ?lat=XX&lon=YY for Open-Meteo.",
            "GET /api/long-term/<district_name>": "Long-term proneness + WASH tech recommendation.",
            "POST /api/predict": "Custom feature vector → short-term prediction (JSON body).",
            "GET /api/quick-measures/<hazard>": "Quick protective measures for flood|heatwave|drought.",
            "GET /api/myip": "Returns this server's public IP (for IMD IP whitelist request).",
        }
    })


@app.route("/api/short-term/<district_id>")
def short_term_prediction(district_id):
    """
    Short-term hazard prediction for a district.
    Tries IMD first, falls back to Open-Meteo if lat/lon provided.

    Usage:
      GET /api/short-term/573                      (IMD only)
      GET /api/short-term/573?lat=26.9&lon=75.7    (Open-Meteo fallback)
    """
    lat = request.args.get("lat", type=float)
    lon = request.args.get("lon", type=float)

    imd_warnings = fetch_district_warnings(district_id)
    imd_rainfall = fetch_district_rainfall(district_id)

    rain_dep = 0
    if imd_warnings:
        hazards = parse_warning_to_hazards(imd_warnings)
        source = "IMD"
        if imd_rainfall and isinstance(imd_rainfall, list) and len(imd_rainfall) > 0:
            dep_str = imd_rainfall[0].get("Daily Departure Per", "0%")
            try:
                rain_dep = float(dep_str.replace("%", "").replace("+", ""))
            except Exception:
                rain_dep = 0

    elif lat and lon:
        forecast = fetch_forecast(lat, lon, days=7)
        hazards = compute_hazard_from_forecast(forecast)
        source = "Open-Meteo"

        features = {
            "rainfall_mm": 0,
            "temperature_c": 0,
            "temp_departure_c": 0,
            "humidity_pct": 50,
            "gw_depth_m": 10,
            "river_level_pct": 50,
            "consecutive_dry_days": 0,
            "rainfall_departure_pct": 0,
            "soil_permeability": 2,
        }
        model_pred = short_term.predict(features)
        for h in ["flood", "heatwave", "drought"]:
            hazards[h] = max(hazards.get(h, 0), model_pred.get(h, 0))

    else:
        return jsonify({
            "error": "IMD unavailable. Provide lat/lon query params for Open-Meteo fallback.",
            "example": f"/api/short-term/{district_id}?lat=26.9&lon=75.7"
        }), 400

    triggered_measures = {}
    for hazard_type, prob in hazards.items():
        if hazard_type in QUICK_MEASURES:
            threshold = QUICK_MEASURES[hazard_type]["threshold"]
            if prob >= threshold:
                triggered_measures[hazard_type] = {
                    "probability": prob,
                    "risk_level": short_term.get_risk_level(prob),
                    "measures": QUICK_MEASURES[hazard_type]["measures"],
                }

    return jsonify({
        "district_id": district_id,
        "source": source,
        "prediction": {
            "flood": round(hazards.get("flood", 0), 3),
            "heatwave": round(hazards.get("heatwave", 0), 3),
            "drought": round(hazards.get("drought", 0), 3),
        },
        "triggered_measures": triggered_measures,
        "message": _build_alert_message(hazards, triggered_measures),
    })


@app.route("/api/long-term/<district_name>")
def long_term_recommendation(district_name):
    """
    Long-term proneness scoring + WASH technology recommendations.

    Query params (all optional):
      avg_rainfall, flood_events, gw_depth, soil (1-3),
      elevation, hw_days, drought_months, coastal (true/false),
      river_basin (true/false)
    """
    gw_depth = get_district_gw_depth(district_name)
    gw_trend = get_district_gw_trend(district_name)

    profile = {
        "avg_annual_rainfall_mm": request.args.get("avg_rainfall", 1100, type=float),
        "flood_events_per_decade": request.args.get("flood_events", 2, type=int),
        "avg_gw_depth_m": gw_depth or request.args.get("gw_depth", 8, type=float),
        "gw_trend_m_per_year": gw_trend or 0,
        "soil_permeability": request.args.get("soil", 2, type=int),
        "elevation_m": request.args.get("elevation", 200, type=float),
        "heatwave_days_per_year": request.args.get("hw_days", 10, type=int),
        "drought_months_per_year": request.args.get("drought_months", 1, type=int),
        "coastal_district": request.args.get("coastal", "false").lower() == "true",
        "river_basin": request.args.get("river_basin", "false").lower() == "true",
    }

    scores = long_term.score_district(profile)
    recommendations = recommend_technologies(scores)

    return jsonify({
        "district": district_name,
        "profile_used": profile,
        "proneness_scores": scores,
        "recommendations": recommendations,
    })


@app.route("/api/predict", methods=["POST"])
def predict_custom():
    """
    POST a custom feature vector for short-term hazard prediction.

    JSON body fields:
      rainfall_mm, temperature_c, temp_departure_c, humidity_pct,
      gw_depth_m, river_level_pct, consecutive_dry_days,
      rainfall_departure_pct, soil_permeability
    """
    features = request.get_json()
    if not features:
        return jsonify({"error": "Send a JSON body with feature fields"}), 400

    prediction = short_term.predict(features)

    triggered = {}
    for hazard_type in ["flood", "heatwave", "drought"]:
        prob = prediction.get(hazard_type, 0)
        if hazard_type in QUICK_MEASURES:
            if prob >= QUICK_MEASURES[hazard_type]["threshold"]:
                triggered[hazard_type] = {
                    "probability": prob,
                    "risk_level": short_term.get_risk_level(prob),
                    "measures": QUICK_MEASURES[hazard_type]["measures"],
                }

    prediction["triggered_measures"] = triggered
    return jsonify(prediction)


@app.route("/api/quick-measures/<hazard>")
def get_quick_measures(hazard):
    """Get protective measures for a specific hazard (flood/heatwave/drought)."""
    if hazard not in QUICK_MEASURES:
        return jsonify({
            "error": f"Unknown hazard: {hazard}",
            "available": list(QUICK_MEASURES.keys())
        }), 404
    return jsonify(QUICK_MEASURES[hazard])


@app.route("/api/myip")
def my_ip():
    """Returns this server's public IP — use this when requesting IMD IP whitelist."""
    try:
        import requests as req
        r = req.get("https://api.ipify.org?format=json", timeout=5)
        return jsonify(r.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================
# HELPERS
# ============================================================

def _build_alert_message(hazards, triggered):
    if not triggered:
        return "All hazard levels LOW. No immediate action needed."
    parts = []
    for h, data in triggered.items():
        level = data["risk_level"]["level"]
        pct = round(data["probability"] * 100)
        count = len(data["measures"])
        parts.append(f"{h.upper()} risk {level} ({pct}%) — {count} measures activated")
    return " | ".join(parts)


# ============================================================
# ENTRY POINT
# ============================================================
if __name__ == "__main__":
    port = int(os.environ.get("ML_PORT", 8080))
    print("=" * 55)
    print("  ClimResWASH Early Warning System — Flask API")
    print(f"  Running on http://0.0.0.0:{port}")
    print("=" * 55)
    print(f"  GET  /api/short-term/<district_id>?lat=XX&lon=YY")
    print(f"  GET  /api/long-term/<district_name>")
    print(f"  POST /api/predict  (JSON body)")
    print(f"  GET  /api/quick-measures/<flood|heatwave|drought>")
    print(f"  GET  /api/myip  (for IMD whitelist request)")
    print("=" * 55)
    app.run(host="0.0.0.0", port=port, debug=False)
