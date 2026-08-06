// Per-unit cost assumptions for estimating total funding required to address school
// infrastructure needs (toilet construction, classroom repair, dilapidated-building
// reconstruction, new classroom construction) on /csr-rajasthan.
//
// Stored in localStorage rather than a backend field -- these are editable planning
// estimates a UNICEF/CSR-outreach user sets for themselves, not authoritative unit
// costs from any government schedule of rates, and there's no reason a page reload
// (or another visitor) should reset them. Lives in its own module + its own page
// (CSRCostAssumptionsPage.tsx) precisely so editing costs doesn't require the CSR
// page to re-fetch its ~5MB of district/company/school data -- reading localStorage
// is instant, no network round-trip.

export interface UnitCosts {
  toilet: number;              // ₹ per toilet_required_count unit
  // ₹ per classroom needing repair -- FALLBACK ONLY. Repair cost normally comes from real
  // data (classroom_repair_actual_cost_rs, summed from ACR_Raiparing List.xlsx's own
  // per-school cost column by build_csr_district_map.py), not this flat estimate. Only
  // used if a district is somehow missing from that real data. Not shown as an editable
  // field on the cost-assumptions page for that reason.
  classroomRepair: number;
  dilapidatedBuilding: number; // ₹ per school flagged building_dilapidated (full reconstruction)
  newClassroom: number;        // ₹ per new classroom required
}

// Rough planning-level defaults (₹), not sourced from an official schedule of rates --
// meant as a reasonable starting point the user overrides on the cost-assumptions page.
export const DEFAULT_UNIT_COSTS: UnitCosts = {
  toilet: 60_000,
  classroomRepair: 150_000,
  dilapidatedBuilding: 1_000_000,
  newClassroom: 800_000,
};

const STORAGE_KEY = "csr_unit_costs_v1";

export function loadUnitCosts(): UnitCosts {
  if (typeof window === "undefined") return DEFAULT_UNIT_COSTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_UNIT_COSTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_UNIT_COSTS, ...parsed };
  } catch {
    return DEFAULT_UNIT_COSTS;
  }
}

export function saveUnitCosts(costs: UnitCosts) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(costs));
}

export function resetUnitCosts() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export interface NeedCounts {
  toilet_required_count: number;
  classroom_repair_needed_count: number;
  classroom_repair_actual_cost_rs?: number; // real data -- see UnitCosts.classroomRepair comment
  building_dilapidated_count: number;
  new_classroom_requirement_count: number;
}

export function repairCost(need: NeedCounts, costs: UnitCosts): number {
  return need.classroom_repair_actual_cost_rs && need.classroom_repair_actual_cost_rs > 0
    ? need.classroom_repair_actual_cost_rs
    : need.classroom_repair_needed_count * costs.classroomRepair;
}

export function estimateFundingRequired(need: NeedCounts, costs: UnitCosts): number {
  return need.toilet_required_count * costs.toilet
    + repairCost(need, costs)
    + need.building_dilapidated_count * costs.dilapidatedBuilding
    + need.new_classroom_requirement_count * costs.newClassroom;
}

// Indian numbering (lakh/crore) currency formatting -- matches the convention the
// source CSR spreadsheet itself uses ("1.80 cr").
export function formatINR(amount: number): string {
  if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(2)} Cr`;
  if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(2)} L`;
  return `₹${amount.toLocaleString("en-IN")}`;
}
