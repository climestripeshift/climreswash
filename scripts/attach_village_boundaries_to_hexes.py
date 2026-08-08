"""
Attach real village boundary data (Survey of India, via NWDP -- see
fetch_village_boundaries.py) to hexes, replacing the OSM-point-based
india_hex_villages.json with a richer version built from authoritative
government polygons: real Gram Panchayat name/code, block/district
hierarchy, and actual population/household counts (OSM had names only,
population was almost always null).

For each village polygon, we use its centroid to decide which hex it
belongs to (same H3-cell-of-centroid approach as attach_villages_to_hexes.py
used for OSM points) -- res-5 hexes are ~252 sq km, comfortably larger
than a single village, so centroid assignment is accurate except for a
small number of edge-straddling villages, same caveat as the OSM version.

Coverage: NWDP has 35/36 states+UTs (Uttarakhand is missing from the
dataset as of this scrape). For hexes with zero SoI villages -- Uttarakhand,
plus any hex the SoI centroids happened to miss -- we fall back to the
existing OSM-based india_hex_villages.json so coverage doesn't regress.

Cache: none needed beyond fetch_village_boundaries.py's data/raw cache
(this script streams each state file once per run; re-run is cheap enough
not to need its own resumability).
Output: client/public/data/india_hex_villages.json (h3_id -> {count,
source, villages: [[name, gp, gp_code, block, district, population,
households], ...]})  -- villages list capped per hex, sorted by
population descending (biggest/most relevant show first in the UI), and
each village a positional array rather than a keyed object: with a
national total near 640K villages the repeated JSON key names alone
would add ~50MB versus this compact form (measured: 88.8MB keyed vs
37.6MB positional at the same per-hex cap) -- frontend maps the array
back to named fields at render time. A village's source ("soi" vs the
OSM fallback) is inferable from `district` being non-null -- SoI
records always set it, OSM fallback records never do.

Run: python scripts/attach_village_boundaries_to_hexes.py
"""
import json
from pathlib import Path

import h3
import ijson
from pyproj import Transformer
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data/raw/village_boundaries"
OSM_VILLAGES = ROOT / "data/raw/india_hex_villages_osm_backup.json"
OUT = ROOT / "client/public/data/india_hex_villages.json"

H3_RES = 5
MAX_VILLAGES_PER_HEX = 300

# All 35 NWDP village-boundary files are in EPSG:7755 ("WGS 84 / India NSF LCC", a
# projected CRS in meters, false name notwithstanding -- verified via each file's own
# "crs" header, not assumed) -- must reproject centroids to WGS84 lon/lat before H3
# lookups, or every village lands in a wildly wrong (essentially random) hex.
TO_WGS84 = Transformer.from_crs("EPSG:7755", "EPSG:4326", always_xy=True)

# A handful of villages per state are unresolved administrative placeholders, not real
# villages -- e.g. Ladakh/J&K/Arunachal border areas with "Data Partially Available" and
# a sentinel vlcode of 999999. Real village records never look like this.
PLACEHOLDER_NAMES = {"data partially available", "data not available", "na", "n/a", "-"}


def clean_key(k: str) -> str:
    return k.strip()


def clean_val(v):
    if isinstance(v, str):
        v = v.strip()
        return v if v not in ("", " ") else None
    return v


def num(v):
    v = clean_val(v)
    if v is None:
        return None
    try:
        n = float(v)
        return int(n) if n == int(n) else n
    except (TypeError, ValueError):
        return None


def process_state(path: Path, hex_villages: dict) -> tuple[int, int]:
    n_features, n_no_geom = 0, 0
    with open(path, "rb") as f:
        for feat in ijson.items(f, "features.item"):
            n_features += 1
            geom = feat.get("geometry")
            if not geom or not geom.get("coordinates"):
                n_no_geom += 1
                continue
            props = {clean_key(k): v for k, v in feat.get("properties", {}).items()}

            name = clean_val(props.get("village"))
            vlcode = clean_val(props.get("vlcode"))
            if not name or name.strip().lower() in PLACEHOLDER_NAMES or vlcode == "999999":
                n_no_geom += 1
                continue

            try:
                centroid = shape(geom).centroid  # centroid in native EPSG:7755 meters
                lon, lat = TO_WGS84.transform(centroid.x, centroid.y)
            except Exception:
                n_no_geom += 1
                continue
            if not (6 < lat < 38 and 66 < lon < 98):  # sanity bound: India's extent
                n_no_geom += 1
                continue

            h3_id = h3.latlng_to_cell(lat, lon, H3_RES)

            record = {
                "name": name,
                "gp": clean_val(props.get("gram_panchayat_name")),
                "gp_code": clean_val(props.get("gram_panchayat_code")),
                "block": clean_val(props.get("block")),
                "district": clean_val(props.get("district")),
                "population": num(props.get("total_population_village")),
                "households": num(props.get("total_households")),
                "source": "soi",
            }
            hex_villages.setdefault(h3_id, []).append(record)
    return n_features, n_no_geom


def main():
    state_files = sorted(RAW_DIR.glob("*.geojson"))
    print(f"Found {len(state_files)} state files")

    hex_villages: dict[str, list] = {}
    total_features, total_no_geom = 0, 0
    for i, path in enumerate(state_files):
        print(f"  [{i+1}/{len(state_files)}] {path.stem}...", end=" ", flush=True)
        nf, ng = process_state(path, hex_villages)
        total_features += nf
        total_no_geom += ng
        print(f"{nf} villages ({ng} skipped)")

    print(f"\nTotal: {total_features} villages, {total_no_geom} skipped (no name/geometry)")
    print(f"Hexes with >=1 SoI village: {len(hex_villages)}")

    # Fall back to OSM data for hexes SoI didn't cover (Uttarakhand + any gaps)
    print(f"\nLoading OSM fallback from {OSM_VILLAGES}...")
    osm_data = json.loads(OSM_VILLAGES.read_text()) if OSM_VILLAGES.exists() else {}
    osm_fallback_hexes = 0
    for h3_id, entry in osm_data.items():
        if h3_id in hex_villages:
            continue
        osm_fallback_hexes += 1
        hex_villages[h3_id] = [
            {
                "name": v.get("name"),
                "gp": None,
                "gp_code": None,
                "block": None,
                "district": None,
                "population": v.get("population"),
                "households": None,
                "source": "osm",
            }
            for v in entry.get("villages", [])
        ]
    print(f"  {osm_fallback_hexes} hexes filled from OSM fallback")

    # Build final output: sort by population desc, cap list length, keep true count.
    # Each village serialized as a positional array (name, gp, gp_code, block, district,
    # population, households) -- see module docstring for why, versus a keyed object.
    result = {}
    for h3_id, villages in hex_villages.items():
        villages.sort(key=lambda v: v["population"] or 0, reverse=True)
        sources = {v["source"] for v in villages}
        result[h3_id] = {
            "count": len(villages),
            "source": "soi" if sources == {"soi"} else ("osm" if sources == {"osm"} else "mixed"),
            "villages": [
                [v["name"], v["gp"], v["gp_code"], v["block"], v["district"], v["population"], v["households"]]
                for v in villages[:MAX_VILLAGES_PER_HEX]
            ],
        }

    print(f"\nTotal hexes with village data: {len(result)}")
    counts = [v["count"] for v in result.values()]
    print(f"  villages/hex: min {min(counts)}, max {max(counts)}, mean {sum(counts)/len(counts):.1f}")

    OUT.write_text(json.dumps(result, separators=(",", ":")))
    import os
    print(f"\nSaved {OUT} ({os.path.getsize(OUT)/1024/1024:.1f}MB)")


if __name__ == "__main__":
    main()
