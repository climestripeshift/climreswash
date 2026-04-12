"""
Layer 2: Long-term district proneness scoring.
Scores chronic vulnerability to flood, heatwave, drought.
Output feeds into WASH technology recommender.
"""


class LongTermPronenessModel:
    """
    Scores district-level hazard proneness (0-1) per hazard type.
    Phase 1: weighted formula using available data.
    Phase 2: train Random Forest on CEEW/NDMA district risk data.
    Phase 3: add CMIP6 climate projections.
    """

    def score_district(self, profile):
        """
        Calculate hazard proneness scores for a district.

        Args:
            profile: dict with avg_annual_rainfall_mm, flood_events_per_decade,
                avg_gw_depth_m, gw_trend_m_per_year, soil_permeability,
                elevation_m, heatwave_days_per_year, drought_months_per_year,
                coastal_district (bool), river_basin (bool)

        Returns:
            dict with proneness scores (0-1) and dominant_hazard
        """
        rain = profile.get("avg_annual_rainfall_mm", 1100)
        floods = profile.get("flood_events_per_decade", 2)
        gw = profile.get("avg_gw_depth_m", 8)
        gw_trend = profile.get("gw_trend_m_per_year", 0)
        soil = profile.get("soil_permeability", 2)
        elevation = profile.get("elevation_m", 200)
        hw_days = profile.get("heatwave_days_per_year", 10)
        drought_months = profile.get("drought_months_per_year", 1)
        coastal = profile.get("coastal_district", False)
        river_basin = profile.get("river_basin", False)

        # ---- FLOOD PRONENESS ----
        flood_score = 0.0
        flood_score += min(0.35, floods / 12)
        if rain > 2500:
            flood_score += 0.20
        elif rain > 1500:
            flood_score += 0.12
        elif rain > 1000:
            flood_score += 0.05
        if gw < 3:
            flood_score += 0.15
        elif gw < 5:
            flood_score += 0.08
        if gw_trend < -0.1:
            flood_score += 0.08
        flood_score += (1 / soil) * 0.08
        if coastal:
            flood_score += 0.10
        if river_basin:
            flood_score += 0.10
        if elevation < 50:
            flood_score += 0.08
        flood_prone = min(1.0, flood_score)

        # ---- HEATWAVE PRONENESS ----
        heat_score = 0.0
        heat_score += min(0.40, hw_days / 50)
        if rain < 500:
            heat_score += 0.25
        elif rain < 800:
            heat_score += 0.15
        elif rain < 1200:
            heat_score += 0.05
        if gw > 20:
            heat_score += 0.10
        elif gw > 10:
            heat_score += 0.05
        if not coastal:
            heat_score += 0.05
        heat_prone = min(1.0, heat_score)

        # ---- DROUGHT PRONENESS ----
        drought_score = 0.0
        drought_score += min(0.35, drought_months / 5)
        if rain < 400:
            drought_score += 0.30
        elif rain < 700:
            drought_score += 0.20
        elif rain < 1000:
            drought_score += 0.08
        if gw_trend > 0.3:
            drought_score += 0.15
        elif gw_trend > 0.1:
            drought_score += 0.08
        if gw > 20:
            drought_score += 0.12
        elif gw > 12:
            drought_score += 0.06
        drought_prone = min(1.0, drought_score)

        scores = {
            "flood": flood_prone,
            "heatwave": heat_prone,
            "drought": drought_prone,
        }
        dominant = max(scores, key=scores.get)

        return {
            "flood_proneness": round(flood_prone, 3),
            "heatwave_proneness": round(heat_prone, 3),
            "drought_proneness": round(drought_prone, 3),
            "dominant_hazard": dominant,
        }
