"""
Compiles water quality risk and drinking water source data for each district.

Sources:
  - CGWB Annual Report 2023-24: district-level fluoride/arsenic/nitrate/iron
  - NFHS-5 district CSV: improved drinking water source %, wasting %
  - SBM IMIS: ODF proxy from toilet coverage

Outputs: client/public/data/wash_quality.json
"""
import json, csv
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).parent.parent
OUT  = ROOT / "client/public/data/wash_quality.json"

# ── CGWB contamination-affected districts (from CGWB Annual Report 2023-24) ──
# Source: Central Ground Water Board, Ministry of Jal Shakti
# Format: "District|State" : [contaminants with severity]
# Severity: "high" = confirmed >limit; "moderate" = near limit / seasonal

CGWB_CONTAMINANTS: dict[str, list[str]] = {}

def flag(districts: list[str], contaminant: str):
    for d in districts:
        CGWB_CONTAMINANTS.setdefault(d, [])
        if contaminant not in CGWB_CONTAMINANTS[d]:
            CGWB_CONTAMINANTS[d].append(contaminant)

# ── FLUORIDE (>1.5 mg/L) ─────────────────────────────────────────────────────
# Rajasthan — almost all districts
flag([
    "Nagaur|Rajasthan","Jodhpur|Rajasthan","Barmer|Rajasthan","Jaisalmer|Rajasthan",
    "Bikaner|Rajasthan","Churu|Rajasthan","Sikar|Rajasthan","Jhunjhunu|Rajasthan",
    "Alwar|Rajasthan","Bharatpur|Rajasthan","Sawai Madhopur|Rajasthan","Tonk|Rajasthan",
    "Ajmer|Rajasthan","Bhilwara|Rajasthan","Pali|Rajasthan","Jalore|Rajasthan",
    "Sirohi|Rajasthan","Udaipur|Rajasthan","Rajsamand|Rajasthan","Dungarpur|Rajasthan",
    "Banswara|Rajasthan","Pratapgarh|Rajasthan","Kota|Rajasthan","Bundi|Rajasthan",
    "Baran|Rajasthan","Jhalawar|Rajasthan","Jaipur|Rajasthan","Dausa|Rajasthan",
    "Dholpur|Rajasthan","Karauli|Rajasthan","Hanumangarh|Rajasthan","Sri Ganganagar|Rajasthan",
], "fluoride")
# Andhra Pradesh
flag([
    "Nalgonda|Andhra Pradesh","Guntur|Andhra Pradesh","Krishna|Andhra Pradesh",
    "West Godavari|Andhra Pradesh","East Godavari|Andhra Pradesh","Prakasam|Andhra Pradesh",
    "Kadapa|Andhra Pradesh","Anantapur|Andhra Pradesh","Kurnool|Andhra Pradesh",
    "Nellore|Andhra Pradesh","Chittoor|Andhra Pradesh",
], "fluoride")
# Telangana
flag([
    "Suryapet|Telangana","Nalgonda|Telangana","Khammam|Telangana","Warangal|Telangana",
    "Karimnagar|Telangana","Adilabad|Telangana","Nizamabad|Telangana","Mahbubnagar|Telangana",
    "Sangareddy|Telangana","Medchal Malkajgiri|Telangana",
], "fluoride")
# Karnataka
flag([
    "Kolar|Karnataka","Tumkur|Karnataka","Chitradurga|Karnataka","Davangere|Karnataka",
    "Bellary|Karnataka","Raichur|Karnataka","Koppal|Karnataka","Bidar|Karnataka",
    "Gulbarga|Karnataka","Yadgir|Karnataka","Vijayapura|Karnataka","Bagalkot|Karnataka",
], "fluoride")
# Gujarat
flag([
    "Mehsana|Gujarat","Patan|Gujarat","Banaskantha|Gujarat","Sabarkantha|Gujarat",
    "Surendranagar|Gujarat","Kutch|Gujarat","Jamnagar|Gujarat","Morbi|Gujarat",
    "Botad|Gujarat","Amreli|Gujarat",
], "fluoride")
# Haryana
flag([
    "Rohtak|Haryana","Hisar|Haryana","Bhiwani|Haryana","Sirsa|Haryana",
    "Fatehabad|Haryana","Mahendragarh|Haryana","Rewari|Haryana","Jhajjar|Haryana",
    "Narnaul|Haryana",
], "fluoride")
# Madhya Pradesh
flag([
    "Shivpuri|Madhya Pradesh","Morena|Madhya Pradesh","Gwalior|Madhya Pradesh",
    "Datia|Madhya Pradesh","Chhatarpur|Madhya Pradesh","Tikamgarh|Madhya Pradesh",
    "Sagar|Madhya Pradesh","Damoh|Madhya Pradesh","Mandsaur|Madhya Pradesh",
    "Neemuch|Madhya Pradesh",
], "fluoride")
# Uttar Pradesh
flag([
    "Agra|Uttar Pradesh","Mathura|Uttar Pradesh","Bareilly|Uttar Pradesh",
    "Unnao|Uttar Pradesh","Kannauj|Uttar Pradesh","Raebareli|Uttar Pradesh",
    "Sonbhadra|Uttar Pradesh","Mirzapur|Uttar Pradesh",
], "fluoride")
# Odisha, Bihar, others
flag([
    "Ganjam|Odisha","Nayagarh|Odisha","Khordha|Odisha","Cuttack|Odisha",
    "Gaya|Bihar","Munger|Bihar","Bhojpur|Bihar",
    "Jodhpur|Uttar Pradesh",
], "fluoride")

# ── ARSENIC (>0.05 mg/L) ─────────────────────────────────────────────────────
# West Bengal — Ganga delta
flag([
    "Murshidabad|West Bengal","Malda|West Bengal","North 24 Parganas|West Bengal",
    "South 24 Parganas|West Bengal","Nadia|West Bengal","Bardhaman|West Bengal",
    "Hooghly|West Bengal","Howrah|West Bengal","Kolkata|West Bengal",
    "Paschim Medinipur|West Bengal","Purba Medinipur|West Bengal",
], "arsenic")
# Bihar — Ganga plains
flag([
    "Bhojpur|Bihar","Saran|Bihar","Vaishali|Bihar","Patna|Bihar",
    "Bhagalpur|Bihar","Begusarai|Bihar","Lakhisarai|Bihar","Munger|Bihar",
    "Khagaria|Bihar","Katihar|Bihar","Purnia|Bihar","Samastipur|Bihar",
    "Sitamarhi|Bihar","Sheohar|Bihar","East Champaran|Bihar","West Champaran|Bihar",
], "arsenic")
# Assam — Brahmaputra floodplain
flag([
    "Jorhat|Assam","Dibrugarh|Assam","Golaghat|Assam","Nagaon|Assam",
    "Barpeta|Assam","Dhubri|Assam","Kamrup|Assam","Darrang|Assam",
    "Sonitpur|Assam","Nalbari|Assam","Morigaon|Assam","Hojai|Assam",
], "arsenic")
# Uttar Pradesh
flag([
    "Ballia|Uttar Pradesh","Lakhimpur Kheri|Uttar Pradesh","Unnao|Uttar Pradesh",
    "Varanasi|Uttar Pradesh","Ghazipur|Uttar Pradesh","Chandauli|Uttar Pradesh",
    "Bahraich|Uttar Pradesh","Shravasti|Uttar Pradesh","Siddharthnagar|Uttar Pradesh",
], "arsenic")
# Jharkhand, Manipur
flag([
    "Sahebganj|Jharkhand","Pakur|Jharkhand","Godda|Jharkhand",
    "Thoubal|Manipur","Bishnupur|Manipur",
], "arsenic")

# ── NITRATE (>45 mg/L) ────────────────────────────────────────────────────────
flag([
    "Ludhiana|Punjab","Amritsar|Punjab","Jalandhar|Punjab","Patiala|Punjab",
    "Bathinda|Punjab","Moga|Punjab","Ferozepur|Punjab","Faridkot|Punjab",
    "Rohtak|Haryana","Hisar|Haryana","Sirsa|Haryana","Fatehabad|Haryana",
    "Karnal|Haryana","Kurukshetra|Haryana","Kaithal|Haryana",
    "Nagaur|Rajasthan","Jodhpur|Rajasthan","Barmer|Rajasthan","Pali|Rajasthan",
    "Nagpur|Maharashtra","Amravati|Maharashtra","Akola|Maharashtra",
    "Yavatmal|Maharashtra","Wardha|Maharashtra","Buldhana|Maharashtra",
    "Guntur|Andhra Pradesh","Prakasam|Andhra Pradesh","Anantapur|Andhra Pradesh",
    "Karimnagar|Telangana","Nizamabad|Telangana",
], "nitrate")

# ── IRON (>0.3 mg/L) ─────────────────────────────────────────────────────────
flag([
    # Assam — almost all
    "Jorhat|Assam","Dibrugarh|Assam","Tinsukia|Assam","Lakhimpur|Assam",
    "Dhemaji|Assam","Sivasagar|Assam","Charaideo|Assam","Golaghat|Assam",
    "Nagaon|Assam","Morigaon|Assam","Karbi Anglong|Assam",
    "Kamrup|Assam","Barpeta|Assam","Nalbari|Assam","Darrang|Assam",
    "Dhubri|Assam","Bongaigaon|Assam","Kokrajhar|Assam","Chirang|Assam",
    # West Bengal
    "Murshidabad|West Bengal","Malda|West Bengal","North Dinajpur|West Bengal",
    "South Dinajpur|West Bengal","Jalpaiguri|West Bengal","Darjeeling|West Bengal",
    "Cooch Behar|West Bengal","Alipurduar|West Bengal",
    # Bihar, Jharkhand, Odisha
    "Supaul|Bihar","Madhepura|Bihar","Saharsa|Bihar","Darbhanga|Bihar",
    "Muzaffarpur|Bihar","Gopalganj|Bihar","Siwan|Bihar",
    "Ranchi|Jharkhand","Dhanbad|Jharkhand","Bokaro|Jharkhand",
    "Sambalpur|Odisha","Sundargarh|Odisha","Keonjhar|Odisha","Mayurbhanj|Odisha",
    # Kerala
    "Ernakulam|Kerala","Thrissur|Kerala","Malappuram|Kerala","Kozhikode|Kerala",
    # Chhattisgarh
    "Raipur|Chhattisgarh","Durg|Chhattisgarh","Bilaspur|Chhattisgarh",
    "Raigarh|Chhattisgarh","Janjgir Champa|Chhattisgarh","Korba|Chhattisgarh",
], "iron")

# ── SALINITY / TDS (>2000 mg/L) ──────────────────────────────────────────────
flag([
    "Kutch|Gujarat","Surendranagar|Gujarat","Anand|Gujarat","Kheda|Gujarat",
    "Barmer|Rajasthan","Jaisalmer|Rajasthan","Bikaner|Rajasthan",
    "Sri Ganganagar|Rajasthan","Hanumangarh|Rajasthan",
    "Sirsa|Haryana","Fatehabad|Haryana",
    "Bathinda|Punjab","Ferozepur|Punjab","Muktsar|Punjab",
], "salinity")

# ── Extract NFHS-5 fields: improved water source %, wasting % ─────────────────

INDICATORS_MAP = {
    "Population living in households with an improved drinkingwater source (%)": "improved_water_pct",
    "Children under 5 years who are wasted (weight for height) (%)": "wasting_pct",
    "Children under 5 years who are severely wasted (weight for height) (%)": "severe_wasting_pct",
    "Population living in households that use an improved sanitation facility (%)": "improved_sanit_pct",
}

nfhs5_path = ROOT / "data/nfhs5_district_all_indicators.csv"
district_nfhs = defaultdict(dict)

if nfhs5_path.exists():
    with open(nfhs5_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ind = row.get("Indicator","").strip()
            if ind in INDICATORS_MAP:
                district = row.get("District","").strip().title()
                val_str  = row.get("NFHS 5","").strip().replace(",","")
                try:
                    district_nfhs[district][INDICATORS_MAP[ind]] = float(val_str)
                except (ValueError, KeyError):
                    pass
    print(f"NFHS-5 extracted for {len(district_nfhs)} districts")
else:
    print("Warning: nfhs5_district_all_indicators.csv not found")

# ── Load SBM for ODF proxy ────────────────────────────────────────────────────

sbm_path = ROOT / "client/public/data/sbm_toilet_types.json"
sbm = {}
if sbm_path.exists():
    raw = json.loads(sbm_path.read_text())
    for key, val in raw.items():
        d = val.get("district","").strip().title()
        sbm[d] = val

def estimate_odf(district: str) -> str | None:
    """ODF estimated from SBM toilet coverage."""
    s = sbm.get(district)
    if not s: return None
    twin = s.get("twin_pit_pct", 0) or 0
    single = s.get("single_pit_pct", 0) or 0
    total_toilet_pct = min(100, (twin + single + (s.get("septic_soak_pct",0) or 0) + (s.get("septic_nosoak_pct",0) or 0)))
    if total_toilet_pct >= 90:  return "likely_odf"
    if total_toilet_pct >= 70:  return "progressing"
    return "needs_work"

# ── Compile output ────────────────────────────────────────────────────────────

def risk_level(contaminants: list[str]) -> str:
    if not contaminants: return "low"
    if len(contaminants) >= 3: return "critical"
    if len(contaminants) == 2: return "high"
    return "moderate"

all_districts: set[str] = set(district_nfhs.keys())
for key in CGWB_CONTAMINANTS:
    all_districts.add(key.split("|")[0].strip().title())

output: dict[str, dict] = {}
for district in all_districts:
    # CGWB: try both bare name and state-qualified name
    contaminants_raw = []
    for key, conts in CGWB_CONTAMINANTS.items():
        dname = key.split("|")[0].strip().title()
        if dname == district:
            contaminants_raw.extend(conts)
    contaminants_raw = list(set(contaminants_raw))

    nfhs = district_nfhs.get(district, {})
    entry = {
        "contaminants": contaminants_raw,
        "water_quality_risk": risk_level(contaminants_raw),
        "improved_water_pct": nfhs.get("improved_water_pct"),
        "wasting_pct": nfhs.get("wasting_pct"),
        "severe_wasting_pct": nfhs.get("severe_wasting_pct"),
        "improved_sanit_pct": nfhs.get("improved_sanit_pct"),
        "odf_estimated": estimate_odf(district),
    }
    # Only include districts with at least one data field
    if any(v is not None for v in entry.values() if v != []):
        output[district] = entry

print(f"Districts with contamination flags: {sum(1 for v in output.values() if v['contaminants'])}")
print(f"Districts with improved_water_pct:  {sum(1 for v in output.values() if v['improved_water_pct'] is not None)}")
print(f"Districts with wasting_pct:         {sum(1 for v in output.values() if v['wasting_pct'] is not None)}")
print(f"Districts with ODF estimate:        {sum(1 for v in output.values() if v['odf_estimated'])}")

OUT.write_text(json.dumps(output, separators=(",",":"), ensure_ascii=False))
print(f"\nWrote {OUT} ({OUT.stat().st_size//1024} KB, {len(output)} districts)")
