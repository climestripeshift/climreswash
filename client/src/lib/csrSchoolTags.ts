// Manual CSR-company <-> school tagging for /csr-rajasthan's Companies tab -- lets a user
// pin specific schools to a specific CSR company as a simple outreach worklist ("this
// company should fund this school"), independent of the district-level matching the rest
// of the page does. Many-to-many: a school can be tagged under more than one company, and
// a company can have any number of tagged schools.
//
// Persisted to localStorage, same rationale as csrCostAssumptions.ts -- this is a personal
// working list for whoever's doing outreach, not shared/synced data, and there's no backend
// write endpoint on this static-data platform to persist it to instead.
//
// IMPORTANT: localStorage.setItem can throw (QuotaExceededError) -- confirmed happening in
// Replit's preview webview specifically, which appears to allow a much smaller quota than a
// normal desktop browser tab (auto-tagging a few thousand small records was enough to hit
// it there, though it's well under localStorage's usual ~5-10MB elsewhere). An uncaught
// throw here previously aborted the *entire* React state update that called it, silently
// discarding the in-memory tag change too -- every write below is wrapped so persistence
// failing degrades to "works for this session, won't survive a reload" instead of "looks
// like tagging just does nothing."

export interface TaggedSchool {
  udise_code: string;
  name: string;
  district: string;
}

export type SchoolTags = Record<string, TaggedSchool[]>; // company name -> tagged schools

const STORAGE_KEY = "csr_school_tags_v1";

/** True if the most recent save() call failed to persist (e.g. quota exceeded) --
 * the in-memory data is still correct, it just won't survive a reload. */
let lastSaveFailed = false;
export function didLastTagSaveFail() {
  return lastSaveFailed;
}

function trySet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn(`csrSchoolTags: localStorage.setItem("${key}") failed (${(e as Error)?.name ?? e}) -- `
      + `continuing in-memory only, this won't survive a reload.`);
    return false;
  }
}

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
  lastSaveFailed = !trySet(STORAGE_KEY, JSON.stringify(tags));
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
  trySet(AUTO_TAG_STORAGE_KEY, JSON.stringify(Array.from(set)));
}

// Safety ceiling per company. Lowered from an earlier 3000 after that amount alone was
// enough to blow Replit's preview-webview localStorage quota -- 500 is a large enough
// worklist to be a genuine district-wide need list while leaving real headroom before
// hitting quota issues again, and multiple companies can still each get their own 500.
export const AUTO_TAG_CAP = 500;
