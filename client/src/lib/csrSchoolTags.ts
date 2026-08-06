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

// Bulk tag (used for auto-tagging every needy school in a company's districts on first
// expand) -- sets the full list at once rather than N individual tagSchool() calls, and
// dedupes by udise_code. Doesn't check "already tagged" per-school since this is meant to
// run once against an empty/near-empty list (see AUTO_TAG_STORAGE_KEY below); if the
// company already has some manual tags, those are merged in rather than overwritten.
export function bulkTagSchools(tags: SchoolTags, company: string, newSchools: TaggedSchool[]): SchoolTags {
  const existing = tags[company] ?? [];
  const byCode = new Map(existing.map((s) => [s.udise_code, s]));
  for (const s of newSchools) if (!byCode.has(s.udise_code)) byCode.set(s.udise_code, s);
  const next = { ...tags, [company]: Array.from(byCode.values()) };
  saveSchoolTags(next);
  return next;
}

// Tracks which companies have already been auto-tagged, so it only runs once ever per
// company -- otherwise re-expanding a panel after the user deliberately untagged some
// schools would just silently re-add them all.
const AUTO_TAG_STORAGE_KEY = "csr_auto_tagged_companies_v1";

export function loadAutoTaggedSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(AUTO_TAG_STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function markAutoTagged(company: string) {
  const set = loadAutoTaggedSet();
  set.add(company);
  window.localStorage.setItem(AUTO_TAG_STORAGE_KEY, JSON.stringify(Array.from(set)));
}

// Safety ceiling per company, purely to protect localStorage's ~5-10MB per-origin quota --
// a handful of very broad companies could otherwise auto-tag tens of thousands of schools.
// Essentially never hit for a company scoped to a normal handful of districts.
export const AUTO_TAG_CAP = 3000;
