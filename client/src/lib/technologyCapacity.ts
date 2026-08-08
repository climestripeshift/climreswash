/**
 * Real capacity formulas for WASH technologies -- replaces the earlier hardcoded
 * populationLoad range (a judgment call about "typical deployment scale", not a
 * computation) with an actual design-norm-based calculator: population served =
 * f(a physical design parameter you can measure or look up for a real installation).
 *
 * Each technology is assigned one FormulaKind. A kind is a reusable calculation
 * (e.g. "volume / (per-capita accumulation rate x design period)") parameterized by
 * published per-capita design norms, not technology-specific magic numbers -- the only
 * thing that varies per technology is which norm applies and what the input dimension is.
 *
 * Sources (India-context defaults, cited per formula group below):
 *  - CPHEEO Manual on Sewerage and Sewage Treatment Systems, 2013 (Ministry of Housing
 *    and Urban Affairs) -- septic tank sizing, waste stabilization pond area norms,
 *    per-capita sewage flow.
 *  - IS 2470 (Part 1 & 2):1985 -- Code of practice for installation of septic tanks.
 *  - Swachh Bharat Mission Technical Note on twin-pit design (Ministry of Jal Shakti) --
 *    pit sludge accumulation rate for onsite pit systems.
 *  - BORDA / EAWAG-Sandec "Compendium of Sanitation Systems and Technologies", 2nd ed.,
 *    2014 -- DEWATS component sizing (ABR/AF/UASB/settler HRT, constructed wetland
 *    hydraulic loading), FSSM drying-bed loading rates.
 *  - Sphere Handbook (Humanitarian Charter and Minimum Standards), 2018 -- emergency
 *    sanitation people-per-facility ratios.
 *  - Solid Waste Management Rules 2016 (MoEFCC) -- per-capita waste generation.
 *
 * These are the standard reference-design defaults, not a substitute for a site-specific
 * engineering study -- soil type, climate, occupancy pattern, and local regulations all
 * shift the real number. The calculator lets you override the design parameter with your
 * installation's actual dimension; the constants (accumulation rate, HRT, etc.) are held
 * fixed at the cited norm.
 */

export type FormulaKind =
  | 'pit'            // solids accumulation: volume / (accum rate x design period)
  | 'septic'         // IS 2470: volume / ((flow x retention) + (sludge rate x desludge interval))
  | 'reactor'        // hydraulic retention time: volume / (per-capita flow x HRT)
  | 'wetland'         // area norm: area / (m2 per person)
  | 'pond'           // area norm: area / (m2 per person)
  | 'bed'            // FSSM drying bed area norm: area / (m2 per person)
  | 'water-supply'   // yield vs demand: daily supply (L/day) / per-capita demand (Lpcd)
  | 'per-unit'       // standards ratio: units x people-per-unit
  | 'waste-collection'; // collection capacity vs per-capita generation

export interface CapacityModel {
  kind: FormulaKind;
  paramLabel: string;
  paramUnit: string;
  defaultParam: number;   // a realistic single-installation default, used for the filter band
  source: string;         // citation for the constants used
  // Kind-specific constants (only the ones relevant to `kind` are set)
  accumRate?: number;      // m3/person/year (pit)
  designPeriod?: number;   // years (pit, septic desludge interval)
  flowPerCapita?: number;  // m3/person/day (septic, reactor, wetland)
  retentionDays?: number;  // days (septic retention time)
  hrtDays?: number;        // days (reactor)
  areaPerCapita?: number;  // m2/person (wetland, pond, bed)
  demandLpcd?: number;     // liters/person/day (water-supply)
  peoplePerUnit?: number;  // people (per-unit)
  wastePerCapitaKgDay?: number; // kg/person/day (waste-collection)
}

export function computePopulationServed(model: CapacityModel, param: number): number {
  if (param <= 0) return 0;
  switch (model.kind) {
    case 'pit':
      return param / ((model.accumRate ?? 0.067) * (model.designPeriod ?? 3));
    case 'septic': {
      const perPerson = (model.flowPerCapita ?? 0.10) * (model.retentionDays ?? 1)
        + (model.accumRate ?? 0.03) * (model.designPeriod ?? 2);
      return param / perPerson;
    }
    case 'reactor':
      return param / ((model.flowPerCapita ?? 0.08) * (model.hrtDays ?? 1));
    case 'wetland':
    case 'pond':
    case 'bed':
      return param / (model.areaPerCapita ?? 1);
    case 'water-supply':
      return param / (model.demandLpcd ?? 55);
    case 'per-unit':
      return param * (model.peoplePerUnit ?? 20);
    case 'waste-collection':
      return param / (model.wastePerCapitaKgDay ?? 0.4);
    default:
      return 0;
  }
}

// Human-readable one-line description of the formula, for display next to the calculator
export function describeFormula(model: CapacityModel): string {
  switch (model.kind) {
    case 'pit':
      return `Population = ${model.paramLabel} ÷ (${model.accumRate} m³/person/yr accumulation × ${model.designPeriod} yr design period)`;
    case 'septic':
      return `Population = ${model.paramLabel} ÷ [(${model.flowPerCapita} m³/person/day × ${model.retentionDays}-day retention) + (${model.accumRate} m³/person/yr sludge × ${model.designPeriod}-yr desludge interval)]`;
    case 'reactor':
      return `Population = ${model.paramLabel} ÷ (${model.flowPerCapita} m³/person/day × ${model.hrtDays}-day retention time)`;
    case 'wetland':
    case 'pond':
    case 'bed':
      return `Population = ${model.paramLabel} ÷ ${model.areaPerCapita} m²/person design norm`;
    case 'water-supply':
      return `Population = ${model.paramLabel} ÷ ${model.demandLpcd} liters/person/day demand`;
    case 'per-unit':
      return `Population = ${model.paramLabel} × ${model.peoplePerUnit} people/unit`;
    case 'waste-collection':
      return `Population = ${model.paramLabel} ÷ ${model.wastePerCapitaKgDay} kg/person/day generation rate`;
  }
}

const SBM_PIT_SOURCE = 'SBM Technical Note on twin-pit design (Ministry of Jal Shakti): 1 m³ pit serves a 5-person household ~3 years ⇒ 0.067 m³/person/yr';
const IS2470_SOURCE = 'IS 2470 (Part 1):1985 + CPHEEO Manual on Sewerage & Sewage Treatment (2013): 100 Lpcd flow, 1-day retention, 30 L/person/yr sludge, 2-yr desludging interval';
const DEWATS_SOURCE = 'BORDA/EAWAG-Sandec Compendium of Sanitation Systems and Technologies (2nd ed., 2014): 80 Lpcd decentralized wastewater flow';
const CW_SOURCE = 'BORDA/EAWAG-Sandec Compendium (2014) + CPHEEO Manual: horizontal-flow constructed wetland design area norm ≈2 m²/person';
const WSP_SOURCE = 'CPHEEO Manual on Sewerage & Sewage Treatment (2013): waste stabilization pond area norms for warm-climate (Indian) conditions';
const FSSM_SOURCE = 'CPHEEO Faecal Sludge & Septage Management Manual (2013 update) + BORDA drying-bed loading guidance';
const WATER_SOURCE = 'CPHEEO / national rural drinking water norm: 55 liters/person/day (Jal Jeevan Mission baseline)';
const SPHERE_SOURCE = 'Sphere Handbook (2018), Minimum Standards in WASH: 1 shared latrine per ≤20 people in an emergency phase';
const SWM_SOURCE = 'Solid Waste Management Rules 2016 (MoEFCC): ≈0.4 kg/person/day municipal solid waste generation (Indian town average)';

export const CAPACITY_MODELS: Record<string, CapacityModel> = {
  'twin-pit': { kind: 'pit', paramLabel: 'Volume per pit', paramUnit: 'm³', defaultParam: 1.0, accumRate: 0.067, designPeriod: 3, source: SBM_PIT_SOURCE },
  'vip': { kind: 'pit', paramLabel: 'Pit volume', paramUnit: 'm³', defaultParam: 1.7, accumRate: 0.067, designPeriod: 5, source: SBM_PIT_SOURCE + '; VIP single pit sized for a longer 5-yr design life' },
  'uddt': { kind: 'pit', paramLabel: 'Vault volume', paramUnit: 'm³', defaultParam: 0.9, accumRate: 0.06, designPeriod: 3, source: SBM_PIT_SOURCE + '; urine diversion reduces solids volume slightly' },
  'composting-dry': { kind: 'pit', paramLabel: 'Chamber volume', paramUnit: 'm³', defaultParam: 0.8, accumRate: 0.07, designPeriod: 2, source: SBM_PIT_SOURCE + '; dry composting, shorter 2-yr cycle before harvesting compost' },
  'arborloo': { kind: 'pit', paramLabel: 'Pit volume', paramUnit: 'm³', defaultParam: 0.35, accumRate: 0.07, designPeriod: 1, source: SBM_PIT_SOURCE + '; shallow pit moved annually to plant a tree over it' },
  'skyloo': { kind: 'pit', paramLabel: 'Vault volume (per household)', paramUnit: 'm³', defaultParam: 1.0, accumRate: 0.067, designPeriod: 3, source: SBM_PIT_SOURCE + '; elevated vault, same accumulation basis as twin-pit' },
  'flood-resilient-sanitation': { kind: 'pit', paramLabel: 'Raised-pit volume', paramUnit: 'm³', defaultParam: 1.2, accumRate: 0.067, designPeriod: 3, source: SBM_PIT_SOURCE + '; elevated 0.6-1m above flood level, same accumulation basis' },

  'soak-pit': { kind: 'wetland', paramLabel: 'Infiltration surface area', paramUnit: 'm²', defaultParam: 3, areaPerCapita: 0.8, source: 'CPHEEO Manual, on-site sullage disposal: ≈0.8 m² infiltration area per person for greywater in moderately permeable soil' },
  'greywater-garden': { kind: 'wetland', paramLabel: 'Leach/planted bed area', paramUnit: 'm²', defaultParam: 4, areaPerCapita: 0.8, source: 'CPHEEO Manual, on-site sullage disposal: ≈0.8 m² infiltration area per person' },

  'septic-tank': { kind: 'septic', paramLabel: 'Tank volume', paramUnit: 'm³', defaultParam: 1.0, flowPerCapita: 0.10, retentionDays: 1, accumRate: 0.03, designPeriod: 2, source: IS2470_SOURCE },
  'septic-tank-improved': { kind: 'septic', paramLabel: 'Tank volume', paramUnit: 'm³', defaultParam: 1.2, flowPerCapita: 0.10, retentionDays: 1, accumRate: 0.03, designPeriod: 3, source: IS2470_SOURCE + '; improved design extends desludging interval to 3 yr' },

  'dewats': { kind: 'reactor', paramLabel: 'Total system volume (settler+ABR+AF+wetland combined)', paramUnit: 'm³', defaultParam: 40, flowPerCapita: 0.08, hrtDays: 1, source: DEWATS_SOURCE },
  'dewats-full-train': { kind: 'reactor', paramLabel: 'Total treatment-train volume', paramUnit: 'm³', defaultParam: 400, flowPerCapita: 0.08, hrtDays: 1, source: DEWATS_SOURCE + '; full multi-stage train sized for institutional/small-town scale' },
  'settler-sedimentation-tank': { kind: 'reactor', paramLabel: 'Settler volume', paramUnit: 'm³', defaultParam: 4, flowPerCapita: 0.08, hrtDays: 0.125, source: DEWATS_SOURCE + '; primary settler HRT ≈3 hours' },
  'anaerobic-baffled-reactor': { kind: 'reactor', paramLabel: 'ABR volume', paramUnit: 'm³', defaultParam: 60, flowPerCapita: 0.08, hrtDays: 1.5, source: DEWATS_SOURCE + '; ABR HRT ≈36-48 hours' },
  'anaerobic-filter': { kind: 'reactor', paramLabel: 'Filter volume', paramUnit: 'm³', defaultParam: 30, flowPerCapita: 0.08, hrtDays: 1, source: DEWATS_SOURCE + '; AF as polishing stage, HRT ≈1 day' },
  'uasb-reactor': { kind: 'reactor', paramLabel: 'Reactor volume', paramUnit: 'm³', defaultParam: 150, flowPerCapita: 0.08, hrtDays: 0.33, source: DEWATS_SOURCE + '; UASB is high-rate, HRT ≈6-8 hours' },
  'biogas-digester-kvic': { kind: 'reactor', paramLabel: 'Digester volume', paramUnit: 'm³', defaultParam: 2, flowPerCapita: 0.005, hrtDays: 40, source: 'KVIC/Deenbandhu design manual: ≈40-day retention for methanogenesis, sized on night-soil + kitchen waste input (~5 L/person/day)' },
  'bio-digester': { kind: 'reactor', paramLabel: 'Digester tank volume', paramUnit: 'm³', defaultParam: 1.5, flowPerCapita: 0.008, hrtDays: 35, source: 'DRDO bio-digester design (psychrophilic bacteria, used by Indian Railways/Army): ≈35-day retention at ambient/cold temperature, toilet-integrated tank' },
  'johkasou': { kind: 'reactor', paramLabel: 'Unit volume', paramUnit: 'm³', defaultParam: 3, flowPerCapita: 0.20, hrtDays: 0.33, source: 'Japan Johkasou design standard (MLIT): packaged units rated in "nin-so" (person-equivalent), ≈200 Lpcd design flow, ≈8-hour retention' },

  'constructed-wetland': { kind: 'wetland', paramLabel: 'Wetland bed area', paramUnit: 'm²', defaultParam: 16, areaPerCapita: 2, source: CW_SOURCE },
  'constructed-wetland-horizontal': { kind: 'wetland', paramLabel: 'Bed area', paramUnit: 'm²', defaultParam: 16, areaPerCapita: 2, source: CW_SOURCE },
  'constructed-wetland-vertical': { kind: 'wetland', paramLabel: 'Bed area', paramUnit: 'm²', defaultParam: 10, areaPerCapita: 1, source: CW_SOURCE + '; vertical-flow beds oxygenate better, ≈1 m²/person' },
  'root-zone-treatment': { kind: 'wetland', paramLabel: 'Root-zone bed area', paramUnit: 'm²', defaultParam: 16, areaPerCapita: 2, source: CW_SOURCE },
  'sand-gravel-filter': { kind: 'wetland', paramLabel: 'Filter bed area', paramUnit: 'm²', defaultParam: 4, areaPerCapita: 0.5, source: DEWATS_SOURCE + '; slow sand/gravel filter, low-rate loading ≈0.5 m²/person' },

  'waste-stabilization-pond': { kind: 'pond', paramLabel: 'Total pond area (anaerobic+facultative+maturation)', paramUnit: 'm²', defaultParam: 8000, areaPerCapita: 4, source: WSP_SOURCE },
  'duckweed-pond': { kind: 'pond', paramLabel: 'Pond surface area', paramUnit: 'm²', defaultParam: 5000, areaPerCapita: 2.5, source: WSP_SOURCE + '; duckweed cover improves treatment efficiency per m² over open facultative ponds' },
  'polishing-pond': { kind: 'pond', paramLabel: 'Pond surface area', paramUnit: 'm²', defaultParam: 2000, areaPerCapita: 1, source: WSP_SOURCE + '; tertiary/maturation stage only, smaller area than primary treatment ponds' },

  'planted-drying-bed': { kind: 'bed', paramLabel: 'Bed area', paramUnit: 'm²', defaultParam: 60, areaPerCapita: 0.025, source: FSSM_SOURCE + '; planted beds, continuous loading' },
  'unplanted-drying-bed-solar': { kind: 'bed', paramLabel: 'Bed area', paramUnit: 'm²', defaultParam: 100, areaPerCapita: 0.03, source: FSSM_SOURCE + '; unplanted solar beds need bed rotation/rest periods, slightly more area per person' },
  'faecal-sludge-co-composting': { kind: 'bed', paramLabel: 'Composting pad area', paramUnit: 'm²', defaultParam: 150, areaPerCapita: 0.03, source: FSSM_SOURCE },

  'rainwater-harvesting': { kind: 'water-supply', paramLabel: 'Reliable daily yield', paramUnit: 'L/day', defaultParam: 275, demandLpcd: 55, source: WATER_SOURCE },
  'bore-well': { kind: 'water-supply', paramLabel: 'Pump/handpump yield', paramUnit: 'L/day', defaultParam: 2750, demandLpcd: 55, source: WATER_SOURCE },
  'solar-water-pump': { kind: 'water-supply', paramLabel: 'Pump output', paramUnit: 'L/day', defaultParam: 5000, demandLpcd: 55, source: WATER_SOURCE },
  'greywater-recycling-unit': { kind: 'water-supply', paramLabel: 'Treatment capacity', paramUnit: 'L/day', defaultParam: 1000, demandLpcd: 50, source: 'CPHEEO Manual on-site sullage generation: ≈50 Lpcd greywater fraction (not total supply demand)' },
  'sewered-flush': { kind: 'water-supply', paramLabel: 'Connected treatment plant capacity', paramUnit: 'L/day', defaultParam: 1000000, demandLpcd: 135, source: 'CPHEEO Manual on Sewerage & Sewage Treatment (2013): urban design flow 135 Lpcd; STP capacity in MLD × 1,000,000 = L/day (e.g. a 5 MLD plant → enter 5000000)' },

  'emergency-latrine': { kind: 'per-unit', paramLabel: 'Number of latrine stances', paramUnit: 'stances', defaultParam: 1, peoplePerUnit: 20, source: SPHERE_SOURCE },
  'cbs': { kind: 'per-unit', paramLabel: 'Number of container-toilet units', paramUnit: 'units', defaultParam: 1, peoplePerUnit: 5, source: 'CBS practice (e.g. Sanergy, X-Runner): 1 container unit per household, ≈5 people/household (Census 2011 India average)' },

  'solid-waste': { kind: 'waste-collection', paramLabel: 'Daily collection capacity', paramUnit: 'kg/day', defaultParam: 400, wastePerCapitaKgDay: 0.4, source: SWM_SOURCE },
};

// Technologies without a clean single physical-capacity formula (policy/coverage-scale
// interventions, not a sized treatment unit) -- kept as a labeled typical-scale
// description rather than forcing a fabricated formula onto something that isn't sized
// this way in practice.
export const NON_PHYSICAL_SCALE: Record<string, string> = {
  'watershed-management': 'Village catchment scale (500-10,000 people) -- sized by hectares of catchment treated, not a per-person design norm; highly site- and rainfall-dependent.',
  'early-warning-system': 'Village to block level (1,000-50,000 people) -- coverage is communication range (siren/SMS/cable radius), not a treatment capacity.',
  'drought-resistant-crops': 'Farming community scale (50-5,000 people) -- an agricultural intervention; population "served" depends on landholding patterns, not a fixed design ratio.',
};

const NON_PHYSICAL_RANGE: Record<string, [number, number]> = {
  'watershed-management': [500, 10000],
  'early-warning-system': [1000, 50000],
  'drought-resistant-crops': [50, 5000],
};

// Population served at this technology's default design parameter -- used to place it
// in a Population Load filter band. A real computed number (see computePopulationServed),
// not a hardcoded guess; the 3 non-physical entries fall back to a labeled typical range.
export function defaultPopulationServed(slug: string): number {
  const model = CAPACITY_MODELS[slug];
  if (model) return computePopulationServed(model, model.defaultParam);
  const range = NON_PHYSICAL_RANGE[slug];
  return range ? Math.round((range[0] + range[1]) / 2) : 0;
}

export function populationLoadLabel(slug: string): string {
  const model = CAPACITY_MODELS[slug];
  if (model) {
    const pop = Math.round(computePopulationServed(model, model.defaultParam));
    return `≈${pop.toLocaleString()} people at default ${model.defaultParam}${model.paramUnit} ${model.paramLabel.toLowerCase()}`;
  }
  return NON_PHYSICAL_SCALE[slug] ?? '';
}
