"""
Fetch India river network from OSM Overpass API.
Compute distance from each H3 hex centroid to nearest major river (km).
Patches india_hex_props.json with dist_to_river_km.
Saves a simplified river overlay to client/public/data/india_rivers.geojson.

Cache: data/raw/india_rivers_osm.json (one-time ~30MB download)
Run:   python scripts/fetch_river_distance.py
"""
import json
import math
import time
import urllib.parse
import urllib.request
from pathlib import Path

import h3
import numpy as np
from scipy.spatial import KDTree

ROOT        = Path(__file__).resolve().parent.parent
HEX_PROPS   = ROOT / "client/public/data/india_hex_props.json"
CACHE_FILE  = ROOT / "data/raw/india_rivers_osm.json"
OVERLAY_OUT = ROOT / "client/public/data/india_rivers.geojson"

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# waterway=river gives main channels; excludes streams, canals, drains
OVERPASS_QUERY = """
[out:json][timeout:240];
(
  way["waterway"="river"](6.0,68.0,38.0,98.0);
);
out geom;
"""


def fetch_osm():
    if CACHE_FILE.exists():
        print(f"Using cached OSM data: {CACHE_FILE} ({CACHE_FILE.stat().st_size // 1024}KB)")
        with open(CACHE_FILE) as f:
            return json.load(f)

    print("Fetching India rivers from OSM Overpass API (~20-40MB, one-time download)...")
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    encoded = urllib.parse.urlencode({"data": OVERPASS_QUERY}).encode()
    req = urllib.request.Request(
        OVERPASS_URL,
        data=encoded,
        headers={"User-Agent": "ClimResWASH/1.0 (climate-resilient-WASH-India-research)"},
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=260) as resp:
        raw = resp.read()
    print(f"  Downloaded {len(raw) // 1024}KB in {time.time()-t0:.0f}s")
    with open(CACHE_FILE, "wb") as f:
        f.write(raw)
    return json.loads(raw)


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(min(1.0, a)))


def main():
    # ── 1. Fetch / load OSM data ────────────────────────────────────────────
    data = fetch_osm()
    elements = data.get("elements", [])
    print(f"  {len(elements)} river way segments")

    # ── 2. Extract nodes + build simplified overlay ──────────────────────────
    all_nodes = []          # (lat, lon) for every node — KDTree input
    overlay_features = []   # simplified per-way GeoJSON features for display

    for el in elements:
        if el.get("type") != "way" or "geometry" not in el:
            continue
        geom = el["geometry"]   # list of {lat, lon} dicts

        # Collect all nodes for distance computation
        for pt in geom:
            all_nodes.append((pt["lat"], pt["lon"]))

        # Simplified overlay: keep every 4th node (rivers are densely sampled)
        coords = [[pt["lon"], pt["lat"]] for pt in geom[::4]]
        if len(coords) < 2:
            coords = [[pt["lon"], pt["lat"]] for pt in geom]

        tags = el.get("tags", {})
        overlay_features.append({
            "type": "Feature",
            "properties": {
                "name": tags.get("name", ""),
                "name_en": tags.get("name:en", ""),
            },
            "geometry": {"type": "LineString", "coordinates": coords},
        })

    print(f"  {len(all_nodes):,} river nodes extracted")
    print(f"  {len(overlay_features)} ways for overlay")

    # ── 3. Save simplified river overlay ────────────────────────────────────
    overlay = {"type": "FeatureCollection", "features": overlay_features}
    with open(OVERLAY_OUT, "w") as f:
        json.dump(overlay, f, separators=(",", ":"))
    import os
    print(f"  Overlay saved: {OVERLAY_OUT} ({os.path.getsize(OVERLAY_OUT) // 1024}KB)")

    # ── 4. Build KDTree (flat-earth approx, valid within India's lat range) ─
    # Convert to approx Cartesian: scale lon by cos(mean_lat) to equalise degrees
    mean_lat = sum(n[0] for n in all_nodes) / len(all_nodes)
    cos_lat = math.cos(math.radians(mean_lat))
    node_arr = np.array([[lat, lon * cos_lat] for lat, lon in all_nodes])
    tree = KDTree(node_arr)
    all_nodes_arr = np.array(all_nodes)  # original lat/lon for haversine

    # ── 5. Load hex props ───────────────────────────────────────────────────
    print(f"\nLoading {HEX_PROPS}...")
    with open(HEX_PROPS) as f:
        props = json.load(f)
    print(f"  {len(props)} hexes")

    # ── 6. Compute distance for each hex centroid ───────────────────────────
    print("Computing hex→river distances...")
    t0 = time.time()
    for i, p in enumerate(props):
        if i % 2000 == 0 and i > 0:
            elapsed = time.time() - t0
            eta = elapsed / i * (len(props) - i)
            print(f"  {i}/{len(props)}  ETA {eta:.0f}s")

        boundary = h3.cell_to_boundary(p["h3_id"])
        clat = sum(b[0] for b in boundary) / len(boundary)
        clng = sum(b[1] for b in boundary) / len(boundary)

        # Nearest node in scaled degree-space
        dd, idx = tree.query([clat, clng * cos_lat], k=1)
        rlat, rlon = all_nodes_arr[idx]
        p["dist_to_river_km"] = round(haversine_km(clat, clng, rlat, rlon), 1)

    print(f"  Done in {time.time()-t0:.0f}s")

    # ── 7. Save patched hex props ────────────────────────────────────────────
    print(f"Saving patched hex props...")
    with open(HEX_PROPS, "w") as f:
        json.dump(props, f, separators=(",", ":"))
    print(f"  Saved ({os.path.getsize(HEX_PROPS) // 1024}KB)")

    # ── 8. Stats ─────────────────────────────────────────────────────────────
    dists = [p["dist_to_river_km"] for p in props]
    mean_d = sum(dists) / len(dists)
    print(f"\nResults:")
    print(f"  mean dist to river : {mean_d:.1f} km")
    print(f"  max dist to river  : {max(dists):.1f} km")
    print(f"  <5 km  : {sum(1 for d in dists if d < 5):4d} hexes  ({100*sum(1 for d in dists if d < 5)/len(dists):.0f}%)")
    print(f"  <20 km : {sum(1 for d in dists if d < 20):4d} hexes  ({100*sum(1 for d in dists if d < 20)/len(dists):.0f}%)")
    print(f"  <50 km : {sum(1 for d in dists if d < 50):4d} hexes  ({100*sum(1 for d in dists if d < 50)/len(dists):.0f}%)")
    print(f"  >100km : {sum(1 for d in dists if d > 100):4d} hexes  ({100*sum(1 for d in dists if d > 100)/len(dists):.0f}%)")


if __name__ == "__main__":
    main()
