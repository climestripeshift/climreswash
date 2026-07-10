"""
Fetches real river discharge forecasts from GloFAS (via Open-Meteo flood API)
for 150+ strategic points along India's major rivers.

Outputs: client/public/data/river_forecast.json
"""
import json, time, urllib.request, urllib.parse
from datetime import datetime
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).parent.parent
OUT  = ROOT / "client/public/data/river_forecast.json"

# ── Major river sample points (lat, lon, river, district_hint) ──────────────
# Placed on main river channels — not cities, but the actual river course

RIVER_POINTS = [
    # ── GANGA MAIN STEM ──────────────────────────────────────────────────────
    (30.10, 78.30, "Ganga",       "Haridwar"),
    (29.95, 78.10, "Ganga",       "Haridwar"),
    (27.88, 78.08, "Ganga",       "Aligarh"),
    (27.18, 78.00, "Yamuna",      "Etawah"),
    (26.46, 80.35, "Ganga",       "Kanpur"),
    (25.45, 81.89, "Ganga",       "Prayagraj"),
    (25.30, 82.98, "Ganga",       "Varanasi"),
    (25.58, 85.10, "Ganga",       "Patna"),
    (25.37, 86.47, "Ganga",       "Bhagalpur"),
    (24.80, 87.92, "Ganga",       "Sahibganj"),
    (24.20, 88.35, "Ganga",       "Farakka"),
    (23.50, 88.55, "Ganga",       "Murshidabad"),
    (22.90, 88.40, "Hooghly",     "Hooghly"),
    (22.57, 88.35, "Hooghly",     "Kolkata"),

    # ── YAMUNA ───────────────────────────────────────────────────────────────
    (30.60, 77.80, "Yamuna",      "Dehradun"),
    (29.96, 77.55, "Yamuna",      "Saharanpur"),
    (28.66, 77.23, "Yamuna",      "Delhi"),
    (27.50, 77.68, "Yamuna",      "Mathura"),
    (25.45, 81.85, "Yamuna",      "Prayagraj"),

    # ── GHAGHRA / SARYU ──────────────────────────────────────────────────────
    (27.57, 81.60, "Ghaghra",     "Bahraich"),
    (27.20, 82.00, "Ghaghra",     "Gonda"),
    (26.77, 83.40, "Ghaghra",     "Gorakhpur"),
    (26.12, 84.63, "Ghaghra",     "Saran"),
    (25.78, 84.67, "Ghaghra",     "Saran"),

    # ── GANDAK ───────────────────────────────────────────────────────────────
    (27.00, 83.75, "Gandak",      "Kushinagar"),
    (26.47, 84.46, "Gandak",      "Champaran"),
    (25.92, 85.13, "Gandak",      "Muzaffarpur"),

    # ── KOSI ─────────────────────────────────────────────────────────────────
    (26.90, 87.17, "Kosi",        "Supaul"),
    (26.53, 87.28, "Kosi",        "Madhepura"),
    (25.87, 87.07, "Kosi",        "Saharsa"),

    # ── BRAHMAPUTRA ──────────────────────────────────────────────────────────
    (27.48, 94.90, "Brahmaputra", "Dibrugarh"),
    (27.00, 94.20, "Brahmaputra", "Jorhat"),
    (26.73, 93.80, "Brahmaputra", "Golaghat"),
    (26.33, 92.77, "Brahmaputra", "Nagaon"),
    (26.18, 91.73, "Brahmaputra", "Kamrup"),
    (26.10, 90.50, "Brahmaputra", "Barpeta"),
    (26.08, 89.87, "Brahmaputra", "Dhubri"),

    # ── BARAK ────────────────────────────────────────────────────────────────
    (24.82, 92.80, "Barak",       "Cachar"),
    (24.47, 92.42, "Barak",       "Hailakandi"),

    # ── MAHANADI ─────────────────────────────────────────────────────────────
    (21.90, 83.20, "Mahanadi",    "Raigarh"),
    (21.47, 83.97, "Mahanadi",    "Sambalpur"),
    (20.47, 85.88, "Mahanadi",    "Cuttack"),
    (20.25, 86.47, "Mahanadi",    "Kendrapara"),

    # ── GODAVARI ─────────────────────────────────────────────────────────────
    (19.96, 73.80, "Godavari",    "Nashik"),
    (19.88, 77.30, "Godavari",    "Nanded"),
    (18.97, 79.60, "Godavari",    "Adilabad"),
    (17.97, 79.60, "Godavari",    "Karimnagar"),
    (17.27, 81.77, "Godavari",    "Rajamahendravaram"),
    (16.78, 81.80, "Godavari",    "Konaseema"),

    # ── KRISHNA ──────────────────────────────────────────────────────────────
    (17.67, 73.97, "Krishna",     "Satara"),
    (17.07, 75.87, "Krishna",     "Sangli"),
    (16.58, 77.60, "Krishna",     "Raichur"),
    (16.52, 80.61, "Krishna",     "Krishna"),
    (16.10, 81.10, "Krishna",     "Krishna"),

    # ── KAVERI ───────────────────────────────────────────────────────────────
    (12.43, 76.57, "Kaveri",      "Mysuru"),
    (11.43, 77.70, "Kaveri",      "Salem"),
    (10.77, 79.12, "Kaveri",      "Thanjavur"),

    # ── NARMADA ──────────────────────────────────────────────────────────────
    (22.87, 78.57, "Narmada",     "Mandla"),
    (22.30, 77.30, "Narmada",     "Hoshangabad"),
    (22.17, 75.78, "Narmada",     "Khargone"),
    (21.78, 73.02, "Narmada",     "Bharuch"),

    # ── TAPI ─────────────────────────────────────────────────────────────────
    (21.13, 77.30, "Tapi",        "Akola"),
    (21.12, 74.78, "Tapi",        "Jalgaon"),
    (21.17, 72.83, "Tapi",        "Surat"),

    # ── SABARMATI ────────────────────────────────────────────────────────────
    (23.00, 72.57, "Sabarmati",   "Gandhinagar"),
    (22.32, 72.62, "Sabarmati",   "Anand"),

    # ── MAHI ─────────────────────────────────────────────────────────────────
    (22.77, 74.03, "Mahi",        "Vadodara"),

    # ── DAMODAR ──────────────────────────────────────────────────────────────
    (23.75, 86.40, "Damodar",     "Dhanbad"),
    (23.37, 87.50, "Damodar",     "Paschim Bardhaman"),
    (23.10, 88.07, "Damodar",     "Hooghly"),

    # ── SUBARNAREKHA ─────────────────────────────────────────────────────────
    (22.80, 85.83, "Subarnarekha","Jharsuguda"),
    (22.22, 86.92, "Subarnarekha","Balasore"),

    # ── BHIMA ────────────────────────────────────────────────────────────────
    (18.52, 74.00, "Bhima",       "Pune"),
    (17.37, 76.82, "Bhima",       "Solapur"),

    # ── TUNGABHADRA ──────────────────────────────────────────────────────────
    (15.33, 76.47, "Tungabhadra", "Ballari"),
    (15.17, 76.83, "Tungabhadra", "Koppal"),

    # ── PERIYAR ──────────────────────────────────────────────────────────────
    (10.22, 76.62, "Periyar",     "Ernakulam"),

    # ── SUTLEJ / BEAS / RAVI ─────────────────────────────────────────────────
    (31.32, 75.58, "Sutlej",      "Ludhiana"),
    (30.93, 75.85, "Sutlej",      "Ludhiana"),
    (30.90, 74.55, "Sutlej",      "Ferozepur"),
    (31.52, 74.52, "Beas",        "Amritsar"),
    (32.10, 75.80, "Ravi",        "Pathankot"),

    # ── CHAMBAL ──────────────────────────────────────────────────────────────
    (25.98, 76.57, "Chambal",     "Morena"),
    (26.47, 79.20, "Chambal",     "Etawah"),

    # ── BETWA ────────────────────────────────────────────────────────────────
    (25.47, 78.57, "Betwa",       "Jhansi"),

    # ── SON ──────────────────────────────────────────────────────────────────
    (23.47, 81.88, "Son",         "Rewa"),
    (25.18, 83.98, "Son",         "Rohtas"),

    # ── PENNAR ───────────────────────────────────────────────────────────────
    (14.47, 77.65, "Pennar",      "Anantapuramu"),

    # ── VAIGAI ───────────────────────────────────────────────────────────────
    (9.92,  78.12, "Vaigai",      "Madurai"),

    # ── INDUS TRIBUTARIES (Indian side) ──────────────────────────────────────
    (34.08, 77.58, "Indus",       "Leh"),
    (33.72, 74.87, "Jhelum",      "Baramulla"),
    (33.50, 75.20, "Jhelum",      "Anantnag"),
]

# ── Fetch GloFAS data ────────────────────────────────────────────────────────

def fetch_point(lat, lon):
    params = urllib.parse.urlencode({
        "latitude": lat, "longitude": lon,
        "daily": "river_discharge,river_discharge_p25,river_discharge_p75",
        "forecast_days": 7, "past_days": 1,
    })
    url = f"https://flood-api.open-meteo.com/v1/flood?{params}"
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}

def classify(discharge, p25, p75):
    if discharge is None or p75 is None: return "unknown"
    spread = max((p75 - (p25 or 0)), 1)
    if discharge > p75 + spread * 2:   return "extreme"
    if discharge > p75 + spread * 1:   return "danger"
    if discharge > p75:                 return "warning"
    if discharge > (p25 or 0):         return "elevated"
    return "normal"

# ── Main ────────────────────────────────────────────────────────────────────

print(f"Fetching {len(RIVER_POINTS)} river points…")
results = []
errors  = 0

for i, (lat, lon, river, district) in enumerate(RIVER_POINTS):
    data = fetch_point(lat, lon)
    if "error" in data:
        print(f"  [{i+1}] ERROR {river}/{district}: {data['error']}")
        errors += 1
        time.sleep(0.5)
        continue

    daily = data.get("daily", {})
    dates = daily.get("time", [])
    disc  = daily.get("river_discharge", [])
    p25s  = daily.get("river_discharge_p25", [])
    p75s  = daily.get("river_discharge_p75", [])

    if not disc or all(d is None for d in disc):
        continue

    today_idx = 1  # past_days=1, so index 1 is today
    days_out = []
    max_severity = "normal"
    severity_order = ["normal","elevated","warning","danger","extreme","unknown"]

    for j, (dt, dv, p2, p7) in enumerate(zip(dates, disc, p25s, p75s)):
        if dv is None: continue
        sev = classify(dv, p2, p7)
        days_out.append({
            "date": dt,
            "discharge": round(dv, 1),
            "p25": round(p2, 1) if p2 else None,
            "p75": round(p7, 1) if p7 else None,
            "severity": sev,
        })
        if severity_order.index(sev) > severity_order.index(max_severity):
            max_severity = sev

    if not days_out: continue

    results.append({
        "lat": lat, "lon": lon,
        "river": river, "location": district,
        "current_discharge": days_out[today_idx]["discharge"] if len(days_out) > today_idx else days_out[0]["discharge"],
        "current_severity": days_out[today_idx]["severity"] if len(days_out) > today_idx else days_out[0]["severity"],
        "max_severity_7d": max_severity,
        "days": days_out,
    })

    if (i+1) % 20 == 0:
        print(f"  {i+1}/{len(RIVER_POINTS)} done…")
    time.sleep(0.12)  # ~8 req/sec, well under limits

# Summary
sev_counts = defaultdict(int)
for r in results:
    sev_counts[r["max_severity_7d"]] += 1

print(f"\nFetched {len(results)} points ({errors} errors)")
print("7-day severity summary:")
for sev in ["extreme","danger","warning","elevated","normal"]:
    if sev_counts[sev]:
        print(f"  {sev}: {sev_counts[sev]} points")

# Top alerts
alerts = [r for r in results if r["max_severity_7d"] in ("extreme","danger","warning")]
alerts.sort(key=lambda x: ["normal","elevated","warning","danger","extreme"].index(x["max_severity_7d"]), reverse=True)
print("\nTop alerts:")
for a in alerts[:10]:
    print(f"  {a['river']} @ {a['location']}: {a['max_severity_7d'].upper()} ({a['current_discharge']:.0f} m³/s)")

# Filter out points not on major rivers (p75 < 20 means we hit a small tributary)
def max_p75(pt):
    return max((d.get("p75") or 0) for d in pt["days"])

valid = [r for r in results if max_p75(r) >= 20]
print(f"\nValid river points (p75 ≥ 20 m³/s): {len(valid)} / {len(results)}")

sev_counts2 = defaultdict(int)
for r in valid:
    sev_counts2[r["max_severity_7d"]] += 1

out = {
    "generated": datetime.utcnow().isoformat() + "Z",
    "points": valid,
    "summary": dict(sev_counts2),
}
OUT.write_text(json.dumps(out, separators=(",",":"), ensure_ascii=False))
print(f"Wrote {OUT} ({OUT.stat().st_size//1024} KB)")
