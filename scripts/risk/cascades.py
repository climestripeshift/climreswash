"""
WASH cascade rules — compound risk amplifiers with action recommendations.
These fire when multiple WASH/climate conditions combine, producing
specific intervention recommendations. This is ClimResWASH's unique value.
"""
from dataclasses import dataclass


@dataclass
class CascadeResult:
    rule_id: str
    name: str
    severity: str      # low / medium / high / critical
    amplifier: float   # added to risk score
    category: str      # WASH / DRR / Health / Livelihood
    action: str        # specific recommendation


# Each rule: (rule_id, name, severity, amplifier, category, action, check_fn)
# check_fn receives a dict with hex + state-level properties

def _check_flood_pit_toilet(p: dict) -> bool:
    return (p.get("flood_risk", 0) > 4
            and p.get("toilet_pct", 100) < 80
            and p.get("population", 0) > 50000)

def _check_flood_open_defecation(p: dict) -> bool:
    return (p.get("flood_risk", 0) > 3
            and p.get("toilet_pct", 100) < 60
            and p.get("population", 0) > 10000)

def _check_drought_water_scarcity(p: dict) -> bool:
    return (p.get("drought_risk", 0) > 3
            and p.get("piped_water_pct", 100) < 85)

def _check_heat_no_electricity(p: dict) -> bool:
    return (p.get("heat_risk", 0) > 4
            and p.get("electricity_pct", 100) < 92)

def _check_cyclone_poor_sanitation(p: dict) -> bool:
    return (p.get("cyclone_risk", 0) > 3
            and p.get("toilet_pct", 100) < 80)

def _check_wetbulb_no_health(p: dict) -> bool:
    return (p.get("wetbulb_risk", 0) > 3
            and p.get("health_access_pct", 100) < 75)

def _check_landslide_remote(p: dict) -> bool:
    return (p.get("landslide_risk", 0) > 3
            and p.get("elevation_mean", 0) > 1000)

def _check_flood_low_literacy(p: dict) -> bool:
    return (p.get("flood_risk", 0) > 3
            and p.get("female_literacy_pct", 100) < 65
            and p.get("population", 0) > 50000)

def _check_drought_poverty(p: dict) -> bool:
    return (p.get("drought_risk", 0) > 3
            and p.get("poverty_pct", 0) > 25)

def _check_coldwave_exposure(p: dict) -> bool:
    return (p.get("coldwave_risk", 0) > 3
            and p.get("built_pct", 100) < 20
            and p.get("poverty_pct", 0) > 20)


CASCADE_RULES = [
    ("flood_pit_toilet",
     "Flood + Pit Toilet Contamination",
     "critical", 1.5, "WASH",
     "Replace pit toilets with sealed septic tanks or DEWATS. Chlorinate all water sources within 48h of flooding.",
     _check_flood_pit_toilet),

    ("flood_open_defecation",
     "Flood + Open Defecation → Waterborne Disease",
     "critical", 2.0, "WASH",
     "URGENT: Deploy mobile toilet units. Distribute ORS packets. Chlorinate all drinking water. Set up diarrhoea treatment centres.",
     _check_flood_open_defecation),

    ("drought_water_scarcity",
     "Drought + Low Piped Water → Water Crisis",
     "high", 1.5, "WASH",
     "Deploy water tankers. Monitor bore well levels. Activate rainwater harvesting. Restrict non-essential water use.",
     _check_drought_water_scarcity),

    ("heat_no_electricity",
     "Heatwave + Low Electricity → Heat Death Risk",
     "high", 1.0, "Health",
     "Open public cooling shelters. Deploy mobile medical units with IV fluids. Issue heat advisory via SMS.",
     _check_heat_no_electricity),

    ("cyclone_poor_sanitation",
     "Cyclone + Poor Sanitation → Post-Cyclone Disease",
     "critical", 1.5, "WASH",
     "Pre-position ORS, water purification tablets, temporary latrines. Plan sanitation restoration within 72h.",
     _check_cyclone_poor_sanitation),

    ("wetbulb_no_health",
     "Wet-Bulb Heat + Low Health Access → Heat Stroke Deaths",
     "critical", 1.5, "Health",
     "Deploy mobile health units to high wet-bulb areas. Stock IV fluids and cooling equipment. Restrict outdoor labour.",
     _check_wetbulb_no_health),

    ("landslide_remote",
     "Landslide + Remote Area → Rescue Delay",
     "high", 1.0, "DRR",
     "Pre-position rescue equipment at block HQ. Establish helicopter landing zones. Activate community first responders.",
     _check_landslide_remote),

    ("flood_low_literacy",
     "Flood + Low Female Literacy → Child Vulnerability",
     "high", 1.0, "DRR",
     "Deliver early warnings via voice messages (not SMS). Set up child-safe evacuation points. Deploy ASHA workers for house-to-house alerts.",
     _check_flood_low_literacy),

    ("drought_poverty",
     "Drought + High Poverty → Livelihood Crisis",
     "high", 1.5, "Livelihood",
     "Activate MGNREGA drought works. Distribute drought-resistant seeds. Set up fodder camps. Expedite crop insurance payouts.",
     _check_drought_poverty),

    ("coldwave_exposure",
     "Cold Wave + Open Exposure → Hypothermia Deaths",
     "high", 1.0, "Health",
     "Distribute blankets and warm clothing. Open 24/7 night shelters. Deploy hot meal distribution. Alert hospitals for hypothermia cases.",
     _check_coldwave_exposure),
]


def evaluate_cascades(props: dict) -> list[CascadeResult]:
    """Evaluate all cascade rules against hex properties. Returns triggered rules."""
    triggered = []
    for rule_id, name, severity, amplifier, category, action, check_fn in CASCADE_RULES:
        if check_fn(props):
            triggered.append(CascadeResult(
                rule_id=rule_id, name=name, severity=severity,
                amplifier=amplifier, category=category, action=action,
            ))
    return triggered
