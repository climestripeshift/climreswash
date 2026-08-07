import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, ChevronRight, X, Plus, Loader2 } from "lucide-react";
import { THEMES, type ThemeKey, type Company } from "@/lib/csrTypes";
import {
  type SchoolTags, type TaggedSchool, loadSchoolTags, tagSchool, untagSchool,
  bulkTagSchools, loadAutoTaggedSet, markAutoTagged, AUTO_TAG_CAP, didLastTagSaveFail,
} from "@/lib/csrSchoolTags";

interface SchoolLite {
  udise_code: string;
  name: string;
  district: string;
  school_level: string | null;
  block: string | null;
  rating: number | null;
  girls_toilet_required: number | null;
  classroom_repair_needed: boolean;
  building_dilapidated: boolean;
  new_classroom_requirement: boolean;
}

const PAGE_SIZE = 25;
const SEARCH_RESULTS_LIMIT = 40;
const TAGGED_PAGE_SIZE = 100;

function needBadges(s: SchoolLite) {
  const badges: { icon: string; title: string }[] = [];
  if (s.girls_toilet_required) badges.push({ icon: "🚽", title: "Toilet required" });
  if (s.classroom_repair_needed) badges.push({ icon: "🛠️", title: "Classroom repair needed" });
  if (s.building_dilapidated) badges.push({ icon: "🏚️", title: "Building dilapidated" });
  if (s.new_classroom_requirement) badges.push({ icon: "🏗️", title: "New classroom needed" });
  return badges;
}

// Shared by the suggestion list (which slices this down for display) and the auto-tag
// effect (which uses the full thing, capped) -- every school with a documented need in
// the given districts, most-needs-first.
function allNeedySchoolsInDistricts(schools: SchoolLite[], districts: string[]): SchoolLite[] {
  const scope = new Set(districts);
  const pool = schools.filter((s) => scope.has(s.district) && needBadges(s).length > 0);
  return pool.sort((a, b) => needBadges(b).length - needBadges(a).length || a.name.localeCompare(b.name));
}

function TaggingPanel({ company, needInScope, schools, schoolsLoading, tags, onTag, onUntag }: {
  company: Company; needInScope: number; schools: SchoolLite[] | undefined; schoolsLoading: boolean;
  tags: TaggedSchool[]; onTag: (s: TaggedSchool) => void; onUntag: (udise: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState<string>(company.districts[0] ?? "All");
  const [tagsShown, setTagsShown] = useState(TAGGED_PAGE_SIZE);
  const taggedCodes = useMemo(() => new Set(tags.map((t) => t.udise_code)), [tags]);
  const hasCompanyDistricts = company.districts.length > 0;
  const q = search.trim().toLowerCase();

  // Districts are already known per company and need flags already known per school, so
  // the panel auto-suggests needy schools in the company's own districts rather than
  // requiring the user to type a name first -- search just narrows that candidate pool
  // (or, for a pure-statewide company with no specific district list, search is the only
  // way in, since "all 41 districts' schools" is too large a pool to dump by default).
  const { candidates, matchCount, requiresSearch } = useMemo(() => {
    if (!schools) return { candidates: [] as SchoolLite[], matchCount: 0, requiresSearch: false };
    let pool = schools;
    const requiresSearch = !hasCompanyDistricts && districtFilter === "All";
    if (requiresSearch && !q) return { candidates: [], matchCount: 0, requiresSearch: true };

    if (hasCompanyDistricts) {
      const scope = districtFilter === "All" ? new Set(company.districts) : new Set([districtFilter]);
      pool = pool.filter((s) => scope.has(s.district));
    } else if (districtFilter !== "All") {
      pool = pool.filter((s) => s.district === districtFilter);
    }
    if (q) pool = pool.filter((s) => s.name.toLowerCase().includes(q));
    // without a search term, only show schools with an actual documented need -- that's
    // the whole point of suggesting candidates instead of dumping every school in scope
    if (!q) pool = pool.filter((s) => needBadges(s).length > 0);

    const sorted = [...pool].sort((a, b) => needBadges(b).length - needBadges(a).length || a.name.localeCompare(b.name));
    return { candidates: sorted.slice(0, SEARCH_RESULTS_LIMIT), matchCount: sorted.length, requiresSearch: false };
  }, [schools, q, districtFilter, hasCompanyDistricts, company.districts]);

  return (
    <div className="p-3 space-y-3">
      {hasCompanyDistricts && (
        <div className="text-[10px] text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
          {needInScope > AUTO_TAG_CAP ? (
            <>{company.name.split(",")[0]}'s districts have <strong>{needInScope.toLocaleString()}</strong> schools with a
            documented need in total — the worklist below is capped at the first <strong>{AUTO_TAG_CAP}</strong> (most-needs-first)
            to keep this manageable and protect browser storage; the rest are still findable via search.</>
          ) : (
            <>Every school with a documented need in {company.name.split(",")[0]}'s districts
            ({needInScope.toLocaleString()} total) was auto-tagged below — untag any that don't belong,
            or use the search further down to add others.</>
          )}
        </div>
      )}
      <div>
        <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">
          Tagged schools ({tags.length})
        </div>
        {tags.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">None yet — pick one from the suggestions below.</div>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {tags.slice(0, tagsShown).map((t) => (
              <div key={t.udise_code} className="flex items-center justify-between px-2 py-1 rounded bg-emerald-500/10 text-[11px]">
                <span>{t.name} <span className="text-muted-foreground">· {t.district}</span></span>
                <button onClick={() => onUntag(t.udise_code)} className="text-muted-foreground hover:text-red-400">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {tags.length > tagsShown && (
              <button onClick={() => setTagsShown((n) => n + TAGGED_PAGE_SIZE)}
                className="text-[10px] text-emerald-400 hover:underline px-2 py-1">
                Show {Math.min(TAGGED_PAGE_SIZE, tags.length - tagsShown)} more ({tags.length - tagsShown} remaining)
              </button>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">
          {hasCompanyDistricts ? "Needy schools in this company's districts" : "Tag a school"}
        </div>
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={hasCompanyDistricts ? "Narrow by school name (optional)..." : "Search school name (required — statewide company)..."}
              className="w-full pl-6 pr-2 py-1 rounded-md border border-border/50 bg-background text-[11px] outline-none" />
          </div>
          <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)}
            className="rounded-md border border-border/50 bg-background px-2 py-1 text-[11px] outline-none">
            <option value="All">{hasCompanyDistricts ? "All of this company's districts" : "All districts (type a name first)"}</option>
            {company.districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        {schoolsLoading ? (
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Loading school registry…</div>
        ) : requiresSearch ? (
          <div className="text-[11px] text-muted-foreground">This company covers all districts statewide — type a school name or pick one district to browse.</div>
        ) : candidates.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">{q ? "No matches." : "No documented need found for schools in scope — try searching by name instead."}</div>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {!q && matchCount > candidates.length && (
              <div className="text-[10px] text-muted-foreground pb-1">Showing top {candidates.length} of {matchCount} needy schools, most needs first — search to narrow.</div>
            )}
            {candidates.map((s) => {
              const already = taggedCodes.has(s.udise_code);
              return (
                <div key={s.udise_code} className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted/30 text-[11px]">
                  <span className="flex items-center gap-1.5">
                    {s.name} <span className="text-muted-foreground">· {s.district}{s.block && ` · ${s.block}`}</span>
                    {needBadges(s).map((b) => <span key={b.icon} title={b.title}>{b.icon}</span>)}
                  </span>
                  <button
                    disabled={already}
                    onClick={() => onTag({ udise_code: s.udise_code, name: s.name, district: s.district })}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 ${already ? "text-muted-foreground" : "bg-emerald-600 text-white hover:bg-emerald-500"}`}>
                    {already ? "Tagged" : <><Plus className="h-2.5 w-2.5" />Tag</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CSRCompaniesTab({ companies, districts, districtNeedCounts }: {
  companies: Company[]; districts: string[]; districtNeedCounts: Record<string, number>;
}) {
  const [search, setSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState("All");
  const [themeFilter, setThemeFilter] = useState<ThemeKey | "all">("all");
  const [sortBy, setSortBy] = useState<"name" | "districts" | "need" | "tagged">("need");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [tags, setTags] = useState<SchoolTags>(() => loadSchoolTags());
  // saveSchoolTags()/didLastTagSaveFail() are synchronous, but setTags(updaterFn) isn't --
  // React doesn't call the updater until its own commit phase, so checking
  // didLastTagSaveFail() right after calling setTags reads a stale (pre-write) value. This
  // ref always holds the latest tags so handlers can compute the next value and call
  // saveSchoolTags() synchronously themselves, then check the result immediately.
  const tagsRef = useRef(tags);
  useEffect(() => { tagsRef.current = tags; }, [tags]);
  const [autoTagged, setAutoTagged] = useState<Set<string>>(() => loadAutoTaggedSet());
  const [saveFailed, setSaveFailed] = useState(false);

  // Lazy-loaded: the full school registry is ~70MB, no reason to fetch it until the user
  // actually opens a company's tagging panel for the first time.
  const schoolsQ = useQuery<SchoolLite[]>({
    queryKey: ["csr-tagging-schools"],
    queryFn: () => fetch("/data/shvr_schools_infra_rajasthan.json").then((r) => r.json()),
    staleTime: Infinity,
    enabled: expanded !== null,
  });

  // Auto-tag every needy school in the expanded company's districts, once, the first time
  // its panel is ever opened -- districts are already known per company and need flags
  // already known per school, so there's no reason to make the user manually build this
  // list one click at a time. Only runs once per company ever (see markAutoTagged); a
  // user who untags some afterward won't have them silently reappear on re-expand. Pure
  // statewide companies (no specific district on record) are skipped -- "every needy
  // school in Rajasthan" isn't a usable worklist.
  useEffect(() => {
    if (!expanded || !schoolsQ.data) return;
    if (autoTagged.has(expanded)) return;
    const company = companies.find((c) => c.name === expanded);
    if (!company || company.districts.length === 0) return;

    const needy = allNeedySchoolsInDistricts(schoolsQ.data, company.districts).slice(0, AUTO_TAG_CAP);
    const toTag: TaggedSchool[] = needy.map((s) => ({ udise_code: s.udise_code, name: s.name, district: s.district }));
    const next = bulkTagSchools(tagsRef.current, expanded, toTag);
    setTags(next);
    markAutoTagged(expanded);
    setAutoTagged((s) => new Set(s).add(expanded));
    if (didLastTagSaveFail()) setSaveFailed(true);
  }, [expanded, schoolsQ.data, companies, autoTagged]);

  const filtered = useMemo(() => {
    let r = companies;
    if (districtFilter !== "All") r = r.filter((c) => c.districts.includes(districtFilter) || c.is_statewide);
    if (themeFilter !== "all") r = r.filter((c) => c.themes[themeFilter]);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter((c) => c.name.toLowerCase().includes(q));
    }
    return r;
  }, [companies, districtFilter, themeFilter, search]);

  // Real total, not the (500-capped) auto-tag worklist size -- computed from the already-
  // loaded district summary, not the lazily-fetched school registry, so it's available for
  // every company immediately without expanding anything.
  const needInScope = (company: Company) => company.districts.reduce((sum, d) => sum + (districtNeedCounts[d] ?? 0), 0);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "tagged") return (tags[b.name]?.length ?? 0) - (tags[a.name]?.length ?? 0);
    if (sortBy === "need") return needInScope(b) - needInScope(a);
    return b.districts.length - a.districts.length;
  }), [filtered, sortBy, tags, districtNeedCounts]);

  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  const handleTag = (company: string, school: TaggedSchool) => {
    const next = tagSchool(tagsRef.current, company, school);
    setTags(next);
    if (didLastTagSaveFail()) setSaveFailed(true);
  };
  const handleUntag = (company: string, udise: string) => {
    const next = untagSchool(tagsRef.current, company, udise);
    setTags(next);
    if (didLastTagSaveFail()) setSaveFailed(true);
  };

  return (
    <div className="space-y-3">
      {saveFailed && (
        <div className="px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-500 dark:text-amber-400">
          ⚠️ Couldn't save tags to this browser's storage (quota exceeded) — they're still working for this
          session, but won't survive a reload. This can happen in some embedded/preview browser windows; try a
          regular browser tab if it matters that these persist.
        </div>
      )}
      <div className="border border-border/40 rounded-lg overflow-hidden">
        <div className="p-3 border-b border-border/30 flex flex-wrap gap-2 items-center bg-muted/20">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search company name..."
              className="w-full pl-7 pr-2 py-1.5 rounded-md border border-border/50 bg-background text-xs outline-none" />
          </div>
          <select value={districtFilter} onChange={(e) => { setDistrictFilter(e.target.value); setPage(0); }}
            className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs outline-none">
            <option value="All">All Districts</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={themeFilter} onChange={(e) => { setThemeFilter(e.target.value as ThemeKey | "all"); setPage(0); }}
            className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs outline-none">
            <option value="all">All themes</option>
            {THEMES.map((t) => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
          </select>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{sorted.length} companies</span>
        </div>

        <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background border-b border-border/30">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium w-6"></th>
                <th className="px-3 py-2 font-medium cursor-pointer hover:text-foreground" onClick={() => setSortBy("name")}>
                  Company{sortBy === "name" && " ▾"}
                </th>
                <th className="px-3 py-2 font-medium cursor-pointer hover:text-foreground" onClick={() => setSortBy("districts")}>
                  Districts Covered{sortBy === "districts" && " ▾"}
                </th>
                <th className="px-3 py-2 font-medium">Themes</th>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Budget</th>
                <th className="px-3 py-2 font-medium text-right cursor-pointer hover:text-foreground" onClick={() => setSortBy("need")}
                  title="Real total, from the district summary -- not capped">
                  Schools Needing Help{sortBy === "need" && " ▾"}
                </th>
                <th className="px-3 py-2 font-medium text-right cursor-pointer hover:text-foreground" onClick={() => setSortBy("tagged")}
                  title="Auto-tag worklist, capped at 500/company">
                  Tagged Schools{sortBy === "tagged" && " ▾"}
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.flatMap((c) => {
                const companyTags = tags[c.name] ?? [];
                const need = needInScope(c);
                const rows = [
                  <tr key={c.name} className="border-b border-border/10 hover:bg-muted/20 cursor-pointer"
                    onClick={() => setExpanded(expanded === c.name ? null : c.name)}>
                    <td className="px-3 py-1.5">{expanded === c.name ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</td>
                    <td className="px-3 py-1.5 font-medium max-w-xs truncate" title={c.name}>{c.name}</td>
                    <td className="px-3 py-1.5">
                      {c.is_statewide ? (
                        <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 text-[10px] font-semibold">STATEWIDE (all 41)</span>
                      ) : (
                        <span className="text-muted-foreground">{c.districts.slice(0, 3).join(", ")}{c.districts.length > 3 && ` +${c.districts.length - 3} more`}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {THEMES.filter((t) => c.themes[t.key]).map((t) => <span key={t.key} title={t.label}>{t.icon}</span>)}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground max-w-[140px] truncate" title={c.contact_info ?? ""}>{c.contact_person ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground max-w-[100px] truncate" title={c.budget_raw ?? ""}>{c.budget_raw ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">{need > 0 ? need.toLocaleString() : "—"}</td>
                    <td className="px-3 py-1.5 text-right">
                      <span className={companyTags.length > 0 ? "text-emerald-400 font-semibold" : "text-muted-foreground"}>
                        {companyTags.length.toLocaleString()}{companyTags.length >= AUTO_TAG_CAP && companyTags.length < need && <span title="Capped -- see the column to the left for the real total">*</span>}
                      </span>
                    </td>
                  </tr>,
                ];
                if (expanded === c.name) {
                  rows.push(
                    <tr key={`${c.name}-panel`}>
                      <td colSpan={8} className="p-0 bg-muted/10 border-b border-border/10">
                        <TaggingPanel
                          company={c}
                          needInScope={need}
                          schools={schoolsQ.data}
                          schoolsLoading={schoolsQ.isLoading}
                          tags={companyTags}
                          onTag={(s) => handleTag(c.name, s)}
                          onUntag={(udise) => handleUntag(c.name, udise)}
                        />
                      </td>
                    </tr>,
                  );
                }
                return rows;
              })}
            </tbody>
          </table>
        </div>
        <div className="p-2 border-t border-border/30 flex items-center justify-between bg-muted/20">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded text-[10px] disabled:opacity-30 hover:bg-muted/40">← Prev</button>
          <span className="text-[10px] text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded text-[10px] disabled:opacity-30 hover:bg-muted/40">Next →</button>
        </div>
      </div>
    </div>
  );
}
