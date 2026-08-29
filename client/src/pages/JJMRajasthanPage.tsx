import { useState, useMemo, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

type FacilityType = "school" | "anganwadi";
// The top-level view shown on the page: the first two mirror FacilityType 1:1, "colocated" is a
// derived slice of anganwadi rows (co_located_with_school === true, optionally narrowed further
// by level bucket), "combined" is schools + anganwadi together.
type ViewMode = "school" | "anganwadi" | "colocated" | "combined";

interface JJMFacility {
  district: string;
  block: string | null;
  panchayat: string | null;
  village: string | null;
  habitation: string | null;
  habitation_lgd_id: string | null;
  name: string;
  category: string | null;
  classification: string | null;
  tap_water: boolean | null;
  toilet_running_water: boolean | null;
  hand_washing: boolean | null;
  separate_toilets_girls_boys: boolean | null;
  lat: number | null;
  lon: number | null;
  rainwater_harvesting: boolean | null;
  dried_toilets: boolean | null;
  grey_water_mgmt: boolean | null;
  approved_by_state: boolean | null;
  scheme_name: string | null;
  facility_type: FacilityType;
  co_located_with_school?: boolean; // anganwadi rows only
  co_located_level_bucket?: LevelBucket | null; // anganwadi rows only, inferred (see classifyJJMSchoolLevel)
}

// The co_located_with_school flag doesn't name which school -- so to know the LEVEL of the
// co-located school, we match the anganwadi's habitation_lgd_id (an exact govt LGD code, not a
// fuzzy name match) against JJM school records in the same habitation and read their level off
// the "classification" column. This is an inference, not a direct field:
//  - exactly one distinct level found in that habitation -> that level (PS/UPS/SR_SEC)
//  - more than one distinct level present -> "multiple" (ambiguous which one it's co-located with)
//  - no JJM school record in that habitation at all -> "none"
type LevelBucket = "PS" | "UPS" | "SR_SEC" | "multiple" | "none";
const LEVEL_BUCKET_LABEL: Record<LevelBucket, string> = {
  PS: "Primary (PS)",
  UPS: "Upper Primary (UPS)",
  SR_SEC: "Secondary/Sr. Sec. (SS)",
  multiple: "Multiple levels in habitation",
  none: "No JJM school record in habitation",
};
const LEVEL_BUCKET_ORDER: LevelBucket[] = ["PS", "UPS", "SR_SEC", "multiple", "none"];

function classifyJJMSchoolLevel(classification: string | null | undefined): "PS" | "UPS" | "SR_SEC" | null {
  if (!classification) return null;
  const c = classification.toLowerCase();
  if (c.startsWith("primary only")) return "PS";
  if (c.startsWith("upper primary")) return "UPS";
  if (c.includes("higher secondary") || c.includes("secondary/sr") || c.includes("hr. sec")) return "SR_SEC";
  return null;
}

interface JJMDistrictStats {
  total_facilities: number;
  govt_count: number; private_count: number; local_body_count: number;
  has_coordinates: number;
  tap_water_count: number; tap_water_pct: number | null;
  toilet_running_water_count: number; toilet_running_water_pct: number | null;
  hand_washing_count: number; hand_washing_pct: number | null;
  separate_toilets_girls_boys_count: number; separate_toilets_girls_boys_pct: number | null;
  rainwater_harvesting_count: number; rainwater_harvesting_pct: number | null;
  dried_toilets_count: number; dried_toilets_pct: number | null;
  grey_water_mgmt_count: number; grey_water_mgmt_pct: number | null;
  co_located_with_school_count?: number; co_located_with_school_pct?: number | null;
}
interface JJMDistrictSummary {
  meta: { source: string; note: string; districts_covered: string[]; co_located_total?: number; co_located_pct?: number | null };
  by_district: Record<string, JJMDistrictStats>;
}

const AMENITY_FIELDS = ["tap_water", "toilet_running_water", "hand_washing",
  "separate_toilets_girls_boys", "rainwater_harvesting", "dried_toilets", "grey_water_mgmt"] as const;

// Client-side equivalent of the backend's by_district aggregation, used only for the
// "Combined" view (schools + anganwadi together) since there's no precomputed file for that.
function computeDistrictSummary(facilities: JJMFacility[]): JJMDistrictSummary {
  const grouped: Record<string, JJMFacility[]> = {};
  for (const f of facilities) (grouped[f.district] ??= []).push(f);
  const by_district: Record<string, JJMDistrictStats> = {};
  for (const [d, group] of Object.entries(grouped)) {
    const n = group.length;
    const coLocated = group.filter((f) => f.co_located_with_school === true).length;
    const hasAnyCoLocated = group.some((f) => f.co_located_with_school !== undefined);
    const stats: JJMDistrictStats = {
      total_facilities: n,
      govt_count: group.filter((f) => f.category === "Government").length,
      private_count: group.filter((f) => f.category === "Private").length,
      local_body_count: group.filter((f) => f.category === "Local Body").length,
      has_coordinates: group.filter((f) => f.lat != null).length,
      tap_water_count: 0, tap_water_pct: null, toilet_running_water_count: 0, toilet_running_water_pct: null,
      hand_washing_count: 0, hand_washing_pct: null, separate_toilets_girls_boys_count: 0, separate_toilets_girls_boys_pct: null,
      rainwater_harvesting_count: 0, rainwater_harvesting_pct: null, dried_toilets_count: 0, dried_toilets_pct: null,
      grey_water_mgmt_count: 0, grey_water_mgmt_pct: null,
      ...(hasAnyCoLocated ? { co_located_with_school_count: coLocated, co_located_with_school_pct: round1(100 * coLocated / n) } : {}),
    };
    for (const field of AMENITY_FIELDS) {
      const yes = group.filter((f) => f[field] === true).length;
      (stats as any)[`${field}_count`] = yes;
      (stats as any)[`${field}_pct`] = n ? round1(100 * yes / n) : null;
    }
    by_district[d] = stats;
  }
  return { meta: { source: "combined (client-computed)", note: "", districts_covered: Object.keys(by_district) }, by_district };
}

function round1(v: number) { return Math.round(v * 10) / 10; }

interface AmenityLayer { key: string; label: string; icon: string }
const LAYERS: AmenityLayer[] = [
  { key: "tap_water", label: "Tap Water Connection", icon: "🚰" },
  { key: "toilet_running_water", label: "Running Water in Toilets", icon: "🚽" },
  { key: "hand_washing", label: "Hand Washing Facility", icon: "🧼" },
  { key: "separate_toilets_girls_boys", label: "Separate Toilets (Girls/Boys)", icon: "🚻" },
  { key: "rainwater_harvesting", label: "Rainwater Harvesting", icon: "🌧️" },
  { key: "dried_toilets", label: "Dried Toilets/Urinals", icon: "🏜️" },
  { key: "grey_water_mgmt", label: "Grey Water Management", icon: "💧" },
  { key: "co_located_with_school", label: "Co-Located with School", icon: "🏫" },
];
// co_located_with_school only makes sense for anganwadi/combined views (schools are always
// "co-located" with themselves, so the field doesn't exist on school records at all)
const SCHOOL_ONLY_LAYERS = LAYERS.filter((l) => l.key !== "co_located_with_school");
const LAYER_BY_KEY = Object.fromEntries(LAYERS.map((l) => [l.key, l]));

// green=high (good) -> red=low (bad), same semantics for every amenity here
const AMENITY_RAMP: [number, number, number][] = [[239, 68, 68], [249, 115, 22], [234, 179, 8], [132, 204, 22], [34, 197, 94]];

function gradientColor(ramp: [number, number, number][], t: number) {
  t = Math.max(0, Math.min(1, t));
  const s = t * (ramp.length - 1);
  const lo = Math.floor(s), hi = Math.min(lo + 1, ramp.length - 1);
  const f = s - lo;
  const a = ramp[lo], b = ramp[hi];
  return `rgb(${a.map((c, i) => Math.round(c + f * (b[i] - c))).join(",")})`;
}
function amenityColor(pct: number | null) {
  if (pct == null) return "#374151";
  return gradientColor(AMENITY_RAMP, pct / 100);
}

type DisplayMode = "number" | "percentage" | "both";
const DISPLAY_MODE_OPTIONS: { key: DisplayMode; label: string }[] = [
  { key: "percentage", label: "%" },
  { key: "number", label: "#" },
  { key: "both", label: "% + #" },
];
function formatStat(pct: number | null, count: number | null, total: number | null, mode: DisplayMode): string {
  if (pct == null || count == null) return "—";
  const pctStr = `${pct}%`;
  const countStr = total != null ? `${count.toLocaleString()}/${total.toLocaleString()}` : count.toLocaleString();
  if (mode === "percentage") return pctStr;
  if (mode === "number") return countStr;
  return `${pctStr} (${countStr})`;
}
// In "number" mode the shading should reflect which districts have the highest/lowest raw count
// (e.g. most co-located anganwadis in absolute terms), not percentage -- otherwise a
// small-but-100%-co-located district would outshine a huge district with more actual facilities.
function statColor(pct: number | null, count: number | null, mode: DisplayMode, maxCount: number) {
  if (mode !== "number") return amenityColor(pct);
  if (count == null || maxCount <= 0) return "#374151";
  return gradientColor(AMENITY_RAMP, count / maxCount);
}

const canvasRenderer = L.canvas({ padding: 0.5 });

const PAGE_SIZE = 50;
const CATEGORY_OPTIONS = ["Government", "Private", "Local Body"];

function FacilityTable({ facilities, districts, viewMode }: { facilities: JJMFacility[]; districts: string[]; viewMode: ViewMode }) {
  const [search, setSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [tapWaterFilter, setTapWaterFilter] = useState("All");
  const [coLocatedFilter, setCoLocatedFilter] = useState("All");
  const [page, setPage] = useState(0);
  // On the dedicated Co-Located tab every row is already co_located_with_school === true, so the
  // column/filter would just show "Yes" for everything -- only useful on Anganwadi/Combined.
  const showCoLocated = viewMode === "anganwadi" || viewMode === "combined";
  const showTypeColumn = viewMode === "combined";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return facilities.filter((f) => {
      if (districtFilter !== "All" && f.district !== districtFilter) return false;
      if (categoryFilter !== "All" && f.category !== categoryFilter) return false;
      if (tapWaterFilter === "yes" && f.tap_water !== true) return false;
      if (tapWaterFilter === "no" && f.tap_water !== false) return false;
      if (tapWaterFilter === "unknown" && f.tap_water != null) return false;
      if (coLocatedFilter === "yes" && f.co_located_with_school !== true) return false;
      if (coLocatedFilter === "no" && f.co_located_with_school !== false) return false;
      if (q && !f.name?.toLowerCase().includes(q) && !f.village?.toLowerCase().includes(q) && !f.habitation?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [facilities, search, districtFilter, categoryFilter, tapWaterFilter, coLocatedFilter]);

  useEffect(() => { setPage(0); }, [viewMode]);

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const yn = (v: boolean | null) => v === true ? <span className="text-emerald-400">Yes</span> : v === false ? <span className="text-red-400">No</span> : <span className="text-muted-foreground">—</span>;

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-border/30 flex flex-wrap gap-2 items-center bg-muted/20">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search facility, village, or habitation..."
            className="w-full pl-7 pr-2 py-1.5 rounded-md border border-border/50 bg-background text-xs outline-none"
          />
        </div>
        <select value={districtFilter} onChange={(e) => { setDistrictFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs outline-none">
          <option value="All">All Districts</option>
          {districts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs outline-none">
          <option value="All">All Categories</option>
          {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={tapWaterFilter} onChange={(e) => { setTapWaterFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs outline-none">
          <option value="All">All Tap Water Status</option>
          <option value="yes">🚰 Has Tap Water</option>
          <option value="no">No Tap Water</option>
          <option value="unknown">Unknown</option>
        </select>
        {showCoLocated && (
          <select value={coLocatedFilter} onChange={(e) => { setCoLocatedFilter(e.target.value); setPage(0); }}
            className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs outline-none">
            <option value="All">All Co-Location Status</option>
            <option value="yes">🏫 Co-Located with School</option>
            <option value="no">Not Co-Located</option>
          </select>
        )}
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{filtered.length.toLocaleString()} facilities</span>
      </div>

      <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background border-b border-border/30">
            <tr className="text-left text-muted-foreground">
              {showTypeColumn && <th className="px-3 py-2 font-medium">Type</th>}
              <th className="px-3 py-2 font-medium">Facility</th>
              <th className="px-3 py-2 font-medium">District</th>
              <th className="px-3 py-2 font-medium">Block / Village</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Classification</th>
              <th className="px-3 py-2 font-medium text-right">🚰 Tap Water</th>
              <th className="px-3 py-2 font-medium text-right">🚽 Toilet Water</th>
              <th className="px-3 py-2 font-medium text-right">🧼 Hand Wash</th>
              {showCoLocated && <th className="px-3 py-2 font-medium text-right">🏫 Co-Located</th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((f, i) => (
              <tr key={i} className="border-b border-border/10 hover:bg-muted/20">
                {showTypeColumn && (
                  <td className="px-3 py-1.5">
                    {f.facility_type === "school" ? <span className="text-sky-400">🏫 School</span> : <span className="text-purple-400">👶 Anganwadi</span>}
                  </td>
                )}
                <td className="px-3 py-1.5">{f.name}</td>
                <td className="px-3 py-1.5">{f.district}</td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {f.block}{f.village && ` · ${f.village}`}
                  {f.lat != null && <span className="ml-1 text-emerald-400" title="Geo-tagged">📍</span>}
                </td>
                <td className="px-3 py-1.5">{f.category ?? "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{f.classification ?? "—"}</td>
                <td className="px-3 py-1.5 text-right">{yn(f.tap_water)}</td>
                <td className="px-3 py-1.5 text-right">{yn(f.toilet_running_water)}</td>
                <td className="px-3 py-1.5 text-right">{yn(f.hand_washing)}</td>
                {showCoLocated && (
                  <td className="px-3 py-1.5 text-right">
                    {f.facility_type === "school" ? <span className="text-muted-foreground">—</span> : yn(f.co_located_with_school ?? null)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-2 border-t border-border/30 flex items-center justify-between bg-muted/20">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}
          className="px-2 py-1 rounded text-[10px] disabled:opacity-30 hover:bg-muted/40">← Prev</button>
        <span className="text-[10px] text-muted-foreground">Page {page + 1} of {totalPages}</span>
        <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}
          className="px-2 py-1 rounded text-[10px] disabled:opacity-30 hover:bg-muted/40">Next →</button>
      </div>
    </div>
  );
}

function DistrictAmenityTable({ data, layer, displayMode }: { data: JJMDistrictSummary; layer: AmenityLayer; displayMode: DisplayMode }) {
  const [sortBy, setSortBy] = useState<"pct" | "total">("pct");
  const rows = useMemo(() => {
    return Object.entries(data.by_district).map(([district, v]) => ({
      district, total: v.total_facilities,
      pct: (v as any)[`${layer.key}_pct`] as number | null,
      count: (v as any)[`${layer.key}_count`] as number,
      hasCoords: v.has_coordinates,
    }));
  }, [data, layer]);
  const sorted = useMemo(() => [...rows].sort((a, b) => sortBy === "pct" ? (b.pct ?? 0) - (a.pct ?? 0) : b.total - a.total), [rows, sortBy]);
  const maxCount = useMemo(() => Math.max(0, ...rows.map((r) => r.count ?? 0)), [rows]);

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-border/30 bg-muted/20">
        <div className="text-xs font-semibold">{layer.icon} {layer.label} by District</div>
        <div className="text-[10px] text-muted-foreground mt-1">Click a column header to sort. From the JJM F26 report — no UDISE link, so this is independent of SHVR ratings.</div>
      </div>
      <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background border-b border-border/30">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">District</th>
              <th className="px-3 py-2 font-medium text-right cursor-pointer hover:text-foreground" onClick={() => setSortBy("total")}>
                Total Facilities{sortBy === "total" && " ▾"}
              </th>
              <th className="px-3 py-2 font-medium text-right cursor-pointer hover:text-foreground" onClick={() => setSortBy("pct")}>
                {layer.label}{sortBy === "pct" && " ▾"}
              </th>
              <th className="px-3 py-2 font-medium text-right">Geo-Tagged</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.district} className="border-b border-border/10 hover:bg-muted/20">
                <td className="px-3 py-1.5 font-medium">{r.district}</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{r.total.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right font-semibold" style={{ color: statColor(r.pct, r.count, displayMode, maxCount) }}>
                  {formatStat(r.pct, r.count, r.total, displayMode)}
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{r.hasCoords.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function JJMRajasthanPage() {
  const [attr, setAttr] = useState("tap_water");
  const [viewMode, setViewMode] = useState<ViewMode>("school");
  const [levelBucketFilter, setLevelBucketFilter] = useState<LevelBucket | "All">("All");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("both");
  const layer = LAYER_BY_KEY[attr];

  const schoolsQ = useQuery<JJMFacility[]>({
    queryKey: ["jjm-schools"],
    queryFn: () => fetch("/data/jjm_schools_rajasthan.json").then((r) => r.json())
      .then((rows) => rows.map((r: any) => ({ ...r, facility_type: "school" as const }))),
    staleTime: Infinity,
  });
  const anganwadiQ = useQuery<JJMFacility[]>({
    queryKey: ["jjm-anganwadi"],
    queryFn: () => fetch("/data/jjm_anganwadi_rajasthan.json").then((r) => r.json())
      .then((rows) => rows.map((r: any) => ({ ...r, facility_type: "anganwadi" as const }))),
    staleTime: Infinity,
  });
  const schoolDistrictSummaryQ = useQuery<JJMDistrictSummary>({
    queryKey: ["jjm-school-district-summary"],
    queryFn: () => fetch("/data/jjm_district_summary_rajasthan.json").then((r) => r.json()),
    staleTime: Infinity,
  });
  const anganwadiDistrictSummaryQ = useQuery<JJMDistrictSummary>({
    queryKey: ["jjm-anganwadi-district-summary"],
    queryFn: () => fetch("/data/jjm_anganwadi_district_summary_rajasthan.json").then((r) => r.json()),
    staleTime: Infinity,
  });
  const districtBoundaryQ = useQuery<any>({
    queryKey: ["rajasthan-districts-current"],
    queryFn: () => fetch("/data/rajasthan_districts_current.geojson").then((r) => r.json()),
    staleTime: Infinity,
  });

  // habitation_lgd_id -> distinct school levels present, from the JJM schools export -- used to
  // infer the level of the school each co-located anganwadi is likely attached to (see
  // classifyJJMSchoolLevel above for why this can't be a direct field).
  const habitationLevelsMap = useMemo(() => {
    const m = new Map<string, Set<"PS" | "UPS" | "SR_SEC">>();
    for (const s of schoolsQ.data ?? []) {
      if (!s.habitation_lgd_id) continue;
      const level = classifyJJMSchoolLevel(s.classification);
      if (!level) continue;
      if (!m.has(s.habitation_lgd_id)) m.set(s.habitation_lgd_id, new Set());
      m.get(s.habitation_lgd_id)!.add(level);
    }
    return m;
  }, [schoolsQ.data]);

  const coLocatedLevelBucket = useCallback((a: JJMFacility): LevelBucket | null => {
    if (!a.co_located_with_school) return null;
    const levels = a.habitation_lgd_id ? habitationLevelsMap.get(a.habitation_lgd_id) : undefined;
    if (!levels || levels.size === 0) return "none";
    if (levels.size > 1) return "multiple";
    return Array.from(levels)[0];
  }, [habitationLevelsMap]);

  const anganwadiWithLevel = useMemo(() => {
    if (!anganwadiQ.data) return undefined;
    return anganwadiQ.data.map((a) => ({ ...a, co_located_level_bucket: coLocatedLevelBucket(a) }));
  }, [anganwadiQ.data, coLocatedLevelBucket]);

  const levelBucketCounts = useMemo(() => {
    const counts: Record<LevelBucket, number> = { PS: 0, UPS: 0, SR_SEC: 0, multiple: 0, none: 0 };
    for (const a of anganwadiWithLevel ?? []) {
      if (a.co_located_level_bucket) counts[a.co_located_level_bucket]++;
    }
    return counts;
  }, [anganwadiWithLevel]);

  // Co-Located tab = anganwadi rows with co_located_with_school === true, optionally narrowed
  // further to a specific inferred level bucket (PS/UPS/SS/multiple/none).
  const coLocatedFacilities = useMemo(() => {
    if (!anganwadiWithLevel) return undefined;
    return anganwadiWithLevel.filter((a) =>
      a.co_located_with_school === true && (levelBucketFilter === "All" || a.co_located_level_bucket === levelBucketFilter));
  }, [anganwadiWithLevel, levelBucketFilter]);

  const facilitiesQ = useMemo(() => {
    if (viewMode === "school") return schoolsQ;
    if (viewMode === "anganwadi") return { data: anganwadiWithLevel, isLoading: anganwadiQ.isLoading };
    if (viewMode === "colocated") return { data: coLocatedFacilities, isLoading: anganwadiQ.isLoading };
    return { data: [...(schoolsQ.data ?? []), ...(anganwadiWithLevel ?? [])], isLoading: schoolsQ.isLoading || anganwadiQ.isLoading };
  }, [viewMode, schoolsQ, anganwadiQ.isLoading, anganwadiWithLevel, coLocatedFacilities]);

  const districtSummary = useMemo<JJMDistrictSummary | undefined>(() => {
    if (viewMode === "school") return schoolDistrictSummaryQ.data;
    if (viewMode === "anganwadi") return anganwadiDistrictSummaryQ.data;
    if (viewMode === "colocated") return coLocatedFacilities ? computeDistrictSummary(coLocatedFacilities) : undefined;
    if (!schoolsQ.data || !anganwadiWithLevel) return undefined;
    return computeDistrictSummary([...schoolsQ.data, ...anganwadiWithLevel]);
  }, [viewMode, schoolDistrictSummaryQ.data, anganwadiDistrictSummaryQ.data, schoolsQ.data, anganwadiWithLevel, coLocatedFacilities]);

  const districts = useMemo(() => Object.keys(districtSummary?.by_district ?? {}).sort(), [districtSummary]);

  const geoTaggedFacilities = useMemo(() =>
    facilitiesQ.data?.filter((f) => f.lat != null && f.lon != null) ?? [],
  [facilitiesQ.data]);

  const coLocationStats = useMemo(() => {
    if (viewMode === "school" || !anganwadiDistrictSummaryQ.data) return null;
    return anganwadiDistrictSummaryQ.data.meta;
  }, [viewMode, anganwadiDistrictSummaryQ.data]);

  const districtGeo = useMemo(() => {
    if (!districtBoundaryQ.data || !districtSummary) return null;
    return {
      type: "FeatureCollection",
      features: districtBoundaryQ.data.features.map((f: any) => {
        const district = f.properties.NAME;
        const stats = districtSummary.by_district[district];
        const pct = stats ? (stats as any)[`${attr}_pct`] as number | null : null;
        const count = stats ? (stats as any)[`${attr}_count`] as number : null;
        return { ...f, properties: { ...f.properties, district, pct, count, total: stats?.total_facilities ?? null } };
      }),
    };
  }, [districtBoundaryQ.data, districtSummary, attr]);

  const maxDistrictCount = useMemo(() => {
    if (!districtSummary) return 0;
    let max = 0;
    for (const stats of Object.values(districtSummary.by_district)) {
      const c = (stats as any)[`${attr}_count`] as number | undefined;
      if (c != null && c > max) max = c;
    }
    return max;
  }, [districtSummary, attr]);

  const isLoading = facilitiesQ.isLoading || districtBoundaryQ.isLoading;

  const pointToLayer = useCallback((feature: any, latlng: L.LatLng) =>
    L.circleMarker(latlng, {
      radius: 3, weight: 0.6, color: "#ffffff",
      fillColor: feature.properties.value === true ? "#16a34a" : feature.properties.value === false ? "#dc2626" : "#6b7280",
      fillOpacity: 0.9, renderer: canvasRenderer,
    }), []);

  const geoPointsData = useMemo(() => ({
    type: "FeatureCollection",
    features: geoTaggedFacilities.map((f) => ({
      type: "Feature",
      properties: { name: f.name, district: f.district, village: f.village, value: (f as any)[attr] },
      geometry: { type: "Point", coordinates: [f.lon, f.lat] },
    })),
  }), [geoTaggedFacilities, attr]);

  const onEachPoint = useCallback((feature: any, leafletLayer: any) => {
    const p = feature.properties;
    const label = p.value === true ? "Yes" : p.value === false ? "No" : "Unknown";
    leafletLayer.bindTooltip(`<b>${p.name}</b><br/>📍 ${p.village}, ${p.district}<br/>${layer.label}: ${label}`, { sticky: true });
  }, [layer]);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <header className="h-10 px-3 border-b border-border/40 flex items-center gap-3 bg-background/95 backdrop-blur z-50 shrink-0">
        <Link href="/"><Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2"><ArrowLeft className="h-3 w-3" />Home</Button></Link>
        <div className="h-3 w-px bg-border/50" />
        <span className="text-xs font-semibold">JJM Schools & Anganwadi — Rajasthan</span>
        <div className="flex-1" />
        <ThemeToggle />
      </header>

      {districtSummary && (
        <div className="px-4 py-2 border-b border-border/30 bg-amber-500/5 text-[11px] text-muted-foreground leading-relaxed">
          ⚠️ From the JJM F26 report ("Status of Pipe Water Supply in School/Balwadi/Anganwadi"), manually exported
          per-district from the login-gated JJM MIS portal — <strong className="text-foreground">{facilitiesQ.data?.length.toLocaleString() ?? "…"} facilities</strong> across{" "}
          <strong className="text-emerald-400">{districts.length} of Rajasthan's 41 current districts</strong>. This export has{" "}
          <strong className="text-foreground">no UDISE/AWC code</strong>, so it is NOT linked to the SHVR ratings or CSR infrastructure
          data elsewhere on this platform — a standalone dataset identified only by Block/Panchayat/Village/Habitation.
          Only a small share of rows are geo-tagged (real lat/lon) — most facilities are only known at district level here.
          {coLocationStats?.co_located_total != null && (
            <> <strong className="text-purple-400">{coLocationStats.co_located_total.toLocaleString()}</strong> anganwadi centers
            ({coLocationStats.co_located_pct}%) are co-located with a school — read directly from the source data's Scheme Name
            column ("Owned and managed by School only"), not inferred from geography.</>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">View:</span>
            <button onClick={() => { setViewMode("school"); if (attr === "co_located_with_school") setAttr("tap_water"); }}
              className={`px-2.5 py-1 rounded text-[11px] font-medium ${viewMode === "school" ? "bg-emerald-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
              🏫 Schools
            </button>
            <button onClick={() => setViewMode("anganwadi")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium ${viewMode === "anganwadi" ? "bg-emerald-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
              👶 Anganwadi
            </button>
            <button onClick={() => { setViewMode("colocated"); if (attr === "co_located_with_school") setAttr("tap_water"); }}
              className={`px-2.5 py-1 rounded text-[11px] font-medium ${viewMode === "colocated" ? "bg-purple-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
              🔗 Co-Located
            </button>
            <button onClick={() => setViewMode("combined")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium ${viewMode === "combined" ? "bg-emerald-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
              📚 Combined
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Amenity:</span>
            <select value={attr} onChange={(e) => setAttr(e.target.value)}
              className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs outline-none">
              {(viewMode === "school" || viewMode === "colocated" ? SCHOOL_ONLY_LAYERS : LAYERS).map((l) => <option key={l.key} value={l.key}>{l.icon} {l.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Show:</span>
            <div className="flex rounded-md border border-border/50 overflow-hidden">
              {DISPLAY_MODE_OPTIONS.map((o) => (
                <button key={o.key} onClick={() => setDisplayMode(o.key)}
                  className={`px-2.5 py-1.5 text-xs font-medium ${displayMode === o.key ? "bg-emerald-600 text-white" : "bg-background text-muted-foreground hover:bg-muted/40"}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {viewMode === "colocated" && (
          <div className="flex flex-wrap items-center gap-2 -mt-2">
            <span className="text-xs text-muted-foreground">Co-located school level (inferred from same-habitation JJM school records):</span>
            <button onClick={() => setLevelBucketFilter("All")}
              className={`px-2 py-1 rounded text-[11px] font-medium ${levelBucketFilter === "All" ? "bg-purple-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
              All ({levelBucketCounts.PS + levelBucketCounts.UPS + levelBucketCounts.SR_SEC + levelBucketCounts.multiple + levelBucketCounts.none})
            </button>
            {LEVEL_BUCKET_ORDER.map((b) => (
              <button key={b} onClick={() => setLevelBucketFilter(b)}
                className={`px-2 py-1 rounded text-[11px] font-medium ${levelBucketFilter === b ? "bg-purple-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
                {LEVEL_BUCKET_LABEL[b]} ({levelBucketCounts[b].toLocaleString()})
              </button>
            ))}
          </div>
        )}

        <div className="h-[60vh] rounded-lg overflow-hidden border border-border/40 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading JJM facility data…
            </div>
          ) : (
            <>
              <MapContainer center={[26.5, 73.8]} zoom={7} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                  attribution='&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, FAO, NOAA, USGS, &copy; OpenStreetMap contributors' />
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}" />
                <style>{`
                  .jjm-district-label { background: transparent; border: none; box-shadow: none; padding: 0;
                    font-weight: 800; font-size: 12px; color: #0f172a; text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff; }
                  .jjm-district-label::before { display: none; }
                `}</style>
                {districtGeo && (
                  <GeoJSON key={`districts-${attr}-${viewMode}-${levelBucketFilter}-${displayMode}`} data={districtGeo as any}
                    style={(feature: any) => ({
                      fillColor: statColor(feature.properties.pct, feature.properties.count, displayMode, maxDistrictCount),
                      fillOpacity: 0.7, color: "#1e293b", weight: 1, renderer: canvasRenderer,
                    })}
                    onEachFeature={(feature: any, leafletLayer: any) => {
                      const p = feature.properties;
                      const label = formatStat(p.pct, p.count, p.total, displayMode);
                      leafletLayer.bindTooltip(`${p.district}<br/>${label}`, { permanent: true, direction: "center", className: "jjm-district-label" });
                    }} />
                )}
                <GeoJSON key={`points-${attr}-${viewMode}-${levelBucketFilter}`} data={geoPointsData as any} pointToLayer={pointToLayer} onEachFeature={onEachPoint} />
              </MapContainer>
              <div className="absolute bottom-3 left-3 z-[800] bg-background/90 backdrop-blur border border-border/40 rounded-lg p-2.5 shadow-lg w-52">
                <p className="text-[10px] font-semibold mb-1.5">{layer.icon} {layer.label}</p>
                <div className="h-2.5 w-full rounded-sm mb-1" style={{ background: `linear-gradient(to right, ${AMENITY_RAMP.map((c) => `rgb(${c.join(",")})`).join(", ")})` }} />
                <div className="flex justify-between text-[9px] text-muted-foreground mb-1.5">
                  {displayMode === "number" ? (
                    <><span>0</span><span>{maxDistrictCount.toLocaleString()}</span></>
                  ) : (
                    <><span>0%</span><span>100%</span></>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#374151" }} />
                  <span className="text-[9px] text-muted-foreground">No data for this district</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full border border-white" style={{ background: "#16a34a" }} />
                  <span className="text-[9px] text-muted-foreground">🏫 geo-tagged facility (green=yes, red=no)</span>
                </div>
              </div>
            </>
          )}
        </div>

        {districtSummary && <DistrictAmenityTable data={districtSummary} layer={layer} displayMode={displayMode} />}

        {facilitiesQ.isLoading ? (
          <div className="text-xs text-muted-foreground py-4 text-center">Loading facility list…</div>
        ) : facilitiesQ.data ? (
          <FacilityTable facilities={facilitiesQ.data} districts={districts} viewMode={viewMode} />
        ) : null}
      </div>
    </div>
  );
}
