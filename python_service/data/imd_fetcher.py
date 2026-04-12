"""
Fetches weather data from IMD APIs.
Requires IP whitelisting — email IMD at mausam.imd.gov.in.
Falls back to Open-Meteo if IMD is unreachable.
"""
import requests
from config import IMD_APIS


def fetch_district_warnings(district_id=None):
    """
    Fetch 5-day weather warnings for all or specific district.

    Warning color codes: 1=Red, 2=Orange, 3=Yellow, 4=Green
    Warning codes:
      1=No Warning, 2=Heavy Rain, 3=Heavy Snow, 4=Thunderstorm,
      5=Hailstorm, 6=Dust Storm, 9=Heat Wave, 10=Hot Day,
      12=Cold Wave, 16=Very Heavy Rain, 17=Extremely Heavy Rain
    """
    url = IMD_APIS["district_warnings"]
    if district_id:
        url += f"?id={district_id}"

    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[IMD] District warnings fetch failed: {e}")
        return None


def fetch_district_rainfall(district_id=None):
    """
    Fetch actual vs normal rainfall.
    Departure categories: LE=Large Excess, E=Excess, N=Normal,
    D=Deficient, LD=Large Deficient, NR=No Rain
    """
    url = IMD_APIS["district_rainfall"]
    if district_id:
        url += f"?id={district_id}"

    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[IMD] District rainfall fetch failed: {e}")
        return None


def fetch_district_nowcast(district_id=None):
    """
    Fetch current nowcast for district.
    Color codes: 1=Green (safe), 2=Yellow, 3=Orange, 4=Red (severe)
    """
    url = IMD_APIS["district_nowcast"]
    if district_id:
        url += f"?id={district_id}"

    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[IMD] Nowcast fetch failed: {e}")
        return None


def parse_warning_to_hazards(warning_data):
    """
    Convert IMD warning codes to hazard probabilities.

    Color → probability:
      Red (1)    → 0.90
      Orange (2) → 0.65
      Yellow (3) → 0.35
      Green (4)  → 0.05
    """
    if not warning_data:
        return {"flood": 0, "heatwave": 0, "drought": 0}

    hazards = {"flood": 0.0, "heatwave": 0.0, "drought": 0.0}
    flood_codes = {2, 3, 16, 17}
    heat_codes = {9, 10, 11}
    color_prob = {1: 0.90, 2: 0.65, 3: 0.35, 4: 0.05}

    records = warning_data if isinstance(warning_data, list) else [warning_data]
    for record in records:
        for day in range(1, 6):
            day_key = f"Day_{day}"
            color_key = f"Day{day}_Color"
            if day_key not in record or color_key not in record:
                continue

            codes_str = str(record[day_key]).split(",")
            color = int(record.get(color_key, 4))
            prob = color_prob.get(color, 0.05)

            for code in codes_str:
                code = code.strip()
                if not code.isdigit():
                    continue
                code_int = int(code)
                if code_int in flood_codes:
                    hazards["flood"] = max(hazards["flood"], prob)
                elif code_int in heat_codes:
                    hazards["heatwave"] = max(hazards["heatwave"], prob)

    return hazards
