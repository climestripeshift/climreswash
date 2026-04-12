"""
Configuration for ClimResWASH Early Warning System
"""

IMD_BASE = "https://mausam.imd.gov.in/api"
IMD_CITY_BASE = "https://city.imd.gov.in/api"

IMD_APIS = {
    "district_warnings": f"{IMD_BASE}/warnings_district_api.php",
    "district_rainfall": f"{IMD_BASE}/districtwise_rainfall_api.php",
    "district_nowcast": f"{IMD_BASE}/nowcast_district_api.php",
    "aws_data": f"{IMD_CITY_BASE}/aws_data_api.php",
    "city_forecast": f"{IMD_CITY_BASE}/cityweather_loc.php",
    "state_rainfall": f"{IMD_BASE}/statewise_rainfall_api.php",
    "district_rf_forecast": f"{IMD_BASE}/api_5d_statewisedistricts_rf_forecast.php",
    "basin_qpf": f"{IMD_BASE}/basin_qpf_api.php",
}

OPENMETEO_BASE = "https://api.open-meteo.com/v1"
OPENMETEO_FORECAST = f"{OPENMETEO_BASE}/forecast"
OPENMETEO_HISTORICAL = "https://archive-api.open-meteo.com/v1/archive"
OPENMETEO_FLOOD = "https://flood-api.open-meteo.com/v1/flood"

CGWB_CSV_URL = (
    "https://ckandev.indiadataportal.com/dataset/"
    "8ceb3cea-a8a9-4624-af75-fc92429d8fa5/resource/"
    "580a8f6e-3d86-4ca7-ac7d-cd5df12b443c/download/"
    "cgwb-changes-in-depth-to-water-level.csv"
)

THRESHOLDS = {
    "flood": {
        "rainfall_heavy_mm_day": 115.6,
        "rainfall_extreme_mm_day": 204.4,
        "river_level_warning_pct": 70,
        "river_level_danger_pct": 90,
        "gw_shallow_risk_m": 3.0,
        "rainfall_departure_excess_pct": 60,
    },
    "heatwave": {
        "temp_plains_c": 40,
        "temp_hills_c": 30,
        "departure_heatwave_c": 4.5,
        "departure_severe_c": 6.4,
        "temp_absolute_hw_c": 45,
        "temp_absolute_severe_c": 47,
    },
    "drought": {
        "rainfall_deficient_pct": -20,
        "rainfall_large_deficient_pct": -60,
        "consecutive_dry_days": 15,
        "gw_deep_stress_m": 15,
    },
}

FETCH_INTERVAL_HOURS = 3
LONG_TERM_UPDATE_DAYS = 30
PORT = 8080
