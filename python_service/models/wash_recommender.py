"""
Maps hazard proneness profiles to recommended WASH technologies.
Edit these rules to match your domain expertise.
"""

TOILET_TECHNOLOGIES = {
    "raised_ecosan": {
        "name": "Raised EcoSan Toilet (Urine-Diverting)",
        "description": "Elevated platform (>60cm), sealed urine diversion, twin composting vaults above flood level. Zero groundwater contact.",
        "best_for": ["flood"],
        "avoid_for": [],
        "cost_range": "₹25,000 - ₹45,000",
    },
    "elevated_twin_pit": {
        "name": "Elevated Twin-Pit Pour-Flush",
        "description": "Standard twin-pit raised on plinth with reinforced concrete rings, flood-proof inspection covers, sealed joints.",
        "best_for": ["flood"],
        "avoid_for": ["drought"],
        "cost_range": "₹20,000 - ₹35,000",
    },
    "vip_latrine": {
        "name": "Ventilated Improved Pit (VIP) Latrine",
        "description": "Solar-heated dark vent pipe creates updraft. Accelerates pathogen kill in heat. Low water requirement.",
        "best_for": ["heatwave"],
        "avoid_for": ["flood"],
        "cost_range": "₹12,000 - ₹20,000",
    },
    "composting_uddt": {
        "name": "Composting / Urine-Diverting Dry Toilet (UDDT)",
        "description": "Zero water requirement. Urine diverted. Ash/sawdust after use. Desiccation chamber produces safe compost in 6-12 months.",
        "best_for": ["drought"],
        "avoid_for": ["flood"],
        "cost_range": "₹18,000 - ₹30,000",
    },
    "biogas_toilet": {
        "name": "Biogas-Linked Toilet",
        "description": "Connected to biogas digester. Produces cooking gas. Works best above 15°C. Needs water for slurry.",
        "best_for": ["moderate_climate"],
        "avoid_for": ["drought", "cold"],
        "cost_range": "₹35,000 - ₹60,000",
    },
    "standard_twin_pit": {
        "name": "Standard Twin-Pit Pour-Flush",
        "description": "SBM-recommended design. Alternating pit usage. Adequate for low-to-moderate hazard zones.",
        "best_for": ["low_risk"],
        "avoid_for": ["flood", "drought"],
        "cost_range": "₹15,000 - ₹25,000",
    },
}

LIQUID_WASTE_TECHNOLOGIES = {
    "raised_leach_pit": {
        "name": "Raised Leach Pit with Sealed Cover",
        "description": "Leach pit with raised collar wall, sealed concrete cover. Prevents floodwater ingress.",
        "best_for": ["flood"],
    },
    "constructed_wetland": {
        "name": "Constructed Wetland / Reed Bed (Bunded)",
        "description": "Bunded walls for flood protection. Treats greywater through planted gravel filter. Resistant to seasonal flooding.",
        "best_for": ["flood", "moderate_climate"],
    },
    "et_bed": {
        "name": "Evapotranspiration Bed",
        "description": "Shallow planted bed uses high ET rates in hot climate to process greywater. Low water requirement. Kitchen garden reuse.",
        "best_for": ["heatwave", "drought"],
    },
    "soak_pit_recycle": {
        "name": "Soak Pit with Greywater Recycling",
        "description": "Greywater recycled for toilet flushing or irrigation. Reduces total water demand 40-60%.",
        "best_for": ["drought"],
    },
    "standard_leach_pit": {
        "name": "Standard Leach Pit / Soak Pit",
        "description": "Simple leach pit for greywater. Sized for household usage. Include grease trap for kitchen waste.",
        "best_for": ["low_risk"],
    },
    "dewats": {
        "name": "DEWATS (Decentralized Wastewater Treatment)",
        "description": "Settler + anaerobic baffled reactor + planted gravel filter. For community-level treatment.",
        "best_for": ["moderate_climate", "community"],
    },
}


def recommend_technologies(proneness_scores):
    """
    Recommend toilet + liquid waste technologies based on hazard proneness.

    Args:
        proneness_scores: dict from LongTermPronenessModel.score_district()

    Returns:
        dict with toilet and liquid_waste recommendations
    """
    flood = proneness_scores.get("flood_proneness", 0)
    heat = proneness_scores.get("heatwave_proneness", 0)
    drought = proneness_scores.get("drought_proneness", 0)

    toilet_recs = []
    liquid_recs = []

    if flood >= 0.5:
        toilet_recs.append({
            "technology": TOILET_TECHNOLOGIES["raised_ecosan"],
            "reason": f"Flood proneness is {flood:.0%}. Raised design prevents pit flooding and groundwater contamination.",
            "priority": "PRIMARY",
        })
        toilet_recs.append({
            "technology": TOILET_TECHNOLOGIES["elevated_twin_pit"],
            "reason": "Alternative: Elevated twin-pit if EcoSan is culturally unacceptable in the community.",
            "priority": "ALTERNATIVE",
        })
        liquid_recs.append({
            "technology": LIQUID_WASTE_TECHNOLOGIES["raised_leach_pit"],
            "reason": "Sealed cover prevents floodwater contamination of greywater system.",
            "priority": "PRIMARY",
        })
        liquid_recs.append({
            "technology": LIQUID_WASTE_TECHNOLOGIES["constructed_wetland"],
            "reason": "Bunded wetland handles seasonal flooding while treating greywater.",
            "priority": "ALTERNATIVE",
        })

    if heat >= 0.5:
        toilet_recs.append({
            "technology": TOILET_TECHNOLOGIES["vip_latrine"],
            "reason": f"Heatwave proneness is {heat:.0%}. Solar vent pipe accelerates drying and pathogen kill.",
            "priority": "PRIMARY" if flood < 0.5 else "SECONDARY",
        })
        liquid_recs.append({
            "technology": LIQUID_WASTE_TECHNOLOGIES["et_bed"],
            "reason": "High ET rates during heat efficiently process greywater with low water input.",
            "priority": "PRIMARY" if flood < 0.5 else "SECONDARY",
        })

    if drought >= 0.5:
        toilet_recs.append({
            "technology": TOILET_TECHNOLOGIES["composting_uddt"],
            "reason": f"Drought proneness is {drought:.0%}. Zero water requirement. Produces safe compost.",
            "priority": "PRIMARY" if flood < 0.5 else "SECONDARY",
        })
        liquid_recs.append({
            "technology": LIQUID_WASTE_TECHNOLOGIES["soak_pit_recycle"],
            "reason": "Greywater recycling reduces total water demand by 40-60%.",
            "priority": "PRIMARY" if flood < 0.5 else "SECONDARY",
        })

    if not toilet_recs:
        toilet_recs.append({
            "technology": TOILET_TECHNOLOGIES["standard_twin_pit"],
            "reason": "Low hazard proneness. Standard SBM design is adequate.",
            "priority": "PRIMARY",
        })
        liquid_recs.append({
            "technology": LIQUID_WASTE_TECHNOLOGIES["standard_leach_pit"],
            "reason": "Standard leach pit suitable for low-risk districts.",
            "priority": "PRIMARY",
        })

    return {
        "toilet_recommendations": toilet_recs,
        "liquid_waste_recommendations": liquid_recs,
        "hazard_profile": {
            "flood": flood,
            "heatwave": heat,
            "drought": drought,
        },
    }
