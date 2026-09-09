"""
Patches india_hex_props.json with real_sand_pct.

Why this exists (see chat, real_sand_pct sync-gap audit): fetch_soilgrids_sand.py
already fetched real ISRIC SoilGrids sand% for all 12,705 hexes (cached in
client/public/data/hex_soil_sand.json), and join_hex_districts.py already
merges it into india_hex_grid.geojson -- but nothing ever propagated it into
india_hex_props.json, the file the frontend actually loads. Unlike
slope_deg/dist_water_m (written directly by compute_slope_water.py) or
dist_to_river_km (patched by the dedicated fetch_river_distance.py), real_sand_pct
never got its own props.json patcher. sync_hex_risk_to_props.py doesn't cover
it either -- that script deliberately syncs only RISK_COLS (computed risk
outputs), not raw geographic inputs like this one. This is that same missing
one-off patcher, same pattern as fetch_river_distance.py's "Patches
india_hex_props.json with X" convention -- a pure local JSON merge, no
network fetch needed since hex_soil_sand.json already has the real data.

Run: python scripts/sync_soil_sand_to_props.py
"""
import json
import os
from pathlib import Path

ROOT       = Path(__file__).resolve().parent.parent
HEX_PROPS  = ROOT / "client/public/data/india_hex_props.json"
SOIL_SAND  = ROOT / "client/public/data/hex_soil_sand.json"


def main():
    print(f"Loading {SOIL_SAND}...")
    soil_map = json.loads(SOIL_SAND.read_text())
    print(f"  {len(soil_map)} hexes with real sand%")

    print(f"Loading {HEX_PROPS}...")
    props = json.loads(HEX_PROPS.read_text())
    print(f"  {len(props)} hexes")

    updated = 0
    missing = 0
    for p in props:
        sand = soil_map.get(p["h3_id"])
        if sand is None:
            missing += 1
            continue
        if p.get("real_sand_pct") != sand:
            updated += 1
        p["real_sand_pct"] = sand

    print(f"\n{updated}/{len(props)} hexes got a real_sand_pct value")
    if missing:
        print(f"  {missing} hexes had no match in hex_soil_sand.json (kept as-is)")

    print(f"Saving {HEX_PROPS}...")
    HEX_PROPS.write_text(json.dumps(props, separators=(",", ":")))
    print(f"  Saved ({os.path.getsize(HEX_PROPS) // 1024}KB)")


if __name__ == "__main__":
    main()
