import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, ChevronRight, X, Plus, Loader2 } from "lucide-react";
import { THEMES, type ThemeKey, type Company } from "@/lib/csrTypes";
import {
  type SchoolTags, type TaggedSchool, loadSchoolTags, tagSchool, untagSchool,
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

function needBadges(s: SchoolLite) {
  const badges: { icon: string; title: string }[] = [];
  if (s.girls_toilet_required) badges.push({ icon: "🚽", title: "Toilet required" });
  if (s.classroom_repair_needed) badges.push({ icon: "🛠️", title: "Classroom repair needed" });
  if (s.building_dilapidated) badges.push({ icon: "🏚️", title: "Building dilapidated" });
  if (s.new_classroom_requirement) badges.push({ icon: "🏗️", title: "New classroom needed" });
  return badges;
}

function TaggingPanel({ company, schools, schoolsLoading, tags, onTag, onUntag }: {
  company: Company; schools: SchoolLite[] | undefined; schoolsLoading: boolean;
  tags: TaggedSchool[]; onTag: (s: TaggedSchool) => void; onUntag: (udise: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState<string>(company.districts[0] ?? "All");
  const taggedCodes = useMemo(() => new Set(tags.map((t) => t.udise_code)), [tags]);

  const results = useMemo(() => {
    if (!schools || search.trim().length < 2) return [];
    const q = search.trim().toLowerCase();
    return schools
      .filter((s) => (districtFilter === "All" || s.district === districtFilter) && s.name.toLowerCase().includes(q))
      .slice(0, SEARCH_RESULTS_LIMIT);
  }, [schools, search, districtFilter]);

  return (
    <div className="p-3 space-y-3">
      <div>
        <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">
          Tagged schools ({tags.length})
        </div>
        {tags.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">None yet — search below to tag a school to this company.</div>
        ) : (
          <div className="space-y-1">
            {tags.map((t) => (
              <div key={t.udise_code} className="flex items-center justify-between px-2 py-1 rounded bg-emerald-500/10 text-[11px]">
                <span>{t.name} <span className="text-muted-foreground">· {t.district}</span></span>
                <button onClick={() => onUntag(t.udise_code)} className="text-muted-foreground hover:text-red-400">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">Tag a school</div>
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search school name (2+ characters)..."
              className="w-full pl-6 pr-2 py-1 rounded-md border border-border/50 bg-background text-[11px] outline-none" />
          </div>
          <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)}
            className="rounded-md border border-border/50 bg-background px-2 py-1 text-[11px] outline-none">
            <option value="All">All districts</option>
            {company.districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        {schoolsLoading ? (
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Loading school registry…</div>
        ) : search.trim().length < 2 ? (
          <div className="text-[11px] text-muted-foreground">Type at least 2 characters to search.</div>
        ) : results.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">No matches.</div>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {results.map((s) => {
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

export default function CSRCompaniesTab({ companies, districts }: { companies: Company[]; districts: string[] }) {
  const [search, setSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState("All");
  const [themeFilter, setThemeFilter] = useState<ThemeKey | "all">("all");
  const [sortBy, setSortBy] = useState<"name" | "districts" | "tagged">("districts");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [tags, setTags] = useState<SchoolTags>(() => loadSchoolTags());

  // Lazy-loaded: the full school registry is ~70MB, no reason to fetch it until the user
  // actually opens a company's tagging panel for the first time.
  const schoolsQ = useQuery<SchoolLite[]>({
    queryKey: ["csr-tagging-schools"],
    queryFn: () => fetch("/data/shvr_schools_infra_rajasthan.json").then((r) => r.json()),
    staleTime: Infinity,
    enabled: expanded !== null,
  });

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

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "tagged") return (tags[b.name]?.length ?? 0) - (tags[a.name]?.length ?? 0);
    return b.districts.length - a.districts.length;
  }), [filtered, sortBy, tags]);

  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  const handleTag = (company: string, school: TaggedSchool) => setTags((t) => tagSchool(t, company, school));
  const handleUntag = (company: string, udise: string) => setTags((t) => untagSchool(t, company, udise));

  return (
    <div className="space-y-3">
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
                <th className="px-3 py-2 font-medium text-right cursor-pointer hover:text-foreground" onClick={() => setSortBy("tagged")}>
                  Tagged Schools{sortBy === "tagged" && " ▾"}
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => {
                const companyTags = tags[c.name] ?? [];
                return (
                  <Fragment key={c.name}>
                    <tr className="border-b border-border/10 hover:bg-muted/20 cursor-pointer"
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
                      <td className="px-3 py-1.5 text-right">
                        <span className={companyTags.length > 0 ? "text-emerald-400 font-semibold" : "text-muted-foreground"}>{companyTags.length}</span>
                      </td>
                    </tr>
                    {expanded === c.name && (
                      <tr>
                        <td colSpan={7} className="p-0 bg-muted/10 border-b border-border/10">
                          <TaggingPanel
                            company={c}
                            schools={schoolsQ.data}
                            schoolsLoading={schoolsQ.isLoading}
                            tags={companyTags}
                            onTag={(s) => handleTag(c.name, s)}
                            onUntag={(udise) => handleUntag(c.name, udise)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
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
