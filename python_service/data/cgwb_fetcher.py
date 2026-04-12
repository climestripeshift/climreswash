"""
CGWB Groundwater data.
22,965 observation wells measured 4 times/year.
Download once from India Data Portal and cache locally.

Sources:
- India Data Portal CSV: district-level depth-to-water-level
- India-WRIS: https://indiawris.gov.in/wris/#/
- CGWB portal: https://gwdata.cgwb.gov.in/
"""
import os
import csv
import requests
from config import CGWB_CSV_URL

CACHE_FILE = os.path.join(os.path.dirname(__file__), "cgwb_cache.csv")


def download_cgwb_data():
    """
    Download CGWB groundwater CSV (one-time, ~5MB).
    Columns: State, District, Well_Code, Lat, Long,
             Season, Year, Depth_to_Water_Level (meters)
    """
    if os.path.exists(CACHE_FILE):
        print("[CGWB] Using cached data")
        return True

    print("[CGWB] Downloading groundwater dataset...")
    try:
        resp = requests.get(CGWB_CSV_URL, timeout=60)
        resp.raise_for_status()
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        with open(CACHE_FILE, "w") as f:
            f.write(resp.text)
        print(f"[CGWB] Downloaded {len(resp.text)} bytes")
        return True
    except Exception as e:
        print(f"[CGWB] Download failed: {e}")
        return False


def get_district_gw_depth(district_name):
    """
    Get latest groundwater depth for a district (meters).
    Lower value = shallower = higher flood risk to pits.
    """
    if not os.path.exists(CACHE_FILE):
        download_cgwb_data()
    if not os.path.exists(CACHE_FILE):
        return None

    district_upper = district_name.upper()
    latest_depth = None
    latest_year = 0

    try:
        with open(CACHE_FILE, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if district_upper in str(row.get("District", "")).upper():
                    year = int(row.get("Year", 0) or 0)
                    depth = row.get("Depth_to_Water_Level", "")
                    if year > latest_year and depth:
                        try:
                            latest_depth = float(depth)
                            latest_year = year
                        except ValueError:
                            continue
    except Exception as e:
        print(f"[CGWB] Parse error: {e}")

    return latest_depth


def get_district_gw_trend(district_name):
    """
    Calculate long-term groundwater trend (m/year).
    Positive = deepening (water stress), negative = rising (flood risk).
    """
    if not os.path.exists(CACHE_FILE):
        download_cgwb_data()
    if not os.path.exists(CACHE_FILE):
        return None

    district_upper = district_name.upper()
    yearly_depths = {}

    try:
        with open(CACHE_FILE, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if district_upper in str(row.get("District", "")).upper():
                    year = int(row.get("Year", 0) or 0)
                    depth = row.get("Depth_to_Water_Level", "")
                    if year > 0 and depth:
                        try:
                            d = float(depth)
                            yearly_depths.setdefault(year, []).append(d)
                        except ValueError:
                            continue
    except Exception:
        return None

    if len(yearly_depths) < 3:
        return None

    avgs = sorted(
        [(y, sum(depths) / len(depths)) for y, depths in yearly_depths.items()]
    )
    if len(avgs) < 2:
        return None

    n = len(avgs)
    sum_x = sum(a[0] for a in avgs)
    sum_y = sum(a[1] for a in avgs)
    sum_xy = sum(a[0] * a[1] for a in avgs)
    sum_x2 = sum(a[0] ** 2 for a in avgs)

    denom = n * sum_x2 - sum_x ** 2
    if denom == 0:
        return 0.0

    slope = (n * sum_xy - sum_x * sum_y) / denom
    return round(slope, 3)
