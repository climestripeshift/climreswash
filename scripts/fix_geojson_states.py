#!/usr/bin/env python3
"""
Fix incorrect STATE assignments in india.json.

The GeoJSON has correct geometry but the STATE attribute was assigned
alphabetically. This script re-derives each district's state from its
centroid using priority-ordered bounding boxes + multi-anchor Voronoi.

Run from project root:
    python3 scripts/fix_geojson_states.py
"""
from __future__ import annotations
import json, math, shutil
from pathlib import Path

# ── Multiple anchor points per state (used for Voronoi tiebreaking) ──────────
# Multi-anchor approach avoids single-capital bias for large/elongated states.
ANCHORS: list[tuple[str, float, float]] = [
    # (state_name, lat, lon)
    # Andaman & Nicobar
    ("Andaman And Nicobar Islands", 11.67, 92.73),
    # Andhra Pradesh
    ("Andhra Pradesh", 16.51, 80.52),
    ("Andhra Pradesh", 14.47, 80.00),
    # Arunachal Pradesh
    ("Arunachal Pradesh", 27.08, 93.60),
    ("Arunachal Pradesh", 28.50, 95.00),
    # Assam — multiple anchors because eastern Assam is far from Guwahati
    ("Assam", 26.14, 91.74),
    ("Assam", 27.50, 95.00),   # eastern Assam near Dibrugarh/Tinsukia
    # Bihar
    ("Bihar", 25.61, 85.14),
    ("Bihar", 25.20, 87.00),
    # Chandigarh UT
    ("Chandigarh", 30.74, 76.79),
    # Chhattisgarh
    ("Chhattisgarh", 21.25, 81.63),
    ("Chhattisgarh", 19.00, 82.00),
    # Dadra & NH + D&D
    ("Dadra & Nagar Haveli And Daman & Diu", 20.40, 72.83),
    # Delhi
    ("Delhi", 28.66, 77.21),
    # Goa
    ("Goa", 15.50, 73.83),
    # Gujarat
    ("Gujarat", 23.22, 72.65),
    ("Gujarat", 22.00, 70.50),
    # Haryana — western Haryana far from Chandigarh
    ("Haryana", 29.06, 76.09),
    ("Haryana", 28.50, 75.70),
    # Himachal Pradesh
    ("Himachal Pradesh", 31.10, 77.17),
    ("Himachal Pradesh", 32.00, 76.50),
    # Jammu And Kashmir
    ("Jammu And Kashmir", 34.09, 74.80),
    ("Jammu And Kashmir", 33.70, 75.50),
    # Jharkhand
    ("Jharkhand", 23.36, 85.33),
    # Karnataka
    ("Karnataka", 12.97, 77.56),
    ("Karnataka", 15.00, 75.50),
    # Kerala
    ("Kerala", 8.52, 76.94),
    ("Kerala", 11.25, 75.80),
    # Ladakh
    ("Ladakh", 34.15, 77.58),
    ("Ladakh", 33.50, 79.00),
    # Lakshadweep
    ("Lakshadweep", 10.57, 72.64),
    # Madhya Pradesh — very large state, multiple anchors
    ("Madhya Pradesh", 23.26, 77.41),
    ("Madhya Pradesh", 22.00, 75.00),
    ("Madhya Pradesh", 24.00, 80.00),
    ("Madhya Pradesh", 26.20, 78.20),  # northern MP near Gwalior/Bhind/Morena
    # Maharashtra
    ("Maharashtra", 19.07, 72.87),
    ("Maharashtra", 20.50, 78.00),
    # Manipur
    ("Manipur", 24.82, 93.94),
    # Meghalaya
    ("Meghalaya", 25.57, 91.88),
    # Mizoram
    ("Mizoram", 23.73, 92.72),
    # Nagaland
    ("Nagaland", 25.67, 94.11),
    # Odisha
    ("Odisha", 20.30, 85.82),
    ("Odisha", 21.50, 84.00),
    # Puducherry
    ("Puducherry", 11.93, 79.83),
    # Punjab
    ("Punjab", 30.90, 75.86),
    ("Punjab", 31.50, 74.90),
    # Rajasthan — large state; eastern anchors to beat western UP Voronoi
    ("Rajasthan", 26.91, 75.79),
    ("Rajasthan", 28.50, 73.00),
    ("Rajasthan", 25.00, 74.00),
    ("Rajasthan", 27.22, 77.00),   # eastern Rajasthan near Bharatpur/Dholpur
    # Sikkim
    ("Sikkim", 27.33, 88.61),
    # Tamil Nadu
    ("Tamil Nadu", 13.08, 80.27),
    ("Tamil Nadu", 10.50, 77.50),
    # Telangana
    ("Telangana", 17.36, 78.48),
    # Tripura
    ("Tripura", 23.83, 91.28),
    # Uttar Pradesh — enormous state, many anchors
    ("Uttar Pradesh", 26.85, 80.95),   # Lucknow
    ("Uttar Pradesh", 27.18, 78.01),   # western UP near Agra
    ("Uttar Pradesh", 27.90, 78.10),   # Aligarh belt
    ("Uttar Pradesh", 28.35, 77.50),   # NCR fringe (Bulandshahr area)
    ("Uttar Pradesh", 25.50, 82.00),   # eastern UP near Varanasi
    ("Uttar Pradesh", 26.00, 83.50),   # far eastern UP
    # Uttarakhand
    ("Uttarakhand", 30.32, 78.03),
    ("Uttarakhand", 29.50, 79.50),
    # West Bengal
    ("West Bengal", 22.57, 88.36),
    ("West Bengal", 26.00, 88.50),
]


# ── Priority-ordered bounding boxes ───────────────────────────────────────────
# Checked in order; FIRST match goes to Voronoi among matched states.
# Smaller/distinct regions listed first.
BOUNDS: list[tuple[str, float, float, float, float]] = [
    # (state, lat_min, lat_max, lon_min, lon_max)

    # --- Islands ---
    ("Lakshadweep",                           8.00, 12.60, 71.50, 74.30),
    ("Andaman And Nicobar Islands",           6.50, 13.70, 92.20, 94.00),

    # --- Tiny UTs (very tight bounds) ---
    # Chandigarh UT proper: only the 1 Chandigarh district (30.67-30.78N, 76.72-76.90E)
    ("Chandigarh",                           30.65, 30.82, 76.71, 76.92),
    ("Delhi",                                28.40, 28.90, 76.84, 77.40),
    ("Goa",                                  14.85, 15.80, 73.85, 74.40),
    ("Dadra & Nagar Haveli And Daman & Diu", 19.90, 20.75, 72.55, 73.25),
    ("Puducherry",                           10.70, 12.15, 79.55, 80.35),
    ("Sikkim",                               27.05, 28.20, 87.85, 88.95),
    ("Ladakh",                               33.00, 36.30, 75.80, 80.35),

    # --- Northeast (lon > 89.5) ---
    # Tripura is isolated in the south (tight box)
    ("Tripura",                              22.80, 24.60, 91.10, 92.40),
    # Mizoram south of Manipur
    ("Mizoram",                              21.85, 24.10, 92.15, 93.55),
    ("Manipur",                              23.70, 25.75, 92.90, 94.85),
    ("Nagaland",                             25.05, 27.10, 93.15, 95.40),
    # Arunachal Pradesh: lat_min raised to reduce Assam overlap
    ("Arunachal Pradesh",                    26.50, 29.60, 91.40, 97.50),
    # Meghalaya south of Assam, lat 24.9-26.2
    ("Meghalaya",                            24.90, 26.25, 89.70, 92.90),
    # Assam covers 24-28.3N, 89.6-96E — must come AFTER all NE specifics
    ("Assam",                                24.00, 28.40, 89.60, 96.20),

    # --- South ---
    ("Kerala",                               8.20,  12.90, 74.80, 77.55),
    ("Tamil Nadu",                           8.00,  13.60, 76.10, 80.50),
    ("Telangana",                            15.70, 20.00, 77.10, 81.45),
    ("Andhra Pradesh",                       12.35, 20.00, 76.55, 84.80),
    ("Karnataka",                            11.50, 18.60, 73.80, 78.75),

    # --- West ---
    ("Gujarat",                              20.00, 24.85, 68.05, 74.65),

    # --- East ---
    ("West Bengal",                          21.40, 27.50, 85.70, 89.95),
    ("Odisha",                               17.70, 22.70, 81.30, 87.60),
    # Jharkhand: restrict lon to avoid Bihar overlap (Jharkhand west of ~87.5)
    ("Jharkhand",                            21.80, 25.45, 83.15, 87.60),
    # Bihar: tighten western bound to 84E to avoid eating eastern UP
    ("Bihar",                                24.20, 27.65, 84.00, 88.20),

    # --- Central ---
    ("Chhattisgarh",                         17.70, 24.20, 80.10, 84.55),
    ("Madhya Pradesh",                       21.00, 26.95, 73.90, 82.90),

    # --- North (order matters for overlaps) ---
    # Uttarakhand: lon_min 77.90 excludes Saharanpur/Muzaffarnagar (UP plains)
    ("Uttarakhand",                          28.60, 31.30, 77.90, 81.25),
    ("Himachal Pradesh",                     30.30, 33.35, 75.45, 79.10),
    ("Jammu And Kashmir",                    32.15, 37.20, 73.65, 80.55),
    ("Punjab",                               29.40, 32.65, 73.80, 76.98),
    # Haryana: restrict east boundary to avoid Delhi/UP overlap
    ("Haryana",                              27.60, 31.05, 74.40, 77.65),
    # Rajasthan: restrict east boundary to ~77.5 to avoid western UP
    ("Rajasthan",                            22.90, 30.30, 69.40, 77.50),
    ("Uttar Pradesh",                        23.80, 30.55, 76.50, 84.80),
    ("Maharashtra",                          15.50, 22.20, 72.50, 81.05),
]


def centroid(geom: dict) -> tuple[float, float]:
    if geom["type"] == "Polygon":
        pts = geom["coordinates"][0]
    elif geom["type"] == "MultiPolygon":
        pts = geom["coordinates"][0][0]
    else:
        return (0.0, 0.0)
    lons = [p[0] for p in pts]; lats = [p[1] for p in pts]
    return (sum(lats) / len(lats), sum(lons) / len(lons))


def nearest_anchor(lat: float, lon: float, candidates: list[str] | None = None) -> str:
    """Return the state whose closest anchor is nearest to (lat, lon).
    If candidates is given, only consider those states."""
    best, best_d = "", float("inf")
    for (state, alat, alon) in ANCHORS:
        if candidates and state not in candidates:
            continue
        d = math.hypot(lat - alat, lon - alon)
        if d < best_d:
            best_d, best = d, state
    return best


def assign_state(lat: float, lon: float) -> str:
    matches = list(dict.fromkeys(  # preserve order, deduplicate
        name for name, lat_min, lat_max, lon_min, lon_max in BOUNDS
        if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max
    ))
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        return nearest_anchor(lat, lon, candidates=matches)
    # No bounding box → global Voronoi
    return nearest_anchor(lat, lon)


def main():
    src = Path("client/public/data/india.json")
    bak = src.with_suffix(".json.bak")
    if src.with_suffix(".json.bak").exists():
        # Restore from original backup for a clean re-run
        shutil.copy(bak, src)
        print(f"Restored from backup {bak}")
    else:
        shutil.copy(src, bak)
        print(f"Backed up to {bak}")

    with open(src) as f:
        geo = json.load(f)

    features = geo["features"]
    changes = 0
    state_counts: dict[str, int] = {}

    for feat in features:
        lat, lon = centroid(feat["geometry"])
        new_state = assign_state(lat, lon)
        old_state = feat["properties"].get("STATE", "")
        if new_state != old_state:
            changes += 1
        feat["properties"]["STATE"] = new_state
        state_counts[new_state] = state_counts.get(new_state, 0) + 1

    with open(src, "w") as f:
        json.dump(geo, f, separators=(",", ":"))

    print(f"Fixed {changes}/{len(features)} state assignments.\n")
    print("Districts per state (expected count in parentheses):")
    expected = {
        "Andaman And Nicobar Islands": 3,
        "Andhra Pradesh": 26, "Arunachal Pradesh": 25, "Assam": 35,
        "Bihar": 38, "Chandigarh": 1, "Chhattisgarh": 28,
        "Dadra & Nagar Haveli And Daman & Diu": 5,
        "Delhi": 11, "Goa": 2, "Gujarat": 35, "Haryana": 22,
        "Himachal Pradesh": 12, "Jammu And Kashmir": 20, "Jharkhand": 24,
        "Karnataka": 30, "Kerala": 14, "Ladakh": 2, "Lakshadweep": 1,
        "Madhya Pradesh": 52, "Maharashtra": 36, "Manipur": 16,
        "Meghalaya": 12, "Mizoram": 11, "Nagaland": 12, "Odisha": 30,
        "Puducherry": 4, "Punjab": 22, "Rajasthan": 33, "Sikkim": 4,
        "Tamil Nadu": 32, "Telangana": 33, "Tripura": 8, "Uttar Pradesh": 75,
        "Uttarakhand": 13, "West Bengal": 23,
    }
    for s, c in sorted(state_counts.items()):
        exp = expected.get(s, "?")
        flag = " ✓" if isinstance(exp, int) and abs(c - exp) <= 3 else f" (expected ~{exp})"
        print(f"  {s}: {c}{flag}")


if __name__ == "__main__":
    main()
