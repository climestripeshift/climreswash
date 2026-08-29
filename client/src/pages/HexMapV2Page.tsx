import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSONLayer } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cellToBoundary } from "h3-js";
import {
  ArrowLeft, ChevronDown, ChevronRight, AlertTriangle, Loader2,
  Grid3X3, PanelLeftClose, PanelLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

// ── Attribute + category definitions ──────────────────────────────────────────

interface AttrDef {
  key: string;
  label: string;
  icon: string;
  desc: string;
  category: string;
}

const CATEGORIES = [
  { id: "overview",     label: "Overview",            icon: "⚠️" },
  { id: "demographics", label: "Demographics",        icon: "👥" },
  { id: "terrain",      label: "Terrain & Land",      icon: "⛰️" },
  { id: "climate",      label: "Climate Hazards",     icon: "🌀" },
  { id: "geographic",   label: "Geographic Hazards",  icon: "🏔️" },
  { id: "wash",         label: "WASH & Capacity",     icon: "🚰" },
  { id: "historical",   label: "Historical Trends",   icon: "📜" },
  { id: "future",       label: "Future Projections",  icon: "🔮" },
];

const ATTRIBUTES: AttrDef[] = [
  // Overview
  { key: "hex_risk",       label: "Max Risk (all hazards)", icon: "⚠️",  category: "overview", desc: "Highest risk across all 10 hazard channels + cascade amplifiers" },
  { key: "data_confidence", label: "Data Confidence",       icon: "🎯",  category: "overview", desc: "Data-provenance confidence: HIGH = real validated data · MEDIUM = real but coarse · LOW = heuristic/absent" },
  { key: "population",    label: "Total Population",       icon: "👥",  category: "overview", desc: "WorldPop 2020 UN-adjusted 100m resolution" },
  { key: "hazard_count_5", label: "Hazards ≥5 (CCRR)",     icon: "🎯",  category: "overview", desc: "Number of hazards scoring ≥5.0 — CCRR threshold" },
  { key: "hazard_count_3", label: "Hazards ≥3 (moderate)", icon: "🎯",  category: "overview", desc: "Number of hazards scoring ≥3.0 — moderate threshold" },
  { key: "cascade_count", label: "WASH Cascades",          icon: "🔗",  category: "overview", desc: "Number of WASH cascade rules triggered in this hex" },

  // Demographics
  { key: "pop_children_under_5", label: "Children Under 5",  icon: "👶", category: "demographics", desc: "Children aged 0-4 (WorldPop × Census age ratios)" },
  { key: "pop_elderly_60plus",   label: "Elderly 60+",       icon: "🧓", category: "demographics", desc: "Population aged 60+ (WorldPop × Census age ratios)" },
  { key: "pop_women_15_49",      label: "Women 15-49",       icon: "👩", category: "demographics", desc: "Women of reproductive age (WorldPop × Census age ratios)" },
  { key: "rural_urban_class",    label: "Rural / Urban Mix", icon: "🏙️", category: "demographics", desc: "Splits each hex's population into a rural component (real named villages, Survey of India) and an urban residual (city/town population no village boundary covers). Rural hexes (≥85% village-accounted) are fine at 252km² resolution as-is. Urban and Composite hexes are candidates for finer-than-hex breakdown — a single hex average is smoothing a city's distinct risk profile together with surrounding farmland." },

  // Terrain
  { key: "elevation_mean",    label: "Elevation (SRTM)",    icon: "⛰️",  category: "terrain", desc: "Mean elevation per hex — real SRTM 90m data" },
  { key: "ndvi_mean",         label: "Vegetation (NDVI)",   icon: "🌿",  category: "terrain", desc: "Mean annual NDVI — real MODIS 2023 data" },
  { key: "land_use",          label: "Land Use (ESA)",      icon: "🗺️",  category: "terrain", desc: "Dominant land cover — real ESA WorldCover 2021" },
  { key: "soil_sand_pct",     label: "Soil Sand %",         icon: "🏖️",  category: "terrain", desc: "Real topsoil (0-5cm) sand content — ISRIC SoilGrids 250m, sampled per hex. Feeds flood/drought/flashflood/fire risk (sandier = better rain infiltration, but also more drought/fire susceptibility) — replaced a flat land-use-based guess that gave every same-land-use hex nationally an identical value." },
  { key: "dist_to_river_km",  label: "Distance to River",   icon: "🏞️",  category: "terrain", desc: "Distance to nearest OSM major river channel (km) — closer = higher flood exposure & surface-water dependency" },

  // Climate hazards
  { key: "flood_risk",   label: "Pluvial Flood",    icon: "🌊", category: "climate", desc: "Flood risk from 50mm monsoon rainfall scenario" },
  { key: "heat_risk",    label: "Heatwave",          icon: "🔥", category: "climate", desc: "Heatwave risk at 44°C for 3 days" },
  { key: "cyclone_risk", label: "Cyclone",           icon: "🌀", category: "climate", desc: "Cat-3 cyclone risk (wind + rain band + coastal surge)" },
  { key: "drought_risk", label: "Drought",           icon: "☀️", category: "climate", desc: "Meteorological drought from aridity + low NDVI" },
  { key: "wetbulb_risk", label: "Wet-Bulb Heat",     icon: "💧", category: "climate", desc: "Lethal humidity × heat combination" },

  // Geographic hazards
  { key: "landslide_risk",  label: "Landslide",      icon: "🏔️", category: "geographic", desc: "Steep slope + deforestation + monsoon trigger" },
  { key: "coldwave_risk",   label: "Cold Wave",      icon: "❄️", category: "geographic", desc: "Northern plains + high altitude winter exposure" },
  { key: "flashflood_risk", label: "Flash Flood",    icon: "⚡", category: "geographic", desc: "Steep terrain + sudden monsoon runoff" },
  { key: "sealevel_risk",   label: "Sea Level Rise", icon: "🌊", category: "geographic", desc: "Low-elevation coastal inundation exposure" },
  { key: "fire_risk",       label: "Forest Fire",    icon: "🔥", category: "geographic", desc: "Dry deciduous forest + scrubland fire risk" },

  // WASH & district baseline (real NFHS-5 district-level data)
  { key: "pollution_risk",          label: "Air Pollution",           icon: "🏭", category: "climate", desc: "PM2.5 annual mean → WHO-anchored hazard score" },
  { key: "total_burden_days",      label: "Burden Days (total)",     icon: "📅", category: "overview", desc: "Total calendar days/yr under ANY hazard stress (no duplication)" },
  { key: "multi_hazard_days",      label: "Multi-Hazard Days",       icon: "⚡", category: "overview", desc: "Days/yr under 2+ hazards simultaneously (compounded stress)" },
  { key: "pm25_annual",             label: "PM2.5 (ug/m3)",           icon: "💨", category: "climate", desc: "Annual mean PM2.5 concentration (CAMS satellite-derived estimate)" },
  { key: "adaptive_capacity",      label: "Adaptive Capacity",      icon: "🛡️", category: "wash", desc: "WASH-based coping capacity (NFHS-5 district-level)" },
  { key: "jjm_fhtc_pct",           label: "JJM Tap Water %",        icon: "🚰", category: "wash", desc: "Functional Household Tap Connections — JJM IMIS (ejalshakti.gov.in, Jul 2026)" },
  { key: "wash_sanitation_pct",    label: "Sanitation %",            icon: "🚽", category: "wash", desc: "Improved sanitation coverage (NFHS-5 district)" },
  { key: "wash_water_pct",         label: "Water Access %",         icon: "💧", category: "wash", desc: "Improved water source coverage (NFHS-5 district)" },
  { key: "wash_health_pct",        label: "Health Access %",        icon: "🏥", category: "wash", desc: "Institutional births as health access proxy (NFHS-5)" },
  { key: "wash_stunting_pct",        label: "Child Stunting %",        icon: "📉", category: "wash", desc: "Children under 5 stunted (NFHS-5 district)" },
  { key: "wash_diarrhoea_pct",      label: "Diarrhoea Prevalence",    icon: "🦠", category: "wash", desc: "Diarrhoea prevalence in children (NFHS-5 district)" },
  { key: "wash_anaemia_pct",        label: "Child Anaemia %",         icon: "🩸", category: "wash", desc: "Children with anaemia (NFHS-5 district)" },
  // NFHS-5 extra indicators (nfhs5_extra.json — joined by district)
  { key: "menstrual_hygiene_pct",   label: "Menstrual Hygiene %",     icon: "🩺", category: "wash", desc: "Women 15-24 using hygienic menstrual protection (NFHS-5)" },
  { key: "clean_fuel_pct",          label: "Clean Cooking Fuel %",    icon: "🔥", category: "wash", desc: "Households using clean fuel for cooking (NFHS-5)" },
  { key: "ors_diarrhoea_pct",       label: "ORS for Diarrhoea %",    icon: "💊", category: "wash", desc: "Children with diarrhoea who received ORS (NFHS-5)" },
  { key: "child_marriage_pct",      label: "Child Marriage %",        icon: "⚠️", category: "wash", desc: "Women 20-24 married before age 18 (NFHS-5 vulnerability indicator)" },
  { key: "antenatal_4visit_pct",    label: "Antenatal 4+ Visits %",  icon: "🏥", category: "wash", desc: "Mothers with 4+ antenatal care visits (NFHS-5)" },
  // SBM Phase 2 toilet types (sbm_toilet_types.json — joined by district)
  { key: "sbm_twin_pit_pct",        label: "SBM Twin-Pit Toilet %",  icon: "🚽", category: "wash", desc: "% IHHL with twin-pit design (flood-safe, recommended) — SBM Phase 2 IMIS" },
  { key: "sbm_single_pit_pct",      label: "SBM Single-Pit Toilet %",icon: "🚽", category: "wash", desc: "% IHHL with single-pit design (flood-vulnerable) — SBM Phase 2 IMIS" },
  { key: "sbm_septic_soak_pct",     label: "SBM Septic+Soak %",      icon: "🚽", category: "wash", desc: "% IHHL with septic tank + soak pit (properly treated) — SBM Phase 2 IMIS" },
  { key: "sbm_septic_nosoak_pct",   label: "SBM Not Individually Verified %", icon: "❓", category: "wash", desc: "SBM's own \"septic tank, no soak pit\" bucket — but data-audited: in 491 of 557 districts, the 5 toilet-type categories' sum exceeds total registered latrines, and this bucket sits at/near the total-latrine count almost everywhere while the actually-surveyed count (toilet_type_entered) is far smaller. That means most of this % is toilets never individually field-verified, defaulting here administratively — NOT a confirmed finding that they're poorly built. Treat as a data-completeness gap, not a WASH outcome." },
  { key: "sbm_total_ihhl",          label: "SBM Total IHHL",         icon: "🏠", category: "wash", desc: "Total Individual Household Latrines registered — SBM Phase 2 IMIS" },
  // Population vulnerability layers
  { key: "wash_wasting_pct",        label: "Child Wasting (acute)",   icon: "📉", category: "wash", desc: "Acute malnutrition — wasting in children under 5 (NFHS-5 district)" },
  { key: "gw_stress_score",         label: "Groundwater Stress",      icon: "💧", category: "wash", desc: "Groundwater depletion risk score — GRACE satellite + extraction rates" },
  { key: "weighted_burden_children",label: "Child Burden Days",       icon: "👶", category: "overview", desc: "Annual hazard burden days weighted by children-under-5 population" },
  { key: "weighted_burden_elderly", label: "Elderly Burden Days",     icon: "👴", category: "overview", desc: "Annual hazard burden days weighted by elderly (60+) population" },

  // Historical trends (ERA5 1940-2024, per-hex — merged from
  // hex_historical_climatology.json by h3_id)
  { key: "hist_rainfall_trend",  label: "Rainfall Trend (1940-2024)", icon: "🌧️", category: "historical", desc: "Real observed change in annual rainfall, mm/decade — ERA5 monthly-mean reanalysis (Copernicus/ECMWF, CC-BY 4.0), linear trend over 85 years, all 12,705 hexes. Negative = drying, positive = wetter — direction of concern depends on the area's baseline (a drought-prone area getting drier is bad; a flood-prone area getting wetter is also bad)." },
  { key: "hist_temp_trend",      label: "Temperature Trend (1940-2024)", icon: "🌡️", category: "historical", desc: "Real observed warming, °C/decade — ERA5 monthly-mean reanalysis, linear trend in annual mean temperature over 85 years. Higher = faster warming." },
  { key: "hist_rainfall_cv", label: "Monsoon Reliability (CV)", icon: "🎲", category: "historical", desc: "Coefficient of variation of annual rainfall (std ÷ mean) over 1940-2024 — higher means a more erratic, less predictable monsoon from year to year, independent of the trend direction. ERA5 monthly-mean reanalysis." },

  // Future projections (CMIP6 NEX-GDDP — merged from india_hex_future.json)
  { key: "risk_ssp245_2050",             label: "Risk 2050 (SSP2-4.5)",     icon: "🔮", category: "future", desc: "Projected risk score 2050 under SSP2-4.5 moderate emissions" },
  { key: "risk_ssp585_2030",             label: "Risk 2030 (SSP5-8.5)",     icon: "🔮", category: "future", desc: "Near-term 2030 risk under SSP5-8.5 high emissions" },
  { key: "risk_ssp585_2050",             label: "Risk 2050 (SSP5-8.5)",     icon: "🔴", category: "future", desc: "Worst-case projected risk score 2050 under SSP5-8.5" },
  { key: "heat_days_ssp585_2050",        label: "Heat Days 2050 (SSP5)",     icon: "🔥", category: "future", desc: "Total days/yr above heat threshold by 2050 (SSP5-8.5)" },
  { key: "severe_heat_days_ssp585_2050", label: "Severe Heat Days 2050",     icon: "🌡️", category: "future", desc: "Total days/yr above severe heat threshold by 2050 (SSP5-8.5)" },
  // wet_bulb_days_ssp585_2050 layer temporarily removed: the underlying raster (gee_future_climatology.js)
  // used a 28°C threshold that's actually the ZERO point of the live wet_bulb_score() gradient, not the
  // dangerous cutoff (35°C is) -- inflated this to a national median of ~232 "dangerous" days/yr, which is
  // implausible. Threshold fixed in the script (28->35); re-add this row once the corrected raster is
  // regenerated in GEE and client/public/data/india_hex_future.json is rebuilt via compute_future_days.py.
  { key: "flood_days_ssp585_2050",       label: "Flood Days 2050 (SSP5)",    icon: "🌊", category: "future", desc: "Total extreme-rain/flood days/yr by 2050 (SSP5-8.5)" },
];

// ── Color scales ──────────────────────────────────────────────────────────────

const VIRIDIS: [number,number,number][] = [[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]];
const GREENS:  [number,number,number][] = [[255,255,255],[199,233,192],[116,196,118],[49,163,84],[0,109,44]];
const BLUES:   [number,number,number][] = [[240,249,255],[189,215,231],[107,174,214],[33,113,181],[8,48,107]];
const ORANGES: [number,number,number][] = [[255,255,229],[254,217,142],[254,153,41],[217,95,14],[153,52,4]];
const RISK:    [number,number,number][] = [[34,197,94],[234,179,8],[249,115,22],[239,68,68],[153,27,27]];
// Diverging brown->teal (ColorBrewer BrBG), standard for precipitation trend/anomaly maps:
// brown = drying, teal = wetter. Centered at the domain's midpoint, not strictly good/bad.
const BRBG:    [number,number,number][] = [[140,81,10],[223,194,125],[245,245,245],[128,205,193],[1,102,94]];
// Diverging blue->red (ColorBrewer RdBu, reversed), standard for temperature anomaly
// maps: blue = cooler than baseline, red = warmer than baseline.
const RDBU_REV: [number,number,number][] = [[33,102,172],[146,197,222],[247,247,247],[244,165,130],[178,24,43]];

const ATTR_RAMP: Record<string, [number,number,number][]> = {
  elevation_mean: VIRIDIS, ndvi_mean: GREENS, population: ORANGES, dist_to_river_km: BLUES,
  soil_sand_pct: ORANGES, // neutral terrain property, not shown in LAYER_DIRECTION -- more
  // sand helps flood/flashflood drainage but hurts drought/fire susceptibility, no single
  // "higher is better/worse" answer
  hazard_count_5: RISK, hazard_count_3: RISK,
  pop_children_under_5: ORANGES, pop_elderly_60plus: ORANGES, pop_women_15_49: ORANGES,
  flood_risk: BLUES, heat_risk: ORANGES, heat_peak_score: ORANGES, cyclone_risk: RISK, drought_risk: ORANGES,
  wetbulb_risk: BLUES, landslide_risk: VIRIDIS, coldwave_risk: BLUES,
  flashflood_risk: BLUES, sealevel_risk: BLUES, fire_risk: ORANGES,
  hex_risk: RISK, cascade_count: RISK, data_confidence: [[239,68,68],[234,179,8],[22,163,74]],
  adaptive_capacity: GREENS,
  pollution_risk: RISK, pm25_annual: ORANGES,
  total_burden_days: ORANGES, multi_hazard_days: RISK,
  jjm_fhtc_pct: BLUES,
  wash_sanitation_pct: GREENS, wash_water_pct: BLUES, wash_health_pct: GREENS,
  wash_stunting_pct: RISK, wash_diarrhoea_pct: RISK, wash_anaemia_pct: RISK, wash_wasting_pct: RISK,
  gw_stress_score: ORANGES, weighted_burden_children: ORANGES, weighted_burden_elderly: ORANGES,
  // NFHS extra
  menstrual_hygiene_pct: GREENS, clean_fuel_pct: GREENS, ors_diarrhoea_pct: GREENS,
  antenatal_4visit_pct: GREENS, child_marriage_pct: RISK,
  // SBM -- twin-pit and septic+soak are both "properly handled" outcomes (green=more is
  // good); single-pit means waste isn't safely contained (red=more is bad).
  // septic_nosoak is data-audited to be mostly an unverified/default bucket rather than a
  // genuine finding (see its ATTRIBUTES description) -- neutral blue, no good/bad claim.
  // sbm_total_ihhl is a raw count, stays neutral.
  sbm_twin_pit_pct: GREENS, sbm_single_pit_pct: RISK,
  sbm_septic_soak_pct: GREENS, sbm_septic_nosoak_pct: BLUES, sbm_total_ihhl: ORANGES,
  // Historical (1940-2024, ERA5) -- rainfall trend is diverging (drying vs wetter, neither
  // is universally good/bad, see its ATTRIBUTES description); temp/hot-days/CV are all
  // "higher = more concerning" so a sequential ramp fits.
  hist_rainfall_trend: BRBG, hist_temp_trend: ORANGES, hist_rainfall_cv: ORANGES,
  // Future
  risk_ssp245_2050: RISK, risk_ssp585_2030: RISK, risk_ssp585_2050: RISK,
  heat_days_ssp585_2050: ORANGES, severe_heat_days_ssp585_2050: RISK,
  wet_bulb_days_ssp585_2050: BLUES, flood_days_ssp585_2050: BLUES,
};

const LAND_USE_COLORS: Record<string, string> = {
  tree: "#2d6a4f", shrub: "#95d5b2", grass: "#d8f3dc", crop: "#f4d35e",
  built: "#d62828", barren: "#c9b79c", water: "#1d4e89", wetland: "#84a59d",
  snow: "#dbeafe", mangrove: "#52b788",
};

// Rural: fine as-is. Urban/Composite: candidates for finer-than-hex breakdown (see
// compute_rural_urban_mix.py). Negligible: too sparse for the ratio to be meaningful.
const RURAL_URBAN_COLORS: Record<string, string> = {
  rural: "#4d9d5c", composite: "#c084fc", urban: "#d62828", negligible: "#cbd5e1",
};
const RURAL_URBAN_LABELS: Record<string, string> = {
  rural: "Rural (village-accounted)", composite: "Composite (mixed)",
  urban: "Urban (village data can't see)", negligible: "Negligible population",
};

// Fixed absolute domains — green always means safe, red always means danger
const FIXED_DOMAIN: Record<string, [number, number]> = {
  hex_risk: [0, 10], population: [0, 5000000], cascade_count: [0, 4], data_confidence: [0, 1],
  hazard_count_5: [0, 5], hazard_count_3: [0, 6],
  pop_children_under_5: [0, 500000], pop_elderly_60plus: [0, 500000], pop_women_15_49: [0, 1500000],
  elevation_mean: [0, 5000], ndvi_mean: [0, 0.8], land_use: [0, 1], dist_to_river_km: [0, 100],
  soil_sand_pct: [0, 100],
  flood_risk: [0, 10], heat_risk: [0, 10], heat_peak_score: [0, 10], cyclone_risk: [0, 10],
  drought_risk: [0, 10], wetbulb_risk: [0, 10], landslide_risk: [0, 10],
  coldwave_risk: [0, 10], flashflood_risk: [0, 10], sealevel_risk: [0, 10],
  fire_risk: [0, 10],
  adaptive_capacity: [0, 1],
  jjm_fhtc_pct: [0, 100],
  wash_sanitation_pct: [0, 100], wash_water_pct: [0, 100], wash_health_pct: [0, 100],
  pollution_risk: [0, 10], pm25_annual: [0, 100],
  total_burden_days: [0, 365], multi_hazard_days: [0, 100],
  wash_stunting_pct: [0, 60], wash_diarrhoea_pct: [0, 20], wash_anaemia_pct: [0, 80], wash_wasting_pct: [0, 30],
  gw_stress_score: [0, 1.5], weighted_burden_children: [0, 120], weighted_burden_elderly: [0, 120],
  // NFHS extra
  menstrual_hygiene_pct: [0, 100], clean_fuel_pct: [0, 100], ors_diarrhoea_pct: [0, 100],
  antenatal_4visit_pct: [0, 100], child_marriage_pct: [0, 60],
  // SBM
  sbm_twin_pit_pct: [0, 100], sbm_single_pit_pct: [0, 100],
  sbm_septic_soak_pct: [0, 100], sbm_septic_nosoak_pct: [0, 100], sbm_total_ihhl: [0, 500000],
  // Historical (1940-2024, ERA5) -- p5-p95 of the real national distribution (12,705/12,705
  // hexes), not the full min-max, so a handful of extreme outliers (e.g. Meghalaya's
  // >11,000mm/yr rainfall) don't wash out the color scale for everywhere else
  hist_rainfall_trend: [-45, 30], hist_temp_trend: [0, 0.28], hist_rainfall_cv: [0.1, 0.46],
  // Future projections
  risk_ssp245_2050: [0, 10], risk_ssp585_2030: [0, 10], risk_ssp585_2050: [0, 10],
  heat_days_ssp585_2050: [0, 135], severe_heat_days_ssp585_2050: [0, 30],
  wet_bulb_days_ssp585_2050: [0, 365], flood_days_ssp585_2050: [0, 35],
};

function lerp3(a: [number,number,number], b: [number,number,number], t: number) {
  return `rgb(${a.map((c,i) => Math.round(c + t * (b[i] - c))).join(",")})`;
}

function gradientColor(ramp: [number,number,number][], t: number) {
  t = Math.max(0, Math.min(1, t));
  const s = t * (ramp.length - 1);
  const lo = Math.floor(s);
  const hi = Math.min(lo + 1, ramp.length - 1);
  return lerp3(ramp[lo], ramp[hi], s - lo);
}

// ── Data-provenance confidence ────────────────────────────────────────────────

type ConfLevel = 'high' | 'medium' | 'low';

const HAZARD_CONFIDENCE: Record<string, { level: ConfLevel; reason: string }> = {
  flood_risk:      { level: 'high',   reason: 'CHIRPS/ERA5 rainfall · IMD intensity table · SRTM terrain · backtest-validated' },
  drought_risk:    { level: 'high',   reason: 'MODIS NDVI 2023 · ESA land cover · backtest-validated (Marathwada 2015, 7.54/10)' },
  heat_risk:       { level: 'high',   reason: 'ERA5 temperature · NFHS-5 adaptive capacity · backtest-validated (Delhi 2023, 6.88/10)' },
  wetbulb_risk:    { level: 'high',   reason: 'ERA5 temp + humidity · Stull 2011 wet-bulb formula · physiological threshold validated' },
  pollution_risk:  { level: 'high',   reason: 'WashU satellite PM2.5 2021–2023 · real annual mean concentrations' },
  coldwave_risk:   { level: 'medium', reason: 'Elevation + latitude climatology proxy · no historical event backtest' },
  flashflood_risk: { level: 'medium', reason: 'SRTM slope (H3 neighbor differencing) + monsoon trigger · slope approximate' },
  sealevel_risk:   { level: 'medium', reason: 'SRTM elevation + coastal distance · simplified bathtub inundation model' },
  fire_risk:       { level: 'medium', reason: 'ESA land cover + aridity index · no FIRMS fire-history validation' },
  cyclone_risk:    { level: 'low',    reason: 'Coastal distance heuristic · no IBTrACS historical track data used' },
  landslide_risk:  { level: 'low',    reason: 'Deforestation proxy · slope_deg absent (national default 3° assumed)' },
};

const HAZARD_KEYS = Object.keys(HAZARD_CONFIDENCE);

function getHexDataConfidence(props: any): { level: ConfLevel; reason: string; dominant: string } {
  const TIER: Record<ConfLevel, number> = { high: 2, medium: 1, low: 0 };
  const THRESHOLD = 1.5; // only consider hazards that meaningfully score for this hex

  let level: ConfLevel = 'high';
  let domKey = 'flood_risk', domVal = 0;
  let worstKey = 'flood_risk';

  for (const k of HAZARD_KEYS) {
    const v = props[k] ?? 0;
    if (v > domVal) { domVal = v; domKey = k; }
    if (v >= THRESHOLD) {
      const tier = TIER[HAZARD_CONFIDENCE[k].level];
      if (tier < TIER[level]) { level = HAZARD_CONFIDENCE[k].level; worstKey = k; }
    }
  }

  const reason = HAZARD_CONFIDENCE[worstKey]?.reason ?? 'Data quality unspecified';
  return { level, reason, dominant: domKey };
}

// Timelapse color domains -- real ANNUAL values (not the 85-year trend/mean), so these
// are the CHANGE from each hex's own 1940s baseline DECADE average (not a single 1940
// value -- comparing to one specific year is dominated by that year's own noise, e.g. an
// anomalously dry 1940 makes nearly every later year look "wetter" even in a hex whose
// real 85-year trend is declining; measured directly: single-year baseline disagreed with
// the trend's sign on 31% of hexes, a decade-average baseline drops that to 3%, matching
// standard climate-anomaly practice of using a reference period, not a reference year).
// national p2-p98 of (year value - 1940s decade-avg) across all years x 12,705 hexes.
const TIMELAPSE_RAINFALL_DOMAIN: [number, number] = [-700, 800];
const TIMELAPSE_TEMP_DOMAIN: [number, number] = [-1.5, 2];
const BASELINE_DECADE_LEN = 10; // first 10 entries = 1940-1949, since data.years starts at 1940

function baselineAvg(series: number[] | undefined): number | null {
  if (!series || series.length < BASELINE_DECADE_LEN) return null;
  const slice = series.slice(0, BASELINE_DECADE_LEN);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function timelapseHexColor(
  h3_id: string, attr: string, year: number,
  data: { years: number[]; rainfall: Record<string, number[]>; temp: Record<string, number[]> } | undefined,
): string {
  if (!data) return "#e2e8f0";
  const yearIdx = data.years.indexOf(year);
  if (yearIdx < 0) return "#e2e8f0";
  if (attr === "hist_rainfall_trend") {
    const series = data.rainfall[h3_id];
    const baseline = baselineAvg(series);
    if (series?.[yearIdx] == null || baseline == null) return "#e2e8f0";
    const change = series[yearIdx] - baseline;
    const [lo, hi] = TIMELAPSE_RAINFALL_DOMAIN;
    return gradientColor(BRBG, (change - lo) / (hi - lo));
  }
  if (attr === "hist_temp_trend") {
    const series = data.temp[h3_id];
    const baseline = baselineAvg(series);
    if (series?.[yearIdx] == null || baseline == null) return "#e2e8f0";
    const change = series[yearIdx] - baseline;
    const [lo, hi] = TIMELAPSE_TEMP_DOMAIN;
    return gradientColor(RDBU_REV, (change - lo) / (hi - lo));
  }
  return "#e2e8f0";
}

function timelapseChange(
  h3_id: string, attr: string, year: number,
  data: { years: number[]; rainfall: Record<string, number[]>; temp: Record<string, number[]> } | undefined,
): number | null {
  if (!data) return null;
  const yearIdx = data.years.indexOf(year);
  if (yearIdx < 0) return null;
  const series = attr === "hist_rainfall_trend" ? data.rainfall[h3_id] : data.temp[h3_id];
  const baseline = baselineAvg(series);
  if (series?.[yearIdx] == null || baseline == null) return null;
  return series[yearIdx] - baseline;
}

function hexColor(props: any, attr: string) {
  if (attr === "land_use") return LAND_USE_COLORS[props.land_use] ?? "#94a3b8";
  if (attr === "rural_urban_class") return RURAL_URBAN_COLORS[props.rural_urban_class] ?? "#94a3b8";
  if (attr === "data_confidence") {
    const { level } = getHexDataConfidence(props);
    return level === 'high' ? '#22c55e' : level === 'medium' ? '#f59e0b' : '#ef4444';
  }
  // Defensive: a hex with no historical data (shouldn't happen at full 12,705/12,705
  // coverage, but e.g. a coastal hex whose centroid falls just outside the ERA5 grid)
  // must render as neutral "no data", not silently fall through to 0 and get colored
  // like a real (often misleadingly "good") value.
  if (attr.startsWith("hist_") && props[attr] == null) return "#e2e8f0";
  const val = props[attr] ?? 0;
  const [lo, hi] = FIXED_DOMAIN[attr] ?? [0, 10];
  const t = hi > lo ? (val - lo) / (hi - lo) : 0;
  return gradientColor(ATTR_RAMP[attr] ?? GREENS, t);
}

// ── Cross-filter types ────────────────────────────────────────────────────────

interface CrossFilter {
  key: string;
  op: ">=" | "<=" | ">";
  value: number;
}

const FILTERABLE_KEYS = ATTRIBUTES.filter((a) => a.key !== "land_use" && a.key !== "rural_urban_class").map((a) => ({ key: a.key, label: a.label, icon: a.icon }));

// ── Sidebar ───────────────────────────────────────────────────────────────────

// ── District Rankings panel ────────────────────────────────────────────────────

interface RankingEntry {
  rank: number; district: string; state: string; risk_score: number;
  dominant_hazard: string; dominant_hazard_icon: string; dominant_hazard_score: number;
  explanation: string; recommendation: string;
  population_at_risk: number; children_under5_at_risk: number;
  top_vulnerabilities: string[];
}

function RankingsPanel({ onDistrictSelect }: { onDistrictSelect: (state: string, district: string) => void }) {
  const [sortBy, setSortBy] = useState("risk_score");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const rankQ = useQuery<RankingEntry[]>({
    queryKey: ["district-rankings"],
    queryFn: () => fetch("/data/district_rankings.json").then((r) => {
      if (!r.ok) throw new Error("Failed to load rankings");
      return r.json();
    }),
    staleTime: Infinity,
    retry: 1,
  });

  // dominant_hazard values in data: "flood" | "drought" | "wet-bulb heat" | "cold wave" | "landslide"
  const HAZARD_SORT_MAP: Record<string, string> = { flood: "flood", drought: "drought", heat: "wet-bulb heat", landslide: "landslide" };

  const sorted = useMemo(() => {
    if (!rankQ.data) return [];
    const data = [...rankQ.data];
    if (sortBy !== "risk_score") {
      const target = HAZARD_SORT_MAP[sortBy];
      data.sort((a, b) => {
        const aMatch = a.dominant_hazard === target ? 1 : 0;
        const bMatch = b.dominant_hazard === target ? 1 : 0;
        if (bMatch !== aMatch) return bMatch - aMatch;
        return b.risk_score - a.risk_score;
      });
    }
    return showAll ? data : data.slice(0, 20);
  }, [rankQ.data, sortBy, showAll]);

  if (!rankQ.data) return <div className="px-3 py-2 text-[10px] text-muted-foreground">Loading rankings...</div>;

  return (
    <div className="px-2 pb-2 space-y-1.5">
      <div className="flex gap-1 flex-wrap">
        {["risk_score", "flood", "drought", "heat", "landslide"].map((s) => (
          <button key={s} onClick={() => setSortBy(s)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${sortBy === s ? "bg-red-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
            {s === "risk_score" ? "Overall" : s === "heat" ? "Heat/WB" : s}
          </button>
        ))}
      </div>
      <div className="space-y-0.5 max-h-[40vh] overflow-y-auto">
        {sorted.map((r, i) => (
          <div key={r.district + r.state}>
            <button onClick={() => { setExpanded(expanded === i ? null : i); onDistrictSelect(r.state, r.district); }}
              className={`w-full text-left px-2 py-1.5 rounded-md text-[10px] hover:bg-muted/30 transition-colors ${expanded === i ? "bg-red-500/10" : ""}`}>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground w-5 text-right shrink-0">{r.rank}</span>
                <span className="text-xs">{r.dominant_hazard_icon}</span>
                <span className="font-semibold flex-1 truncate">{r.district}</span>
                <span className="font-mono font-bold" style={{ color: r.risk_score >= 7 ? "#ef4444" : r.risk_score >= 4 ? "#f59e0b" : "#22c55e" }}>
                  {r.risk_score.toFixed(1)}
                </span>
              </div>
              <div className="text-[9px] text-muted-foreground ml-7 truncate">{r.state}</div>
            </button>
            {expanded === i && (
              <div className="ml-2 px-2 py-2 bg-muted/20 rounded-md text-[10px] space-y-1.5 mb-1">
                <div className="text-foreground">{r.explanation}</div>
                <div className="flex gap-3 text-muted-foreground my-1">
                  <span>👥 {(r.population_at_risk || 0).toLocaleString()}</span>
                  <span>👶 {(r.children_under5_at_risk || 0).toLocaleString()}</span>
                </div>
                {(r as any).recommendations && (
                  <div className="space-y-1.5 border-t border-border/30 pt-1.5">
                    <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Resilience Actions</div>
                    {[
                      { key: "school", emoji: "🏫", label: "School" },
                      { key: "anganwadi", emoji: "👶", label: "Anganwadi" },
                      { key: "household", emoji: "🏠", label: "Household" },
                    ].map(({ key, emoji, label }) => {
                      const rec = (r as any).recommendations[key];
                      if (!rec) return null;
                      return (
                        <div key={key}>
                          <div className="font-semibold text-foreground">{emoji} {label}</div>
                          {rec.measures.slice(0, 2).map((m: string, mi: number) => (
                            <div key={mi} className="text-muted-foreground ml-3">• {m}</div>
                          ))}
                          <div className="ml-3 flex flex-wrap gap-1 mt-0.5">
                            {rec.schemes.map((s: string) => (
                              <span key={s} className="px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[8px]">{s}</span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {!showAll && rankQ.data.length > 20 && (
        <button onClick={() => setShowAll(true)}
          className="w-full text-[9px] text-muted-foreground hover:text-foreground py-1">
          Show all {rankQ.data.length} districts
        </button>
      )}
    </div>
  );
}

// ── Multi-Hazard Impact panel ─────────────────────────────────────────────────

const HAZARD_DEFS = [
  { key: "flood_risk",      label: "Flood",       icon: "🌊" },
  { key: "heat_risk",       label: "Heat",        icon: "🔥" },
  { key: "cyclone_risk",    label: "Cyclone",     icon: "🌀" },
  { key: "drought_risk",    label: "Drought",     icon: "☀️" },
  { key: "wetbulb_risk",    label: "Wet Bulb",    icon: "💧" },
  { key: "landslide_risk",  label: "Landslide",   icon: "🏔️" },
  { key: "coldwave_risk",   label: "Cold Wave",   icon: "❄️" },
  { key: "flashflood_risk", label: "Flash Flood",  icon: "⚡" },
  { key: "sealevel_risk",   label: "Sea Level",   icon: "🌊" },
  { key: "fire_risk",       label: "Fire",        icon: "🔥" },
];

function MultiHazardPanel({ features }: { features: any[] }) {
  const [selectedHazards, setSelectedHazards] = useState<Set<string>>(new Set(["flood_risk", "heat_risk", "cyclone_risk"]));
  const [threshold, setThreshold] = useState(5.0);

  const toggle = (key: string) => {
    setSelectedHazards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const stats = useMemo(() => {
    if (!features.length) return null;
    const breakdown: Record<number, { total: number; children: number; elderly: number; women: number }> = {};
    let maxK = 0;

    for (const f of features) {
      const p = f.properties;
      let count = 0;
      const hazardNames: string[] = [];
      for (const hk of Array.from(selectedHazards)) {
        if ((p[hk] ?? 0) >= threshold) { count++; hazardNames.push(hk); }
      }
      if (count > maxK) maxK = count;
      if (!breakdown[count]) breakdown[count] = { total: 0, children: 0, elderly: 0, women: 0 };
      breakdown[count].total    += p.population ?? 0;
      breakdown[count].children += p.pop_children_under_5 ?? 0;
      breakdown[count].elderly  += p.pop_elderly_60plus ?? 0;
      breakdown[count].women    += p.pop_women_15_49 ?? 0;
    }

    // Cumulative (k or more)
    const cumulative: Record<number, { total: number; children: number; elderly: number; women: number }> = {};
    for (let k = maxK; k >= 1; k--) {
      cumulative[k] = { total: 0, children: 0, elderly: 0, women: 0 };
      for (let j = k; j <= maxK; j++) {
        if (breakdown[j]) {
          cumulative[k].total    += breakdown[j].total;
          cumulative[k].children += breakdown[j].children;
          cumulative[k].elderly  += breakdown[j].elderly;
          cumulative[k].women    += breakdown[j].women;
        }
      }
    }

    return { breakdown, cumulative, maxK };
  }, [features, selectedHazards, threshold]);

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${n}`;

  return (
    <div className="px-3 pb-3 space-y-2">
      {/* Hazard checkboxes */}
      <div className="grid grid-cols-2 gap-1">
        {HAZARD_DEFS.map((h) => (
          <label key={h.key} className={`flex items-center gap-1 px-1.5 py-1 rounded text-[10px] cursor-pointer transition-colors ${
            selectedHazards.has(h.key) ? "bg-red-500/15 text-red-300" : "bg-muted/30 text-muted-foreground"
          }`}>
            <input type="checkbox" checked={selectedHazards.has(h.key)} onChange={() => toggle(h.key)}
              className="w-3 h-3 accent-red-500" />
            <span>{h.icon} {h.label}</span>
          </label>
        ))}
      </div>

      {/* Threshold */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-muted-foreground">Threshold</span>
        <input type="range" min={1} max={8} step={0.5} value={threshold}
          onChange={(e) => setThreshold(parseFloat(e.target.value))}
          className="flex-1 h-1 accent-red-500" />
        <span className="text-[10px] font-mono text-red-400 w-6">≥{threshold}</span>
      </div>

      {/* Results headline */}
      {stats && selectedHazards.size > 0 && (
        <div className="space-y-1.5">
          <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
            People facing N+ of {selectedHazards.size} selected hazards
          </div>
          {Array.from({ length: stats.maxK }, (_, i) => i + 1).map((k) => {
            const c = stats.cumulative[k];
            if (!c || c.total === 0) return null;
            return (
              <div key={k} className="bg-muted/20 rounded-md p-2">
                <div className="text-[11px] font-bold text-foreground mb-1">
                  {k}+ hazards
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">👥 Total</span><span className="font-semibold">{fmt(c.total)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">👶 Children</span><span className="font-semibold text-red-400">{fmt(c.children)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">🧓 Elderly</span><span className="font-semibold">{fmt(c.elderly)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">👩 Women</span><span className="font-semibold">{fmt(c.women)}</span></div>
                </div>
              </div>
            );
          })}
          {stats.maxK === 0 && (
            <div className="text-[10px] text-muted-foreground text-center py-2">
              No hexes meet threshold ≥{threshold} for selected hazards
            </div>
          )}
        </div>
      )}
      {selectedHazards.size === 0 && (
        <div className="text-[10px] text-muted-foreground text-center py-2">
          Select hazards above to see impact
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function FilterSidebar({
  collapsed, onToggle,
  attr, onAttrChange,
  selectedState, states, onStateChange,
  selectedDistrict, districts, onDistrictChange,
  crossFilters, onCrossFiltersChange, matchCount, totalCount,
  features,
  showDistricts, onShowDistrictsChange, showStates, onShowStatesChange,
  showRivers, onShowRiversChange,
  showSchools, onShowSchoolsChange,
  heatViewMode, onHeatViewModeChange,
  nfhs6Loading, nfhs6NDistricts,
  nfhs6Indicator, onNfhs6IndicatorChange,
  nfhs6Field, onNfhs6FieldChange,
  nfhs6Search, onNfhs6SearchChange,
  nfhs6FilteredIndicators, nfhs6TotalIndicators,
}: {
  collapsed: boolean; onToggle: () => void;
  attr: string; onAttrChange: (k: string) => void;
  selectedState: string; states: string[]; onStateChange: (s: string) => void;
  selectedDistrict: string; districts: string[]; onDistrictChange: (d: string) => void;
  crossFilters: CrossFilter[]; onCrossFiltersChange: (f: CrossFilter[]) => void;
  matchCount: number; totalCount: number;
  features: any[];
  showDistricts: boolean; onShowDistrictsChange: (v: boolean) => void;
  showStates: boolean; onShowStatesChange: (v: boolean) => void;
  showRivers: boolean; onShowRiversChange: (v: boolean) => void;
  showSchools: boolean; onShowSchoolsChange: (v: boolean) => void;
  heatViewMode: "annual" | "peak"; onHeatViewModeChange: (m: "annual" | "peak") => void;
  nfhs6Loading: boolean; nfhs6NDistricts: number;
  nfhs6Indicator: number; onNfhs6IndicatorChange: (n: number) => void;
  nfhs6Field: "delta" | "nfhs6" | "nfhs5"; onNfhs6FieldChange: (f: "delta" | "nfhs6" | "nfhs5") => void;
  nfhs6Search: string; onNfhs6SearchChange: (s: string) => void;
  nfhs6FilteredIndicators: { num: number; label: string }[]; nfhs6TotalIndicators: number;
}) {
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({ overview: true });

  const toggleCat = (id: string) => setOpenCats((prev) => ({ ...prev, [id]: !prev[id] }));

  if (collapsed) {
    return (
      <div className="w-10 border-r border-border/40 bg-background flex flex-col items-center py-3 shrink-0">
        <button onClick={onToggle} className="text-muted-foreground hover:text-foreground mb-4">
          <PanelLeft className="h-4 w-4" />
        </button>
        {CATEGORIES.map((c) => (
          <div key={c.id} className="text-sm mb-2 cursor-pointer" title={c.label}
               onClick={() => { onToggle(); setOpenCats((p) => ({ ...p, [c.id]: true })); }}>
            {c.icon}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-border/40 bg-background flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Grid3X3 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold">Layers</span>
        </div>
        <button onClick={onToggle} className="text-muted-foreground hover:text-foreground">
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Location filters */}
      <div className="px-3 py-2 border-b border-border/30 space-y-1.5">
        <div className="relative">
          <ChevronDown className="pointer-events-none absolute right-2 top-1.5 h-3 w-3 text-muted-foreground" />
          <select value={selectedState} onChange={(e) => onStateChange(e.target.value)}
            className="w-full appearance-none rounded-md border border-border/50 bg-muted/40 pl-2 pr-6 py-1 text-xs outline-none cursor-pointer text-foreground">
            <option value="All India">All India</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {districts.length > 0 && (
          <div className="relative">
            <ChevronDown className="pointer-events-none absolute right-2 top-1.5 h-3 w-3 text-muted-foreground" />
            <select value={selectedDistrict} onChange={(e) => onDistrictChange(e.target.value)}
              className="w-full appearance-none rounded-md border border-border/50 bg-muted/40 pl-2 pr-6 py-1 text-xs outline-none cursor-pointer text-foreground">
              <option value="All">All Districts</option>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Boundary overlays */}
      <div className="px-3 py-2 border-b border-border/30 flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
          <input type="checkbox" checked={showStates} onChange={(e) => onShowStatesChange(e.target.checked)}
            className="w-3 h-3 accent-amber-500" />
          <span className="text-amber-400">State lines</span>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
          <input type="checkbox" checked={showDistricts} onChange={(e) => onShowDistrictsChange(e.target.checked)}
            className="w-3 h-3 accent-gray-500" />
          <span className="text-muted-foreground">District lines</span>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
          <input type="checkbox" checked={showRivers} onChange={(e) => onShowRiversChange(e.target.checked)}
            className="w-3 h-3 accent-blue-500" />
          <span className="text-blue-400">Rivers</span>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
          <input type="checkbox" checked={showSchools} onChange={(e) => onShowSchoolsChange(e.target.checked)}
            className="w-3 h-3 accent-emerald-500" />
          <span className="text-emerald-400">Schools</span>
        </label>
      </div>
      {showSchools && selectedState !== "All India" && <SchoolsCoverageNote state={selectedState} />}

      {/* NFHS-6 indicator picker -- the Phase 2 grid's primary layer control.
          The hazard-layer picker lives on /grid; this replaces it here rather
          than duplicating it, per request. */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className="px-3 py-2 border-b border-border/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs">🏥</span>
            <span className="text-[11px] font-semibold flex-1">NFHS-6 Indicator</span>
            {nfhs6Loading
              ? <span className="text-[9px] text-muted-foreground">loading…</span>
              : <span className="text-[9px] text-muted-foreground">{nfhs6NDistricts} districts</span>}
          </div>
          <div className="grid grid-cols-3 gap-1 mb-2">
            {([["delta", "Change"], ["nfhs6", "2023-24"], ["nfhs5", "2019-21"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => onNfhs6FieldChange(k)}
                className={`px-1.5 py-1 rounded text-[10px] font-semibold transition-colors ${
                  nfhs6Field === k ? "bg-rose-600 text-white" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}>
                {l}
              </button>
            ))}
          </div>
          <input
            type="text" value={nfhs6Search} onChange={(e) => onNfhs6SearchChange(e.target.value)}
            placeholder={`Search ${nfhs6TotalIndicators || 93} indicators…`}
            className="w-full rounded-md border border-border/50 bg-muted/40 px-2 py-1 text-[11px] outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-1.5">
          {nfhs6FilteredIndicators.length === 0 ? (
            <div className="text-[10px] text-muted-foreground text-center py-4">No indicators match "{nfhs6Search}"</div>
          ) : (
            nfhs6FilteredIndicators.map((ind) => (
              <button
                key={ind.num}
                onClick={() => onNfhs6IndicatorChange(ind.num)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] flex items-start gap-2 transition-colors mb-0.5 ${
                  nfhs6Indicator === ind.num
                    ? "bg-rose-600/15 text-rose-400 font-semibold"
                    : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                }`}
              >
                <span className="flex-1 leading-tight">{ind.label}</span>
                {nfhs6Indicator === ind.num && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0" />}
              </button>
            ))
          )}
        </div>
        <p className="px-3 py-1.5 text-[9px] text-muted-foreground border-t border-border/20 leading-tight">
          {nfhs6Field === "delta"
            ? "Green = improved, red = worsened, NFHS-5 (2019-21) → NFHS-6 (2023-24)."
            : "Darker blue = higher value. Direction (good/bad) isn't assumed for a raw level — switch to Change to see improved vs. worsened."}
          {" "}Sanitation, cooking fuel, handwashing and anaemia aren't published in NFHS-6.
        </p>
      </div>

      {/* Cross-filter section */}
      <div className="border-t border-border/30">
        <button onClick={() => toggleCat("_crossfilter")}
          className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-muted/30">
          {openCats["_crossfilter"] ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          <span className="text-xs">🔍</span>
          <span className="text-[11px] font-semibold flex-1">Cross-Filter</span>
          {crossFilters.length > 0 && (
            <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 rounded font-semibold">
              {matchCount.toLocaleString()} / {totalCount.toLocaleString()}
            </span>
          )}
        </button>
        {openCats["_crossfilter"] && (
          <div className="px-3 pb-2 space-y-2">
            {crossFilters.map((cf, i) => (
              <div key={i} className="flex items-center gap-1">
                <select value={cf.key} onChange={(e) => {
                  const updated = [...crossFilters];
                  updated[i] = { ...cf, key: e.target.value };
                  onCrossFiltersChange(updated);
                }} className="flex-1 appearance-none rounded border border-border/50 bg-muted/40 px-1 py-0.5 text-[10px] outline-none text-foreground truncate">
                  {FILTERABLE_KEYS.map((k) => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}
                </select>
                <select value={cf.op} onChange={(e) => {
                  const updated = [...crossFilters];
                  updated[i] = { ...cf, op: e.target.value as CrossFilter["op"] };
                  onCrossFiltersChange(updated);
                }} className="w-10 appearance-none rounded border border-border/50 bg-muted/40 px-1 py-0.5 text-[10px] outline-none text-foreground text-center">
                  <option value=">=">≥</option>
                  <option value="<=">≤</option>
                  <option value=">">&gt;</option>
                </select>
                <input type="number" value={cf.value} onChange={(e) => {
                  const updated = [...crossFilters];
                  updated[i] = { ...cf, value: parseFloat(e.target.value) || 0 };
                  onCrossFiltersChange(updated);
                }} className="w-16 rounded border border-border/50 bg-muted/40 px-1 py-0.5 text-[10px] outline-none text-foreground text-right" />
                <button onClick={() => onCrossFiltersChange(crossFilters.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-red-400 text-[10px]">✕</button>
              </div>
            ))}
            <div className="flex gap-1">
              <button onClick={() => onCrossFiltersChange([...crossFilters, { key: "flood_risk", op: ">=", value: 5 }])}
                className="flex-1 px-2 py-1 rounded bg-muted/60 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground">
                + Add filter
              </button>
              {crossFilters.length > 0 && (
                <button onClick={() => onCrossFiltersChange([])}
                  className="px-2 py-1 rounded bg-red-500/10 text-[10px] text-red-400 hover:bg-red-500/20">
                  Clear
                </button>
              )}
            </div>
            {crossFilters.length === 0 && (
              <div className="text-[9px] text-muted-foreground">
                e.g. Children &lt;5 ≥ 10000 AND Flood risk ≥ 5
              </div>
            )}
          </div>
        )}
      </div>

      {/* Multi-Hazard Impact panel */}
      <div className="border-t border-border/30">
        <button onClick={() => toggleCat("_multihazard")}
          className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-muted/30">
          {openCats["_multihazard"] ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          <span className="text-xs">👶</span>
          <span className="text-[11px] font-semibold flex-1">Multi-Hazard Impact</span>
        </button>
        {openCats["_multihazard"] && <MultiHazardPanel features={features} />}
      </div>

      {/* District Rankings */}
      <div className="border-t border-border/30">
        <button onClick={() => toggleCat("_rankings")}
          className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-muted/30">
          {openCats["_rankings"] ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          <span className="text-xs">🏆</span>
          <span className="text-[11px] font-semibold flex-1">District Rankings</span>
        </button>
        {openCats["_rankings"] && <RankingsPanel onDistrictSelect={(state: string, district: string) => { onStateChange(state); setTimeout(() => onDistrictChange(district), 100); }} />}
      </div>

      {/* Export */}
      <div className="px-3 py-2 border-t border-border/30">
        <button onClick={() => {
          const csvKeys = ["h3_id","state","district_name","population","pop_children_under_5","pop_elderly_60plus","pop_women_15_49","hex_risk","hazard_count_5","hazard_count_3","flood_risk","heat_risk","cyclone_risk","drought_risk","wetbulb_risk","landslide_risk","coldwave_risk","flashflood_risk","sealevel_risk","fire_risk","cascade_count","adaptive_capacity","jjm_fhtc_pct","wash_sanitation_pct","wash_water_pct","wash_health_pct","wash_stunting_pct","wash_diarrhoea_pct","wash_anaemia_pct","wash_wasting_pct","gw_stress_score","elevation_mean","ndvi_mean","land_use","dist_to_river_km","pm25_annual","pollution_risk","total_burden_days","weighted_burden_children","weighted_burden_elderly"];
          const header = csvKeys.join(",");
          const rows = features.map((f: any) => csvKeys.map((k) => {
            const v = f.properties[k]; return v == null ? "" : typeof v === "string" && v.includes(",") ? `"${v}"` : v;
          }).join(","));
          const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
          a.download = "climreswash_hex_data.csv"; a.click();
        }} className="w-full px-2 py-1.5 rounded-md bg-muted/60 text-[10px] text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5">
          📥 Export CSV ({features.length} hexes)
        </button>
      </div>

      {/* Heat view toggle — only shown when Heatwave layer is active */}
      {attr === "heat_risk" && (
        <div className="px-3 py-2 border-t border-border/30 bg-amber-500/5">
          <div className="text-[10px] text-muted-foreground mb-1.5">🔥 Heat view</div>
          <div className="flex gap-1">
            <button
              onClick={() => onHeatViewModeChange("annual")}
              className={`flex-1 py-1 text-[10px] rounded transition-colors ${heatViewMode === "annual" ? "bg-amber-500/25 text-amber-300 font-semibold" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"}`}
            >
              Annual
            </button>
            <button
              onClick={() => onHeatViewModeChange("peak")}
              className={`flex-1 py-1 text-[10px] rounded transition-colors ${heatViewMode === "peak" ? "bg-amber-500/25 text-amber-300 font-semibold" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"}`}
            >
              Peak season
            </button>
          </div>
          <div className="text-[9px] text-muted-foreground mt-1">
            {heatViewMode === "annual" ? "Annual average risk (green=low, red=high)" : "Risk in the hottest month (domain 0–10)"}
          </div>
        </div>
      )}

      {/* Active layer info */}
      {(() => {
        const active = ATTRIBUTES.find((a) => a.key === attr);
        return active ? (
          <div className="px-3 py-2 border-t border-border/30 bg-muted/20">
            <div className="text-[10px] font-semibold text-foreground">{active.icon} {active.label}</div>
            <div className="text-[9px] text-muted-foreground mt-0.5">{active.desc}</div>
          </div>
        ) : null;
      })()}
    </div>
  );
}

// ── Canvas + map setup ────────────────────────────────────────────────────────

const canvasRenderer = L.canvas({ padding: 0.5 });
// Dedicated pane + renderer for state/district boundaries, kept above the hex
// canvas so boundary clicks are never swallowed by whichever layer happened
// to finish loading (and therefore drawing) last.
const boundaryRenderer = L.svg({ pane: "boundaries" });

function SetupCanvas() {
  const map = useMap();
  useEffect(() => {
    (map as any).options.renderer = canvasRenderer;
    if (!map.getPane("boundaries")) {
      map.createPane("boundaries");
      map.getPane("boundaries")!.style.zIndex = "450";
    }
  }, [map]);
  return null;
}

// ── Hex info panel ────────────────────────────────────────────────────────────

// One village record, serialized as a positional array to keep the ~640K-village
// national file small (see attach_village_boundaries_to_hexes.py docstring):
// [name, gp, gp_code, block, district, population, households].
// "district" non-null means it's a real Survey of India boundary polygon (via NWDP)
// -- gp/block/population/households are real government data. district null means
// it's an OSM fallback point (for hexes SoI didn't cover -- Uttarakhand + gaps),
// name-only, population almost always null. GP-name coverage varies genuinely by
// state in the source data itself (populated in Kerala/TN/Karnataka/Bihar, blank in
// Rajasthan/Goa/Maharashtra/WB) -- not a bug, so render it as "GP: —" rather than
// hiding the row.
type VillageArr = [
  name: string, gp: string | null, gp_code: string | null, block: string | null,
  district: string | null, population: number | null, households: number | null,
];
type VillageHexEntry = { count: number; source: "soi" | "osm" | "mixed"; villages: VillageArr[] };

const INST_ICONS: Record<string, string> = { school: "🏫", anganwadi: "🌸", household: "🏠" };
const RISK_LABEL: Record<string, string> = {
  flood_risk: "Flood", heat_risk: "Heat", cyclone_risk: "Cyclone", drought_risk: "Drought",
  wetbulb_risk: "Wet Bulb", landslide_risk: "Landslide", coldwave_risk: "Cold Wave",
  flashflood_risk: "Flash Flood", sealevel_risk: "Sea Level", fire_risk: "Fire",
};

function HexInfoPanel({ props, ranking, confidence, villages, villagesLoading, onClose }: {
  props: any;
  ranking: any | null;
  confidence: { p5: number; p95: number; mean: number; sd: number } | null;
  villages: VillageHexEntry | null;
  villagesLoading: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"data" | "actions">("data");
  const [villagesExpanded, setVillagesExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [nfhs6Expanded, setNfhs6Expanded] = useState(false);
  const nfhs6Q = useQuery<{
    meta: { n_districts: number; n_matched: number; source: string; note: string };
    districts: Array<{ state: string; district: string; matched_factors: boolean;
      factors: Record<string, number> | null;
      indicators: Record<string, { label: string; nfhs6: number; nfhs5: number; delta: number; improved: boolean; small_sample: boolean }> }>;
    correlations: Array<{ indicator: string; field: string; factor: string; r: number; n: number }>;
  }>({
    queryKey: ["nfhs6-district-trends"],
    queryFn: () => fetch("/data/nfhs6_district_trends.json").then((r) => r.json()),
    staleTime: Infinity,
    enabled: nfhs6Expanded,
  });
  const hasRanking = !!ranking;
  const ciWidth = confidence ? confidence.p95 - confidence.p5 : null;
  const ciLabel = ciWidth != null ? (ciWidth < 1.5 ? "High" : ciWidth < 3 ? "Moderate" : "Low") : null;
  const ciColor = ciLabel === "High" ? "text-emerald-400" : ciLabel === "Moderate" ? "text-amber-400" : "text-red-400";

  return (
    <div className="bg-background/95 backdrop-blur border border-border/40 rounded-lg shadow-lg w-64 max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between p-3 pb-2 border-b border-border/30">
        <div>
          <div className="text-xs font-semibold">{props.district_name ?? props.state}</div>
          <div className="text-[10px] text-muted-foreground">{props.state}</div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-2 shrink-0">
          <span className="text-xs">✕</span>
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-border/30">
        <button
          className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${tab === "data" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setTab("data")}
        >
          📊 Risk Data
        </button>
        <button
          className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${tab === "actions" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"} ${!hasRanking ? "opacity-40 cursor-not-allowed" : ""}`}
          onClick={() => hasRanking && setTab("actions")}
        >
          📋 Actions
        </button>
      </div>

      {tab === "data" && (
        <div className="p-3 space-y-1 text-[11px]">
          <div className="flex justify-between"><span className="text-muted-foreground">⛰️ Elevation</span><span className="font-medium">{props.elevation_mean}m</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">🌿 NDVI</span><span className="font-medium">{props.ndvi_mean}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">🗺️ Land Use</span><span className="font-medium capitalize">{props.land_use}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">👥 Population</span><span className="font-medium">{(props.population ?? 0).toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">👶 Children &lt;5</span><span className="font-medium">{(props.pop_children_under_5 ?? 0).toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">🧓 Elderly 60+</span><span className="font-medium">{(props.pop_elderly_60plus ?? 0).toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">👩 Women 15-49</span><span className="font-medium">{(props.pop_women_15_49 ?? 0).toLocaleString()}</span></div>
          {props.rural_urban_class && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">🏙️ Rural / Urban</span>
              <span className="font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ background: RURAL_URBAN_COLORS[props.rural_urban_class] }} />
                {props.rural_urban_class === "rural" ? "Rural" : props.rural_urban_class === "urban" ? "Urban" : props.rural_urban_class === "composite" ? "Composite" : "—"}
              </span>
            </div>
          )}
          {(props.rural_urban_class === "urban" || props.rural_urban_class === "composite") && (
            <div className="text-[9px] text-muted-foreground italic -mt-0.5">
              {(props.urban_pop ?? 0).toLocaleString()} of {(props.population ?? 0).toLocaleString()} live outside any named village —
              this hex is a candidate for finer-than-hex breakdown.
            </div>
          )}
          {props.hist_rainfall_mean != null && (
            <div>
              <button className="flex justify-between w-full" onClick={() => setHistoryExpanded((v) => !v)}>
                <span className="text-muted-foreground">📜 Historical Climate (1940-2024)</span>
                <span className="font-medium">{historyExpanded ? "▾" : "▸"}</span>
              </button>
              {historyExpanded && (
                <div className="mt-1 space-y-0.5 pl-1 border-l border-border/30 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mean annual rainfall</span>
                    <span className="font-medium">{props.hist_rainfall_mean?.toLocaleString()}mm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rainfall trend</span>
                    <span className={`font-medium ${props.hist_rainfall_trend < 0 ? "text-amber-500" : "text-blue-400"}`}>
                      {props.hist_rainfall_trend > 0 ? "+" : ""}{props.hist_rainfall_trend}mm/decade
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monsoon reliability (CV)</span>
                    <span className="font-medium">{props.hist_rainfall_cv}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mean annual temp</span>
                    <span className="font-medium">{props.hist_temp_mean}°C</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Warming trend</span>
                    <span className={`font-medium ${props.hist_temp_trend < 0 ? "text-blue-400" : "text-red-400"}`}>
                      {props.hist_temp_trend > 0 ? "+" : ""}{props.hist_temp_trend}°C/decade
                    </span>
                  </div>
                  {props.hist_recent_vs_baseline_rainfall_pct != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rain, 1995-2024 vs 1940-1969</span>
                      <span className="font-medium">{props.hist_recent_vs_baseline_rainfall_pct > 0 ? "+" : ""}{props.hist_recent_vs_baseline_rainfall_pct}%</span>
                    </div>
                  )}
                  {props.hist_recent_vs_baseline_temp_c != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Temp, 1995-2024 vs 1940-1969</span>
                      <span className="font-medium">{props.hist_recent_vs_baseline_temp_c > 0 ? "+" : ""}{props.hist_recent_vs_baseline_temp_c}°C</span>
                    </div>
                  )}
                  <p className="text-[9px] text-muted-foreground italic pt-0.5">
                    ERA5 monthly-mean reanalysis (Copernicus/ECMWF, CC-BY 4.0), per-hex, 85-year record.
                  </p>
                </div>
              )}
            </div>
          )}
          {props.district_name && (
            <div>
              <button className="flex justify-between w-full" onClick={() => setNfhs6Expanded((v) => !v)}>
                <span className="text-muted-foreground">🏥 NFHS-5→6 District Trends</span>
                <span className="font-medium">{nfhs6Expanded ? "▾" : "▸"}</span>
              </button>
              {nfhs6Expanded && (() => {
                if (nfhs6Q.isLoading) return <div className="mt-1 text-[10px] text-muted-foreground">Loading NFHS-6 district compendiums…</div>;
                if (nfhs6Q.isError || !nfhs6Q.data) return <div className="mt-1 text-[10px] text-red-400">Failed to load NFHS-6 district data</div>;
                const norm = (s: string) => (s || "").toLowerCase().replace(/&/g, "and").replace(/[-_]/g, " ").trim();
                const rec = nfhs6Q.data.districts.find(
                  (d) => norm(d.district) === norm(props.district_name) && norm(d.state) === norm(props.state)
                );
                if (!rec) return <div className="mt-1 text-[10px] text-muted-foreground italic">No NFHS-6 district compendium matched for {props.district_name} — likely a genuinely new district with no predecessor (Telangana's Hanumakonda/Mulugu, Haryana's Charkhi Dadri, Tamil Nadu's Tenkasi, Delhi's Shahdara) or Mumbai/Mahe, which this platform's boundaries can't currently place correctly.</div>;
                const rows = Object.values(rec.indicators).filter((i) => !i.small_sample);
                const topMovers = [...rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 15);
                const improvedCount = rows.filter((i) => i.improved).length;
                return (
                  <div className="mt-1 space-y-1 pl-1 border-l border-border/30 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Indicators improved / worsened</span>
                      <span className="font-medium"><span className="text-emerald-400">{improvedCount}</span> / <span className="text-red-400">{rows.length - improvedCount}</span> of {rows.length}</span>
                    </div>
                    {!rec.matched_factors && (
                      <p className="text-amber-500 italic">Terrain/hazard correlation unavailable — district name didn't match this platform's hex boundaries.</p>
                    )}
                    <p className="text-muted-foreground italic pt-0.5">Top 15 movers, NFHS-5 (2019-21) → NFHS-6 (2023-24):</p>
                    <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                      {topMovers.map((ind, i) => (
                        <div key={i} className="flex justify-between gap-2">
                          <span className="text-muted-foreground leading-tight">{ind.label.replace(/\s*\(%\)\s*$/, "")}</span>
                          <span className={`font-medium shrink-0 ${ind.improved ? "text-emerald-400" : "text-red-400"}`}>
                            {ind.nfhs5}→{ind.nfhs6} ({ind.delta > 0 ? "+" : ""}{ind.delta})
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-muted-foreground italic pt-0.5">
                      NFHS-6 (2023-24) vs NFHS-5 (2019-21) State/District Fact Sheet Compendiums, IIPS/MoHFW. Sanitation, cooking fuel, handwashing and anaemia aren't published in NFHS-6 — not shown here, not a gap in this parse.
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
          <div className="border-t border-border/30 my-1 pt-1" />
          <div>
            <button className="flex justify-between w-full" onClick={() => setVillagesExpanded((v) => !v)}>
              <span className="text-muted-foreground">🏘️ Villages in this hex</span>
              <span className="font-medium">
                {villagesLoading ? "…" : villages ? `${villages.count.toLocaleString()} ${villagesExpanded ? "▾" : "▸"}` : "0"}
              </span>
            </button>
            {villagesExpanded && villages && (
              <div className="mt-1 max-h-40 overflow-y-auto space-y-1 pl-1 border-l border-border/30">
                {villages.villages.slice(0, 200).map(([name, gp, , block, district, population], i) => (
                  <div key={i} className="text-[10px]">
                    <div className="text-muted-foreground flex justify-between gap-2">
                      <span className="truncate">{name}</span>
                      {population != null && <span className="shrink-0 font-medium">{population.toLocaleString()}</span>}
                    </div>
                    {district && (
                      <div className="text-[9px] text-muted-foreground/70 truncate">
                        {gp ? `GP: ${gp}` : "GP: —"}{block ? ` · ${block}` : ""}{`, ${district}`}
                      </div>
                    )}
                  </div>
                ))}
                {villages.villages.length > 200 && (
                  <div className="text-[9px] text-muted-foreground italic">+{villages.villages.length - 200} more</div>
                )}
                <div className="text-[9px] text-muted-foreground italic pt-0.5">
                  {villages.source === "soi" && "Survey of India village boundaries (via NWDP) — real Gram Panchayat/block linkage where the source reports it."}
                  {villages.source === "osm" && "From OpenStreetMap — real but not exhaustive coverage, no official GP linkage."}
                  {villages.source === "mixed" && "Mix of Survey of India boundaries and OpenStreetMap fallback points."}
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-border/30 my-1 pt-1" />
          {Object.entries(RISK_LABEL).map(([k, label]) => {
            const v = props[k];
            if (!v || v < 0.01) return null;
            return (
              <div key={k} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className={`font-medium ${v > 2 ? "text-red-400" : v > 1 ? "text-amber-400" : ""}`}>{v}</span>
              </div>
            );
          })}
          <div className="border-t border-border/30 pt-1 mt-1">
            <div className="flex justify-between font-bold">
              <span>⚠️ Max Risk</span>
              <span>{props.hex_risk ?? "—"}</span>
            </div>
            {confidence && (
              <div className="mt-1 space-y-0.5">
                <div className="flex justify-between text-[9px]">
                  <span className="text-muted-foreground">90% CI</span>
                  <span className="font-medium tabular-nums">{confidence.p5.toFixed(1)} – {confidence.p95.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-[9px]">
                  <span className="text-muted-foreground">Confidence</span>
                  <span className={`font-semibold ${ciColor}`}>{ciLabel}</span>
                </div>
                <div className="h-1 rounded-full bg-muted/40 overflow-hidden mt-1">
                  <div
                    className="h-full rounded-full bg-primary/40"
                    style={{ width: `${Math.min(100, (confidence.p5 / 10) * 100)}%`, marginLeft: 0 }}
                  />
                </div>
                <div className="relative h-1 -mt-1 rounded-full overflow-hidden">
                  <div
                    className="absolute h-full bg-primary/70 rounded-full"
                    style={{
                      left: `${(confidence.p5 / 10) * 100}%`,
                      width: `${((confidence.p95 - confidence.p5) / 10) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          {props.peak_season_month && (
            <div className="flex justify-between text-[10px] mt-1 border-t border-border/30 pt-1">
              <span className="text-muted-foreground">📅 Peak risk season</span>
              <span className="font-medium text-amber-300">
                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][props.peak_season_month - 1]}
              </span>
            </div>
          )}
          {props.cascade_count > 0 && (
            <div className="text-[10px] text-red-400 font-semibold mt-1">
              🔗 {props.cascade_count} WASH cascade{props.cascade_count > 1 ? "s" : ""} active
            </div>
          )}
          {/* Data-provenance confidence badge */}
          {(() => {
            const { level, reason, dominant } = getHexDataConfidence(props);
            const col = level === 'high' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
              : level === 'medium' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
              : 'text-red-400 border-red-500/30 bg-red-500/10';
            const label = level === 'high' ? 'High' : level === 'medium' ? 'Medium' : 'Low';
            return (
              <div className="mt-2 pt-2 border-t border-border/30 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground">Data confidence</span>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${col}`}>{label}</span>
                </div>
                <p className="text-[9px] text-muted-foreground/70 leading-snug">{reason}</p>
                <p className="text-[9px] text-muted-foreground/50">Dominant: {RISK_LABEL[dominant] ?? dominant}</p>
              </div>
            );
          })()}
          <div className="mt-1 text-[9px] text-muted-foreground/50 truncate">{props.h3_id}</div>
        </div>
      )}

      {tab === "actions" && ranking && (
        <div className="p-3 space-y-3 text-[11px]">
          {/* District snapshot */}
          <div className="flex gap-2 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${ranking.risk_score >= 5 ? "bg-red-500/15 text-red-400 border-red-500/30" : ranking.risk_score >= 3 ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"}`}>
              ⚠️ Risk {ranking.risk_score.toFixed(1)}/10
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border/40 bg-muted/30">
              {ranking.dominant_hazard_icon} {ranking.dominant_hazard}
            </span>
          </div>
          {ranking.recommendation && (
            <p className="text-[10px] text-muted-foreground italic leading-snug">{ranking.recommendation}</p>
          )}

          {/* Institution actions */}
          {(["school", "anganwadi", "household"] as const).map((inst) => {
            const rec = ranking.recommendations?.[inst];
            if (!rec?.measures?.length) return null;
            return (
              <div key={inst} className="border border-border/30 rounded-md p-2 bg-muted/10">
                <div className="text-[10px] font-semibold mb-1.5">{INST_ICONS[inst]} {inst.charAt(0).toUpperCase() + inst.slice(1)} Actions</div>
                <ul className="space-y-1">
                  {rec.measures.slice(0, 2).map((m: string, i: number) => (
                    <li key={i} className="flex gap-1 text-[10px]">
                      <span className="text-muted-foreground shrink-0 mt-0.5">•</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
                {rec.schemes?.[0] && (
                  <div className="mt-1.5 text-[9px] text-muted-foreground">💰 {rec.schemes[0]}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer links */}
      {props.district_name && props.district_name !== "Unknown" && (
        <div className="p-3 pt-0 flex gap-1.5">
          <a
            href={`/report/${encodeURIComponent(props.district_name)}`}
            target="_blank" rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground border border-border/40 rounded py-1 hover:bg-muted/30 transition-colors"
          >
            📄 Full Report
          </a>
          <a
            href="/wash-assess"
            target="_blank" rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1 text-[10px] font-medium text-primary border border-primary/30 rounded py-1 hover:bg-primary/10 transition-colors"
          >
            🎯 Assess
          </a>
        </div>
      )}
    </div>
  );
}

// ── SBM district-name matching ──────────────────────────────────────────────────
// sbm_toilet_types.json is keyed by the district names SBM's own portal uses, which are
// frequently NOT what the hex grid's india.json district source uses -- different
// English transliterations of the same district (Bellary/Ballari, Mysore/Mysuru),
// spacing/punctuation differences (Uttarkashi/Uttar Kashi), or genuine renames
// (Allahabad/Prayagraj). Raw exact-match was landing at 59% (425/720 state|district
// combos) -- most of the rest weren't scraper failures, they're this exact problem.
//
// SBM_DISTRICT_ALIAS below covers every rename VERIFIED against SBM's own district
// list for that state (i.e. the target name actually exists in the data, not a guess).
// Two categories deliberately NOT aliased here, left as honest gaps instead of wrong
// matches:
//  - Real administrative SPLITS (Andhra Pradesh's 2022 13->26 district reorganization,
//    Telangana's Warangal/Hanamkonda split, Chhattisgarh's 2022 new districts) -- these
//    aren't 1:1 renames, a naive alias would misattribute one new district's data to
//    several old ones, the same class of problem the Rajasthan CSR/JJM work handled by
//    NOT guessing.
//  - Districts genuinely absent from SBM Phase 2's own data even within a covered state
//    (e.g. Uttarakhand only reports 7 of 13 districts; several Gujarat/Tamil Nadu
//    districts aren't in the source at all) -- no alias fixes a real data gap.
//  - Punjab, Haryana, Delhi, Puducherry, Andaman & Nicobar are entirely absent from SBM
//    Phase 2 as a state -- structural, not a naming issue.
const SBM_DISTRICT_ALIAS: Record<string, string> = {
  // Karnataka (Kannada-spelling renames, boundaries unchanged)
  "KARNATAKA|BAGALKOT": "KARNATAKA|BAGALKOTE", "KARNATAKA|BELGAUM": "KARNATAKA|BELAGAVI",
  "KARNATAKA|BELLARY": "KARNATAKA|BALLARI", "KARNATAKA|BIJAPUR": "KARNATAKA|VIJAYAPURA",
  "KARNATAKA|CHAMARAJANAGAR": "KARNATAKA|CHAMARAJANAGARA", "KARNATAKA|CHIKMAGALUR": "KARNATAKA|CHIKKAMAGALURU",
  "KARNATAKA|DAVANAGERE": "KARNATAKA|DAVANGERE", "KARNATAKA|GULBARGA": "KARNATAKA|KALABURAGI",
  "KARNATAKA|MYSORE": "KARNATAKA|MYSURU", "KARNATAKA|SHIMOGA": "KARNATAKA|SHIVAMOGGA",
  "KARNATAKA|TUMKUR": "KARNATAKA|TUMAKURU", "KARNATAKA|BANGALORE": "KARNATAKA|BENGALURU URBAN",
  "KARNATAKA|BANGALORE RURAL": "KARNATAKA|BENGALURU RURAL",
  // Maharashtra
  "MAHARASHTRA|AHMADNAGAR": "MAHARASHTRA|AHMEDNAGAR", "MAHARASHTRA|AURANGABAD": "MAHARASHTRA|CHHATRAPATI SAMBHAJINAGAR",
  "MAHARASHTRA|BID": "MAHARASHTRA|BEED", "MAHARASHTRA|BULDANA": "MAHARASHTRA|BULDHANA",
  "MAHARASHTRA|GONDIYA": "MAHARASHTRA|GONDIA", "MAHARASHTRA|OSMANABAD": "MAHARASHTRA|DHARASHIV",
  "MAHARASHTRA|RAIGARH": "MAHARASHTRA|RAIGAD",
  // Gujarat (only districts confirmed present in SBM's Gujarat list -- ~12 Gujarat
  // districts are absent from SBM entirely and aren't aliased below)
  "GUJARAT|AHMADABAD": "GUJARAT|AHMEDABAD", "GUJARAT|ARAVALI": "GUJARAT|ARVALLI",
  "GUJARAT|CHHOTA UDAIPUR": "GUJARAT|CHHOTAUDEPUR", "GUJARAT|DOHAD": "GUJARAT|DAHOD",
  "GUJARAT|THE DANGS": "GUJARAT|DANGS", "GUJARAT|BANASKANTHA": "GUJARAT|BANAS KANTHA",
  "GUJARAT|SABARKANTHA": "GUJARAT|SABAR KANTHA",
  // West Bengal
  "WEST BENGAL|KOCH BIHAR": "WEST BENGAL|COOCH BEHAR", "WEST BENGAL|MALDAH": "WEST BENGAL|MALDA",
  "WEST BENGAL|HUGLI": "WEST BENGAL|HOOGHLY", // Howrah is absent from SBM's WB data entirely, no alias possible
  "WEST BENGAL|DARJILING": "WEST BENGAL|DARJEELING", "WEST BENGAL|PURULIYA": "WEST BENGAL|PURULIA",
  "WEST BENGAL|NORTH TWENTY FOUR PARGANAS": "WEST BENGAL|NORTH 24 PARGANAS",
  "WEST BENGAL|SOUTH TWENTY FOUR PARGANAS": "WEST BENGAL|SOUTH 24 PARGANAS",
  "WEST BENGAL|PURBA BARDDHAMAN": "WEST BENGAL|PURBA BARDHAMAN", "WEST BENGAL|PASCHIM BARDDHAMAN": "WEST BENGAL|PASCHIM BARDHAMAN",
  // Odisha
  "ODISHA|BAUDH": "ODISHA|BOUDH", "ODISHA|DEBAGARH": "ODISHA|DEOGARH",
  "ODISHA|SUBARNAPUR": "ODISHA|SONEPUR", "ODISHA|NABARANGAPUR": "ODISHA|NABARANGPUR",
  // Uttarakhand (Garhwal/Tehri Garhwal/Almora/Champawat/Nainital/Rudraprayag are genuinely
  // absent from SBM entirely -- 7 of 13 districts covered, not a naming issue)
  "UTTARAKHAND|UTTARKASHI": "UTTARAKHAND|UTTAR KASHI", "UTTARAKHAND|UDHAM SINGH NAGAR": "UTTARAKHAND|UDAM SINGH NAGAR",
  // Jharkhand
  "JHARKHAND|PASHCHIMI SINGHBHUM": "JHARKHAND|WEST SINGHBHUM", "JHARKHAND|PURBI SINGHBHUM": "JHARKHAND|EAST SINGHBUM",
  "JHARKHAND|SARAIKELA-KHARSAWAN": "JHARKHAND|SARAIKELA KHARSAWAN", "JHARKHAND|SAHIBGANJ": "JHARKHAND|SAHEBGANJ",
  "JHARKHAND|KODARMA": "JHARKHAND|KODERMA",
  // Bihar
  "BIHAR|PURBA CHAMPARAN": "BIHAR|PURBI CHAMPARAN",
  // Uttar Pradesh -- SBM's own UP coverage is thin (26 of 75 districts), so most renamed
  // districts (Ayodhya, Amroha, Hathras, Kasganj, Shamli) aren't in the source at all even
  // post-rename; only these two verified targets actually exist in the data
  "UTTAR PRADESH|ALLAHABAD": "UTTAR PRADESH|PRAYAGRAJ",
  "UTTAR PRADESH|SANT RAVIDAS NAGAR (BHADOHI)": "UTTAR PRADESH|BHADOHI",
  // Jammu & Kashmir
  "JAMMU & KASHMIR|BANDIPORE": "JAMMU & KASHMIR|BANDIPORA", "JAMMU & KASHMIR|BARAMULA": "JAMMU & KASHMIR|BARAMULLA",
  "JAMMU & KASHMIR|PUNCH": "JAMMU & KASHMIR|POONCH", "JAMMU & KASHMIR|BADGAM": "JAMMU & KASHMIR|BUDGAM",
  "JAMMU & KASHMIR|SHUPIYAN": "JAMMU & KASHMIR|SHOPIAN",
  // Ladakh
  "LADAKH|LEH(LADAKH)": "LADAKH|LEH LADAKH",
  // Telangana
  "TELANGANA|RANGAREDDY": "TELANGANA|RANGA REDDY", "TELANGANA|KOMARAM BHEEM": "TELANGANA|KUMURAM BHEEM ASIFABAD",
  "TELANGANA|JAYASHANKAR": "TELANGANA|JAYASHANKAR BHUPALAPALLY", "TELANGANA|JOGULAMBA": "TELANGANA|JOGULAMBA GADWAL",
  "TELANGANA|BHADRADRI": "TELANGANA|BHADRADRI KOTHAGUDEM", "TELANGANA|YADADRI BHONGIRI": "TELANGANA|YADADRI BHUVANAGIRI",
};

function sbmLookupKeys(state: string, district: string): string[] {
  const raw = `${(state ?? "").toUpperCase()}|${(district ?? "").toUpperCase()}`;
  const keys = [raw];
  if (SBM_DISTRICT_ALIAS[raw]) keys.push(SBM_DISTRICT_ALIAS[raw]);
  return keys;
}

// ── Legend ─────────────────────────────────────────────────────────────────────

const LEGEND_OVERRIDES: Record<string, { icon: string; label: string }> = {
  heat_peak_score: { icon: "🔥", label: "Heatwave — Peak season" },
};

// Explicit "does a higher number mean better or worse" per layer -- shown directly on
// the legend rather than left for the user to infer from color alone. Deliberately a
// hand-checked table, not inferred from which color ramp a layer happens to use: several
// layers (flood_risk, heat_risk, jjm_fhtc_pct, wash_water_pct...) use a thematic color
// (blue for water, orange for heat) rather than the green/red good/bad ramp, so ramp
// identity alone isn't a reliable signal of direction.
const LAYER_DIRECTION: Record<string, "good" | "bad"> = {
  // hazard / risk / burden scores -- higher is always worse
  flood_risk: "bad", heat_risk: "bad", heat_peak_score: "bad", cyclone_risk: "bad", drought_risk: "bad",
  wetbulb_risk: "bad", landslide_risk: "bad", coldwave_risk: "bad", flashflood_risk: "bad",
  sealevel_risk: "bad", fire_risk: "bad", pollution_risk: "bad", hex_risk: "bad", cascade_count: "bad",
  hazard_count_5: "bad", hazard_count_3: "bad", total_burden_days: "bad", multi_hazard_days: "bad",
  weighted_burden_children: "bad", weighted_burden_elderly: "bad", gw_stress_score: "bad", pm25_annual: "bad",
  risk_ssp245_2050: "bad", risk_ssp585_2030: "bad", risk_ssp585_2050: "bad",
  heat_days_ssp585_2050: "bad", severe_heat_days_ssp585_2050: "bad", wet_bulb_days_ssp585_2050: "bad", flood_days_ssp585_2050: "bad",
  // WASH access / outcome measures
  adaptive_capacity: "good", jjm_fhtc_pct: "good", wash_sanitation_pct: "good", wash_water_pct: "good", wash_health_pct: "good",
  wash_stunting_pct: "bad", wash_diarrhoea_pct: "bad", wash_anaemia_pct: "bad", wash_wasting_pct: "bad",
  menstrual_hygiene_pct: "good", clean_fuel_pct: "good", ors_diarrhoea_pct: "good", antenatal_4visit_pct: "good", child_marriage_pct: "bad",
  // SBM toilet types -- twin-pit and septic+soak are safely-contained/treated outcomes;
  // single-pit and septic-without-soak-pit both mean waste isn't safely handled
  // sbm_septic_nosoak_pct deliberately excluded -- data-audited to be mostly an
  // "unverified, defaults here" bucket rather than a genuine WASH outcome, see its
  // description. Showing a good/bad direction for it would overstate what's known.
  sbm_twin_pit_pct: "good", sbm_septic_soak_pct: "good", sbm_single_pit_pct: "bad",
  // Historical trends (1940-2024) -- hist_rainfall_trend deliberately excluded: whether
  // drying or wetting is "bad" depends on the district's baseline (drought-prone areas
  // drying further vs flood-prone areas getting wetter), no single direction fits.
  hist_temp_trend: "bad", hist_rainfall_cv: "bad",
};

function Legend({ attr, timelapseYear, nfhs6Label, nfhs6Field }: { attr: string; timelapseYear?: number | null; nfhs6Label?: string; nfhs6Field?: "delta" | "nfhs6" | "nfhs5" }) {
  if (attr === "nfhs6") {
    const isDelta = nfhs6Field === "delta";
    return (
      <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-2.5 shadow-lg w-52">
        <p className="text-[10px] font-semibold mb-1.5 leading-tight">🏥 {nfhs6Label}</p>
        {isDelta ? (
          <>
            <div className="h-2.5 w-full rounded-sm mb-1" style={{ background: "linear-gradient(to right, #ef4444, #fee2e2, #d1fae5, #10b981)" }} />
            <div className="flex justify-between text-[9px] text-muted-foreground"><span>Worsened</span><span>Improved</span></div>
          </>
        ) : (
          <>
            <div className="h-2.5 w-full rounded-sm mb-1" style={{ background: "linear-gradient(to right, #dbeafe, #1e40af)" }} />
            <div className="flex justify-between text-[9px] text-muted-foreground"><span>Low</span><span>High</span></div>
          </>
        )}
        <p className="text-[9px] text-muted-foreground italic mt-1">Gray = district not matched. {nfhs6Field === "nfhs6" ? "2023-24 level" : nfhs6Field === "nfhs5" ? "2019-21 level" : "Change, NFHS-5→6"}.</p>
      </div>
    );
  }
  const meta = ATTRIBUTES.find((a) => a.key === attr) ?? LEGEND_OVERRIDES[attr];
  if (!meta) return null;

  // In timelapse mode, colors reflect the real annual value for the selected year, not
  // the 85-year trend the normal legend below would show -- a different domain/ramp.
  if (timelapseYear != null && (attr === "hist_rainfall_trend" || attr === "hist_temp_trend")) {
    const isRain = attr === "hist_rainfall_trend";
    const [lo, hi] = isRain ? TIMELAPSE_RAINFALL_DOMAIN : TIMELAPSE_TEMP_DOMAIN;
    const ramp = isRain ? BRBG : RDBU_REV;
    const stops = ramp.map((c) => `rgb(${c.join(",")})`);
    const unit = isRain ? "mm" : "°C";
    return (
      <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-2.5 shadow-lg w-48">
        <p className="text-[10px] font-semibold mb-1">{isRain ? "🌧️" : "🌡️"} {timelapseYear} vs 1940s avg</p>
        <div className="h-2.5 w-full rounded-sm mb-1" style={{ background: `linear-gradient(to right, ${stops.join(", ")})` }} />
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span>{lo}{unit}</span><span>0{unit}</span><span>+{hi}{unit}</span>
        </div>
        <p className="text-[9px] text-muted-foreground italic mt-1">
          Change per hex from its own 1940-1949 average — {isRain ? "brown = drier, teal = wetter" : "blue = cooler, red = warmer"}.
        </p>
      </div>
    );
  }

  if (attr === "land_use") {
    return (
      <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-2.5 shadow-lg w-40">
        <p className="text-[10px] font-semibold mb-1.5">{meta.icon} {meta.label}</p>
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(LAND_USE_COLORS).map(([cls, color]) => (
            <div key={cls} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
              <span className="text-[9px] capitalize text-muted-foreground">{cls}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (attr === "rural_urban_class") {
    return (
      <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-2.5 shadow-lg w-52">
        <p className="text-[10px] font-semibold mb-1.5">🏙️ Rural / Urban Mix</p>
        {(["rural", "composite", "urban", "negligible"] as const).map((cls) => (
          <div key={cls} className="flex items-center gap-1.5 mb-0.5">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: RURAL_URBAN_COLORS[cls] }} />
            <span className="text-[9px] text-muted-foreground">{RURAL_URBAN_LABELS[cls]}</span>
          </div>
        ))}
        <p className="text-[9px] text-muted-foreground italic pt-1 border-t border-border/30 mt-1">
          Urban + Composite = candidates for finer-than-hex breakdown
        </p>
      </div>
    );
  }

  if (attr === "data_confidence") {
    return (
      <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-2.5 shadow-lg w-44">
        <p className="text-[10px] font-semibold mb-1.5">🎯 Data Confidence</p>
        {([['high','#22c55e','Real validated data'],['medium','#f59e0b','Real but coarse/approx.'],['low','#ef4444','Heuristic / absent']] as const).map(([lvl,col,desc]) => (
          <div key={lvl} className="flex items-center gap-1.5 mb-0.5">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: col }} />
            <span className="text-[9px] capitalize font-medium" style={{ color: col }}>{lvl}</span>
            <span className="text-[9px] text-muted-foreground">— {desc}</span>
          </div>
        ))}
      </div>
    );
  }

  const ramp = ATTR_RAMP[attr] ?? GREENS;
  const stops = Array.from({ length: 5 }, (_, i) => gradientColor(ramp, i / 4));
  const [lo, hi] = FIXED_DOMAIN[attr] ?? [0, 10];
  const fmt = (v: number) => attr === "elevation_mean" ? `${Math.round(v)}m` : v.toFixed(2);
  const direction = LAYER_DIRECTION[attr];

  return (
    <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-2.5 shadow-lg w-44">
      <p className="text-[10px] font-semibold mb-1">{meta.icon} {meta.label}</p>
      <div className="h-2.5 w-full rounded-sm mb-1" style={{ background: `linear-gradient(to right, ${stops.join(", ")})` }} />
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>{fmt(lo)}</span><span>{fmt(hi)}</span>
      </div>
      {direction && (
        <p className={`text-[9px] font-medium mt-1 ${direction === "good" ? "text-emerald-400" : "text-red-400"}`}>
          {direction === "good" ? "↑ Higher = Better" : "↑ Higher = Worse"}
        </p>
      )}
    </div>
  );
}

// ── District summary ──────────────────────────────────────────────────────────

function DistrictSummary({ features, district, state }: { features: any[]; district: string; state: string }) {
  const [expanded, setExpanded] = useState(false);
  const d = features.filter((f: any) => f.properties.district_name === district);
  if (!d.length) return null;

  const pop = d.reduce((s: number, f: any) => s + (f.properties.population || 0), 0);
  const avg = d.reduce((s: number, f: any) => s + (f.properties.hex_risk || 0), 0) / d.length;
  const mx = Math.max(...d.map((f: any) => f.properties.hex_risk || 0));
  const cas = d.filter((f: any) => (f.properties.cascade_count || 0) > 0).length;

  const hazardKeys = ["flood_risk","heat_risk","cyclone_risk","drought_risk","wetbulb_risk","landslide_risk","coldwave_risk","flashflood_risk","sealevel_risk","fire_risk"];
  const hazardAvgs = hazardKeys.map((h) => ({
    key: h, label: h.replace("_risk",""),
    avg: d.reduce((s: number, f: any) => s + (f.properties[h] || 0), 0) / d.length,
    max: Math.max(...d.map((f: any) => f.properties[h] || 0)),
  })).sort((a,b) => b.avg - a.avg);

  const riskLevel = avg >= 7 ? "EXTREME" : avg >= 5 ? "HIGH" : avg >= 3 ? "MODERATE" : "LOW";
  const riskClr = avg >= 7 ? "text-red-500" : avg >= 5 ? "text-orange-400" : avg >= 3 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className={`bg-background/95 backdrop-blur border border-border/40 rounded-lg shadow-lg p-3 ${expanded ? "w-72" : "w-56"} max-h-[70vh] overflow-y-auto print:w-full print:max-h-none print:shadow-none print:border-0`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-bold">{district}</div>
          <div className="text-[10px] text-muted-foreground">{state} · {d.length} hexes</div>
        </div>
        <span className={`text-[10px] font-bold ${riskClr}`}>{riskLevel}</span>
      </div>

      <div className="space-y-1 text-[11px] mt-2">
        <div className="flex justify-between"><span className="text-muted-foreground">👥 Population</span><span className="font-medium">{pop.toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">⚠️ Avg Risk</span><span className="font-bold">{avg.toFixed(2)}/10</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">🔴 Max Risk</span><span className="font-bold text-red-400">{mx.toFixed(2)}/10</span></div>
        {cas > 0 && <div className="flex justify-between"><span className="text-red-400">🔗 WASH Cascades</span><span className="text-red-400 font-bold">{cas}/{d.length} hexes</span></div>}
      </div>

      {/* Hazard breakdown */}
      <button onClick={() => setExpanded((v) => !v)}
        className="w-full mt-2 text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Hazard breakdown
      </button>
      {expanded && (
        <div className="mt-1 space-y-1">
          {hazardAvgs.filter((h) => h.avg > 0.01).map((h) => (
            <div key={h.key} className="flex items-center gap-1.5 text-[10px]">
              <span className="w-16 text-muted-foreground capitalize truncate">{h.label}</span>
              <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, h.avg * 10)}%`, background: gradientColor(RISK, h.avg / 10) }} />
              </div>
              <span className="w-8 text-right font-mono" style={{ color: gradientColor(RISK, h.avg / 10) }}>{h.avg.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 mt-2 print:hidden">
        <Link href={`/report/${encodeURIComponent(district)}`}
          className="flex-1 px-2 py-1 rounded-md bg-muted/60 text-[10px] text-muted-foreground hover:bg-muted text-center transition-colors">
          📄 Report
        </Link>
        <Link href={`/forecast?state=${encodeURIComponent(state)}`}
          className="flex-1 px-2 py-1 rounded-md bg-red-600/20 text-[10px] text-red-400 hover:bg-red-600/30 text-center transition-colors">
          📡 Forecast
        </Link>
      </div>
    </div>
  );
}

// ── Leaflet map ───────────────────────────────────────────────────────────────

// ── Boundary analysis panel ───────────────────────────────────────────────────

const HAZARD_KEYS_LIST = ["flood_risk","heat_risk","cyclone_risk","drought_risk","wetbulb_risk",
  "landslide_risk","coldwave_risk","flashflood_risk","sealevel_risk","fire_risk","pollution_risk"];
const HAZARD_ICONS: Record<string, string> = {
  flood_risk:"🌊", heat_risk:"🔥", cyclone_risk:"🌀", drought_risk:"☀️", wetbulb_risk:"💧",
  landslide_risk:"🏔️", coldwave_risk:"❄️", flashflood_risk:"⚡", sealevel_risk:"🌊",
  fire_risk:"🔥", pollution_risk:"🏭",
};

function BoundaryAnalysisPanel({
  features, type, name, stateName, onClose,
}: {
  features: any[];
  type: "state" | "district";
  name: string;
  stateName: string;
  onClose: () => void;
}) {
  const hexes = useMemo(() => {
    const props = features.map((f: any) => f.properties);
    // Normalize for state-name mismatches between GeoJSON (e.g. "Delhi") and hex props (e.g. "NCT of Delhi")
    const norm = (s: string) => (s || "").toLowerCase().replace(/\s+and\s+/gi, " & ").replace(/[^a-z&\s]/g, "").trim();
    if (type === "state") {
      const target = norm(name);
      return props.filter((p: any) => {
        const pn = norm(p.state || "");
        return pn === target || pn.includes(target) || target.includes(pn);
      });
    }
    // District: match by district name; use stateName loosely in case of minor mismatch
    return props.filter((p: any) => p.district_name === name);
  }, [features, type, name, stateName]);

  if (!hexes.length) return null;

  const n = hexes.length;
  const totalPop    = hexes.reduce((s: number, p: any) => s + (p.population || 0), 0);
  const totalChild  = hexes.reduce((s: number, p: any) => s + (p.pop_children_under_5 || 0), 0);
  const totalElderly = hexes.reduce((s: number, p: any) => s + (p.pop_elderly_60plus || 0), 0);
  const avgRisk     = hexes.reduce((s: number, p: any) => s + (p.hex_risk || 0), 0) / n;
  const maxRisk     = Math.max(...hexes.map((p: any) => p.hex_risk || 0));
  const cascadeHexes = hexes.filter((p: any) => (p.cascade_count || 0) > 0).length;
  const avgAC       = hexes.filter((p: any) => p.adaptive_capacity != null)
    .reduce((s: number, p: any) => s + p.adaptive_capacity, 0) / n;

  const tierCounts = {
    extreme: hexes.filter((p: any) => (p.hex_risk || 0) >= 7).length,
    high:    hexes.filter((p: any) => (p.hex_risk || 0) >= 5 && (p.hex_risk || 0) < 7).length,
    moderate:hexes.filter((p: any) => (p.hex_risk || 0) >= 3 && (p.hex_risk || 0) < 5).length,
    low:     hexes.filter((p: any) => (p.hex_risk || 0) < 3).length,
  };

  const hazardAvgs = HAZARD_KEYS_LIST.map((k) => ({
    key: k,
    label: RISK_LABEL[k] ?? k.replace("_risk",""),
    icon: HAZARD_ICONS[k] ?? "⚠️",
    avg: hexes.reduce((s: number, p: any) => s + (p[k] || 0), 0) / n,
  })).sort((a, b) => b.avg - a.avg);

  const dominant = hazardAvgs[0];
  const riskClr = avgRisk >= 7 ? "text-red-500" : avgRisk >= 5 ? "text-orange-400" : avgRisk >= 3 ? "text-amber-400" : "text-emerald-400";
  const riskLabel = avgRisk >= 7 ? "EXTREME" : avgRisk >= 5 ? "HIGH" : avgRisk >= 3 ? "MODERATE" : "LOW";

  const fmtPop = (v: number) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : `${v}`;

  return (
    <div className="bg-background/95 backdrop-blur border border-border/40 rounded-lg shadow-xl w-72 max-h-[82vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between p-3 pb-2 border-b border-border/30">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground uppercase tracking-wide font-semibold">
              {type === "state" ? "State" : "District"}
            </span>
            <span className={`text-[10px] font-bold ${riskClr}`}>{riskLabel}</span>
          </div>
          <div className="text-sm font-bold mt-0.5">{name}</div>
          {type === "district" && <div className="text-[10px] text-muted-foreground">{stateName}</div>}
          <div className="text-[9px] text-muted-foreground">{n} hexes · {fmtPop(totalPop)} people</div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-2 shrink-0 mt-0.5">
          <span className="text-xs">✕</span>
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Risk summary */}
        <div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">Risk Profile</div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-muted-foreground text-[9px]">Avg Risk</div>
              <div className={`font-bold text-base ${riskClr}`}>{avgRisk.toFixed(1)}<span className="text-[9px] text-muted-foreground">/10</span></div>
            </div>
            <div className="bg-muted/30 rounded p-1.5">
              <div className="text-muted-foreground text-[9px]">Peak Risk</div>
              <div className="font-bold text-base text-red-400">{maxRisk.toFixed(1)}<span className="text-[9px] text-muted-foreground">/10</span></div>
            </div>
          </div>
          {/* Risk tier bar */}
          <div className="mt-1.5">
            <div className="flex h-2 rounded-full overflow-hidden">
              {tierCounts.extreme > 0 && <div className="bg-red-600" style={{ width: `${(tierCounts.extreme/n)*100}%` }} title={`${tierCounts.extreme} extreme`} />}
              {tierCounts.high > 0 && <div className="bg-orange-400" style={{ width: `${(tierCounts.high/n)*100}%` }} title={`${tierCounts.high} high`} />}
              {tierCounts.moderate > 0 && <div className="bg-amber-400" style={{ width: `${(tierCounts.moderate/n)*100}%` }} title={`${tierCounts.moderate} moderate`} />}
              {tierCounts.low > 0 && <div className="bg-emerald-500" style={{ width: `${(tierCounts.low/n)*100}%` }} title={`${tierCounts.low} low`} />}
            </div>
            <div className="flex gap-2 mt-1 text-[9px] text-muted-foreground flex-wrap">
              {tierCounts.extreme > 0 && <span><span className="text-red-500 font-bold">{tierCounts.extreme}</span> extreme</span>}
              {tierCounts.high > 0 && <span><span className="text-orange-400 font-bold">{tierCounts.high}</span> high</span>}
              {tierCounts.moderate > 0 && <span><span className="text-amber-400 font-bold">{tierCounts.moderate}</span> moderate</span>}
              {tierCounts.low > 0 && <span><span className="text-emerald-500 font-bold">{tierCounts.low}</span> low</span>}
            </div>
          </div>
        </div>

        {/* Demographics */}
        <div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">Population at Risk</div>
          <div className="space-y-0.5 text-[11px]">
            <div className="flex justify-between"><span className="text-muted-foreground">👥 Total</span><span className="font-medium">{fmtPop(totalPop)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">👶 Children &lt;5</span><span className="font-medium">{fmtPop(totalChild)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">🧓 Elderly 60+</span><span className="font-medium">{fmtPop(totalElderly)}</span></div>
          </div>
        </div>

        {/* Dominant hazard */}
        <div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">Hazard Breakdown (avg)</div>
          <div className="space-y-1">
            {hazardAvgs.filter((h) => h.avg > 0.05).map((h) => (
              <div key={h.key} className="flex items-center gap-1.5 text-[10px]">
                <span className="w-20 text-muted-foreground truncate">{h.icon} {h.label}</span>
                <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, h.avg * 10)}%`, background: gradientColor(RISK, h.avg / 10) }} />
                </div>
                <span className="w-7 text-right font-mono text-[9px]" style={{ color: gradientColor(RISK, h.avg / 10) }}>{h.avg.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* WASH & capacity */}
        <div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">Adaptive Capacity</div>
          <div className="space-y-0.5 text-[11px]">
            <div className="flex justify-between"><span className="text-muted-foreground">🛡️ Avg AC</span><span className="font-medium">{avgAC.toFixed(2)}</span></div>
            {cascadeHexes > 0 && (
              <div className="flex justify-between"><span className="text-red-400">🔗 WASH Cascades</span><span className="text-red-400 font-bold">{cascadeHexes}/{n} hexes</span></div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 pt-1 border-t border-border/30">
          {type === "district" && (
            <Link href={`/report/${encodeURIComponent(name)}`}
              className="flex-1 px-2 py-1.5 rounded-md bg-muted/60 text-[10px] text-muted-foreground hover:bg-muted text-center transition-colors">
              📄 Report
            </Link>
          )}
          <Link href={`/forecast?state=${encodeURIComponent(type === "state" ? name : stateName)}`}
            className="flex-1 px-2 py-1.5 rounded-md bg-red-600/20 text-[10px] text-red-400 hover:bg-red-600/30 text-center transition-colors">
            📡 Forecast
          </Link>
          <Link href="/wash-assess"
            className="flex-1 px-2 py-1.5 rounded-md bg-blue-600/20 text-[10px] text-blue-400 hover:bg-blue-600/30 text-center transition-colors">
            📋 Assess
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Boundary GeoJSON layers ───────────────────────────────────────────────────

function BoundaryLayers({
  showDistricts, showStates, onBoundaryClick,
}: {
  showDistricts: boolean;
  showStates: boolean;
  onBoundaryClick: (type: "state" | "district", name: string, stateName: string) => void;
}) {
  const districtQ = useQuery<any>({
    queryKey: ["india-districts-boundary"],
    queryFn: () => fetch("/data/india.json").then((r) => r.json()),
    staleTime: Infinity,
    enabled: showDistricts,
  });
  const stateQ = useQuery<any>({
    queryKey: ["india-states-boundary"],
    queryFn: () => fetch("/data/india_states.geojson").then((r) => r.json()),
    staleTime: Infinity,
    enabled: showStates,
  });

  const districtStyle = useCallback(() => ({
    fillOpacity: 0.01, color: "#ffffff", weight: 1.5, dashArray: "5 3", opacity: 0.8, renderer: boundaryRenderer,
  }), []);
  const stateStyle = useCallback(() => ({
    fillOpacity: 0.01, color: "#f59e0b", weight: 2.5, renderer: boundaryRenderer,
  }), []);

  const onDistrictFeature = useCallback((feature: any, layer: any) => {
    const distName = feature.properties.NAME;
    const stateName = feature.properties.STATE;
    layer.bindTooltip(
      `<b>${distName}</b><br/>${stateName}<br/><span style="font-size:9px;color:#9ca3af">Click for district analysis</span>`,
      { sticky: true }
    );
    layer.on("click", (e: any) => {
      L.DomEvent.stopPropagation(e);
      onBoundaryClick("district", distName, stateName);
    });
  }, [onBoundaryClick]);

  const onStateFeature = useCallback((feature: any, layer: any) => {
    const stateName = feature.properties.state || feature.properties.STATE || feature.properties.name;
    layer.bindTooltip(
      `<b>${stateName}</b><br/><span style="font-size:9px;color:#9ca3af">Click for state analysis</span>`,
      { sticky: true }
    );
    layer.on("click", (e: any) => {
      L.DomEvent.stopPropagation(e);
      onBoundaryClick("state", stateName, stateName);
    });
  }, [onBoundaryClick]);

  return (
    <>
      {showDistricts && districtQ.data && (
        <GeoJSON key="district-boundaries" data={districtQ.data} style={districtStyle}
          onEachFeature={onDistrictFeature} />
      )}
      {showStates && stateQ.data && (
        <GeoJSON key="state-boundaries" data={stateQ.data} style={stateStyle}
          onEachFeature={onStateFeature} />
      )}
    </>
  );
}

function RiverOverlay({ show }: { show: boolean }) {
  const riverQ = useQuery<any>({
    queryKey: ["india-rivers"],
    queryFn: () => fetch("/data/india_rivers.geojson").then((r) => r.json()),
    staleTime: Infinity,
    enabled: show,
  });
  const riverStyle = useCallback(() => ({
    fillOpacity: 0, color: "#3b82f6", weight: 1.2, opacity: 0.6,
  }), []);
  const onEachRiver = useCallback((feature: any, layer: any) => {
    const name = feature.properties?.name || feature.properties?.name_en;
    if (name) layer.bindTooltip(name, { sticky: true, className: "text-[10px]" });
  }, []);
  if (!show || !riverQ.data) return null;
  return (
    <GeoJSON key="river-overlay" data={riverQ.data} style={riverStyle} onEachFeature={onEachRiver} />
  );
}

// Real school points from OpenStreetMap — volunteer-mapped, so coverage is
// partial (see SchoolsCoverageNote). No WASH-infrastructure data; UDISE+ has
// that but no public bulk API for individual schools.
function SchoolsOverlay({ show, selectedState }: { show: boolean; selectedState: string }) {
  const schoolsQ = useQuery<any>({
    queryKey: ["schools-osm"],
    queryFn: () => fetch("/data/schools_osm.geojson").then((r) => r.json()),
    staleTime: Infinity,
    enabled: show,
  });

  const filtered = useMemo(() => {
    if (!schoolsQ.data || selectedState === "All India") return null;
    return {
      ...schoolsQ.data,
      features: schoolsQ.data.features.filter((f: any) => f.properties.state === selectedState),
    };
  }, [schoolsQ.data, selectedState]);

  const pointToLayer = useCallback((_feature: any, latlng: L.LatLng) =>
    L.circleMarker(latlng, {
      radius: 4, color: "#059669", weight: 1, fillColor: "#34d399", fillOpacity: 0.85,
      renderer: boundaryRenderer,
    }), []);

  const onEachSchool = useCallback((feature: any, layer: any) => {
    const name = feature.properties?.name || "Unnamed school (OSM)";
    layer.bindTooltip(`🏫 ${name}`, { sticky: true, className: "text-[10px]" });
  }, []);

  if (!show || !filtered || !filtered.features.length) return null;
  return (
    <GeoJSON key={`schools-${selectedState}`} data={filtered} pointToLayer={pointToLayer} onEachFeature={onEachSchool} />
  );
}

function SchoolsCoverageNote({ state }: { state: string }) {
  const covQ = useQuery<Record<string, { osm_schools: number; udise_official_total: number | null; coverage_pct: number | null }>>({
    queryKey: ["schools-osm-coverage"],
    queryFn: () => fetch("/data/schools_osm_coverage.json").then((r) => r.json()),
    staleTime: Infinity,
  });
  const row = covQ.data?.[state];
  if (!row) return null;
  return (
    <div className="px-3 py-1.5 border-b border-border/30 text-[9px] text-muted-foreground bg-emerald-500/5">
      🏫 {row.osm_schools.toLocaleString()} schools mapped in OSM
      {row.udise_official_total != null && (
        <> · ~{row.coverage_pct}% of {row.udise_official_total.toLocaleString()} official (UDISE+) — partial, volunteer-mapped, no WASH data</>
      )}
    </div>
  );
}

function HexMap({
  geoData, attr, selectedState, selectedDistrict, crossFilters, mapRef, onHexClick,
  showDistricts, showStates, showRivers, showSchools, onBoundaryClick, hasFutureData,
  timelapseYear, timelapseData, nfhs6ColorFn, nfhs6Label,
}: {
  geoData: any; attr: string; selectedState: string; selectedDistrict: string;
  crossFilters: CrossFilter[];
  mapRef: React.MutableRefObject<LeafletMap | null>;
  onHexClick: (p: any) => void;
  showDistricts: boolean; showStates: boolean; showRivers: boolean; showSchools: boolean;
  onBoundaryClick: (type: "state" | "district", name: string, stateName: string) => void;
  hasFutureData: boolean;
  timelapseYear: number | null;
  timelapseData: { years: number[]; rainfall: Record<string, number[]>; temp: Record<string, number[]> } | undefined;
  nfhs6ColorFn: (props: any) => string;
  nfhs6Label: string;
}) {
  const geoJsonRef = useRef<LeafletGeoJSONLayer | null>(null);

  const filtered = useMemo(() => {
    if (!geoData) return null;
    let feats = geoData.features;
    if (selectedState !== "All India") feats = feats.filter((f: any) => f.properties.state === selectedState);
    if (selectedDistrict !== "All") feats = feats.filter((f: any) => f.properties.district_name === selectedDistrict);
    if (crossFilters.length > 0) {
      feats = feats.filter((f: any) => crossFilters.every((cf) => {
        const val = f.properties[cf.key] ?? 0;
        if (cf.op === ">=") return val >= cf.value;
        if (cf.op === "<=") return val <= cf.value;
        return val > cf.value;
      }));
    }
    return { ...geoData, features: feats };
  }, [geoData, selectedState, selectedDistrict, crossFilters]);

  const styleFeature = useCallback((feature: any) => ({
    fillColor: attr === "nfhs6"
      ? nfhs6ColorFn(feature.properties)
      : timelapseYear != null
      ? timelapseHexColor(feature.properties.h3_id, attr, timelapseYear, timelapseData)
      : hexColor(feature.properties, attr),
    fillOpacity: 0.75, color: "#64748b", weight: 0.3, renderer: canvasRenderer,
  }), [attr, timelapseYear, timelapseData, nfhs6ColorFn]);

  useEffect(() => { geoJsonRef.current?.setStyle(styleFeature); }, [styleFeature]);

  const onEachFeature = useCallback((feature: any, layer: any) => {
    const p = feature.properties;
    const district = p.district_name ? `${p.district_name}, ` : "";
    if (attr === "nfhs6") {
      layer.bindTooltip(`<b>${district}${p.state}</b><br/>${nfhs6Label}<br/><i>click for full trend</i>`, { sticky: true });
    } else {
      const val = attr === "land_use" ? p.land_use : p[attr];
      layer.bindTooltip(`<b>${district}${p.state}</b><br/>${val}`, { sticky: true });
    }
    layer.on("click", () => onHexClick(p));
  }, [attr, onHexClick, nfhs6Label]);

  if (!filtered) return null;

  return (
    <MapContainer center={[22.5, 80]} zoom={5} style={{ height: "100%", width: "100%" }}
      scrollWheelZoom maxBounds={[[6,68],[37,98]]} minZoom={4} maxZoom={10} ref={mapRef}>
      <SetupCanvas />
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution='&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, FAO, NOAA, USGS, &copy; OpenStreetMap contributors' />
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}" />
      <GeoJSON ref={geoJsonRef} key={`${selectedState}-${selectedDistrict}-${crossFilters.length}-${crossFilters.map(f=>f.key+f.op+f.value).join(',')}-${hasFutureData}`}
        data={filtered} style={styleFeature} onEachFeature={onEachFeature} />
      <BoundaryLayers showDistricts={showDistricts} showStates={showStates} onBoundaryClick={onBoundaryClick} />
      <RiverOverlay show={showRivers} />
      <SchoolsOverlay show={showSchools} selectedState={selectedState} />
    </MapContainer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HexMapV2Page() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const initialState = urlParams.get("state") || "All India";
  const initialDistrict = urlParams.get("district") || "All";
  const presentMode = urlParams.get("present") === "1";

  const [attr, setAttr]                       = useState("nfhs6");
  const [heatViewMode, setHeatViewMode]       = useState<"annual" | "peak">("annual");
  const effectiveAttr = attr === "heat_risk" && heatViewMode === "peak" ? "heat_peak_score" : attr;

  // Timelapse: only meaningful for the two historical layers that have a real annual
  // value (rainfall trend and temp trend) -- CV is a single 85-year statistic, no
  // per-year value to animate.
  const isTimelapseLayer = attr === "hist_rainfall_trend" || attr === "hist_temp_trend";
  const [timelapseOn, setTimelapseOn] = useState(false);
  const [timelapseYear, setTimelapseYear] = useState(2024);
  const [timelapsePlaying, setTimelapsePlaying] = useState(false);
  const timelapseActive = isTimelapseLayer && timelapseOn;

  const timelapseQ = useQuery<{ years: number[]; rainfall: Record<string, number[]>; temp: Record<string, number[]> }>({
    queryKey: ["hex-climate-timelapse"],
    queryFn: () => fetch("/data/hex_climate_timelapse.json").then((r) => r.json()),
    staleTime: Infinity,
    enabled: timelapseActive,
  });

  // NFHS-5 -> NFHS-6 district trends + correlations vs this platform's terrain/
  // hazard factors (scripts/compute_nfhs6_district_trends.py). This is the Phase
  // 2 grid's primary sidebar now (the hazard-layer picker lives on /grid --
  // replaced here per request, not duplicated). Same query key as HexInfoPanel's
  // per-district lookup -- react-query shares the cache across both.
  const [corrPanelOpen, setCorrPanelOpen] = useState(false);
  const [nfhs6Indicator, setNfhs6Indicator] = useState(68); // "Children under 5 who are stunted"
  const [nfhs6Field, setNfhs6Field] = useState<"delta" | "nfhs6" | "nfhs5">("delta");
  const [nfhs6Search, setNfhs6Search] = useState("");

  type Nfhs6Indicator = { label: string; nfhs6: number; nfhs5: number; delta: number; improved: boolean; small_sample: boolean };
  type Nfhs6District = { state: string; district: string; matched_factors: boolean;
    factors: Record<string, number> | null; indicators: Record<string, Nfhs6Indicator> };
  const nfhs6Q = useQuery<{
    meta: { n_districts: number; n_matched: number; n_indicators: number };
    districts: Nfhs6District[];
    correlations: Array<{ indicator: string; field: string; factor: string; r: number; n: number }>;
  }>({
    queryKey: ["nfhs6-district-trends"],
    queryFn: () => fetch("/data/nfhs6_district_trends.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const nfhs6Norm = (s: string) => (s || "").toLowerCase().replace(/&/g, "and").replace(/[-_]/g, " ").trim();

  // district "state|district" (normalized) -> that district's full record
  const nfhs6DistrictMap = useMemo(() => {
    const m = new Map<string, Nfhs6District>();
    for (const d of nfhs6Q.data?.districts ?? []) m.set(`${nfhs6Norm(d.state)}|${nfhs6Norm(d.district)}`, d);
    return m;
  }, [nfhs6Q.data]);

  // Every indicator this dataset has, {num, label} -- consistent numbering across
  // all 697 districts (verified: same 93 indicators, same order, everywhere), so
  // any one district's indicator set is the full picker list.
  // Union across ALL districts, not just one -- a single district's indicator set
  // is incomplete (compute_nfhs6_district_trends.py drops an indicator per-district
  // when either NFHS-6 or NFHS-5 came back null/suppressed for that specific
  // district, so a small/suppressed district like South Andaman has only ~32 of
  // the 93, while most districts have the full set).
  const nfhs6IndicatorList = useMemo(() => {
    const byNum = new Map<number, string>();
    for (const d of nfhs6Q.data?.districts ?? []) {
      for (const [num, ind] of Object.entries(d.indicators)) {
        if (!byNum.has(Number(num))) byNum.set(Number(num), ind.label.replace(/\s*\(%\)\s*$/, ""));
      }
    }
    return [...byNum.entries()].map(([num, label]) => ({ num, label })).sort((a, b) => a.num - b.num);
  }, [nfhs6Q.data]);

  const nfhs6FilteredIndicators = useMemo(() => {
    if (!nfhs6Search.trim()) return nfhs6IndicatorList;
    const q = nfhs6Search.toLowerCase();
    return nfhs6IndicatorList.filter((i) => i.label.toLowerCase().includes(q));
  }, [nfhs6IndicatorList, nfhs6Search]);

  // p5-p95 domain for the selected indicator+field, across matched non-suppressed
  // districts -- used to scale color intensity.
  const nfhs6Domain = useMemo(() => {
    const vals: number[] = [];
    for (const d of nfhs6Q.data?.districts ?? []) {
      const ind = d.indicators[String(nfhs6Indicator)];
      if (ind && !ind.small_sample) vals.push(ind[nfhs6Field]);
    }
    if (!vals.length) return { lo: 0, hi: 1 };
    vals.sort((a, b) => a - b);
    const lo = vals[Math.floor(vals.length * 0.05)];
    const hi = vals[Math.ceil(vals.length * 0.95) - 1] || vals[vals.length - 1];
    return { lo, hi: hi === lo ? lo + 1 : hi };
  }, [nfhs6Q.data, nfhs6Indicator, nfhs6Field]);

  const nfhs6SelectedLabel = nfhs6IndicatorList.find((i) => i.num === nfhs6Indicator)?.label ?? "";

  // Green = improved (delta) or the "good" end of the range (level); red = the
  // opposite. For delta this uses the server-computed `improved` flag (direction-
  // aware per indicator -- "higher is better" for some, "lower is better" for
  // most), not a raw sign check.
  const nfhs6ColorFn = useCallback((props: any) => {
    const rec = nfhs6DistrictMap.get(`${nfhs6Norm(props.state)}|${nfhs6Norm(props.district_name)}`);
    const ind = rec?.indicators[String(nfhs6Indicator)];
    if (!ind || ind.small_sample) return "#e2e8f0";
    const { lo, hi } = nfhs6Domain;
    if (nfhs6Field === "delta") {
      const mag = Math.min(1, Math.abs(ind.delta) / Math.max(Math.abs(lo), Math.abs(hi), 0.01));
      return ind.improved ? lerp3([16, 185, 129], [220, 252, 231], 1 - mag) : lerp3([239, 68, 68], [254, 226, 226], 1 - mag);
    }
    const t = Math.max(0, Math.min(1, (ind[nfhs6Field] - lo) / (hi - lo)));
    // direction unknown for a raw level without the indicator's own higher/lower-is-better
    // hint, so use a neutral sequential ramp (light -> dark blue) rather than guessing red/green.
    return lerp3([219, 234, 254], [30, 64, 175], t);
  }, [nfhs6DistrictMap, nfhs6Indicator, nfhs6Field, nfhs6Domain]);

  useEffect(() => {
    if (!timelapsePlaying) return;
    const id = setInterval(() => {
      setTimelapseYear((y) => (y >= 2024 ? 1940 : y + 1));
    }, 400);
    return () => clearInterval(id);
  }, [timelapsePlaying]);

  // Leaving the timelapse-eligible layers (or turning it off) stops playback so it
  // doesn't keep silently advancing years against a layer that's no longer showing them
  useEffect(() => {
    if (!isTimelapseLayer) { setTimelapsePlaying(false); setTimelapseOn(false); }
  }, [isTimelapseLayer]);
  const [selectedState, setSelectedState]     = useState(initialState);
  const [selectedDistrict, setSelectedDistrict] = useState(initialDistrict);
  const [clickedHex, setClickedHex]           = useState<any | null>(null);
  const [clickedBoundary, setClickedBoundary] = useState<{ type: "state" | "district"; name: string; stateName: string } | null>(null);

  const handleBoundaryClick = useCallback((type: "state" | "district", name: string, stateName: string) => {
    setClickedBoundary({ type, name, stateName });
    setClickedHex(null);
    // Clicking a boundary on the map now filters the hex grid the same way
    // the sidebar state/district dropdowns already do — hiding everything
    // outside the clicked area.
    if (type === "state") {
      setSelectedState(name);
      setSelectedDistrict("All");
    } else {
      setSelectedState(stateName);
      setSelectedDistrict(name);
    }
  }, []);
  const [sidebarOpen, setSidebarOpen]         = useState(!presentMode && window.innerWidth > 768);
  const [crossFilters, setCrossFilters]       = useState<CrossFilter[]>([]);
  const [showDistricts, setShowDistricts]     = useState(false);
  const [showStates, setShowStates]           = useState(true);
  const [showRivers, setShowRivers]           = useState(false);
  const [showSchools, setShowSchools]         = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);

  const rankQ = useQuery<any[]>({
    queryKey: ["district-rankings"],
    queryFn: () => fetch("/data/district_rankings.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const confidenceQ = useQuery<Record<string, { p5: number; p95: number; mean: number; sd: number }>>({
    queryKey: ["hex-confidence"],
    queryFn: () => fetch("/data/hex_confidence.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  // Which real villages/hamlets/towns (OSM place nodes) fall inside each hex -- doesn't
  // change any risk score, this hex is still one ~252km² cell, just tells you what's in
  // it. Lazy: only fetched the first time a hex is actually clicked, since this file is
  // much bigger than hex_confidence.json and most sessions won't need it at all.
  const hexVillagesQ = useQuery<Record<string, VillageHexEntry>>({
    queryKey: ["hex-villages"],
    queryFn: () => fetch("/data/india_hex_villages.json").then((r) => r.json()),
    staleTime: Infinity,
    enabled: clickedHex !== null,
  });

  const rankByDistrict = useMemo(() => {
    const m: Record<string, any> = {};
    for (const r of rankQ.data ?? []) m[r.district] = r;
    return m;
  }, [rankQ.data]);

  const hexQ = useQuery<any>({
    queryKey: ["india-hex-props-geojson"],
    queryFn: async () => {
      try {
        const props: any[] = await fetch("/data/india_hex_props.json").then((r) => r.json());
        const features = props.map((p) => {
          const boundary = cellToBoundary(p.h3_id);
          const coords = boundary.map(([lat, lng]: [number, number]) => [lng, lat]);
          coords.push(coords[0]);
          return { type: "Feature", properties: p, geometry: { type: "Polygon", coordinates: [coords] } };
        });
        return { type: "FeatureCollection", features };
      } catch {
        // Fallback: load full GeoJSON (larger but has geometries)
        console.warn("h3-js reconstruction failed, falling back to GeoJSON");
        return fetch("/data/india_hex_grid.geojson").then((r) => r.json());
      }
    },
    staleTime: Infinity,
    retry: 1,
  });

  const FUTURE_KEYS = new Set(ATTRIBUTES.filter(a => a.category === "future").map(a => a.key));
  const futureQ = useQuery<any[]>({
    queryKey: ["india-hex-future"],
    queryFn: () => fetch("/data/india_hex_future.json").then((r) => r.json()),
    staleTime: Infinity,
    enabled: FUTURE_KEYS.has(attr),
  });

  const nfhs5ExtraQ = useQuery<Record<string, any>>({
    queryKey: ["nfhs5-extra"],
    queryFn: () => fetch("/data/nfhs5_extra.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const sbmQ = useQuery<Record<string, any>>({
    queryKey: ["sbm-toilet-types"],
    queryFn: () => fetch("/data/sbm_toilet_types.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const soilSandQ = useQuery<Record<string, number>>({
    queryKey: ["hex-soil-sand"],
    queryFn: () => fetch("/data/hex_soil_sand.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  // Rural/urban/composite classification -- see compute_rural_urban_mix.py.
  // [rural_pop, urban_pop, class] per hex, class in rural/urban/composite/negligible.
  const ruralUrbanQ = useQuery<Record<string, [number, number, string]>>({
    queryKey: ["hex-rural-urban"],
    queryFn: () => fetch("/data/hex_rural_urban.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  // 85-year (1940-2024) historical climate trend, ERA5 via Copernicus CDS -- see
  // fetch_historical_climatology_cds.py. Per-hex (each CDS request already returns a
  // full-India grid regardless of sample count, so hex-level costs no extra requests
  // over district-level) -- keyed directly by h3_id, no join needed.
  const histClimateQ = useQuery<Record<string, any>>({
    queryKey: ["hex-historical-climatology"],
    queryFn: () => fetch("/data/hex_historical_climatology.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  // Merge future (by h3_id), NFHS5 extra (by district_name), SBM (by STATE|DISTRICT),
  // soil sand % (by h3_id), rural/urban mix (by h3_id), and historical climatology (by h3_id)
  const mergedGeoData = useMemo(() => {
    if (!hexQ.data) return hexQ.data;
    const futMap: Record<string, any> = {};
    for (const f of futureQ.data ?? []) futMap[f.h3_id] = f;
    const nfhsMap: Record<string, any> = nfhs5ExtraQ.data ?? {};
    const sbmMap: Record<string, any> = sbmQ.data ?? {};
    const soilMap: Record<string, number> = soilSandQ.data ?? {};
    const ruralUrbanMap: Record<string, [number, number, string]> = ruralUrbanQ.data ?? {};
    const histMap: Record<string, any> = histClimateQ.data ?? {};
    return {
      ...hexQ.data,
      features: hexQ.data.features.map((f: any) => {
        const p = f.properties;
        const fut  = futMap[p.h3_id] ?? {};
        const nfhs = nfhsMap[p.district_name] ?? {};
        let sbm: any = {};
        for (const key of sbmLookupKeys(p.state, p.district_name)) {
          if (sbmMap[key]) { sbm = sbmMap[key]; break; }
        }
        const sbmPrefixed = sbm.twin_pit_pct != null ? {
          sbm_twin_pit_pct:      sbm.twin_pit_pct,
          sbm_single_pit_pct:    sbm.single_pit_pct,
          sbm_septic_soak_pct:   sbm.septic_soak_pct,
          sbm_septic_nosoak_pct: sbm.septic_nosoak_pct,
          sbm_total_ihhl:        sbm.total_ihhl,
        } : {};
        const soil = soilMap[p.h3_id] != null ? { soil_sand_pct: soilMap[p.h3_id] } : {};
        const ru = ruralUrbanMap[p.h3_id];
        const ruralUrban = ru ? { rural_pop: ru[0], urban_pop: ru[1], rural_urban_class: ru[2] } : {};
        const hist = histMap[p.h3_id];
        const histPrefixed = hist ? {
          hist_rainfall_trend: hist.rainfall_trend_mm_decade,
          hist_temp_trend: hist.temp_trend_c_decade,
          hist_rainfall_cv: hist.rainfall_cv,
          hist_rainfall_mean: hist.rainfall_mean_mm,
          hist_temp_mean: hist.temp_mean_c,
          hist_recent_vs_baseline_rainfall_pct: hist.recent_vs_baseline_rainfall_pct,
          hist_recent_vs_baseline_temp_c: hist.recent_vs_baseline_temp_c,
        } : {};
        return { ...f, properties: { ...p, ...fut, ...nfhs, ...sbmPrefixed, ...soil, ...ruralUrban, ...histPrefixed } };
      }),
    };
  }, [hexQ.data, futureQ.data, nfhs5ExtraQ.data, sbmQ.data, soilSandQ.data, ruralUrbanQ.data, histClimateQ.data]);

  const features: any[] = (mergedGeoData ?? hexQ.data)?.features ?? [];

  const stateList = useMemo(
    () => Array.from(new Set(features.map((f: any) => f.properties.state).filter(Boolean))).sort() as string[],
    [features]
  );

  const districtList = useMemo(() => {
    if (selectedState === "All India") return [];
    return Array.from(new Set(
      features.filter((f: any) => f.properties.state === selectedState)
        .map((f: any) => f.properties.district_name).filter(Boolean)
    )).sort() as string[];
  }, [features, selectedState]);


  const fitToFeatures = useCallback((feats: any[]) => {
    if (!mapRef.current || !feats.length) return;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const f of feats) {
      for (const ring of (f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat())) {
        for (const [lng, lat] of ring) {
          if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
        }
      }
    }
    mapRef.current.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [20, 20] });
  }, []);

  const handleStateChange = useCallback((state: string) => {
    setSelectedState(state); setSelectedDistrict("All");
    setClickedHex(null);
    // Selecting a state opens the same state-wide summary a map click would —
    // no need to hunt for the (thin) boundary line on the map itself.
    setClickedBoundary(state === "All India" ? null : { type: "state", name: state, stateName: state });
    if (state === "All India" || !hexQ.data) return;
    fitToFeatures(hexQ.data.features.filter((f: any) => f.properties.state === state));
  }, [hexQ.data, fitToFeatures]);

  const handleDistrictChange = useCallback((district: string) => {
    setSelectedDistrict(district);
    if (district === "All" || !hexQ.data) return;
    fitToFeatures(hexQ.data.features.filter((f: any) => f.properties.district_name === district));
  }, [hexQ.data, fitToFeatures]);

  useEffect(() => {
    if (!hexQ.data || initialState === "All India") return;
    const target = initialDistrict !== "All"
      ? hexQ.data.features.filter((f: any) => f.properties.district_name === initialDistrict)
      : hexQ.data.features.filter((f: any) => f.properties.state === initialState);
    if (target.length) fitToFeatures(target);
  }, [hexQ.data, initialState, initialDistrict, fitToFeatures]);

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <FilterSidebar
        collapsed={!sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)}
        attr={attr} onAttrChange={setAttr}
        selectedState={selectedState} states={stateList} onStateChange={handleStateChange}
        selectedDistrict={selectedDistrict} districts={districtList} onDistrictChange={handleDistrictChange}
        crossFilters={crossFilters} onCrossFiltersChange={setCrossFilters}
        features={features}
        showDistricts={showDistricts} onShowDistrictsChange={setShowDistricts}
        showStates={showStates} onShowStatesChange={setShowStates}
        showRivers={showRivers} onShowRiversChange={setShowRivers}
        showSchools={showSchools} onShowSchoolsChange={setShowSchools}
        heatViewMode={heatViewMode} onHeatViewModeChange={setHeatViewMode}
        nfhs6Loading={nfhs6Q.isLoading} nfhs6NDistricts={nfhs6Q.data?.meta.n_districts ?? 0}
        nfhs6Indicator={nfhs6Indicator} onNfhs6IndicatorChange={setNfhs6Indicator}
        nfhs6Field={nfhs6Field} onNfhs6FieldChange={setNfhs6Field}
        nfhs6Search={nfhs6Search} onNfhs6SearchChange={setNfhs6Search}
        nfhs6FilteredIndicators={nfhs6FilteredIndicators} nfhs6TotalIndicators={nfhs6IndicatorList.length}
        matchCount={(() => {
          if (!crossFilters.length || !features.length) return features.length;
          return features.filter((f: any) => crossFilters.every((cf) => {
            const val = f.properties[cf.key] ?? 0;
            if (cf.op === ">=") return val >= cf.value;
            if (cf.op === "<=") return val <= cf.value;
            return val > cf.value;
          })).length;
        })()}
        totalCount={features.length}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Minimal top bar */}
        <header className={`h-10 px-3 border-b border-border/40 flex items-center gap-3 bg-background/95 backdrop-blur z-50 shrink-0 ${presentMode ? "hidden" : ""}`}>
          <Link href="/"><Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2"><ArrowLeft className="h-3 w-3" />Home</Button></Link>
          <div className="h-3 w-px bg-border/50" />
          <span className="text-xs font-semibold">ClimResWASH Hex Grid</span>
          <span className="text-[10px] text-muted-foreground">{features.length ? `${features.length.toLocaleString()} hexes · H3 res-5 · ~252 km² each` : ""}</span>
          <div className="flex-1" />
          <Link href="/forecast" className="text-[11px] text-red-400 hover:text-red-300 font-semibold">Live Forecast →</Link>
          <Link href="/methodology" className="text-[11px] text-muted-foreground hover:text-foreground">Methodology</Link>
          <ThemeToggle />
        </header>

        {/* Map */}
        <div className="flex-1 relative">
          {hexQ.isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading hexes…
            </div>
          ) : hexQ.isError ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-red-400 text-sm">
              <AlertTriangle className="h-5 w-5" /> Failed to load data
            </div>
          ) : (
            <>
              <HexMap geoData={mergedGeoData ?? hexQ.data} attr={effectiveAttr} selectedState={selectedState}
                selectedDistrict={selectedDistrict} crossFilters={crossFilters}
                mapRef={mapRef} onHexClick={(p) => { setClickedHex(p); setClickedBoundary(null); }}
                showDistricts={showDistricts} showStates={showStates} showRivers={showRivers} showSchools={showSchools}
                onBoundaryClick={handleBoundaryClick} hasFutureData={!!futureQ.data}
                timelapseYear={timelapseActive ? timelapseYear : null} timelapseData={timelapseQ.data}
                nfhs6ColorFn={nfhs6ColorFn} nfhs6Label={nfhs6SelectedLabel} />
              {futureQ.isFetching && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[900] flex items-center gap-2 bg-background/90 border border-border rounded-full px-4 py-1.5 text-xs text-muted-foreground shadow-lg">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading future projections…
                </div>
              )}
            </>
          )}

          {/* Clicked hex info */}
          {clickedHex && (
            <div className="absolute top-3 right-3 z-[800]">
              <HexInfoPanel props={clickedHex} ranking={rankByDistrict[clickedHex.district_name] ?? null} confidence={confidenceQ.data?.[clickedHex.h3_id] ?? null}
                villages={hexVillagesQ.data?.[clickedHex.h3_id] ?? null} villagesLoading={hexVillagesQ.isLoading}
                onClose={() => setClickedHex(null)} />
            </div>
          )}

          {/* Boundary analysis panel */}
          {clickedBoundary && (
            <div className="absolute top-3 right-3 z-[800]">
              <BoundaryAnalysisPanel
                features={features}
                type={clickedBoundary.type}
                name={clickedBoundary.name}
                stateName={clickedBoundary.stateName}
                onClose={() => setClickedBoundary(null)}
              />
            </div>
          )}

          {/* District summary */}
          {selectedDistrict !== "All" && (
            <div className="absolute bottom-8 right-3 z-[800]">
              <DistrictSummary features={features} district={selectedDistrict} state={selectedState} />
            </div>
          )}

          {/* Timelapse control -- only for the two historical layers with a real annual
              value (rainfall/temp trend); CV has no per-year value to animate */}
          {isTimelapseLayer && (
            <div className="absolute bottom-8 left-3 z-[800] mb-1" style={{ marginBottom: features.length > 0 ? "9rem" : 0 }}>
              <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-2.5 shadow-lg w-64">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold flex items-center gap-1">🎬 Timelapse</span>
                  <button
                    onClick={() => { setTimelapseOn((v) => !v); setTimelapsePlaying(false); }}
                    className={`text-[9px] px-2 py-0.5 rounded-full border font-medium transition-colors ${
                      timelapseOn ? "bg-purple-500 text-white border-purple-500" : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="button-timelapse-toggle"
                  >
                    {timelapseOn ? "On" : "Off"}
                  </button>
                </div>
                {timelapseOn && (
                  <>
                    {timelapseQ.isLoading ? (
                      <div className="text-[10px] text-muted-foreground py-2 text-center">Loading 85 years of data…</div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setTimelapsePlaying((v) => !v)}
                            className="shrink-0 w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-[10px]"
                            data-testid="button-timelapse-play"
                          >
                            {timelapsePlaying ? "⏸" : "▶"}
                          </button>
                          <input
                            type="range" min={1940} max={2024} step={1} value={timelapseYear}
                            onChange={(e) => { setTimelapseYear(Number(e.target.value)); setTimelapsePlaying(false); }}
                            className="flex-1 accent-purple-500"
                            data-testid="slider-timelapse-year"
                          />
                          <span className="shrink-0 text-xs font-bold text-purple-600 w-10 text-right">{timelapseYear}</span>
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-1">
                          Each hex colored by its change from its own 1940-1949 average — how much {attr === "hist_rainfall_trend" ? "rainfall" : "temperature"} in {timelapseYear} differed from that decade's typical level (a period average, not a single potentially-anomalous year).
                        </p>
                        {clickedHex && (() => {
                          const change = timelapseChange(clickedHex.h3_id, attr, timelapseYear, timelapseQ.data);
                          if (change == null) return null;
                          const unit = attr === "hist_rainfall_trend" ? "mm" : "°C";
                          return (
                            <div className="mt-1.5 pt-1.5 border-t border-border/30 flex justify-between items-center">
                              <span className="text-[9px] text-muted-foreground truncate">{clickedHex.district_name ?? clickedHex.state}</span>
                              <span className={`text-xs font-bold ${change < 0 ? "text-amber-500" : change > 0 ? "text-blue-400" : "text-muted-foreground"}`}>
                                {change > 0 ? "+" : ""}{change.toFixed(attr === "hist_temp_trend" ? 1 : 0)}{unit}
                              </span>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Legend */}
          {features.length > 0 && (
            <div className="absolute bottom-8 left-3 z-[800]">
              <Legend attr={effectiveAttr} timelapseYear={timelapseActive ? timelapseYear : null} nfhs6Label={nfhs6SelectedLabel} nfhs6Field={nfhs6Field} />
            </div>
          )}

          {/* NFHS-5->6 correlations panel */}
          <div className="absolute bottom-8 right-3 z-[800] flex flex-col items-end gap-2">
            {corrPanelOpen && (
              <div className="bg-background/95 backdrop-blur border border-border/40 rounded-lg p-3 shadow-lg w-80 max-h-96 overflow-y-auto text-[10px]">
                <p className="font-semibold mb-1.5 flex items-center gap-1">🏥 NFHS-5→6 vs. terrain/hazard</p>
                {nfhs6Q.isLoading ? (
                  <p className="text-muted-foreground">Loading {`>`}600 district compendiums…</p>
                ) : nfhs6Q.isError || !nfhs6Q.data ? (
                  <p className="text-red-400">Failed to load</p>
                ) : (
                  <>
                    <p className="text-muted-foreground mb-2">
                      {nfhs6Q.data.meta.n_matched} of {nfhs6Q.data.meta.n_districts} districts matched to this platform's terrain/hazard hex data. Pearson r across all matched, non-suppressed districts; only |r|≥0.25 at n≥50 shown.
                    </p>
                    <div className="space-y-1.5">
                      {nfhs6Q.data.correlations.slice(0, 20).map((c, i) => (
                        <div key={i} className="border-t border-border/20 pt-1.5 first:border-0 first:pt-0">
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground leading-tight">{c.indicator.replace(/\s*\(%\)\s*$/, "")} <span className="italic">({c.field === "delta" ? "Δ5→6" : "NFHS-6 level"})</span></span>
                            <span className={`font-mono font-semibold shrink-0 ${c.r > 0 ? "text-emerald-400" : "text-red-400"}`}>r={c.r > 0 ? "+" : ""}{c.r}</span>
                          </div>
                          <div className="text-muted-foreground">vs {c.factor} · n={c.n}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-muted-foreground italic pt-2">
                      Correlation, not causation — most pairs plausibly share a common driver (e.g. urbanization) rather than one directly causing the other.
                    </p>
                  </>
                )}
              </div>
            )}
            <button
              onClick={() => setCorrPanelOpen((v) => !v)}
              className={`px-2.5 py-1.5 rounded-lg border shadow-lg text-[10px] font-semibold flex items-center gap-1 ${
                corrPanelOpen ? "bg-rose-500 text-white border-rose-500" : "bg-background/95 backdrop-blur border-border/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              🏥 NFHS-6 Correlations
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
