"""
Fetch real village boundary polygons (Survey of India, via the National
Water Data Portal) for all of India, to replace the OSM place-node
points used by attach_villages_to_hexes.py with authoritative
government geometry that carries real Gram Panchayat linkage.

Source: https://nwdp.nwic.gov.in/dataset/village-boundary -- one
GeoJSON zip per state/UT (35 total), each feature a village polygon with
name, LGD-style village code, Gram Panchayat name+code, block,
subdistrict, district, population/household counts, and (for many
villages) reported WASH infrastructure status (tap water, wells,
handpumps, drainage) -- real per-village data, a genuine upgrade over
OSM's name-only points.

Cache: data/raw/village_boundaries/<state_slug>.geojson (one file per
state, skipped if already present -- safe to re-run)
Output: this script only fetches + caches; attach_village_boundaries_to_hexes.py
does the per-hex aggregation from the cache.

Run: python scripts/fetch_village_boundaries.py [--states "Goa,Sikkim"]
"""
import argparse
import io
import re
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "data/raw/village_boundaries"
PAGE_URL = "https://nwdp.nwic.gov.in/dataset/village-boundary"

# Scraped once from the dataset page (state name -> GeoJSON zip download URL) -- the
# resource UUIDs aren't derivable from the state name, so this is a fixed lookup rather
# than something re-discovered on every run. If NWDP reorganizes the dataset, re-scrape
# PAGE_URL's "Village Boundary of <state>...GeoJSON" links, each followed a few links
# later by a "Download" link.
STATE_URLS = {
    "Andaman and Nicobar Islands": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/8ecd1271-1838-4413-9d9a-599b122a2e8a/download/vb_soi_an_geojson.zip",
    "Andhra Pradesh": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/80335829-b05e-4b0f-a920-91971a93bce1/download/vb_soi_ap_geojson.zip",
    "Arunachal Pradesh": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/e47e23ab-7f6a-432a-8218-aa7e778e170c/download/vb_soi_ar_geojson.zip",
    "Assam": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/bd9571d5-4874-4cfd-a78e-9d1fdddbe0b2/download/vb_soi_as_geojson.zip",
    "Bihar": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/6f68ad30-a395-4037-a64a-ff42b3fd5a25/download/vb_soi_br_geojson.zip",
    "Chhattisgarh": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/f91bf1e3-b973-46ae-9c5e-1a815a366f61/download/vb_soi_cg_geojson.zip",
    "Chandigarh": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/f7c76b46-75a6-4ab8-a64e-fe0764f20c55/download/vb_soi_ch_geojson.zip",
    "Dadra and Nagar Haveli and Daman and Diu": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/2f408b46-6b7b-4cd1-95e6-95b4101b0041/download/vb_soi_dh_dd_geojson.zip",
    "Delhi": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/634ff8c6-03e6-45d1-b1a1-fcc9cc4a6842/download/vb_soi_dl_geojson.zip",
    "Goa": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/1e2bab81-768d-475b-884c-3409d2b5dbd8/download/vb_soi_ga_geojson.zip",
    "Gujarat": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/4ce4dc83-fe99-4394-b4db-55b51554828c/download/vb_soi_gj_geojson.zip",
    "Himachal Pradesh": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/5e83ba19-b3bc-4dbc-be5f-33b0d229b1b3/download/vb_soi_hp_geojson.zip",
    "Haryana": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/534d7cd1-357e-4919-a672-a2eb77265f72/download/vb_soi_hr_geojson.zip",
    "Jharkhand": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/fb3b2f75-430c-4830-abec-5cec058b777d/download/vb_soi_jh_geojson.zip",
    "Jammu & Kashmir": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/c65985c9-8e44-45e1-9ade-a54e9c747b63/download/vb_soi_jk_geojson.zip",
    "Karnataka": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/1fd9b5a0-2a73-4404-9e45-7c1f3968e545/download/vb_soi_ka_geojson.zip",
    "Kerala": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/e7968f1b-b9dc-4d30-9f55-6dbefba9fff6/download/vb_soi_kl_geojson.zip",
    "Lakshadweep": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/d9e5840a-76cc-4456-88e6-b5d5c4bbab6d/download/vb_soi_ld_geojson.zip",
    "Ladakh": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/72cbc4f1-acb2-46d6-87b9-9496572318d4/download/vb_soi_lk_geojson.zip",
    "Maharashtra": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/41bc7681-d90c-4338-8fdc-35f5f98bc417/download/vb_soi_mh_geojson.zip",
    "Meghalaya": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/b11b4193-c185-477c-8eab-7e365f0bf751/download/vb_soi_ml_geojson.zip",
    "Manipur": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/dcb99b37-d358-481c-af8e-42ae64723511/download/vb_soi_mn_geojson.zip",
    "Madhya Pradesh": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/6312f443-cbb0-4bad-b889-daf09d45d39f/download/vb_soi_mp_geojson.zip",
    "Mizoram": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/d6c6f0f1-981b-4f31-8708-0c01e95637ed/download/vb_soi_mz_geojson.zip",
    "Nagaland": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/41739322-d899-4471-ba51-adf8cb44c622/download/vb_soi_nl_geojson.zip",
    "Odisha": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/8b78c6a6-1e58-485f-bb37-c7812fb93d18/download/vb_soi_or_geojson.zip",
    "Punjab": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/2d014771-e5ff-4ee4-8b3d-730daa2e0d88/download/vb_soi_pb_geojson.zip",
    "Puducherry": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/dd9cd307-f03a-49e1-8409-bad2d5568afc/download/vb_soi_py_geojson.zip",
    "Rajasthan": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/fac4d409-954a-477d-8124-6607fcbd5a74/download/vb_soi_rj_geojson.zip",
    "Sikkim": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/53071bb3-7403-4963-ace9-4f08ca1954ee/download/vb_soi_sk_geojson.zip",
    "Tamil Nadu": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/6ffc418d-317b-42e7-9191-26612a05f1ad/download/vb_soi_tn_geojson.zip",
    "Tripura": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/7a3a4855-2271-4f2b-a588-fd36d54e4af6/download/vb_soi_tr_geojson.zip",
    "Telangana": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/4e8ef6b2-d503-4258-b843-c342895d97de/download/vb_soi_ts_geojson.zip",
    "Uttar Pradesh": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/4756a27b-afc6-470f-af40-b418d830e298/download/vb_soi_up_geojson.zip",
    "West Bengal": "https://nwdp.nwic.gov.in/dataset/9bad17f2-9d88-428d-98ad-831ef01ae2e4/resource/1a8e4af1-42ad-4403-b116-3e8e6f357a88/download/vb_soi_wb_geojson.zip",
}
# Uttarakhand isn't in the current dataset listing (36th state/UT missing from NWDP as of
# this scrape) -- attach_village_boundaries_to_hexes.py falls back to OSM points there.


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def fetch_state(state: str, url: str, retries: int = 3) -> Path | None:
    out_path = CACHE_DIR / f"{slug(state)}.geojson"
    if out_path.exists() and out_path.stat().st_size > 0:
        return out_path

    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ClimResWASH/1.0"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                zip_bytes = resp.read()
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                geojson_names = [n for n in zf.namelist() if n.lower().endswith((".geojson", ".json"))]
                if not geojson_names:
                    print(f"    no .geojson in zip ({zf.namelist()})")
                    return None
                content = zf.read(geojson_names[0])
            out_path.write_bytes(content)
            return out_path
        except (urllib.error.URLError, urllib.error.HTTPError, zipfile.BadZipFile, OSError) as e:
            wait = 15 * (attempt + 1)
            print(f"    error ({e}), retrying in {wait}s...")
            time.sleep(wait)
    print(f"    giving up on {state} after {retries} retries")
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--states", help="Comma-separated state names to fetch (default: all)")
    args = ap.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    states = STATE_URLS
    if args.states:
        wanted = {s.strip() for s in args.states.split(",")}
        states = {k: v for k, v in STATE_URLS.items() if k in wanted}

    print(f"Fetching {len(states)} states...")
    ok, failed = 0, []
    for i, (state, url) in enumerate(states.items()):
        out_path = CACHE_DIR / f"{slug(state)}.geojson"
        if out_path.exists() and out_path.stat().st_size > 0:
            print(f"  [{i+1}/{len(states)}] {state}: cached ({out_path.stat().st_size//1024}KB)")
            ok += 1
            continue
        print(f"  [{i+1}/{len(states)}] {state}: fetching...", end=" ", flush=True)
        result = fetch_state(state, url)
        if result:
            print(f"done ({result.stat().st_size//1024}KB)")
            ok += 1
        else:
            failed.append(state)
        time.sleep(3)

    print(f"\nDone. {ok}/{len(states)} states fetched successfully.")
    if failed:
        print(f"Failed: {failed}")


if __name__ == "__main__":
    main()
