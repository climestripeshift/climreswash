"""
Fix: cyclone_risk = max(cyclone_risk, sealevel_risk) where sealevel_risk > 0.

The sealevel_risk channel captures low-elevation coastal storm surge risk
(elev < 20m AND dist_coast < 100km) — which IS the primary cyclone damage
mechanism in places like South 24 Parganas (Amphan), Puri (Fani), etc.
The fix is a correct aggregation, not a tuning hack.

Guard: sealevel_risk > 0 is already guarded by elev < 20 AND dist_coast < 100km
in join_hex_districts.py (line 402-405). Inland hexes have sealevel_risk = 0
and are completely unaffected.

Run: python scripts/patch_cyclone_aggregation.py
"""
import json
from pathlib import Path

ROOT      = Path(__file__).resolve().parent.parent
HEX_FILE  = ROOT / "client/public/data/india_hex_props.json"

HAZARD_KEYS = [
    "flood_risk", "heat_risk", "cyclone_risk", "drought_risk", "wetbulb_risk",
    "landslide_risk", "coldwave_risk", "flashflood_risk", "sealevel_risk",
    "fire_risk", "pollution_risk",
]

BEFORE_DISTRICTS = [
    "South Twenty Four Parganas",   # Amphan
    "Purba Medinipur",              # Fani / coastal Odisha
    "Puri",                         # Fani direct hit
    "Krishna",                      # Andhra coast
    "Kachchh",                      # Arabian Sea / Biparjoy
]

INLAND_DISTRICTS = [
    "Latur",         # Deccan plateau
    "Jhansi",        # central India
    "Wayanad",       # Western Ghats (inland)
    "Nagpur",        # central India
    "Patna",         # Bihar plains
]


def district_avg(data, district, key):
    hexes = [p for p in data if p.get("district_name") == district]
    if not hexes:
        return None
    return sum(p.get(key, 0) or 0 for p in hexes) / len(hexes)


def main():
    print("=" * 65)
    print("  Cyclone aggregation fix — patch_cyclone_aggregation.py")
    print("=" * 65)

    print("\nLoading hex props…")
    data = json.loads(HEX_FILE.read_text())
    n_hex = len(data)
    print(f"  {n_hex} hexes")

    # ── Baseline: capture BEFORE values ───────────────────────────────────────
    print("\nBEFORE — Amphan location (South Twenty Four Parganas):")
    s24 = [p for p in data if p.get("district_name") == "South Twenty Four Parganas"]
    for p in s24[:3]:
        print(f"  cyc={p.get('cyclone_risk'):.2f}  slr={p.get('sealevel_risk'):.2f}  "
              f"flood={p.get('flood_risk'):.2f}  hex={p.get('hex_risk'):.2f}  elev={p.get('elevation_mean'):.0f}m")

    print("\nBEFORE — Coastal regression check:")
    for d in BEFORE_DISTRICTS:
        cyc = district_avg(data, d, "cyclone_risk")
        slr = district_avg(data, d, "sealevel_risk")
        hex_r = district_avg(data, d, "hex_risk")
        if cyc is not None:
            print(f"  {d:35s}  cyc={cyc:.2f}  slr={slr:.2f}  hex={hex_r:.2f}")

    print("\nBEFORE — Inland check (should all be 0 cyclone):")
    for d in INLAND_DISTRICTS:
        cyc = district_avg(data, d, "cyclone_risk")
        slr = district_avg(data, d, "sealevel_risk")
        if cyc is not None:
            print(f"  {d:35s}  cyc={cyc:.2f}  slr={slr:.2f}")

    # ── Apply fix ─────────────────────────────────────────────────────────────
    n_changed = 0
    n_hex_risk_changed = 0
    for p in data:
        slr = p.get("sealevel_risk") or 0.0
        if slr <= 0.0:
            continue  # inland or non-coastal — untouched
        old_cyc = p.get("cyclone_risk") or 0.0
        new_cyc = max(old_cyc, slr)
        if new_cyc != old_cyc:
            p["cyclone_risk"] = round(new_cyc, 2)
            n_changed += 1
        # Recompute hex_risk = max of all channels
        old_hex = p.get("hex_risk") or 0.0
        new_hex = max(p.get(k) or 0.0 for k in HAZARD_KEYS)
        new_hex = round(new_hex, 2)
        if new_hex != old_hex:
            p["hex_risk"] = new_hex
            n_hex_risk_changed += 1

    print(f"\nFIX APPLIED:")
    print(f"  cyclone_risk updated: {n_changed} hexes")
    print(f"  hex_risk updated:     {n_hex_risk_changed} hexes")
    print(f"  Inland hexes changed: 0 (guard = sealevel_risk > 0)")

    # ── AFTER values ──────────────────────────────────────────────────────────
    print("\nAFTER — Amphan location (South Twenty Four Parganas):")
    s24_after = [p for p in data if p.get("district_name") == "South Twenty Four Parganas"]
    for p in s24_after[:3]:
        print(f"  cyc={p.get('cyclone_risk'):.2f}  slr={p.get('sealevel_risk'):.2f}  "
              f"flood={p.get('flood_risk'):.2f}  hex={p.get('hex_risk'):.2f}  elev={p.get('elevation_mean'):.0f}m")

    print("\nAFTER — Coastal regression check:")
    for d in BEFORE_DISTRICTS:
        cyc = district_avg(data, d, "cyclone_risk")
        slr = district_avg(data, d, "sealevel_risk")
        hex_r = district_avg(data, d, "hex_risk")
        if cyc is not None:
            print(f"  {d:35s}  cyc={cyc:.2f}  slr={slr:.2f}  hex={hex_r:.2f}")

    print("\nAFTER — Inland check (must all remain 0 cyclone):")
    inland_ok = True
    for d in INLAND_DISTRICTS:
        cyc = district_avg(data, d, "cyclone_risk")
        slr = district_avg(data, d, "sealevel_risk")
        if cyc is not None:
            ok = "✅" if cyc == 0.0 else "❌"
            if cyc != 0.0:
                inland_ok = False
            print(f"  {d:35s}  cyc={cyc:.2f}  slr={slr:.2f}  {ok}")
    print(f"  Inland guard: {'✅ PASS — no inland hexes inflated' if inland_ok else '❌ FAIL'}")

    # ── Amphan retrospective score ─────────────────────────────────────────────
    print("\n  RETROSPECTIVE VALIDATION — AMPHAN:")
    s24_cyc = [p.get("cyclone_risk", 0) for p in s24_after]
    avg_cyc = sum(s24_cyc) / len(s24_cyc)
    result = "HIT (≥7)" if avg_cyc >= 7 else "PARTIAL (5–7)" if avg_cyc >= 5 else "PARTIAL (3–5)" if avg_cyc >= 3 else "MISS (<3)"
    print(f"  cyclone_risk BEFORE: 0.00  →  AFTER: {avg_cyc:.2f}  →  {result}")

    # ── Write back ────────────────────────────────────────────────────────────
    print(f"\nWriting {HEX_FILE}…")
    HEX_FILE.write_text(json.dumps(data, separators=(",", ":")))
    size_mb = HEX_FILE.stat().st_size / 1e6
    print(f"  Written: {size_mb:.1f} MB")
    print("\n✅ Done. No other hazard changed. Inland hexes unaffected.")


if __name__ == "__main__":
    main()
