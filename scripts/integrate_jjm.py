"""
Patch india_hex_props.json with JJM IMIS FHTC district data.
Adds jjm_fhtc_pct to every hex that can be matched to a district.

Source: client/public/data/jjm_district_fhtc.json (keyed by UPPERCASE district)
Run:    python scripts/integrate_jjm.py
"""

import json
from pathlib import Path

ROOT      = Path(__file__).resolve().parent.parent
JJM_FILE  = ROOT / "client/public/data/jjm_district_fhtc.json"
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"


def normalize(name: str) -> str:
    return (name.upper().strip()
            .replace(" & ", " AND ")
            .replace("&", " AND ")
            .replace("-", " ")
            .replace("(", "").replace(")", "")
            .replace("  ", " "))


def main():
    print(f"Loading {JJM_FILE}...")
    jjm = json.loads(JJM_FILE.read_text())
    # Build lookup keyed by normalized name
    jjm_lookup = {normalize(k): v for k, v in jjm.items()}
    print(f"  {len(jjm_lookup)} JJM districts")

    print(f"Loading {HEX_PROPS}...")
    props = json.loads(HEX_PROPS.read_text())
    print(f"  {len(props)} hexes")

    matched = 0
    unmatched: set[str] = set()

    for p in props:
        district = p.get("district_name", "")
        if not district or district == "Unknown":
            continue

        norm = normalize(district)
        entry = jjm_lookup.get(norm)

        if not entry:
            # Try prefix match (handles spelling variants)
            for jjm_key, jjm_val in jjm_lookup.items():
                if norm[:6] == jjm_key[:6]:
                    entry = jjm_val
                    break

        if entry:
            p["jjm_fhtc_pct"] = entry["fhtc_pct"]
            matched += 1
        else:
            unmatched.add(district)

    print(f"\n  Matched: {matched}/{len(props)} hexes ({matched*100//len(props)}%)")
    print(f"  Unmatched districts ({len(unmatched)}): {sorted(unmatched)[:15]}")

    vals = [p["jjm_fhtc_pct"] for p in props if "jjm_fhtc_pct" in p]
    print(f"\n  FHTC range: {min(vals):.1f}% – {max(vals):.1f}%  (mean {sum(vals)/len(vals):.1f}%)")

    print(f"\nSaving {HEX_PROPS}...")
    HEX_PROPS.write_text(json.dumps(props, separators=(",", ":")))
    print(f"Done. {HEX_PROPS.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
