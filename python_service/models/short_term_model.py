"""
Layer 1: Short-term hazard prediction (1-7 days ahead).
Predicts probability of flood, heatwave, drought for a district.
Rule-based Phase 1 — ready to upgrade to XGBoost in Phase 2.
"""
import numpy as np
from config import THRESHOLDS


class ShortTermPredictor:
    """
    Rule-based predictor using IMD official thresholds + weighted scoring.
    """

    def predict(self, features):
        """
        Predict hazard probabilities from current conditions.

        Args:
            features: dict with keys:
                rainfall_mm, temperature_c, temp_departure_c,
                humidity_pct, wind_speed_kmph, gw_depth_m,
                river_level_pct, consecutive_dry_days,
                rainfall_departure_pct, imd_warning_color,
                soil_permeability (1=Low, 2=Medium, 3=High)

        Returns:
            dict: flood, heatwave, drought probabilities (0-1)
        """
        rain = features.get("rainfall_mm", 0)
        temp = features.get("temperature_c", 30)
        temp_dep = features.get("temp_departure_c", 0)
        humidity = features.get("humidity_pct", 50)
        gw = features.get("gw_depth_m", 10)
        river = features.get("river_level_pct", 50)
        dry_days = features.get("consecutive_dry_days", 0)
        rain_dep = features.get("rainfall_departure_pct", 0)
        soil = features.get("soil_permeability", 2)

        # ---- FLOOD ----
        flood_score = 0.0
        t = THRESHOLDS["flood"]
        if rain >= t["rainfall_extreme_mm_day"]:
            flood_score += 0.45
        elif rain >= t["rainfall_heavy_mm_day"]:
            flood_score += 0.30
        elif rain >= 64.5:
            flood_score += 0.15
        else:
            flood_score += min(0.10, rain / 650)

        if river >= t["river_level_danger_pct"]:
            flood_score += 0.30
        elif river >= t["river_level_warning_pct"]:
            flood_score += 0.15
        else:
            flood_score += river / 700

        if gw < t["gw_shallow_risk_m"]:
            flood_score += 0.15 * (1 - gw / t["gw_shallow_risk_m"])

        flood_score += (1 / soil) * 0.08

        if rain_dep > t["rainfall_departure_excess_pct"]:
            flood_score += 0.10

        flood_prob = min(0.99, max(0.0, flood_score))

        # ---- HEATWAVE ----
        heat_score = 0.0
        t_hw = THRESHOLDS["heatwave"]

        if temp >= t_hw["temp_absolute_severe_c"]:
            heat_score += 0.50
        elif temp >= t_hw["temp_absolute_hw_c"]:
            heat_score += 0.40
        elif temp >= t_hw["temp_plains_c"]:
            heat_score += 0.20
        else:
            heat_score += max(0, (temp - 35) / 30)

        if temp_dep >= t_hw["departure_severe_c"]:
            heat_score += 0.30
        elif temp_dep >= t_hw["departure_heatwave_c"]:
            heat_score += 0.20
        elif temp_dep > 2:
            heat_score += 0.08

        if humidity < 30 and temp > 40:
            heat_score += 0.10

        if dry_days > 5:
            heat_score += min(0.10, dry_days / 100)

        heat_prob = min(0.99, max(0.0, heat_score))

        # ---- DROUGHT ----
        drought_score = 0.0
        t_dr = THRESHOLDS["drought"]

        if rain_dep <= t_dr["rainfall_large_deficient_pct"]:
            drought_score += 0.40
        elif rain_dep <= t_dr["rainfall_deficient_pct"]:
            drought_score += 0.25

        if dry_days >= t_dr["consecutive_dry_days"]:
            drought_score += 0.30
        elif dry_days >= 7:
            drought_score += 0.15
        else:
            drought_score += dry_days / 100

        if gw >= t_dr["gw_deep_stress_m"]:
            drought_score += 0.20
        elif gw >= 10:
            drought_score += 0.10

        if rain < 2:
            drought_score += 0.10

        drought_prob = min(0.99, max(0.0, drought_score))

        scores = {"flood": flood_prob, "heatwave": heat_prob, "drought": drought_prob}
        dominant = max(scores, key=scores.get)

        return {
            "flood": round(flood_prob, 3),
            "heatwave": round(heat_prob, 3),
            "drought": round(drought_prob, 3),
            "dominant_hazard": dominant,
        }

    def get_risk_level(self, probability):
        """Convert probability to human-readable risk level."""
        if probability >= 0.75:
            return {"level": "CRITICAL", "color": "#E24B4A"}
        elif probability >= 0.50:
            return {"level": "HIGH", "color": "#EF9F27"}
        elif probability >= 0.25:
            return {"level": "MODERATE", "color": "#F0997B"}
        else:
            return {"level": "LOW", "color": "#5DCAA5"}
