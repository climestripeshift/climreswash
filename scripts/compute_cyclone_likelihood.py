"""
Compute cyclone likelihood per hex from IBTrACS or geographic mock.
If IBTrACS CSV missing → MOCK MODE based on coastal proximity + Bay of Bengal.

Run: python scripts/compute_cyclone_likelihood.py
"""
import csv
import json
import math
import random
from pathlib import Path

import h3

ROOT      = Path(__file__).resolve().parent.parent
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
IBTRACS   = ROOT / "data/raw/cyclone/IBTrACS.NI.list.v04r00.csv"
TRACK_RADIUS_KM = 150
REFERENCE_ANNUAL = 0.5  # track every 2 years = likelihood 1.0
YEARS_RANGE = (1981, 2020)


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(min(1, math.sqrt(a)))


def mock_cyclone_likelihood(lat, lon, elev, dist_coast_est):
    """Bay of Bengal coast high, Arabian Sea moderate, inland zero."""
    if dist_coast_est > 300000 or elev > 500:
        return 0.0
    # Bay of Bengal side (east coast)
    if lon > 80 and lat < 22:
        base = 0.7 * math.exp(-dist_coast_est / 100000)
    elif lon > 85 and lat < 24:  # Bengal/Odisha
        base = 0.6 * math.exp(-dist_coast_est / 100000)
    # Arabian Sea (west coast)
    elif lon < 74 and lat < 22:
        base = 0.3 * math.exp(-dist_coast_est / 100000)
    else:
        base = 0.1 * math.exp(-dist_coast_est / 50000)
    return round(min(1.0, max(0, base + random.uniform(-0.03, 0.03))), 3)


def main():
    random.seed(42)

    print(f"Loading {HEX_PROPS}...")
    with open(HEX_PROPS) as f:
        props = json.load(f)
    print(f"  {len(props)} hexes")

    if IBTRACS.exists():
        print(f"REAL MODE — reading {IBTRACS.name}...")
        # Parse IBTrACS: extract unique track points (SID + lat/lon)
        tracks = {}  # SID → list of (lat, lon)
        with open(IBTRACS) as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    year = int(row.get("SEASON", "0"))
                    if year < YEARS_RANGE[0] or year > YEARS_RANGE[1]:
                        continue
                    sid = row.get("SID", "")
                    lat = float(row.get("LAT", "0"))
                    lon = float(row.get("LON", "0"))
                    if 5 < lat < 35 and 65 < lon < 100:
                        if sid not in tracks:
                            tracks[sid] = []
                        tracks[sid].append((lat, lon))
                except (ValueError, KeyError):
                    continue
        print(f"  {len(tracks)} cyclone tracks in {YEARS_RANGE[0]}-{YEARS_RANGE[1]}")

        n_years = YEARS_RANGE[1] - YEARS_RANGE[0] + 1
        for p in props:
            boundary = h3.cell_to_boundary(p["h3_id"])
            clat = sum(b[0] for b in boundary) / len(boundary)
            clon = sum(b[1] for b in boundary) / len(boundary)

            near_tracks = 0
            for sid, points in tracks.items():
                for tlat, tlon in points:
                    if haversine_km(clat, clon, tlat, tlon) <= TRACK_RADIUS_KM:
                        near_tracks += 1
                        break

            annual_freq = near_tracks / n_years
            p["cyclone_likelihood"] = round(min(1.0, annual_freq / REFERENCE_ANNUAL), 3)
    else:
        print("⚠️  MOCK MODE — IBTrACS CSV not found in data/raw/cyclone/")
        print("   Download from https://www.ncei.noaa.gov/products/international-best-track-archive")
        print("   Generating geographically-plausible mock cyclone likelihoods...\n")

        for p in props:
            boundary = h3.cell_to_boundary(p["h3_id"])
            lat = sum(b[0] for b in boundary) / len(boundary)
            lon = sum(b[1] for b in boundary) / len(boundary)
            elev = float(p.get("elevation_mean", 200) or 200)
            dist_coast = float(p.get("dist_water_m", 100000) or 100000)
            # Rough coastal distance estimate for mock
            if elev < 30: dist_est = 10000
            elif elev < 100: dist_est = 50000
            elif elev < 300: dist_est = 150000
            else: dist_est = 500000
            p["cyclone_likelihood"] = mock_cyclone_likelihood(lat, lon, elev, dist_est)

    # Stats
    vals = [p.get("cyclone_likelihood", 0) for p in props]
    print(f"  cyclone_likelihood: {min(vals):.3f} – {max(vals):.3f} (mean {sum(vals)/len(vals):.3f})")
    above_zero = sum(1 for v in vals if v > 0.01)
    print(f"  {above_zero} hexes with cyclone_likelihood > 0.01")

    print(f"\nSaving {HEX_PROPS}...")
    with open(HEX_PROPS, "w") as f:
        json.dump(props, f, separators=(",", ":"))

    import os
    print(f"Done. {os.path.getsize(HEX_PROPS) // 1024} KB")


if __name__ == "__main__":
    main()
