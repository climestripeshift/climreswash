import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapContainer, TileLayer, Polygon, Tooltip as MapTooltip } from "react-leaflet";
import { cellToBoundary } from "h3-js";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Search, Droplets, Trash2, Wind, Thermometer,
  AlertTriangle, CheckCircle, Edit3, Save, X, Info,
  Waves, Sprout, FlaskConical, Activity,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ManualData {
  // Groundwater
  gw_depth_m?: string;
  gw_type?: string;
  gw_notes?: string;
  // JJM / Water Supply
  jjm_tap_pct?: string;
  jjm_functional_pct?: string;
  jjm_source?: string;
  jjm_audit_date?: string;
  // Sanitation / Toilets
  toilet_twin_pit_pct?: string;
  toilet_septic_pct?: string;
  toilet_soak_pit_pct?: string;
  toilet_od_pct?: string;
  // Handwashing
  hwws_pct?: string;
  // Solid waste
  swm_coverage_pct?: string;
  swm_type?: string;
  rrc_present?: string;
  swm_frequency?: string;
  // Liquid waste
  lwm_type?: string;
  lwm_coverage_pct?: string;
  lwm_notes?: string;
  // Meta
  last_updated?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HAZARD_SEASONS: Record<string, { months: number[]; peak: string; duration: string; color: string }> = {
  flood:          { months: [6,7,8,9],    peak: "Aug–Sep",  duration: "3–4 months",  color: "#3b82f6" },
  drought:        { months: [3,4,5,6,7],  peak: "May–Jun",  duration: "4–6 months",  color: "#f97316" },
  "wet-bulb heat":{ months: [4,5,6],      peak: "May",      duration: "2–3 months",  color: "#ef4444" },
  "cold wave":    { months: [12,1,2],     peak: "Jan",      duration: "2–3 months",  color: "#06b6d4" },
  landslide:      { months: [6,7,8,9],    peak: "Jul–Aug",  duration: "3–4 months",  color: "#84cc16" },
  cyclone:        { months: [10,11,12],   peak: "Nov",      duration: "1–2 months",  color: "#a855f7" },
};

const HAZARD_ICONS: Record<string, string> = {
  flood: "🌊", drought: "☀️", "wet-bulb heat": "🌡️",
  "cold wave": "❄️", landslide: "⛰️", cyclone: "🌀",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Storage helpers ──────────────────────────────────────────────────────────

function loadManual(district: string): ManualData {
  try {
    const raw = localStorage.getItem(`wash-manual-${district}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveManual(district: string, data: ManualData) {
  localStorage.setItem(`wash-manual-${district}`, JSON.stringify({
    ...data, last_updated: new Date().toISOString(),
  }));
}

// ─── Small helpers ────────────────────────────────────────────────────────────

type CardStatus = "good" | "at-risk" | "critical" | "missing";

function statusFromPct(pct: number | null | undefined, thresholds = [80, 50]): CardStatus {
  if (pct == null) return "missing";
  if (pct >= thresholds[0]) return "good";
  if (pct >= thresholds[1]) return "at-risk";
  return "critical";
}

function StatusBadge({ status }: { status: CardStatus }) {
  const cfg: Record<CardStatus, { label: string; cls: string }> = {
    good:    { label: "Good",    cls: "bg-green-500/15 text-green-600 border-green-500/30" },
    "at-risk":{ label: "At Risk", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
    critical:{ label: "Critical", cls: "bg-red-500/15 text-red-600 border-red-500/30" },
    missing: { label: "No Data", cls: "bg-muted text-muted-foreground border-border" },
  };
  const { label, cls } = cfg[status];
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

function SourceBadge({ source }: { source: "auto" | "manual" | "derived" }) {
  const cfg = {
    auto:    "bg-blue-500/10 text-blue-600 border-blue-500/20",
    manual:  "bg-amber-500/10 text-amber-600 border-amber-500/20",
    derived: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  };
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${cfg[source]} uppercase tracking-wide`}>
      {source === "auto" ? "Auto" : source === "manual" ? "Manual" : "Derived"}
    </span>
  );
}

function MonthBar({ activeMonths, color }: { activeMonths: number[]; color: string }) {
  return (
    <div className="flex gap-0.5 mt-1">
      {MONTHS.map((m, i) => {
        const active = activeMonths.includes(i + 1);
        return (
          <div
            key={m}
            title={m}
            className="flex-1 h-5 rounded-sm flex items-center justify-center text-[8px] font-bold transition-all"
            style={active
              ? { background: color, color: "#fff" }
              : { background: "transparent", border: "1px solid #334155", color: "#64748b" }
            }
          >
            {m[0]}
          </div>
        );
      })}
    </div>
  );
}

function StatRow({ label, value, unit = "", source, note }: {
  label: string; value: string | number | null | undefined;
  unit?: string; source?: "auto" | "manual" | "derived"; note?: string;
}) {
  const hasValue = value != null && value !== "";
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-border/40 last:border-0">
      <div className="text-xs text-muted-foreground flex-1">{label}</div>
      <div className="flex items-center gap-1.5 shrink-0">
        {hasValue
          ? <span className="text-xs font-semibold text-foreground">{value}{unit}</span>
          : <span className="text-xs text-muted-foreground/50 italic">—</span>
        }
        {source && <SourceBadge source={source} />}
      </div>
    </div>
  );
}

// ─── Card shell ───────────────────────────────────────────────────────────────

function AssessCard({
  icon, title, status, children, editContent, cardKey, editingCard, setEditingCard,
}: {
  icon: React.ReactNode; title: string; status: CardStatus;
  children: React.ReactNode;
  editContent?: React.ReactNode;
  cardKey?: string;
  editingCard?: string | null;
  setEditingCard?: (k: string | null) => void;
}) {
  const isEditing = editingCard === cardKey;
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={status} />
          {editContent && setEditingCard && cardKey && (
            <button
              onClick={() => setEditingCard(isEditing ? null : cardKey)}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
              title={isEditing ? "Close" : "Enter data"}
            >
              {isEditing ? <X className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
      <div className="space-y-0">{children}</div>
      {isEditing && editContent && (
        <div className="border-t border-border pt-3 mt-1 space-y-3">{editContent}</div>
      )}
    </div>
  );
}

// ─── District Hex Map ─────────────────────────────────────────────────────────

const BLUES:   [number,number,number][] = [[240,249,255],[189,215,231],[107,174,214],[33,113,181],[8,48,107]];
const GREENS2: [number,number,number][] = [[255,255,255],[199,233,192],[116,196,118],[49,163,84],[0,109,44]];
const RISK2:   [number,number,number][] = [[34,197,94],[234,179,8],[249,115,22],[239,68,68],[153,27,27]];
const ORANGES2:[number,number,number][] = [[255,255,229],[254,217,142],[254,153,41],[217,95,14],[153,52,4]];

const MAP_LAYERS = [
  { key: "jjm_fhtc_pct",       label: "JJM FHTC %",   ramp: BLUES,    domain: [0, 100] as [number,number] },
  { key: "hex_risk",            label: "Risk Score",    ramp: RISK2,    domain: [0, 10]  as [number,number] },
  { key: "wash_sanitation_pct", label: "Sanitation %",  ramp: GREENS2,  domain: [0, 100] as [number,number] },
  { key: "flood_risk",          label: "Flood Risk",    ramp: BLUES,    domain: [0, 10]  as [number,number] },
  { key: "drought_risk",        label: "Drought Risk",  ramp: ORANGES2, domain: [0, 10]  as [number,number] },
  { key: "wash_water_pct",      label: "Water % (NFHS)",ramp: BLUES,    domain: [0, 100] as [number,number] },
];

function hexColor(ramp: [number,number,number][], domain: [number,number], val: number | undefined): string {
  if (val == null) return "rgba(100,100,100,0.25)";
  const t = Math.max(0, Math.min(1, (val - domain[0]) / (domain[1] - domain[0])));
  const n = ramp.length - 1;
  const lo = Math.floor(t * n), hi = Math.min(lo + 1, n);
  const f = t * n - lo;
  const [a, b] = [ramp[lo], ramp[hi]];
  return `rgba(${a.map((c, i) => Math.round(c + f * (b[i] - c))).join(",")},0.85)`;
}

function DistrictHexMap({ hexes }: { hexes: any[] }) {
  const [activeLayer, setActiveLayer] = useState("jjm_fhtc_pct");
  const layer = MAP_LAYERS.find(l => l.key === activeLayer)!;

  const bounds = useMemo<[[number,number],[number,number]] | null>(() => {
    if (!hexes.length) return null;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    hexes.forEach(h => {
      cellToBoundary(h.h3_id).forEach(([lat, lng]) => {
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
      });
    });
    const pad = 0.15;
    return [[minLat - pad, minLng - pad], [maxLat + pad, maxLng + pad]];
  }, [hexes]);

  if (!hexes.length || !bounds) return null;

  return (
    <div className="mb-6 bg-card border border-border rounded-xl overflow-hidden">
      {/* Layer switcher */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/40 flex-wrap">
        <span className="text-[11px] text-muted-foreground mr-1">Layer:</span>
        {MAP_LAYERS.map(l => (
          <button
            key={l.key}
            onClick={() => setActiveLayer(l.key)}
            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
              activeLayer === l.key
                ? "bg-[#00AEEF] text-white border-[#00AEEF]"
                : "border-border text-muted-foreground hover:border-[#00AEEF]/50"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* Map */}
      <div style={{ height: 280 }}>
        <MapContainer
          bounds={bounds}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {hexes.map(h => {
            const latLngs = cellToBoundary(h.h3_id).map(([lat, lng]) => [lat, lng] as [number, number]);
            const val = h[activeLayer];
            const color = hexColor(layer.ramp, layer.domain, val);
            return (
              <Polygon
                key={h.h3_id}
                positions={latLngs}
                pathOptions={{ color: "rgba(255,255,255,0.15)", weight: 0.5, fillColor: color, fillOpacity: 0.85 }}
              >
                <MapTooltip sticky>
                  <div className="text-xs">
                    <div className="font-semibold">{h.district_name}</div>
                    <div>{layer.label}: {val != null ? `${val.toFixed(1)}${activeLayer.includes("pct") ? "%" : ""}` : "—"}</div>
                    {h.jjm_fhtc_pct != null && activeLayer !== "jjm_fhtc_pct" && (
                      <div className="text-blue-300">JJM FHTC: {h.jjm_fhtc_pct.toFixed(1)}%</div>
                    )}
                  </div>
                </MapTooltip>
              </Polygon>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WashAssessPage() {
  const [search, setSearch] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [manual, setManual] = useState<ManualData>({});
  const [draft, setDraft] = useState<ManualData>({});

  // ─── Data loading ─────────────────────────────────────────────────────────

  const { data: rankings } = useQuery<any[]>({
    queryKey: ["district-rankings"],
    queryFn: () => fetch("/data/district_rankings.json").then(r => r.json()),
    staleTime: Infinity,
  });

  const { data: sbmToilets } = useQuery<Record<string, any>>({
    queryKey: ["sbm-toilet-types"],
    queryFn: () => fetch("/data/sbm_toilet_types.json").then(r => r.json()),
    staleTime: Infinity,
  });

  const { data: jjmFhtc } = useQuery<Record<string, any>>({
    queryKey: ["jjm-district-fhtc"],
    queryFn: () => fetch("/data/jjm_district_fhtc.json").then(r => r.json()),
    staleTime: Infinity,
  });

  const { data: hexProps } = useQuery<any[]>({
    queryKey: ["hex-props-wash"],
    queryFn: () => fetch("/data/india_hex_props.json").then(r => r.json()),
    staleTime: Infinity,
  });

  // ─── Derived district data ────────────────────────────────────────────────

  const rank = useMemo(() =>
    rankings?.find(d => d.district === selectedDistrict) ?? null,
  [rankings, selectedDistrict]);

  const districtHexes = useMemo(() =>
    hexProps?.filter(h => h.district_name === selectedDistrict) ?? [],
  [hexProps, selectedDistrict]);

  const hexAgg = useMemo(() => {
    if (!districtHexes.length) return null;
    const avg = (field: string) =>
      districtHexes.reduce((s, h) => s + (h[field] || 0), 0) / districtHexes.length;
    return {
      gw_stress: avg("gw_stress_score"),
      water_pct: avg("wash_water_pct"),
      sanitation_pct: avg("wash_sanitation_pct"),
      disruption_days: avg("wash_disruption_days"),
      diarrhoea_pct: avg("wash_diarrhoea_pct"),
      health_pct: avg("wash_health_pct"),
      flood_risk: avg("flood_risk"),
      drought_risk: avg("drought_risk"),
      heat_risk: avg("heat_risk"),
    };
  }, [districtHexes]);

  const season = rank ? HAZARD_SEASONS[rank.dominant_hazard] ?? null : null;

  // SBM toilet type data (Rajasthan districts only for now)
  const sbmData = useMemo(() => {
    if (!sbmToilets || !selectedDistrict) return null;
    return sbmToilets[selectedDistrict.toUpperCase()] ?? null;
  }, [sbmToilets, selectedDistrict]);

  // JJM IMIS district FHTC data (Rajasthan districts for now)
  const jjmData = useMemo(() => {
    if (!jjmFhtc || !selectedDistrict) return null;
    return jjmFhtc[selectedDistrict.toUpperCase()] ?? null;
  }, [jjmFhtc, selectedDistrict]);

  // ─── District selection ───────────────────────────────────────────────────

  const districtList = useMemo(() =>
    (rankings ?? [])
      .filter(d => d.district !== "DATA NOT AVAILABLE")
      .map(d => d.district)
      .sort(),
  [rankings]);

  const filtered = useMemo(() =>
    districtList.filter(d => d.toLowerCase().includes(search.toLowerCase())).slice(0, 30),
  [districtList, search]);

  const selectDistrict = useCallback((name: string) => {
    setSelectedDistrict(name);
    setSearch(name);
    setShowDropdown(false);
    setEditingCard(null);
    const saved = loadManual(name);
    setManual(saved);
    setDraft(saved);
  }, []);

  // ─── Manual entry helpers ─────────────────────────────────────────────────

  const updateDraft = (key: keyof ManualData, val: string) => {
    setDraft(prev => ({ ...prev, [key]: val }));
  };

  const saveCard = (card: string) => {
    const updated = { ...manual, ...draft };
    setManual(updated);
    if (selectedDistrict) saveManual(selectedDistrict, updated);
    setEditingCard(null);
  };

  // Helper to get value: manual overrides auto
  const get = (manualKey: keyof ManualData, autoVal: number | null | undefined, decimals = 1): string | null => {
    const m = manual[manualKey];
    if (m != null && m !== "") return m;
    if (autoVal != null) return autoVal.toFixed(decimals);
    return null;
  };

  const pct = (manualKey: keyof ManualData, autoVal: number | null | undefined): number | null => {
    const m = manual[manualKey];
    if (m != null && m !== "") return parseFloat(m);
    return autoVal ?? null;
  };

  // ─── Completeness score ───────────────────────────────────────────────────

  const completeness = useMemo(() => {
    if (!selectedDistrict) return 0;
    const checks = [
      rank != null,                                // hazard
      season != null,                               // seasonality
      hexAgg != null,                               // GW auto-data
      pct("jjm_tap_pct", hexAgg?.water_pct) != null,
      pct("toilet_od_pct", null) != null || (hexAgg?.sanitation_pct ?? 0) > 0,
      manual.hwws_pct != null,
      manual.swm_coverage_pct != null || manual.rrc_present != null,
      manual.lwm_type != null,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [rank, season, hexAgg, manual, selectedDistrict, pct]);

  // ─── Render ───────────────────────────────────────────────────────────────

  // JJM IMIS FHTC% takes priority over NFHS-5 hex data; manual overrides all
  const waterPct = pct("jjm_tap_pct", jjmData?.fhtc_pct ?? (hexAgg?.water_pct != null ? hexAgg.water_pct : null));
  const sanitPct = pct("toilet_od_pct", null) != null
    ? 100 - parseFloat(manual.toilet_od_pct!)
    : pct("toilet_twin_pit_pct", hexAgg?.sanitation_pct != null ? hexAgg.sanitation_pct : null);
  const hwwsPct = pct("hwws_pct", null);
  const swmPct = pct("swm_coverage_pct", null);
  const lwmPct = pct("lwm_coverage_pct", null);
  const gwStress = hexAgg?.gw_stress;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> Home
            </Button>
          </Link>
          <div className="w-px h-4 bg-border" />
          <Droplets className="w-4 h-4 text-[#00AEEF]" />
          <span className="font-semibold text-sm text-foreground">WASH Climate Assessment</span>
          <Badge variant="outline" className="text-[10px]">District-Level</Badge>

          {/* District search */}
          <div className="relative ml-auto w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search district…"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              className="pl-8 h-8 text-xs"
            />
            {showDropdown && filtered.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-52 overflow-y-auto">
                {filtered.map(d => (
                  <button
                    key={d}
                    className="w-full text-left text-xs px-3 py-2 hover:bg-accent"
                    onMouseDown={() => selectDistrict(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ThemeToggle />
        </div>
      </div>

      {!selectedDistrict ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-32 text-center px-4">
          <Droplets className="w-12 h-12 text-[#00AEEF]/40 mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Select a District to Begin</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Search for any of India's 713 districts to view its climate hazard profile and WASH infrastructure assessment.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-lg">
            {["Araria", "Jaisalmer", "Leh(Ladakh)", "Wayanad", "Balasore", "Chandrapur"].map(d => (
              <button key={d} onClick={() => { selectDistrict(d); setSearch(d); }}
                className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-[#00AEEF] hover:text-[#00AEEF] transition-colors">
                {d}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* District header */}
          <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{selectedDistrict}</h1>
              <p className="text-muted-foreground text-sm">{rank?.state ?? "—"} · {rank?.population_at_risk ? `Pop. ${(rank.population_at_risk / 1e6).toFixed(2)}M at-risk` : ""}</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {rank && (
                <>
                  <div className="text-center">
                    <div className="text-2xl font-bold" style={{ color: season?.color ?? "#888" }}>{rank.risk_score.toFixed(1)}</div>
                    <div className="text-[10px] text-muted-foreground">Risk Score</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl">{HAZARD_ICONS[rank.dominant_hazard] ?? "⚠️"}</div>
                    <div className="text-[10px] text-muted-foreground capitalize">{rank.dominant_hazard}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-500">{rank.wash_disruption_days?.toFixed(0) ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground">Disruption Days/yr</div>
                  </div>
                </>
              )}
              {/* Completeness */}
              <div className="text-center">
                <div className="text-2xl font-bold" style={{ color: completeness > 75 ? "#22c55e" : completeness > 50 ? "#f97316" : "#ef4444" }}>
                  {completeness}%
                </div>
                <div className="text-[10px] text-muted-foreground">Complete</div>
              </div>
            </div>
          </div>

          {/* Hex map */}
          <DistrictHexMap hexes={districtHexes} />

          {/* Top vulnerabilities */}
          {rank?.top_vulnerabilities?.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {rank.top_vulnerabilities.map((v: string) => (
                <span key={v} className="text-[11px] px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 border border-red-500/20">
                  ⚠ {v}
                </span>
              ))}
            </div>
          )}

          {/* 8-card grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

            {/* 1. Hazard Type */}
            <AssessCard
              icon={<AlertTriangle className="w-4 h-4" />}
              title="Climate Hazard"
              status={rank ? (rank.risk_score >= 7 ? "critical" : rank.risk_score >= 5 ? "at-risk" : "good") : "missing"}
            >
              <StatRow label="Dominant hazard" value={rank?.dominant_hazard ? `${HAZARD_ICONS[rank.dominant_hazard]} ${rank.dominant_hazard}` : null} source="auto" />
              <StatRow label="Risk score" value={rank?.risk_score?.toFixed(1)} unit="/10" source="auto" />
              <StatRow label="Flood risk" value={hexAgg?.flood_risk?.toFixed(2)} source="derived" />
              <StatRow label="Drought risk" value={hexAgg?.drought_risk?.toFixed(2)} source="derived" />
              <StatRow label="Heat risk" value={hexAgg?.heat_risk?.toFixed(2)} source="derived" />
            </AssessCard>

            {/* 2. Seasonality */}
            <AssessCard
              icon={<Activity className="w-4 h-4" />}
              title="Hazard Duration & Month"
              status={rank ? "good" : "missing"}
            >
              {season ? (
                <>
                  <div className="text-xs text-muted-foreground mb-1">Active months</div>
                  <MonthBar activeMonths={season.months} color={season.color} />
                  <div className="mt-2 space-y-0">
                    <StatRow label="Peak" value={season.peak} source="derived" />
                    <StatRow label="Duration" value={season.duration} source="derived" />
                    <StatRow label="Disruption days/yr" value={rank?.wash_disruption_days?.toFixed(0)} source="auto" />
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Select a district with hazard data to view seasonality.</p>
              )}
            </AssessCard>

            {/* 3. Groundwater */}
            <AssessCard
              icon={<Waves className="w-4 h-4" />}
              title="Groundwater Condition"
              status={gwStress == null ? "missing" : gwStress > 0.6 ? "critical" : gwStress > 0.35 ? "at-risk" : "good"}
              cardKey="gw"
              editingCard={editingCard}
              setEditingCard={setEditingCard}
              editContent={
                <div className="space-y-2.5">
                  <Field label="Depth to water table (m)" value={draft.gw_depth_m ?? ""} onChange={v => updateDraft("gw_depth_m", v)} type="number" />
                  <SelectField label="Aquifer type" value={draft.gw_type ?? ""} onChange={v => updateDraft("gw_type", v)}
                    options={["perennial","seasonal","sporadic","unknown"]} />
                  <Field label="Notes (seasonal variation, contamination)" value={draft.gw_notes ?? ""} onChange={v => updateDraft("gw_notes", v)} />
                  <SaveBtn onSave={() => saveCard("gw")} />
                </div>
              }
            >
              <StatRow label="GW stress score" value={gwStress?.toFixed(3)} unit="" source="derived" />
              <StatRow label="Stress level" value={
                gwStress == null ? null :
                gwStress > 0.6 ? "Critical" : gwStress > 0.35 ? "High" : gwStress > 0.15 ? "Moderate" : "Low"
              } />
              <StatRow label="Depth to water (m)" value={manual.gw_depth_m} source={manual.gw_depth_m ? "manual" : undefined} />
              <StatRow label="Aquifer type" value={manual.gw_type} source={manual.gw_type ? "manual" : undefined} />
              {manual.gw_notes && <p className="text-[11px] text-muted-foreground mt-1 italic">{manual.gw_notes}</p>}
            </AssessCard>

            {/* 4. Water Supply (JJM) */}
            <AssessCard
              icon={<Droplets className="w-4 h-4" />}
              title="Water Supply (JJM)"
              status={statusFromPct(waterPct)}
              cardKey="jjm"
              editingCard={editingCard}
              setEditingCard={setEditingCard}
              editContent={
                <div className="space-y-2.5">
                  <Field label="HH with tap connections (%)" value={draft.jjm_tap_pct ?? ""} onChange={v => updateDraft("jjm_tap_pct", v)} type="number" />
                  <Field label="Functional taps (last 30 days) (%)" value={draft.jjm_functional_pct ?? ""} onChange={v => updateDraft("jjm_functional_pct", v)} type="number" />
                  <SelectField label="Water source" value={draft.jjm_source ?? ""} onChange={v => updateDraft("jjm_source", v)}
                    options={["surface","groundwater","mixed"]} />
                  <Field label="Last JJM audit date" value={draft.jjm_audit_date ?? ""} onChange={v => updateDraft("jjm_audit_date", v)} type="date" />
                  <SaveBtn onSave={() => saveCard("jjm")} />
                </div>
              }
            >
              <StatRow label="FHTC coverage" value={waterPct?.toFixed(1)} unit="%" source={manual.jjm_tap_pct ? "manual" : jjmData ? "auto" : "derived"} />
              {jjmData && !manual.jjm_tap_pct ? (
                <>
                  <StatRow label="HH with tap" value={jjmData.hh_with_tap?.toLocaleString("en-IN")} source="auto" />
                  <StatRow label="Total HH" value={jjmData.total_hh?.toLocaleString("en-IN")} source="auto" />
                  <StatRow label="Functional taps" value={manual.jjm_functional_pct} unit="%" source={manual.jjm_functional_pct ? "manual" : undefined} />
                  <StatRow label="Source type" value={manual.jjm_source} source={manual.jjm_source ? "manual" : undefined} />
                  <p className="text-[10px] text-blue-500/80 mt-1">Source: JJM IMIS (ejalshakti.gov.in) · {jjmData.date}</p>
                </>
              ) : (
                <>
                  <StatRow label="Functional taps" value={manual.jjm_functional_pct} unit="%" source={manual.jjm_functional_pct ? "manual" : undefined} />
                  <StatRow label="Source type" value={manual.jjm_source} source={manual.jjm_source ? "manual" : undefined} />
                  <StatRow label="Last audit" value={manual.jjm_audit_date} source={manual.jjm_audit_date ? "manual" : undefined} />
                </>
              )}
            </AssessCard>

            {/* 5. Sanitation / Toilets */}
            <AssessCard
              icon={<FlaskConical className="w-4 h-4" />}
              title="Toilets & Sanitation"
              status={statusFromPct(sanitPct, [80, 60])}
              cardKey="sanit"
              editingCard={editingCard}
              setEditingCard={setEditingCard}
              editContent={
                <div className="space-y-2.5">
                  <Field label="Twin pit toilet (%)" value={draft.toilet_twin_pit_pct ?? ""} onChange={v => updateDraft("toilet_twin_pit_pct", v)} type="number" />
                  <Field label="Septic tank (%)" value={draft.toilet_septic_pct ?? ""} onChange={v => updateDraft("toilet_septic_pct", v)} type="number" />
                  <Field label="Soak pit / leach pit (%)" value={draft.toilet_soak_pit_pct ?? ""} onChange={v => updateDraft("toilet_soak_pit_pct", v)} type="number" />
                  <Field label="Open defecation (%)" value={draft.toilet_od_pct ?? ""} onChange={v => updateDraft("toilet_od_pct", v)} type="number" />
                  <SaveBtn onSave={() => saveCard("sanit")} />
                </div>
              }
            >
              <StatRow label="Sanitation coverage" value={hexAgg?.sanitation_pct?.toFixed(1)} unit="%" source="auto" />
              {sbmData ? (
                <>
                  <StatRow label="Twin pit" value={sbmData.toilet_twin_pit_pct?.toFixed(1)} unit="%" source="auto" />
                  <StatRow label="Single pit" value={sbmData.toilet_single_pit_pct?.toFixed(1)} unit="%" source="auto" />
                  <StatRow label="Septic w/ soak" value={sbmData.toilet_septic_with_soak_pct?.toFixed(1)} unit="%" source="auto" />
                  <StatRow label="Septic w/o soak" value={sbmData.toilet_septic_without_soak_pct?.toFixed(1)} unit="%" source="auto" />
                  <StatRow label="Others (Ecosan)" value={sbmData.toilet_others_pct?.toFixed(1)} unit="%" source="auto" />
                  <StatRow label="Total IHHL" value={sbmData.total_ihhl?.toLocaleString("en-IN")} source="auto" />
                  <p className="text-[10px] text-blue-500/80 mt-1">Source: SBM Phase 2 portal</p>
                </>
              ) : (
                <>
                  <StatRow label="Twin pit toilet" value={manual.toilet_twin_pit_pct} unit="%" source={manual.toilet_twin_pit_pct ? "manual" : undefined} />
                  <StatRow label="Septic tank" value={manual.toilet_septic_pct} unit="%" source={manual.toilet_septic_pct ? "manual" : undefined} />
                  <StatRow label="Open defecation" value={manual.toilet_od_pct} unit="%" source={manual.toilet_od_pct ? "manual" : undefined} />
                </>
              )}
            </AssessCard>

            {/* 6. Handwashing */}
            <AssessCard
              icon={<Sprout className="w-4 h-4" />}
              title="Handwashing with Soap"
              status={statusFromPct(hwwsPct, [70, 40])}
              cardKey="hwws"
              editingCard={editingCard}
              setEditingCard={setEditingCard}
              editContent={
                <div className="space-y-2.5">
                  <Field label="HH with soap & water station (%)" value={draft.hwws_pct ?? ""} onChange={v => updateDraft("hwws_pct", v)} type="number" />
                  <SaveBtn onSave={() => saveCard("hwws")} />
                </div>
              }
            >
              <StatRow label="HWWS coverage" value={hwwsPct?.toString()} unit="%" source={manual.hwws_pct ? "manual" : undefined} />
              <StatRow label="Diarrhoea prevalence" value={hexAgg?.diarrhoea_pct?.toFixed(1)} unit="%" source="auto" note="Proxy for hygiene gap" />
              <p className="text-[11px] text-muted-foreground mt-1 italic">
                HWWS data typically unavailable from NFHS-5 at district level — enter manually.
              </p>
            </AssessCard>

            {/* 7. Solid Waste Management */}
            <AssessCard
              icon={<Trash2 className="w-4 h-4" />}
              title="Solid Waste Management"
              status={
                manual.swm_coverage_pct ? statusFromPct(parseFloat(manual.swm_coverage_pct)) :
                manual.rrc_present === "yes" ? "at-risk" : "missing"
              }
              cardKey="swm"
              editingCard={editingCard}
              setEditingCard={setEditingCard}
              editContent={
                <div className="space-y-2.5">
                  <Field label="Collection coverage (%)" value={draft.swm_coverage_pct ?? ""} onChange={v => updateDraft("swm_coverage_pct", v)} type="number" />
                  <SelectField label="System type" value={draft.swm_type ?? ""} onChange={v => updateDraft("swm_type", v)}
                    options={["centralized","decentralized","none"]} />
                  <SelectField label="RRC / PWM unit present?" value={draft.rrc_present ?? ""} onChange={v => updateDraft("rrc_present", v)}
                    options={["yes","no","planned"]} />
                  <SelectField label="Collection frequency" value={draft.swm_frequency ?? ""} onChange={v => updateDraft("swm_frequency", v)}
                    options={["daily","alternate","weekly","irregular","none"]} />
                  <SaveBtn onSave={() => saveCard("swm")} />
                </div>
              }
            >
              <StatRow label="Collection coverage" value={manual.swm_coverage_pct} unit="%" source={manual.swm_coverage_pct ? "manual" : undefined} />
              <StatRow label="System type" value={manual.swm_type} source={manual.swm_type ? "manual" : undefined} />
              <StatRow label="RRC / PWM unit" value={manual.rrc_present} source={manual.rrc_present ? "manual" : undefined} />
              <StatRow label="Frequency" value={manual.swm_frequency} source={manual.swm_frequency ? "manual" : undefined} />
              {!manual.swm_coverage_pct && !manual.rrc_present && (
                <p className="text-[11px] text-muted-foreground italic mt-1">No data — click edit to enter field data.</p>
              )}
            </AssessCard>

            {/* 8. Liquid Waste Management */}
            <AssessCard
              icon={<Wind className="w-4 h-4" />}
              title="Liquid Waste Management"
              status={
                manual.lwm_type === "treatment_plant" ? "good" :
                manual.lwm_type === "soak_pit" || manual.lwm_type === "wetland" ? "at-risk" :
                manual.lwm_type === "none" ? "critical" : "missing"
              }
              cardKey="lwm"
              editingCard={editingCard}
              setEditingCard={setEditingCard}
              editContent={
                <div className="space-y-2.5">
                  <SelectField label="Treatment type" value={draft.lwm_type ?? ""} onChange={v => updateDraft("lwm_type", v)}
                    options={["none","soak_pit","drain","wetland","treatment_plant"]} />
                  <Field label="Coverage (%)" value={draft.lwm_coverage_pct ?? ""} onChange={v => updateDraft("lwm_coverage_pct", v)} type="number" />
                  <Field label="Notes" value={draft.lwm_notes ?? ""} onChange={v => updateDraft("lwm_notes", v)} />
                  <SaveBtn onSave={() => saveCard("lwm")} />
                </div>
              }
            >
              <StatRow label="Treatment type" value={manual.lwm_type?.replace("_"," ")} source={manual.lwm_type ? "manual" : undefined} />
              <StatRow label="Coverage" value={manual.lwm_coverage_pct} unit="%" source={manual.lwm_coverage_pct ? "manual" : undefined} />
              {manual.lwm_notes && <p className="text-[11px] text-muted-foreground mt-1 italic">{manual.lwm_notes}</p>}
              {!manual.lwm_type && (
                <p className="text-[11px] text-muted-foreground italic mt-1">No data — click edit to enter field data.</p>
              )}
            </AssessCard>
          </div>

          {/* Recommendations */}
          {rank?.recommendations?.length > 0 && (
            <div className="mt-6 bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4 text-[#00AEEF]" />
                <span className="text-sm font-semibold">System Recommendations</span>
                <SourceBadge source="derived" />
              </div>
              <ul className="space-y-2">
                {rank.recommendations.map((r: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                    <span className="text-[#00AEEF] shrink-0 mt-0.5">→</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Manual entry meta */}
          {manual.last_updated && (
            <div className="mt-3 text-[11px] text-muted-foreground text-right">
              Manual data last saved: {new Date(manual.last_updated).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

function Field({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground mb-1 block">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-7 text-xs"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground mb-1 block">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-7 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">— Select —</option>
        {options.map(o => (
          <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
        ))}
      </select>
    </div>
  );
}

function SaveBtn({ onSave }: { onSave: () => void }) {
  return (
    <Button size="sm" className="w-full h-7 text-xs gap-1.5 mt-1" onClick={onSave}>
      <Save className="w-3 h-3" /> Save
    </Button>
  );
}
