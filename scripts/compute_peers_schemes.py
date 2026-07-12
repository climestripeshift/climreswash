"""
Generates:
  client/public/data/peer_districts.json   — top-5 peer districts per district
  client/public/data/scheme_coverage.json  — relevant schemes per district
"""
import json
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).parent.parent
DM_PATH  = ROOT / "client/public/data/decision_matrix.json"
HP_PATH  = ROOT / "client/public/data/india_hex_props.json"
WQ_PATH  = ROOT / "client/public/data/wash_quality.json"
OUT_PEERS   = ROOT / "client/public/data/peer_districts.json"
OUT_SCHEMES = ROOT / "client/public/data/scheme_coverage.json"

dm = json.loads(DM_PATH.read_text())
hp = json.loads(HP_PATH.read_text())
wq = json.loads(WQ_PATH.read_text()) if WQ_PATH.exists() else {}

# ── Build district-level hex aggregates (stunting, anaemia, risk scores) ──────
hex_agg: dict[str, dict] = {}
dagg: dict[str, list] = defaultdict(list)
for h in hp:
    d = h.get("district_name")
    if d: dagg[d].append(h)

def avg_field(hexes, field):
    vals = [h[field] for h in hexes if h.get(field) is not None]
    return sum(vals)/len(vals) if vals else None

for dist, hexes in dagg.items():
    hex_agg[dist] = {
        "stunting_pct":  avg_field(hexes, "wash_stunting_pct"),
        "anaemia_pct":   avg_field(hexes, "wash_anaemia_pct"),
        "flood_risk":    avg_field(hexes, "flood_risk"),
        "heat_risk":     avg_field(hexes, "heat_risk"),
        "drought_risk":  avg_field(hexes, "drought_risk"),
        "gw_stress":     avg_field(hexes, "gw_stress_score"),
        "pm25":          avg_field(hexes, "pm25_annual"),
        "jjm_fhtc_hex":  avg_field(hexes, "jjm_fhtc_pct"),
    }

# ── Build full district record ─────────────────────────────────────────────────
by_name: dict[str, dict] = {}
for r in dm:
    d = r["district"]
    ha = hex_agg.get(d, {})
    wqe = wq.get(d, {})
    by_name[d] = {
        **r,
        "stunting_pct":  ha.get("stunting_pct"),
        "anaemia_pct":   ha.get("anaemia_pct"),
        "flood_risk":    ha.get("flood_risk"),
        "heat_risk":     ha.get("heat_risk"),
        "drought_risk":  ha.get("drought_risk"),
        "gw_stress":     ha.get("gw_stress"),
        "pm25":          ha.get("pm25"),
        "contaminants":  wqe.get("contaminants", []),
    }

districts = list(by_name.values())

# ── Peer matching ──────────────────────────────────────────────────────────────

PEER_METRICS = [
    # (field, weight)  — lower distance is better
    ("risk",              2.0),
    ("adaptive_capacity", 1.5),
    ("wash_sanitation_pct", 1.0),
    ("jjm_fhtc_pct",     0.8),
    ("menstrual_hygiene_pct", 0.6),
    ("stunting_pct",     0.6),
    ("anaemia_pct",      0.5),
]

def normalise(districts, field):
    vals = [d[field] for d in districts if d.get(field) is not None]
    if not vals: return {}
    mn, mx = min(vals), max(vals)
    span = mx - mn or 1
    return {d["district"]: (d[field] - mn) / span for d in districts if d.get(field) is not None}

norms = {field: normalise(districts, field) for field, _ in PEER_METRICS}

def peer_score(a: dict, b: dict) -> float:
    """Lower is more similar."""
    total_w = 0
    dist = 0
    for field, w in PEER_METRICS:
        na = norms[field].get(a["district"])
        nb = norms[field].get(b["district"])
        if na is not None and nb is not None:
            dist += w * abs(na - nb)
            total_w += w
    return dist / total_w if total_w else 1.0

def best_performer(peers: list[dict], metric: str, higher_better: bool = True) -> dict | None:
    valid = [p for p in peers if p.get(metric) is not None]
    if not valid: return None
    return max(valid, key=lambda p: p[metric]) if higher_better else min(valid, key=lambda p: p[metric])

def get_peers(target: dict, n: int = 5) -> list[dict]:
    hazard = target.get("dominant_hazard")
    same_hazard = [d for d in districts
                   if d["district"] != target["district"]
                   and d.get("dominant_hazard") == hazard
                   and d.get("state") != target.get("state")]  # cross-state only

    if len(same_hazard) < n:
        # relax: include same state but different hazard class
        same_hazard = [d for d in districts
                       if d["district"] != target["district"]
                       and d.get("dominant_hazard") == hazard]

    scored = sorted(same_hazard, key=lambda d: peer_score(target, d))
    return scored[:n]

print("Computing peers…")
peer_out: dict[str, list] = {}
for target in districts:
    peers = get_peers(target)
    # Find the best performer on sanitation among peers
    best_sanit = best_performer(peers, "wash_sanitation_pct", True)
    # Summarize each peer
    peer_out[target["district"]] = [
        {
            "district":      p["district"],
            "state":         p["state"],
            "risk":          p.get("risk"),
            "dominant_hazard": p.get("dominant_hazard"),
            "adaptive_capacity": p.get("adaptive_capacity"),
            "wash_sanitation_pct": p.get("wash_sanitation_pct"),
            "jjm_fhtc_pct":  p.get("jjm_fhtc_pct"),
            "menstrual_hygiene_pct": p.get("menstrual_hygiene_pct"),
            "stunting_pct":  p.get("stunting_pct"),
            "anaemia_pct":   p.get("anaemia_pct"),
            "priority_tier": p.get("priority_tier"),
            "gap_count":     p.get("gap_count"),
            "is_best_sanitation": best_sanit and p["district"] == best_sanit["district"],
        }
        for p in peers
    ]

OUT_PEERS.write_text(json.dumps(peer_out, separators=(",",":"), ensure_ascii=False))
print(f"Wrote {OUT_PEERS} ({OUT_PEERS.stat().st_size//1024} KB, {len(peer_out)} districts)")

# ── Scheme coverage ────────────────────────────────────────────────────────────
# Maps district profile → active/relevant government schemes with rationale

SCHEMES = {
    "JJM": {
        "full_name": "Jal Jeevan Mission",
        "ministry":  "Jal Shakti",
        "url": "https://ejalshakti.gov.in",
        "description": "Functional Household Tap Connection (FHTC) to every rural household by 2024",
    },
    "SBM-G2": {
        "full_name": "Swachh Bharat Mission (Grameen) Phase 2",
        "ministry":  "Jal Shakti",
        "url": "https://sbm.gov.in",
        "description": "ODF Sustainability, solid/liquid waste management, twin-pit promotion",
    },
    "POSHAN": {
        "full_name": "POSHAN Abhiyaan (National Nutrition Mission)",
        "ministry":  "Women & Child Development",
        "url": "https://poshanabhiyaan.gov.in",
        "description": "Reduce stunting, wasting, undernutrition and anaemia among children, adolescent girls, pregnant/lactating women",
    },
    "AMB": {
        "full_name": "Anaemia Mukt Bharat",
        "ministry":  "Health & Family Welfare",
        "url": "https://anemiamuktbharat.info",
        "description": "Target anaemia reduction in children 6–59m, adolescent girls, pregnant women",
    },
    "PMUY": {
        "full_name": "Pradhan Mantri Ujjwala Yojana",
        "ministry":  "Petroleum & Natural Gas",
        "url": "https://pmuy.gov.in",
        "description": "Free LPG connections to BPL households to replace solid-fuel cooking",
    },
    "PMKSY": {
        "full_name": "Pradhan Mantri Krishi Sinchayi Yojana",
        "ministry":  "Jal Shakti / Agriculture",
        "url": "https://pmksy.gov.in",
        "description": "Water conservation, watershed development, micro-irrigation in drought-prone areas",
    },
    "MGNREGS_WATER": {
        "full_name": "MGNREGS — Water Conservation Works",
        "ministry":  "Rural Development",
        "url": "https://mnregaweb4.nic.in",
        "description": "Ponds, check dams, farm bunds, groundwater recharge works funded via MGNREGS",
    },
    "BBBP": {
        "full_name": "Beti Bachao Beti Padhao",
        "ministry":  "Women & Child Development",
        "url": "https://wcd.nic.in/bbbp-schemes",
        "description": "Improve sex ratio, girls' education and retention — includes school toilet drives",
    },
    "RKSK": {
        "full_name": "Rashtriya Kishor Swasthya Karyakram",
        "ministry":  "Health & Family Welfare",
        "url": "https://nhm.gov.in/index4.php?lang=1&level=0&linkid=391&lid=4224",
        "description": "Adolescent health — MHM, nutrition, mental health, substance abuse",
    },
    "NHM_PMSMA": {
        "full_name": "Pradhan Mantri Surakshit Matritva Abhiyan (NHM)",
        "ministry":  "Health & Family Welfare",
        "url": "https://pmsma.nhp.gov.in",
        "description": "Free antenatal checkups on 9th of every month at govt. health facilities",
    },
    "NRDWP_QUALITY": {
        "full_name": "JJM Water Quality Monitoring",
        "ministry":  "Jal Shakti",
        "url": "https://ejalshakti.gov.in/jjmreport/JJMIndia.aspx",
        "description": "Testing and treatment for chemical contamination (fluoride, arsenic, nitrate, iron) in drinking water sources",
    },
    "SAUBHAGYA": {
        "full_name": "PM Saubhagya (Pradhan Mantri Sahaj Bijli Har Ghar Yojana)",
        "ministry":  "Power",
        "url": "https://saubhagya.gov.in",
        "description": "Universal household electricity access — last-mile rural electrification",
    },
    "AMRUT": {
        "full_name": "AMRUT 2.0",
        "ministry":  "Housing & Urban Affairs",
        "url": "https://amrut.gov.in",
        "description": "Urban water supply, sewerage, and wastewater management (applicable to Urban Local Bodies)",
    },
}

def get_schemes(d: dict) -> list[dict]:
    out = []

    def add(code: str, rationale: str, priority: str = "recommended"):
        s = SCHEMES[code]
        out.append({"code": code, "full_name": s["full_name"], "ministry": s["ministry"],
                    "url": s["url"], "description": s["description"],
                    "rationale": rationale, "priority": priority})

    hazard = d.get("dominant_hazard", "")
    jjm    = d.get("jjm_fhtc_pct") or 0
    sanit  = d.get("wash_sanitation_pct") or 0
    mhm    = d.get("menstrual_hygiene_pct") or 100
    cm     = d.get("child_marriage_pct") or 0
    anc    = d.get("antenatal_4visit_pct") or 100
    fuel   = d.get("clean_fuel_pct") or 100
    elec   = (hex_agg.get(d["district"]) or {}).get("stunting_pct") or 100  # placeholder
    stunt  = (hex_agg.get(d["district"]) or {}).get("stunting_pct") or 0
    anaem  = (hex_agg.get(d["district"]) or {}).get("anaemia_pct") or 0
    conts  = (wq.get(d["district"]) or {}).get("contaminants", [])
    gaps   = d.get("gaps", [])
    risk   = d.get("risk", 0)

    # JJM — always relevant
    jjm_prio = "critical" if jjm < 40 else "high" if jjm < 70 else "recommended"
    add("JJM",
        f"FHTC coverage {jjm:.0f}% — {'critical gap' if jjm < 40 else 'significant gap' if jjm < 70 else 'ongoing; sustain quality'}.",
        jjm_prio)

    # SBM-G2 — always relevant
    sbm_prio = "critical" if sanit < 50 else "high" if sanit < 70 else "recommended"
    add("SBM-G2",
        f"Sanitation coverage {sanit:.0f}%. {'ODF not achieved' if sanit < 80 else 'Focus on ODF sustainability & waste management'}.",
        sbm_prio)

    # POSHAN — if stunting high
    if stunt > 30:
        add("POSHAN", f"Stunting {stunt:.0f}% (national avg ~36%) — POSHAN AWC convergence with WASH critical.", "critical" if stunt > 40 else "high")

    # Anaemia Mukt Bharat — if anaemia high
    if anaem > 55:
        add("AMB", f"Anaemia {anaem:.0f}% in women — above national avg. AMB iron supplementation + WASH convergence.", "high")

    # PMUY — if clean fuel low
    if fuel < 50:
        add("PMUY", f"Only {fuel:.0f}% households with clean cooking fuel — indoor air pollution drives anaemia and ARI.", "high")
    elif fuel < 70:
        add("PMUY", f"Clean fuel at {fuel:.0f}% — Ujjwala top-up connections for remaining households.", "recommended")

    # PMKSY / MGNREGS — drought districts
    if hazard in ("drought", "heat") or risk > 6:
        add("PMKSY", f"{'Drought-dominant' if hazard == 'drought' else 'High climate risk'} district — water conservation & micro-irrigation critical.", "high")
        add("MGNREGS_WATER", "Fund groundwater recharge, farm ponds, and check dams via MGNREGS water conservation works.", "recommended")

    # Water quality — if contamination
    if conts:
        add("NRDWP_QUALITY",
            f"CGWB flags: {', '.join(conts)}. Mandatory JJM source quality testing + treatment units needed.",
            "critical")

    # MHM / child marriage
    if mhm < 55:
        add("RKSK", f"MHM only {mhm:.0f}% — RKSK peer educator programme + school sanitation critical for adolescent girls.", "high")
    if cm > 30:
        add("BBBP", f"Child marriage {cm:.0f}% — BBBP school retention + girls' toilet drives to keep girls in school.", "high")
    elif mhm < 65:
        add("BBBP", f"Low MHM linked to school dropout. BBBP school toilet programme supports retention.", "recommended")

    # Antenatal
    if anc < 50:
        add("NHM_PMSMA", f"Only {anc:.0f}% mothers with 4+ ANC visits. PMSMA monthly free checkup drives to improve coverage.", "high")

    # Electricity (via hex_agg)
    elec_pct = (hex_agg.get(d["district"]) or {}).get("stunting_pct")  # reuse compute above won't work
    # Use literacy as proxy for electricity gap check
    # Actually just always add saubhagya as optional
    add("SAUBHAGYA", "Last-mile electrification supports cold-chain for vaccines, health facility lighting, pump operation.", "recommended")

    # Deduplicate by code (keep first occurrence which is highest priority)
    seen = set()
    deduped = []
    for item in out:
        if item["code"] not in seen:
            seen.add(item["code"])
            deduped.append(item)

    # Sort by priority
    prio_order = {"critical": 0, "high": 1, "recommended": 2}
    deduped.sort(key=lambda x: prio_order.get(x["priority"], 3))
    return deduped

print("Computing scheme coverage…")
scheme_out: dict[str, list] = {}
for d in districts:
    scheme_out[d["district"]] = get_schemes(d)

OUT_SCHEMES.write_text(json.dumps(scheme_out, separators=(",",":"), ensure_ascii=False))
print(f"Wrote {OUT_SCHEMES} ({OUT_SCHEMES.stat().st_size//1024} KB, {len(scheme_out)} districts)")

# Quick sanity check
sample = "Araria"
print(f"\nSample: {sample}")
print(f"  Peers: {[p['district']+'/'+p['state'] for p in peer_out[sample]]}")
print(f"  Schemes ({len(scheme_out[sample])}): {[s['code']+'('+s['priority']+')' for s in scheme_out[sample]]}")
