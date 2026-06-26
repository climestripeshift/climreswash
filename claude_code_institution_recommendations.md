# Claude Code Brief — Institution-Differentiated Resilience Recommendations

**Goal:** For each district, given its dominant hazard(s), produce THREE differentiated resilience recommendation sets — **School**, **Anganwadi**, **Household/People** — each with specific WASH-resilience measures and the government scheme that funds them. Plug into the existing district output and the hex popup.

**Why differentiated:** A flood recommendation for a school (doubles as shelter, serves 6–14 children) ≠ for an anganwadi (serves under-5s + pregnant women, highest vulnerability) ≠ for a household. Same hazard, three different action sets.

**Scope:** This brief only. A recommendation matrix module + wiring into existing output (district rankings JSON, district brief, popup). Do NOT change the risk formula, hazard engine, or data layers. This is a consumer of existing risk/dominant-hazard data.

**NOTE TO USER:** The recommendation CONTENT below is a domain best-draft. Review and tune the specific measures and scheme mappings against your WASH expertise — they are structured to be easily editable in one config file.

---

## Part 1 — The recommendation matrix (config)

Create `scripts/output/recommendation_matrix.py` (or .json) — a single editable structure: hazard × institution → measures + scheme. This is the substance; keep it in ONE place so it's tunable.

```python
# hazard -> institution -> {measures: [...], schemes: [...]}
# Institutions: "school", "anganwadi", "household"
# Hazards: flood, drought, heat, wet_bulb, cyclone, (cold_wave fallback)

RECOMMENDATION_MATRIX = {
  "flood": {
    "school": {
      "measures": [
        "Raise toilet blocks and handpumps above historical flood level",
        "Elevated, sealed drinking-water storage to prevent contamination",
        "Seal or relocate pit latrines (direct floodwater contamination risk)",
        "Designate upper floor as relief shelter with pre-positioned WASH kit",
      ],
      "schemes": ["Samagra Shiksha (school infrastructure)", "SBM"],
    },
    "anganwadi": {
      "measures": [
        "Construct elevated platform above flood level",
        "Protected drinking-water source for infants",
        "Pre-position ORS and hygiene supplies",
        "Raise Take-Home-Ration food storage above flood level",
      ],
      "schemes": ["Saksham Anganwadi / ICDS", "JJM"],
    },
    "household": {
      "measures": [
        "Replace pit latrines with sealed/raised twin-pit or septic",
        "Raised handpump platforms",
        "Household water treatment (chlorination) during floods",
        "Flood-safe elevated water storage",
      ],
      "schemes": ["SBM-Gramin", "Jal Jeevan Mission"],
    },
  },

  "drought": {
    "school": {
      "measures": [
        "Rooftop rainwater harvesting (large roof area = high yield)",
        "Groundwater recharge structures in school grounds",
        "Greywater reuse for sanitation flushing",
        "Storage tanks sized for the dry months",
      ],
      "schemes": ["Samagra Shiksha", "MGNREGA (water structures)"],
    },
    "anganwadi": {
      "measures": [
        "Assured priority drinking-water connection (never run dry for infants)",
        "Small rooftop rainwater harvesting",
        "Buffer storage tank for lean season",
      ],
      "schemes": ["JJM (priority)", "ICDS"],
    },
    "household": {
      "measures": [
        "Shift from failing borewell to piped multi-village surface scheme where available",
        "Household rainwater harvesting",
        "Groundwater recharge over extraction (for stressed-aquifer districts)",
        "Demand management and efficient use",
      ],
      "schemes": ["JJM (multi-village schemes)", "Atal Bhujal Yojana (groundwater districts)"],
    },
  },

  "heat": {
    "school": {
      "measures": [
        "Cool roofing / reflective white paint",
        "Shaded play and waiting areas",
        "Increased drinking-water storage for peak demand",
        "Adjust school timings during heatwave alerts; keep ORS available",
      ],
      "schemes": ["Samagra Shiksha", "State Heat Action Plan"],
    },
    "anganwadi": {
      "measures": [
        "Shade and cross-ventilation (infants + pregnant women most heat-vulnerable)",
        "Cool drinking water and hydration protocols",
        "Heat-safe scheduling of activities",
      ],
      "schemes": ["ICDS", "NDMA Heat Action Plan"],
    },
    "household": {
      "measures": [
        "Cool-roof treatment for kutcha/low-income housing",
        "Ensure water-supply continuity during peak-demand heat days",
        "Hydration / ORS awareness; protect elderly and outdoor workers",
      ],
      "schemes": ["PMAY (housing)", "State Heat Action Plan"],
    },
  },

  "wet_bulb": {  # same as heat but emphasise lethality + cooling + hydration
    "school": {"measures": ["Mandatory midday closure during wet-bulb alerts",
        "Cooling + assured hydration", "Identify and monitor vulnerable children"],
        "schemes": ["State Heat Action Plan", "Samagra Shiksha"]},
    "anganwadi": {"measures": ["Suspend outdoor activity in wet-bulb events",
        "Cooling for infants and pregnant women", "Hydration monitoring"],
        "schemes": ["NDMA Heat Action Plan", "ICDS"]},
    "household": {"measures": ["Public cooling shelters access", "Water distribution points",
        "Targeted outreach to elderly, pregnant, outdoor workers"],
        "schemes": ["State Heat Action Plan", "PMAY"]},
  },

  "cyclone": {
    "school": {
      "measures": [
        "Cyclone-resilient construction / retrofitting",
        "Protected, elevated water source against surge and salinity",
        "Equip designated cyclone-shelter role with WASH provisioning",
      ],
      "schemes": ["NCRMP", "Samagra Shiksha"],
    },
    "anganwadi": {
      "measures": [
        "Cyclone-resilient structure",
        "Salinity-safe drinking water for infants",
        "Pre-positioned emergency supplies",
      ],
      "schemes": ["NCRMP", "ICDS"],
    },
    "household": {
      "measures": [
        "Cyclone-resistant housing",
        "Deep/protected tubewells against saltwater intrusion",
        "Post-cyclone water treatment and vector control",
      ],
      "schemes": ["PMAY", "NCRMP", "JJM"],
    },
  },
}

# Fallback per institution if hazard not in matrix (e.g. cold_wave)
GENERIC_FALLBACK = {
  "school":   {"measures": ["Climate-resilient WASH infrastructure assessment"], "schemes": ["Samagra Shiksha"]},
  "anganwadi":{"measures": ["Climate-resilient WASH assessment for under-5 services"], "schemes": ["ICDS"]},
  "household":{"measures": ["Household climate-WASH resilience assessment"], "schemes": ["JJM", "SBM"]},
}
```

---

## Part 2 — The recommendation generator

Create `scripts/output/institution_recommendations.py`.

For each district:
1. Read its dominant hazard (already computed in the rankings output).
2. Optionally read its top-2 hazards (so a district that's both flood + drought gets both sets).
3. For EACH institution type (school, anganwadi, household), look up the matrix and produce the measures + schemes.
4. If the district has known vulnerability flags (e.g. groundwater-stressed → emphasise recharge; coastal → emphasise salinity), tune which measures surface first. Keep this simple for v1 — dominant-hazard lookup is enough.

Output: extend the existing `district_rankings.json` so each district gains:
```
"recommendations": {
  "school":    {"measures": [...], "schemes": [...]},
  "anganwadi": {"measures": [...], "schemes": [...]},
  "household": {"measures": [...], "schemes": [...]}
}
```

If a district has a secondary hazard scoring above a threshold (e.g. >5), include that hazard's recommendations too, labeled by hazard.

---

## Part 3 — Wire into the frontend

### Hex popup / district card
The existing popup shows the breakdown. Add a **"Resilience Actions"** section with three tabs or three labeled blocks:
- 🏫 School
- 👶 Anganwadi
- 🏠 Household

Each shows the measures (bulleted) and the funding scheme(s) as small tags. Pull from the new `recommendations` field in the district data.

### District brief (if/when the PDF brief exists)
The three recommendation sets become three sections of the printable brief — one per institution, each department's action list.

---

## Part 4 — Sanity output

After generating, print 5 sample districts across different dominant hazards (a flood district, a drought district, a heat district, a coastal cyclone district, a groundwater-stressed district) and show their three recommendation sets. Confirm:
- Flood district → school gets "raise toilet blocks", household gets "sealed twin-pit" ✓
- Drought/groundwater district → household gets "shift from borewell / Atal Bhujal" ✓
- Coastal district → all three get salinity-related measures ✓

---

## Acceptance criteria

- [ ] `recommendation_matrix.py` exists as a single editable config (hazard × institution → measures + schemes)
- [ ] Each district in rankings JSON gains a `recommendations` object with school / anganwadi / household sets
- [ ] Dominant hazard drives the recommendation; secondary hazard (>5) included if present
- [ ] Every recommendation includes scheme alignment (which government program funds it)
- [ ] Fallback works for hazards not in the matrix (cold_wave etc.)
- [ ] Frontend popup/card shows the three institution tabs with measures + scheme tags
- [ ] Sanity print: 5 districts across hazards show correct differentiated recommendations
- [ ] No change to risk formula or data layers

---

## Rules for Claude Code

1. The matrix CONTENT is a domain best-draft — implement it exactly as given, in ONE editable config file, so the user can tune measures/schemes without touching logic.
2. Read existing dominant-hazard data; do NOT recompute risk.
3. Every institution gets a recommendation for every district — never blank; use fallback.
4. Always include scheme alignment with each recommendation set.
5. Keep school/anganwadi/household clearly separated in both data and UI.
6. Print the 5-district sanity check.
7. After the sanity check, stop and wait.

---

## END OF BRIEF
