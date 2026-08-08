"""
Propagate the risk fields join_hex_districts.py computes (RISK_COLS) from
india_hex_grid.geojson into india_hex_props.json -- the file the frontend
actually loads.

Why this exists: the two files have drifted apart over the project's life --
various downstream scripts (JJM integration, monthly climatology, NFHS-5
extras) patch props.json directly and were never back-ported to the geojson,
while join_hex_districts.py only ever writes the geojson. This script does
a narrow, safe sync: copies ONLY the RISK_COLS fields (the ones
compute_hex_risk() actually computes) by h3_id, leaving every other field in
props.json (JJM, WASH extras, seasonal/peak-month climatology, etc.)
untouched -- so re-running the core risk pipeline doesn't silently drop
fields other scripts added later.

Run: python scripts/sync_hex_risk_to_props.py
"""
import json
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from risk.hex_risk import RISK_COLS

ROOT = Path(__file__).resolve().parent.parent
HEX_GEO = ROOT / "client/public/data/india_hex_grid.geojson"
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"


def main():
    print(f"Loading {HEX_GEO}...")
    geo = json.loads(HEX_GEO.read_text())
    geo_by_h3 = {f["properties"]["h3_id"]: f["properties"] for f in geo["features"]}
    print(f"  {len(geo_by_h3)} hexes")

    print(f"Loading {HEX_PROPS}...")
    props = json.loads(HEX_PROPS.read_text())
    print(f"  {len(props)} hexes")

    updated = 0
    changed_fields: dict[str, int] = {c: 0 for c in RISK_COLS}
    missing = 0
    for p in props:
        h3_id = p["h3_id"]
        g = geo_by_h3.get(h3_id)
        if g is None:
            missing += 1
            continue
        any_change = False
        for col in RISK_COLS:
            if col not in g:
                continue
            if p.get(col) != g[col]:
                changed_fields[col] += 1
                any_change = True
            p[col] = g[col]
        if any_change:
            updated += 1

    print(f"\n{updated}/{len(props)} hexes had at least one changed risk field")
    if missing:
        print(f"  WARNING: {missing} props.json hexes had no matching geojson entry (unchanged)")
    print("\nChanged-value counts per field:")
    for col, n in sorted(changed_fields.items(), key=lambda kv: -kv[1]):
        if n:
            print(f"  {col:28s} {n:6d} hexes changed")

    HEX_PROPS.write_text(json.dumps(props, separators=(",", ":")))
    import os
    print(f"\nSaved {HEX_PROPS} ({os.path.getsize(HEX_PROPS)//1024//1024}MB)")


if __name__ == "__main__":
    main()
