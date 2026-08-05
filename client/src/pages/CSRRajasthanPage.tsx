import { useState, useMemo, useEffect, Fragment } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowLeft, Loader2, Search, ChevronDown, ChevronRight, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { type UnitCosts, loadUnitCosts, estimateFundingRequired, formatINR } from "@/lib/csrCostAssumptions";

const THEMES = [
  { key: "formal_education", label: "Formal Education", icon: "📖" },
  { key: "wash", label: "WASH", icon: "🚰" },
  { key: "school_hardware", label: "School Hardware", icon: "🏗️" },
  { key: "other_school_initiative", label: "Other (ICT/Sports)", icon: "🏀" },
  { key: "anganwadi", label: "Anganwadi", icon: "👶" },
] as const;
type ThemeKey = typeof THEMES[number]["key"];

interface DistrictStats {
  csr_specific_count: number;
  csr_specific_companies: string[];
  csr_statewide_count: number;
  csr_total_available_count: number;
  csr_specific_by_theme: Record<ThemeKey, number>;
  csr_statewide_by_theme: Record<ThemeKey, number>;
  total_school_count: number;
  schools_needing_help_count: number;
  toilet_required_count: number;
  classroom_repair_needed_count: number;
  building_dilapidated_count: number;
  new_classroom_requirement_count: number;
  needs_help_no_specific_csr: boolean;
}
interface DistrictSummary {
  meta: {
    total_companies: number; statewide_companies: number; broad_unspecified_companies: number;
    unresolved_tokens: Record<string, number>;
  };
  by_district: Record<string, DistrictStats>;
}
interface Company {
  name: string;
  contact_person: string | null;
  contact_info: string | null;
  primary_district_raw: string | null;
  districts: string[];
  is_statewide: boolean;
  themes: Record<ThemeKey, boolean>;
  budget_raw: string | null;
  annual_report_link: string | null;
}

type MetricKey = "need" | "csr_specific" | "csr_total" | "funding";
const METRICS: { key: MetricKey; label: string; icon: string; invert: boolean }[] = [
  { key: "need", label: "Schools Needing Help", icon: "🆘", invert: true },   // high = bad -> red
  { key: "csr_specific", label: "CSR (District-Specific)", icon: "🏭", invert: false }, // high = good -> green
  { key: "csr_total", label: "CSR (incl. Statewide)", icon: "🌐", invert: false },
  { key: "funding", label: "Funding Required", icon: "💰", invert: true }, // high = bad -> red
];

const RAMP: [number, number, number][] = [[239, 68, 68], [249, 115, 22], [234, 179, 8], [132, 204, 22], [34, 197, 94]];
function gradientColor(t: number) {
  t = Math.max(0, Math.min(1, t));
  const s = t * (RAMP.length - 1);
  const lo = Math.floor(s), hi = Math.min(lo + 1, RAMP.length - 1);
  const f = s - lo;
  const a = RAMP[lo], b = RAMP[hi];
  return `rgb(${a.map((c, i) => Math.round(c + f * (b[i] - c))).join(",")})`;
}
function metricValue(v: DistrictStats | undefined, metric: MetricKey, theme: ThemeKey | "all", costs: UnitCosts): number | null {
  if (!v) return null;
  if (metric === "need") return v.schools_needing_help_count;
  if (metric === "funding") return estimateFundingRequired(v, costs);
  if (theme !== "all") {
    return metric === "csr_specific" ? v.csr_specific_by_theme[theme] : v.csr_specific_by_theme[theme] + v.csr_statewide_by_theme[theme];
  }
  return metric === "csr_specific" ? v.csr_specific_count : v.csr_total_available_count;
}
function metricColor(value: number | null, max: number, invert: boolean) {
  if (value == null || max <= 0) return "#374151";
  const t = value / max;
  return gradientColor(invert ? 1 - t : t);
}

const canvasRenderer = L.canvas({ padding: 0.5 });
const PAGE_SIZE = 30;

function CompanyPanel({ companies }: { companies: Company[] }) {
  if (companies.length === 0) return <div className="px-3 py-2 text-[11px] text-muted-foreground">No companies matched to this district.</div>;
  return (
    <div className="divide-y divide-border/20">
      {companies.map((c, i) => (
        <div key={i} className="px-3 py-2 text-[11px]">
          <div className="font-medium flex items-center gap-1.5">
            {c.name}
            {c.is_statewide && <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 text-[9px] font-semibold">STATEWIDE</span>}
          </div>
          <div className="text-muted-foreground mt-0.5">
            {c.contact_person && <span>{c.contact_person} · </span>}
            {c.contact_info && <span>{c.contact_info}</span>}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {THEMES.filter((t) => c.themes[t.key]).map((t) => (
              <span key={t.key} className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 text-[9px]">{t.icon} {t.label}</span>
            ))}
          </div>
          {c.budget_raw && <div className="text-muted-foreground mt-1">Budget: {c.budget_raw}</div>}
        </div>
      ))}
    </div>
  );
}

function DistrictTable({ data, companies, costs }: { data: DistrictSummary; companies: Company[]; costs: UnitCosts }) {
  const [sortBy, setSortBy] = useState<"need" | "csr" | "funding">("need");
  const [gapOnly, setGapOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const companiesByDistrict = useMemo(() => {
    const m: Record<string, Company[]> = {};
    for (const c of companies) {
      for (const d of c.districts) (m[d] ??= []).push(c);
    }
    return m;
  }, [companies]);
  const statewideCompanies = useMemo(() => companies.filter((c) => c.is_statewide), [companies]);

  const rows = useMemo(() => {
    let r = Object.entries(data.by_district).map(([district, v]) => ({ district, v }));
    if (gapOnly) r = r.filter(({ v }) => v.needs_help_no_specific_csr);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(({ district }) => district.toLowerCase().includes(q));
    }
    return r;
  }, [data, gapOnly, search]);
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    if (sortBy === "need") return b.v.schools_needing_help_count - a.v.schools_needing_help_count;
    if (sortBy === "funding") return estimateFundingRequired(b.v, costs) - estimateFundingRequired(a.v, costs);
    return b.v.csr_total_available_count - a.v.csr_total_available_count;
  }), [rows, sortBy, costs]);

  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-border/30 flex flex-wrap gap-2 items-center bg-muted/20">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search district..." className="w-full pl-7 pr-2 py-1.5 rounded-md border border-border/50 bg-background text-xs outline-none" />
        </div>
        <button onClick={() => { setGapOnly((g) => !g); setPage(0); }}
          className={`px-2.5 py-1.5 rounded text-[11px] font-medium ${gapOnly ? "bg-red-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
          ⚠️ Priority gaps only (need, 0 specific CSR)
        </button>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{sorted.length} districts</span>
      </div>
      <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background border-b border-border/30">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium w-6"></th>
              <th className="px-3 py-2 font-medium">District</th>
              <th className="px-3 py-2 font-medium text-right">Total Schools</th>
              <th className="px-3 py-2 font-medium text-right cursor-pointer hover:text-foreground" onClick={() => setSortBy("need")}>
                Needing Help{sortBy === "need" && " ▾"}
              </th>
              <th className="px-3 py-2 font-medium text-right">Toilet</th>
              <th className="px-3 py-2 font-medium text-right">Repair</th>
              <th className="px-3 py-2 font-medium text-right">Dilapidated</th>
              <th className="px-3 py-2 font-medium text-right">New Room</th>
              <th className="px-3 py-2 font-medium text-right cursor-pointer hover:text-foreground" onClick={() => setSortBy("funding")}>
                💰 Funding Required{sortBy === "funding" && " ▾"}
              </th>
              <th className="px-3 py-2 font-medium text-right cursor-pointer hover:text-foreground" onClick={() => setSortBy("csr")}>
                CSR (specific / statewide){sortBy === "csr" && " ▾"}
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ district, v }) => (
              <Fragment key={district}>
                <tr className={`border-b border-border/10 hover:bg-muted/20 cursor-pointer ${v.needs_help_no_specific_csr ? "bg-red-500/5" : ""}`}
                  onClick={() => setExpanded(expanded === district ? null : district)}>
                  <td className="px-3 py-1.5">{expanded === district ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</td>
                  <td className="px-3 py-1.5 font-medium">{district}{v.needs_help_no_specific_csr && <span className="ml-1.5 text-red-400" title="Needs help, no district-specific CSR">⚠️</span>}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{v.total_school_count.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{v.schools_needing_help_count.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{v.toilet_required_count.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{v.classroom_repair_needed_count.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{v.building_dilapidated_count.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{v.new_classroom_requirement_count.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{formatINR(estimateFundingRequired(v, costs))}</td>
                  <td className="px-3 py-1.5 text-right">
                    <span className={v.csr_specific_count === 0 ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"}>{v.csr_specific_count}</span>
                    <span className="text-muted-foreground"> / {v.csr_statewide_count}</span>
                  </td>
                </tr>
                {expanded === district && (
                  <tr>
                    <td colSpan={10} className="p-0 bg-muted/10 border-b border-border/10">
                      <div className="text-[10px] text-muted-foreground px-3 pt-2">
                        {v.csr_specific_count} companies specifically active here, plus {statewideCompanies.length} statewide companies available to any district:
                      </div>
                      <CompanyPanel companies={companiesByDistrict[district] ?? []} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-2 border-t border-border/30 flex items-center justify-between bg-muted/20">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded text-[10px] disabled:opacity-30 hover:bg-muted/40">← Prev</button>
        <span className="text-[10px] text-muted-foreground">Page {page + 1} of {totalPages}</span>
        <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded text-[10px] disabled:opacity-30 hover:bg-muted/40">Next →</button>
      </div>
    </div>
  );
}

export default function CSRRajasthanPage() {
  const [metric, setMetric] = useState<MetricKey>("need");
  const [themeFilter, setThemeFilter] = useState<ThemeKey | "all">("all");
  const [costs, setCosts] = useState<UnitCosts>(() => loadUnitCosts());

  // re-read on focus so coming back from the cost-assumptions page (a separate page
  // precisely so it doesn't share this page's data-fetch) picks up new values without
  // a full reload -- localStorage writes elsewhere don't trigger a React re-render here
  useEffect(() => {
    const onFocus = () => setCosts(loadUnitCosts());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const summaryQ = useQuery<DistrictSummary>({
    queryKey: ["csr-district-summary"],
    queryFn: () => fetch("/data/csr_district_summary_rajasthan.json").then((r) => r.json()),
    staleTime: Infinity,
  });
  const companiesQ = useQuery<Company[]>({
    queryKey: ["csr-companies"],
    queryFn: () => fetch("/data/csr_companies_rajasthan.json").then((r) => r.json()),
    staleTime: Infinity,
  });
  const districtBoundaryQ = useQuery<any>({
    queryKey: ["rajasthan-districts-current"],
    queryFn: () => fetch("/data/rajasthan_districts_current.geojson").then((r) => r.json()),
    staleTime: Infinity,
  });

  const maxValue = useMemo(() => {
    if (!summaryQ.data) return 0;
    let max = 0;
    for (const v of Object.values(summaryQ.data.by_district)) {
      const val = metricValue(v, metric, themeFilter, costs) ?? 0;
      if (val > max) max = val;
    }
    return max;
  }, [summaryQ.data, metric, themeFilter, costs]);

  const districtGeo = useMemo(() => {
    if (!districtBoundaryQ.data || !summaryQ.data) return null;
    return {
      type: "FeatureCollection",
      features: districtBoundaryQ.data.features.map((f: any) => {
        const district = f.properties.NAME;
        const stats = summaryQ.data!.by_district[district];
        const value = metricValue(stats, metric, themeFilter, costs);
        return { ...f, properties: { ...f.properties, district, value, need: stats?.schools_needing_help_count ?? null, csrSpecific: stats?.csr_specific_count ?? null } };
      }),
    };
  }, [districtBoundaryQ.data, summaryQ.data, metric, themeFilter, costs]);

  const activeMetric = METRICS.find((m) => m.key === metric)!;
  const isLoading = summaryQ.isLoading || companiesQ.isLoading || districtBoundaryQ.isLoading;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <header className="h-10 px-3 border-b border-border/40 flex items-center gap-3 bg-background/95 backdrop-blur z-50 shrink-0">
        <Link href="/"><Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2"><ArrowLeft className="h-3 w-3" />Home</Button></Link>
        <div className="h-3 w-px bg-border/50" />
        <span className="text-xs font-semibold">CSR Presence vs. School Need — Rajasthan</span>
        <div className="flex-1" />
        <ThemeToggle />
      </header>

      {summaryQ.data && (
        <div className="px-4 py-2 border-b border-border/30 bg-amber-500/5 text-[11px] text-muted-foreground leading-relaxed">
          ⚠️ From a manually-compiled CSR company list (157 companies) cross-referenced against the same school
          infra-need registry used elsewhere on this platform. District matching for the free-text "CSR in other
          districts" column is best-effort — <strong className="text-foreground">"Bhiwadi" is mapped to Alwar as a
          judgment call</strong>, not a confirmed administrative fact (it drives Alwar's large company count below).{" "}
          <strong className="text-sky-400">{summaryQ.data.meta.statewide_companies} companies</strong> describe
          statewide/blanket coverage and are counted toward every district separately from district-specific ones.
          {Object.keys(summaryQ.data.meta.unresolved_tokens).length > 0 && (
            <> {Object.keys(summaryQ.data.meta.unresolved_tokens).length} place names in the source couldn't be
            confidently resolved to a district and were dropped: {Object.keys(summaryQ.data.meta.unresolved_tokens).join(", ")}.</>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Map metric:</span>
            {METRICS.map((m) => (
              <button key={m.key} onClick={() => setMetric(m.key)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium ${metric === m.key ? "bg-emerald-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Thematic focus (CSR only):</span>
            <select value={themeFilter} onChange={(e) => setThemeFilter(e.target.value as ThemeKey | "all")}
              className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs outline-none">
              <option value="all">All themes</option>
              {THEMES.map((t) => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
            </select>
          </div>
          <div className="flex-1" />
          <Link href="/csr-rajasthan/costs">
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium bg-muted/60 text-muted-foreground hover:bg-muted">
              <Settings2 className="h-3 w-3" />
              Unit costs: 🚽{formatINR(costs.toilet)} · 🛠️{formatINR(costs.classroomRepair)} · 🏚️{formatINR(costs.dilapidatedBuilding)} · 🏗️{formatINR(costs.newClassroom)}
            </button>
          </Link>
        </div>

        <div className="h-[55vh] rounded-lg overflow-hidden border border-border/40 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading CSR & school need data…
            </div>
          ) : (
            <>
              <MapContainer center={[26.5, 73.8]} zoom={7} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>' />
                <style>{`
                  .csr-district-label { background: transparent; border: none; box-shadow: none; padding: 0;
                    font-weight: 800; font-size: 12px; color: #0f172a; text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff; }
                  .csr-district-label::before { display: none; }
                `}</style>
                {districtGeo && (
                  <GeoJSON key={`csr-${metric}-${themeFilter}-${JSON.stringify(costs)}`} data={districtGeo as any}
                    style={(feature: any) => ({
                      fillColor: metricColor(feature.properties.value, maxValue, activeMetric.invert),
                      fillOpacity: 0.75, color: "#1e293b", weight: 1, renderer: canvasRenderer,
                    })}
                    onEachFeature={(feature: any, leafletLayer: any) => {
                      const p = feature.properties;
                      const label = p.value == null ? "—" : metric === "funding" ? formatINR(p.value) : p.value.toLocaleString();
                      leafletLayer.bindTooltip(`${p.district}<br/>${label}`,
                        { permanent: true, direction: "center", className: "csr-district-label" });
                    }} />
                )}
              </MapContainer>
              <div className="absolute bottom-3 left-3 z-[800] bg-background/90 backdrop-blur border border-border/40 rounded-lg p-2.5 shadow-lg w-56">
                <p className="text-[10px] font-semibold mb-1.5">{activeMetric.icon} {activeMetric.label}</p>
                <div className="h-2.5 w-full rounded-sm mb-1" style={{ background: `linear-gradient(to right, ${(activeMetric.invert ? [...RAMP].reverse() : RAMP).map((c) => `rgb(${c.join(",")})`).join(", ")})` }} />
                <div className="flex justify-between text-[9px] text-muted-foreground mb-1.5">
                  <span>{activeMetric.invert ? "0 (best)" : "0"}</span>
                  <span>{metric === "funding" ? formatINR(maxValue) : maxValue.toLocaleString()}{activeMetric.invert ? " (worst)" : " (best)"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#374151" }} />
                  <span className="text-[9px] text-muted-foreground">No data for this district</span>
                </div>
              </div>
            </>
          )}
        </div>

        {summaryQ.data && companiesQ.data && (
          <DistrictTable data={summaryQ.data} companies={companiesQ.data} costs={costs} />
        )}
      </div>
    </div>
  );
}
