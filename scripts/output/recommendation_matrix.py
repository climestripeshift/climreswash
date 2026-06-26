"""
Institution-differentiated resilience recommendation matrix.
Hazard × Institution → measures + government schemes.

SINGLE EDITABLE CONFIG — tune measures and scheme mappings here.
"""

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
                "Shift from failing borewell to piped multi-village surface scheme",
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
    "wet-bulb heat": {
        "school": {
            "measures": [
                "Mandatory midday closure during wet-bulb alerts",
                "Cooling + assured hydration",
                "Identify and monitor vulnerable children",
            ],
            "schemes": ["State Heat Action Plan", "Samagra Shiksha"],
        },
        "anganwadi": {
            "measures": [
                "Suspend outdoor activity in wet-bulb events",
                "Cooling for infants and pregnant women",
                "Hydration monitoring",
            ],
            "schemes": ["NDMA Heat Action Plan", "ICDS"],
        },
        "household": {
            "measures": [
                "Public cooling shelters access",
                "Water distribution points",
                "Targeted outreach to elderly, pregnant, outdoor workers",
            ],
            "schemes": ["State Heat Action Plan", "PMAY"],
        },
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
    "cold wave": {
        "school": {
            "measures": [
                "Insulated water pipes to prevent freezing",
                "Heated handwashing stations",
                "Warm clothing distribution for children",
            ],
            "schemes": ["Samagra Shiksha", "State SDMA"],
        },
        "anganwadi": {
            "measures": [
                "Heated space for infants and pregnant women",
                "Warm water for drinking and bathing",
                "Enhanced nutrition during cold stress",
            ],
            "schemes": ["ICDS", "State SDMA"],
        },
        "household": {
            "measures": [
                "Night shelters with WASH facilities",
                "Protected water supply against freezing",
                "Blanket and warm clothing distribution",
            ],
            "schemes": ["PMAY", "State SDMA"],
        },
    },
    "landslide": {
        "school": {
            "measures": [
                "Slope stability assessment for school sites",
                "Emergency evacuation plan with WASH kit",
                "Alternative water source if springs disrupted",
            ],
            "schemes": ["Samagra Shiksha", "NDMA"],
        },
        "anganwadi": {
            "measures": [
                "Relocate from landslide-prone slopes",
                "Emergency water supply contingency",
            ],
            "schemes": ["ICDS", "NDMA"],
        },
        "household": {
            "measures": [
                "Slope stabilisation and drainage improvement",
                "Alternative water source planning",
                "Community early warning systems",
            ],
            "schemes": ["MGNREGA", "NDMA", "PMAY"],
        },
    },
}

GENERIC_FALLBACK = {
    "school":    {"measures": ["Climate-resilient WASH infrastructure assessment"], "schemes": ["Samagra Shiksha"]},
    "anganwadi": {"measures": ["Climate-resilient WASH assessment for under-5 services"], "schemes": ["ICDS"]},
    "household": {"measures": ["Household climate-WASH resilience assessment"], "schemes": ["JJM", "SBM"]},
}

INSTITUTIONS = ["school", "anganwadi", "household"]


def get_recommendations(dominant_hazard: str, secondary_hazards: list[str] | None = None) -> dict:
    """Get institution-differentiated recommendations for a district's hazard profile."""
    result = {}
    for inst in INSTITUTIONS:
        # Primary hazard recommendations
        hz_data = RECOMMENDATION_MATRIX.get(dominant_hazard, {}).get(inst, GENERIC_FALLBACK[inst])
        measures = list(hz_data["measures"])
        schemes = list(hz_data["schemes"])

        # Add secondary hazard measures if present
        if secondary_hazards:
            for sh in secondary_hazards[:1]:  # top 1 secondary
                sh_data = RECOMMENDATION_MATRIX.get(sh, {}).get(inst)
                if sh_data:
                    measures.append(f"[{sh}] {sh_data['measures'][0]}")
                    for s in sh_data["schemes"]:
                        if s not in schemes:
                            schemes.append(s)

        result[inst] = {"measures": measures, "schemes": schemes}
    return result
