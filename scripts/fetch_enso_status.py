"""
Fetches the REAL, current ENSO (El Niño/La Niña) status from NOAA's Climate
Prediction Center -- what the El Niño page previously had zero of: any signal
on whether an El Niño is actually happening, vs. a purely hypothetical
"here's who'd be hit if it happens" vulnerability score.

Two free, public NOAA sources, no key:
  1. Oceanic Niño Index (ONI) -- plain ASCII table, updated monthly, the
     standard 3-month-running-mean SST anomaly in the Niño-3.4 region.
     https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt
  2. ENSO Diagnostic Discussion -- CPC's monthly official synopsis + alert
     level ("El Niño Advisory" / "La Niña Advisory" / "El Niño Watch" / etc.),
     HTML (no clean API for this one, so it's scraped -- fragile if NOAA
     changes their page layout, but it's the only source for the qualitative
     synopsis text and the forecast strength language ("90% chance of a very
     strong event" etc.) that a raw index number can't convey on its own.

Output: client/public/data/enso_status.json

Run: python scripts/fetch_enso_status.py
"""
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "client/public/data/enso_status.json"

ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
DISC_URL = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml"

# NOAA's own classification bands for ONI (3-month running mean, degrees C)
def classify(oni: float) -> str:
    if oni >= 2.0: return "very strong El Niño"
    if oni >= 1.5: return "strong El Niño"
    if oni >= 1.0: return "moderate El Niño"
    if oni >= 0.5: return "weak El Niño"
    if oni <= -2.0: return "very strong La Niña"
    if oni <= -1.5: return "strong La Niña"
    if oni <= -1.0: return "moderate La Niña"
    if oni <= -0.5: return "weak La Niña"
    return "ENSO-neutral"


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (ClimResWASH research fetch)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def parse_oni(text: str) -> list[dict]:
    rows = []
    for line in text.strip().split("\n")[1:]:  # skip header
        parts = line.split()
        if len(parts) != 4:
            continue
        season, year, sst, anom = parts
        try:
            rows.append({"season": season, "year": int(year), "sst": float(sst), "oni": float(anom)})
        except ValueError:
            continue
    return rows


def parse_discussion(html: str) -> dict:
    status_m = re.search(r"ENSO Alert System Status:.*?<span[^>]*>(.*?)</span>", html, re.DOTALL)
    status = re.sub(r"&ntilde;", "ñ", status_m.group(1)).strip() if status_m else None

    syn_m = re.search(r"<u>Synopsis:</u>&nbsp;<strong>\s*(.*?)\s*</strong>", html, re.DOTALL)
    synopsis = None
    if syn_m:
        synopsis = re.sub(r"&ntilde;", "ñ", syn_m.group(1))
        synopsis = re.sub(r"&#37;", "%", synopsis)
        synopsis = re.sub(r"&deg;", "°", synopsis)
        synopsis = re.sub(r"\s+", " ", synopsis).strip()

    next_m = re.search(r"next ENSO Diagnostics Discussion is scheduled for ([^.<]+)\.", html)
    next_update = next_m.group(1).strip() if next_m else None

    return {"alert_status": status, "synopsis": synopsis, "next_update": next_update}


def main():
    print("Fetching ONI index (NOAA CPC)...")
    oni_rows = parse_oni(fetch(ONI_URL))
    print(f"  {len(oni_rows)} seasons parsed, latest: {oni_rows[-1] if oni_rows else 'none'}")

    print("Fetching ENSO Diagnostic Discussion (NOAA CPC)...")
    try:
        disc = parse_discussion(fetch(DISC_URL))
        print(f"  alert_status={disc['alert_status']!r}")
    except Exception as e:
        print(f"  FAILED: {e} -- continuing with ONI-only status")
        disc = {"alert_status": None, "synopsis": None, "next_update": None}

    latest = oni_rows[-1] if oni_rows else None
    recent = oni_rows[-6:] if len(oni_rows) >= 6 else oni_rows

    out = {
        "source": "NOAA Climate Prediction Center -- Oceanic Niño Index + ENSO Diagnostic Discussion",
        "source_urls": [ONI_URL, DISC_URL],
        "generated": __import__("datetime").datetime.now().isoformat(),
        "latest_oni": latest,
        "latest_classification": classify(latest["oni"]) if latest else None,
        "recent_seasons": recent,
        "alert_status": disc["alert_status"],
        "synopsis": disc["synopsis"],
        "next_update": disc["next_update"],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"\nSaved {OUT}")
    if latest:
        print(f"Current: {latest['season']} {latest['year']}, ONI={latest['oni']:+.2f} -> {classify(latest['oni'])}")
    if disc["alert_status"]:
        print(f"NOAA alert status: {disc['alert_status']}")
    if disc["synopsis"]:
        print(f"Synopsis: {disc['synopsis']}")


if __name__ == "__main__":
    main()
