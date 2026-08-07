"""
Attach village/hamlet/town names to each hex in the main India-wide H3 grid
(resolution 5, ~252 km²/hex, client/public/data/india_hex_props.json) --
NOT a resolution change and NOT a new risk computation. Each hex already
covers dozens to hundreds of real villages; this just lets you look up
which ones, it doesn't make the existing risk score any more granular than
it already is.

Source: data/raw/villages_osm_combined.geojson (from fetch_villages_osm.py,
OSM place=village|hamlet|town nodes, national -- a raw intermediate, not
committed). OSM's village coverage is real but not exhaustive --
volunteer-mapped, will always undercount the true ~6.4 lakh Census 2011
village total, unevenly by state.

Output: client/public/data/india_hex_villages.json -- {h3_id: {count,
villages: [{name, place, population}]}}, kept as its own lazy-loadable
file (not merged into india_hex_props.json) since most users won't need
it and it would otherwise bloat every hex-grid page load.

Run: python scripts/attach_villages_to_hexes.py
"""
import json
from collections import defaultdict
from pathlib import Path

import h3

ROOT = Path(__file__).resolve().parent.parent
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
VILLAGES = ROOT / "data/raw/villages_osm_combined.geojson"
OUT = ROOT / "client/public/data/india_hex_villages.json"

H3_RES = 5


def main():
    print(f"Loading {HEX_PROPS}...")
    hex_props = json.loads(HEX_PROPS.read_text())
    known_hexes = {p["h3_id"] for p in hex_props}
    print(f"  {len(known_hexes)} hexes in the main grid")

    print(f"Loading {VILLAGES}...")
    villages_gj = json.loads(VILLAGES.read_text())
    features = villages_gj["features"]
    print(f"  {len(features)} village/hamlet/town points")

    by_hex: dict[str, list[dict]] = defaultdict(list)
    outside_grid = 0
    no_coords = 0
    for f in features:
        coords = f["geometry"]["coordinates"]
        if coords[0] is None or coords[1] is None:
            no_coords += 1
            continue
        lon, lat = coords
        h3_id = h3.latlng_to_cell(lat, lon, H3_RES)
        if h3_id not in known_hexes:
            outside_grid += 1
            continue
        p = f["properties"]
        by_hex[h3_id].append({
            "name": p.get("name") or "(unnamed)",
            "place": p.get("place"),
            "population": int(p["population"]) if p.get("population") and str(p["population"]).isdigit() else None,
        })

    print(f"  {no_coords} skipped (missing coordinates)")
    print(f"  {outside_grid} fell outside the known hex grid (coastal/border edge cases)")
    print(f"  {len(by_hex)} hexes matched at least one village ({100*len(by_hex)/len(known_hexes):.1f}% of the grid)")

    total_villages = sum(len(v) for v in by_hex.values())
    print(f"  {total_villages} villages attached total")

    counts = sorted((len(v) for v in by_hex.values()), reverse=True)
    if counts:
        print(f"  villages per matched hex: max={counts[0]} median={counts[len(counts)//2]} min={counts[-1]}")

    out = {h3_id: {"count": len(vs), "villages": sorted(vs, key=lambda v: -(v["population"] or 0))}
           for h3_id, vs in by_hex.items()}

    OUT.write_text(json.dumps(out, separators=(",", ":")))
    import os
    print(f"\nSaved {OUT} ({os.path.getsize(OUT)//1024//1024}MB)")

    # per-state coverage summary -- how many of each state's hexes got at least one village
    print("\nPer-state hex coverage (hexes with >=1 village / total hexes in that state):")
    hexes_by_state: dict[str, list[str]] = defaultdict(list)
    for p in hex_props:
        hexes_by_state[p["state"]].append(p["h3_id"])
    rows = []
    for state, hids in hexes_by_state.items():
        matched = sum(1 for h in hids if h in by_hex)
        rows.append((state, matched, len(hids)))
    for state, matched, total in sorted(rows, key=lambda r: r[1] / r[2] if r[2] else 0):
        print(f"  {state:28s} {matched:5d} / {total:5d}  ({100*matched/total:.0f}%)")


if __name__ == "__main__":
    main()
