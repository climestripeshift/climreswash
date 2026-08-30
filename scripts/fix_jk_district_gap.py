"""
Fixes the 294 Jammu & Kashmir hexes (of 441 total -- two thirds of the state)
whose district_name is the literal string "DATA NOT AVAILABLE".

What this actually is (see chat): NOT a join_hex_districts.py bug. The
original india.json district atlas (735 districts, HAZARD/EXPOSURE/
VULNERABILITY/RISK per district) has one row for J&K (ID=63) whose NAME was
never filled in. Its polygon -- bounds lon 72.5-77.8, lat 32.8-37.1, and
confirmed via Census 2011 boundaries (data/india_districts_census.geojson,
which independently has the SAME unnamed residual polygon, near-identical
bbox and area) to have ZERO area overlap with any of J&K's 20 real
Census-administered districts -- turns out to be Pakistan/China-administered
territory (Azad Kashmir + Gilgit-Baltistan): median hex centroid here sits at
~35.5N, ~74.9E, squarely between Muzaffarabad (34.37N 73.47E), Gilgit
(35.92N 74.31E) and Skardu (35.30N 75.68E), nowhere near Leh (34.16N 77.58E)
or Kargil (34.56N 76.13E). India's official map draws this territory as part
of J&K/Ladakh state, but no Indian district government, Census, or NFHS
survey exists for it -- "DATA NOT AVAILABLE" was, in that narrow sense,
already true. The actual bug is just the confusing label: it reads like a
pipeline error, not "this hex is outside India's administrative data
systems," and it swallows a real, fixable minority of hexes along the LoC
border that genuinely do sit inside a real Indian district's polygon.

Two real fixes, not one:
1. Recovery: hex-polygon "intersects" join against the REAL (non-placeholder)
   Census 2011 district polygons. 26 of 294 hexes turn out to sit inside a
   real Indian district after all (border hexes straddling the LoC) --
   Leh(ladakh), Kargil, Punch, Kupwara, Bandipore, Baramula, Rajouri. These
   get their real district name.
2. Honest relabel: the remaining 268 (confirmed to have zero overlap with
   any real Census district) get relabeled from the ambiguous "DATA NOT
   AVAILABLE" to a clear, neutral, factually-scoped label -- stating that no
   Indian administrative data source covers this area, not making any claim
   about who the territory belongs to.

Updates both india_hex_props.json (what every page actually reads) and
india_hex_grid.geojson (used by the data-pipeline scripts), so both stay in
sync as they already must for every other field.

Run: python scripts/fix_jk_district_gap.py
"""
import json
from pathlib import Path

import geopandas as gpd
import h3
from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parent.parent
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
HEX_GEO = ROOT / "client/public/data/india_hex_grid.geojson"
CENSUS = ROOT / "data/india_districts_census.geojson"

OLD_LABEL = "DATA NOT AVAILABLE"
NEW_LABEL = "Outside India's administrative districts (Pakistan/China-administered Kashmir)"

# Harmonize Census 2011's spelling to what this platform's own J&K district
# list already uses elsewhere (see DISTRICT_ALIASES in
# compute_nfhs6_district_trends.py -- these are the same real districts).
CENSUS_NAME_FIX = {
    "Leh (ladakh)": "Leh(Ladakh)",
}


def main():
    hexes = json.loads(HEX_PROPS.read_text())
    target = [h for h in hexes if h.get("district_name") == OLD_LABEL]
    print(f"Hexes currently labeled {OLD_LABEL!r}: {len(target)}")
    if not target:
        print("Nothing to do.")
        return

    census = gpd.read_file(str(CENSUS))
    census_real = census[census["Dist_name"] != "Data Not Available"][["Dist_name", "geometry"]]

    rows = []
    for h in target:
        boundary = h3.cell_to_boundary(h["h3_id"])
        rows.append({"h3_id": h["h3_id"], "geometry": Polygon([(lon, lat) for lat, lon in boundary])})
    hex_gdf = gpd.GeoDataFrame(rows, geometry=[r["geometry"] for r in rows], crs="EPSG:4326")

    joined = gpd.sjoin(hex_gdf, census_real, how="left", predicate="intersects")
    # A hex can straddle the LoC and intersect a real district only at a
    # sliver -- pick the district with the LARGEST actual overlap area, not
    # just the first match, so a border hex is assigned to whichever side it
    # mostly sits in.
    best_by_hex: dict[str, tuple[str, float]] = {}
    census_geom = dict(zip(census_real["Dist_name"], census_real.geometry))
    for _, row in joined.iterrows():
        if not isinstance(row.get("Dist_name"), str):
            continue
        hex_poly = hex_gdf.loc[hex_gdf["h3_id"] == row["h3_id"], "geometry"].iloc[0]
        overlap = hex_poly.intersection(census_geom[row["Dist_name"]]).area
        cur = best_by_hex.get(row["h3_id"])
        if cur is None or overlap > cur[1]:
            best_by_hex[row["h3_id"]] = (row["Dist_name"], overlap)

    recovered = {h3id: CENSUS_NAME_FIX.get(name, name) for h3id, (name, _) in best_by_hex.items()}
    print(f"Recovered a real district for {len(recovered)}/{len(target)} hexes via Census 2011 boundaries:")
    from collections import Counter
    for name, n in Counter(recovered.values()).most_common():
        print(f"    {name}: {n}")
    print(f"Relabeling the remaining {len(target) - len(recovered)} to the honest label (no real district applies).")

    def patch(records):
        n_recovered = n_relabeled = 0
        for h in records:
            if h.get("district_name") != OLD_LABEL:
                continue
            h3id = h.get("h3_id")
            if h3id in recovered:
                h["district_name"] = recovered[h3id]
                n_recovered += 1
            else:
                h["district_name"] = NEW_LABEL
                n_relabeled += 1
        return n_recovered, n_relabeled

    n_r, n_l = patch(hexes)
    print(f"india_hex_props.json: {n_r} recovered, {n_l} relabeled")
    HEX_PROPS.write_text(json.dumps(hexes, separators=(",", ":")))

    geo = json.loads(HEX_GEO.read_text())
    n_r2, n_l2 = patch([f["properties"] for f in geo["features"]])
    print(f"india_hex_grid.geojson: {n_r2} recovered, {n_l2} relabeled")
    HEX_GEO.write_text(json.dumps(geo, separators=(",", ":")))

    print(f"\nSaved {HEX_PROPS} and {HEX_GEO}")


if __name__ == "__main__":
    main()
