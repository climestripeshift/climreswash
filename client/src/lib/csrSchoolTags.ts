// Manual CSR-company <-> school tagging for /csr-rajasthan's Companies tab -- lets a user
// pin specific schools to a specific CSR company as a simple outreach worklist ("this
// company should fund this school"), independent of the district-level matching the rest
// of the page does. Many-to-many: a school can be tagged under more than one company, and
// a company can have any number of tagged schools.
//
// Persisted to localStorage, same rationale as csrCostAssumptions.ts -- this is a personal
// working list for whoever's doing outreach, not shared/synced data, and there's no backend
// write endpoint on this static-data platform to persist it to instead.

export interface TaggedSchool {
  udise_code: string;
  name: string;
  district: string;
}

export type SchoolTags = Record<string, TaggedSchool[]>; // company name -> tagged schools

const STORAGE_KEY = "csr_school_tags_v1";

export function loadSchoolTags(): SchoolTags {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSchoolTags(tags: SchoolTags) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
}

export function tagSchool(tags: SchoolTags, company: string, school: TaggedSchool): SchoolTags {
  const existing = tags[company] ?? [];
  if (existing.some((s) => s.udise_code === school.udise_code)) return tags;
  const next = { ...tags, [company]: [...existing, school] };
  saveSchoolTags(next);
  return next;
}

export function untagSchool(tags: SchoolTags, company: string, udiseCode: string): SchoolTags {
  const next = { ...tags, [company]: (tags[company] ?? []).filter((s) => s.udise_code !== udiseCode) };
  saveSchoolTags(next);
  return next;
}
