"""
Compute real slope and distance-to-water for each hex using H3 neighbors.

Slope: max elevation difference to any of 6 neighbors ÷ hex edge distance.
Distance to water: haversine to nearest hex with land_use == 'water'.

Run: python scripts/compute_slope_water.py
"""
import json
import math
from pathlib import Path

import h3

ROOT     = Path(__file__).resolve().parent.parent
PROPS    = ROOT / "client/public/data/india_hex_props.json"
H3_RES   = 5
HEX_EDGE_KM = 15.1  # approximate edge length for H3 res 5


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(min(1, math.sqrt(a)))


def main():
    print(f"Loading {PROPS}...")
    with open(PROPS) as f:
        props_list = json.load(f)
    print(f"  {len(props_list)} hexes")

    # Build lookup: h3_id → props
    by_id: dict[str, dict] = {}
    for p in props_list:
        by_id[p["h3_id"]] = p

    # Precompute centroids for water hexes (for distance calculation)
    print("Finding water hexes...")
    water_hexes = []
    for p in props_list:
        if p.get("land_use") == "water":
            boundary = h3.cell_to_boundary(p["h3_id"])
            lat = sum(b[0] for b in boundary) / len(boundary)
            lon = sum(b[1] for b in boundary) / len(boundary)
            water_hexes.append((lat, lon))
    print(f"  {len(water_hexes)} water hexes")

    # Compute slope and distance to water for each hex
    print("Computing slope + distance to water...")
    updated = 0
    for i, p in enumerate(props_list):
        h3_id = p["h3_id"]
        elev = float(p.get("elevation_mean", 0) or 0)

        # ── Slope: max elevation diff to neighbors ──
        neighbors = h3.grid_disk(h3_id, 1)
        max_diff = 0
        for nb in neighbors:
            if nb == h3_id:
                continue
            nb_props = by_id.get(nb)
            if nb_props:
                nb_elev = float(nb_props.get("elevation_mean", 0) or 0)
                diff = abs(elev - nb_elev)
                if diff > max_diff:
                    max_diff = diff
        slope_deg = math.degrees(math.atan(max_diff / (HEX_EDGE_KM * 1000))) if max_diff > 0 else 0
        p["slope_deg"] = round(slope_deg, 2)

        # ── Distance to nearest water hex ──
        if p.get("land_use") == "water":
            p["dist_water_m"] = 0
        elif water_hexes:
            boundary = h3.cell_to_boundary(h3_id)
            lat = sum(b[0] for b in boundary) / len(boundary)
            lon = sum(b[1] for b in boundary) / len(boundary)
            min_dist = float("inf")
            for wlat, wlon in water_hexes:
                d = haversine_km(lat, lon, wlat, wlon)
                if d < min_dist:
                    min_dist = d
                if d < 20:
                    break  # close enough, skip rest
            p["dist_water_m"] = round(min_dist * 1000)
        else:
            p["dist_water_m"] = 50000

        updated += 1
        if (i + 1) % 2000 == 0 or i == len(props_list) - 1:
            print(f"  [{i+1}/{len(props_list)}]")

    # Stats
    slopes = [p["slope_deg"] for p in props_list]
    dists = [p["dist_water_m"] for p in props_list]
    print(f"\nResults:")
    print(f"  slope_deg:     {min(slopes):.2f} – {max(slopes):.2f} (mean {sum(slopes)/len(slopes):.2f})")
    print(f"  dist_water_m:  {min(dists)} – {max(dists)} (mean {sum(dists)//len(dists)})")

    print(f"Saving {PROPS}...")
    with open(PROPS, "w") as f:
        json.dump(props_list, f, separators=(",", ":"))

    import os
    print(f"Done. Size: {os.path.getsize(PROPS) // 1024} KB")


if __name__ == "__main__":
    main()
