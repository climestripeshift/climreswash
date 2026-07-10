import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import L from "leaflet";
import { cellToBoundary, cellToLatLng } from "h3-js";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Search, Droplets, Trash2, Wind, Thermometer,
  AlertTriangle, CheckCircle, Edit3, Save, X, Info,
  Waves, Sprout, FlaskConical, Activity, Printer, Heart, Zap, BookOpen,
  Target, TrendingUp, ListChecks, Baby, Flame,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RiverDay { date: string; discharge: number; p25: number|null; p75: number|null; severity: string; }
interface RiverPoint { lat: number; lon: number; river: string; location: string; current_discharge: number; current_severity: string; max_severity_7d: string; days: RiverDay[]; }
interface RiverForecast { generated: string; points: RiverPoint[]; summary: Record<string,number>; }

const RIVER_SEV_COLOR: Record<string,string> = {
  extreme:"#7f1d1d", danger:"#dc2626", warning:"#f97316", elevated:"#eab308", normal:"#22c55e", unknown:"#6b7280",
};
const RIVER_SEV_LABEL: Record<string,string> = {
  extreme:"EXTREME", danger:"DANGER", warning:"WARNING", elevated:"ELEVATED", normal:"Normal", unknown:"Unknown",
};

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

// ─── Comparison row: district vs state vs national ────────────────────────────

function CmpRow({ label, value, stateVal, natVal, unit = "%", higherIsBetter = true }: {
  label: string; value: number | null | undefined;
  stateVal?: number | null; natVal?: number | null;
  unit?: string; higherIsBetter?: boolean;
}) {
  if (value == null) return null;
  const vs = stateVal ?? null;
  const vn = natVal ?? null;
  const isGoodVsState = vs != null ? (higherIsBetter ? value >= vs : value <= vs) : null;
  const isGoodVsNat   = vn != null ? (higherIsBetter ? value >= vn : value <= vn) : null;
  return (
    <div className="flex items-center justify-between gap-1 py-1 border-b border-border/30 last:border-0 text-[10px]">
      <span className="text-muted-foreground flex-1">{label}</span>
      <span className="font-semibold font-mono">{value.toFixed(1)}{unit}</span>
      {vs != null && (
        <span className={`font-mono ${isGoodVsState ? "text-green-500" : "text-red-400"}`}>
          {isGoodVsState ? "▲" : "▼"} {Math.abs(value - vs).toFixed(1)}{unit} vs state
        </span>
      )}
      {vn != null && (
        <span className={`font-mono ${isGoodVsNat ? "text-green-500" : "text-red-400"}`}>
          (nat: {vn.toFixed(0)}{unit})
        </span>
      )}
    </div>
  );
}

// ─── Gap chip ─────────────────────────────────────────────────────────────────

const GAP_META_WA: Record<string, { icon: string; label: string; color: string }> = {
  "flood-toilet":   { icon: "🚽", label: "Flood-unsafe toilets",  color: "bg-red-500/15 text-red-500 border-red-500/30" },
  "water-gap":      { icon: "💧", label: "Water access gap",       color: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  "MHM":            { icon: "🩸", label: "Menstrual hygiene gap",  color: "bg-pink-500/15 text-pink-500 border-pink-500/30" },
  "clean-fuel":     { icon: "🔥", label: "Clean fuel gap",         color: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  "child-marriage": { icon: "💍", label: "Child marriage high",    color: "bg-purple-500/15 text-purple-500 border-purple-500/30" },
  "antenatal":      { icon: "🏥", label: "Antenatal care low",     color: "bg-teal-500/15 text-teal-500 border-teal-500/30" },
  "ORS":            { icon: "💊", label: "ORS coverage low",       color: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30" },
};

// ─── Toilet type bar chart ────────────────────────────────────────────────────

const TOILET_TYPE_DEFS = [
  { label: "Twin pit",    key: "twin_pit_pct",    color: "#22c55e" },
  { label: "Single pit",  key: "single_pit_pct",  color: "#f97316" },
  { label: "Septic+Soak", key: "septic_soak_pct", color: "#3b82f6" },
  { label: "Septic",      key: "septic_nosoak_pct", color: "#a855f7" },
  { label: "Others",      key: "others_pct",      color: "#94a3b8" },
] as const;

function ToiletTypeBar({ sbmData }: { sbmData: Record<string, any> }) {
  return (
    <div className="space-y-1.5 mt-2 mb-1">
      {TOILET_TYPE_DEFS.map(({ label, key, color }) => {
        const val: number | null = sbmData[key] ?? null;
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-[70px] shrink-0">{label}</span>
            <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
              {val != null && (
                <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(val, 0), 100)}%`, background: color }} />
              )}
            </div>
            <span className="text-[10px] font-mono font-semibold w-9 text-right shrink-0">
              {val != null ? `${val.toFixed(1)}%` : "—"}
            </span>
          </div>
        );
      })}
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

// ─── Hex Map (full-country with boundary filters) ────────────────────────────

const BLUES:   [number,number,number][] = [[240,249,255],[189,215,231],[107,174,214],[33,113,181],[8,48,107]];
const GREENS2: [number,number,number][] = [[255,255,255],[199,233,192],[116,196,118],[49,163,84],[0,109,44]];
const RISK2:   [number,number,number][] = [[34,197,94],[234,179,8],[249,115,22],[239,68,68],[153,27,27]];
const ORANGES2:[number,number,number][] = [[255,255,229],[254,217,142],[254,153,41],[217,95,14],[153,52,4]];

const MAP_LAYERS = [
  { key: "jjm_fhtc_pct",       label: "🚰 JJM FHTC",   ramp: BLUES,    domain: [0, 100] as [number,number] },
  { key: "hex_risk",            label: "⚠️ Risk",        ramp: RISK2,    domain: [0, 10]  as [number,number] },
  { key: "wash_sanitation_pct", label: "🚽 Sanitation",  ramp: GREENS2,  domain: [0, 100] as [number,number] },
  { key: "flood_risk",          label: "🌊 Flood",       ramp: BLUES,    domain: [0, 10]  as [number,number] },
  { key: "drought_risk",        label: "☀️ Drought",     ramp: ORANGES2, domain: [0, 10]  as [number,number] },
  { key: "wash_water_pct",      label: "💧 Water (NFHS)",ramp: BLUES,    domain: [0, 100] as [number,number] },
];

const canvasRenderer = L.canvas({ padding: 0.5 });

function SetupCanvas() {
  const map = useMap();
  useEffect(() => { (map as any).options.renderer = canvasRenderer; }, [map]);
  return null;
}

function fitMapToBounds(map: LeafletMap, hexes: any[]) {
  if (!hexes.length) return;
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  hexes.forEach(h => {
    cellToBoundary(h.h3_id).forEach(([lat, lng]) => {
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
    });
  });
  const pad = 0.4;
  map.fitBounds([[minLat - pad, minLng - pad], [maxLat + pad, maxLng + pad]]);
}

function hexFillColor(ramp: [number,number,number][], domain: [number,number], val: number | undefined | null): string {
  if (val == null) return "rgba(80,80,80,0.3)";
  const t = Math.max(0, Math.min(1, (val - domain[0]) / (domain[1] - domain[0])));
  const n = ramp.length - 1;
  const lo = Math.floor(t * n), hi = Math.min(lo + 1, n);
  const f = t * n - lo;
  const [a, b] = [ramp[lo], ramp[hi]];
  return `rgba(${a.map((c, i) => Math.round(c + f * (b[i] - c))).join(",")},0.85)`;
}

function WashHexMap({ hexProps, selectedDistrict, onSelectDistrict }: {
  hexProps: any[];
  selectedDistrict: string | null;
  onSelectDistrict: (district: string) => void;
}) {
  const [activeLayer, setActiveLayer] = useState("jjm_fhtc_pct");
  const [showDistricts, setShowDistricts] = useState(true);
  const mapRef = useRef<LeafletMap | null>(null);
  const geoJsonRef = useRef<any>(null);
  const layer = MAP_LAYERS.find(l => l.key === activeLayer)!;

  // Build GeoJSON from all hex props
  const geoData = useMemo(() => {
    if (!hexProps.length) return null;
    const features = hexProps.map(p => {
      const boundary = cellToBoundary(p.h3_id);
      const coords = boundary.map(([lat, lng]: [number,number]) => [lng, lat]);
      coords.push(coords[0]);
      return { type: "Feature", properties: p, geometry: { type: "Polygon", coordinates: [coords] } };
    });
    return { type: "FeatureCollection" as const, features };
  }, [hexProps]);

  // Fit to selected district when it changes
  useEffect(() => {
    if (!mapRef.current) return;
    if (selectedDistrict) {
      const distHexes = hexProps.filter(h => h.district_name === selectedDistrict);
      if (distHexes.length) fitMapToBounds(mapRef.current, distHexes);
    } else {
      mapRef.current.setView([22.5, 80], 5);
    }
  }, [selectedDistrict, hexProps]);

  const styleFeature = useCallback((feature: any) => {
    const p = feature.properties;
    const isSelected = selectedDistrict && p.district_name === selectedDistrict;
    return {
      fillColor: hexFillColor(layer.ramp, layer.domain, p[activeLayer]),
      fillOpacity: isSelected ? 1 : 0.78,
      color: isSelected ? "#ffffff" : "#1e293b",
      weight: isSelected ? 1.5 : 0.25,
      renderer: canvasRenderer,
    };
  }, [activeLayer, layer, selectedDistrict]);

  useEffect(() => { geoJsonRef.current?.setStyle(styleFeature); }, [styleFeature]);

  const onEachFeature = useCallback((feature: any, lyr: any) => {
    const p = feature.properties;
    const val = p[activeLayer];
    const suffix = activeLayer.includes("pct") ? "%" : "";
    lyr.bindTooltip(
      `<b>${p.district_name ?? "—"}</b>, ${p.state ?? ""}<br/>${layer.label.replace(/.*\s/, "")}: ${val != null ? val.toFixed(1) + suffix : "—"}<br/><span style="font-size:9px;color:#94a3b8">Click to assess</span>`,
      { sticky: true }
    );
    lyr.on("click", () => onSelectDistrict(p.district_name));
  }, [activeLayer, layer, onSelectDistrict]);

  // Boundary layers
  const districtQ = useQuery<any>({
    queryKey: ["india-districts-boundary"],
    queryFn: () => fetch("/data/india.json").then(r => r.json()),
    staleTime: Infinity,
    enabled: showDistricts,
  });
  const stateQ = useQuery<any>({
    queryKey: ["india-states-boundary"],
    queryFn: () => fetch("/data/india_states.geojson").then(r => r.json()),
    staleTime: Infinity,
  });

  const districtBoundaryStyle = useCallback(() => ({
    fillOpacity: 0, color: "#ffffff", weight: 1, dashArray: "4 3", opacity: 0.5,
  }), []);
  const stateBoundaryStyle = useCallback(() => ({
    fillOpacity: 0, color: "#f59e0b", weight: 2,
  }), []);

  const onDistrictBoundary = useCallback((feature: any, lyr: any) => {
    const name = feature.properties.NAME;
    const state = feature.properties.STATE;
    lyr.bindTooltip(`<b>${name}</b><br/>${state}`, { sticky: true });
    lyr.on("click", (e: any) => { L.DomEvent.stopPropagation(e); onSelectDistrict(name); });
  }, [onSelectDistrict]);

  const onStateBoundary = useCallback((feature: any, lyr: any) => {
    const state = feature.properties.state || feature.properties.STATE || feature.properties.name;
    lyr.bindTooltip(`<b>${state}</b>`, { sticky: true });
    lyr.on("click", (e: any) => {
      L.DomEvent.stopPropagation(e);
      // zoom to state
      if (mapRef.current) {
        const stateHexes = hexProps.filter(h => h.state === state);
        if (stateHexes.length) fitMapToBounds(mapRef.current, stateHexes);
      }
    });
  }, [hexProps]);

  if (!geoData) return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      Loading hex grid…
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Layer + boundary controls */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/40 flex-wrap bg-card/80 backdrop-blur-sm z-10 shrink-0">
        {MAP_LAYERS.map(l => (
          <button key={l.key} onClick={() => setActiveLayer(l.key)}
            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap ${
              activeLayer === l.key ? "bg-[#00AEEF] text-white border-[#00AEEF]" : "border-border text-muted-foreground hover:border-[#00AEEF]/50"
            }`}>
            {l.label}
          </button>
        ))}
        <div className="w-px h-4 bg-border/60 mx-1" />
        <button onClick={() => setShowDistricts(v => !v)}
          className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${showDistricts ? "border-white/40 text-white/80" : "border-border text-muted-foreground"}`}>
          Districts
        </button>
        {selectedDistrict && (
          <button onClick={() => { onSelectDistrict(""); mapRef.current?.setView([22.5, 80], 5); }}
            className="text-[11px] px-2 py-0.5 rounded-full border border-red-400/50 text-red-400 hover:bg-red-400/10 ml-auto">
            ✕ Clear
          </button>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 min-h-0">
        <MapContainer
          center={[22.5, 80]} zoom={5}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
          maxBounds={[[6, 68], [37, 98]]}
          minZoom={4} maxZoom={11}
          ref={mapRef}
          attributionControl={false}
        >
          <SetupCanvas />
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" />
          <GeoJSON
            ref={geoJsonRef}
            key={activeLayer}
            data={geoData}
            style={styleFeature}
            onEachFeature={onEachFeature}
          />
          {showDistricts && districtQ.data && (
            <GeoJSON key="dist-bounds" data={districtQ.data}
              style={districtBoundaryStyle} onEachFeature={onDistrictBoundary} />
          )}
          {stateQ.data && (
            <GeoJSON key="state-bounds" data={stateQ.data}
              style={stateBoundaryStyle} onEachFeature={onStateBoundary} />
          )}
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

  const { data: gapData } = useQuery<any[]>({
    queryKey: ["gap-rankings"],
    queryFn: () => fetch("/data/gap_rankings.json").then(r => r.json()),
    staleTime: Infinity,
  });

  const { data: nfhs5Extra } = useQuery<Record<string, any>>({
    queryKey: ["nfhs5-extra"],
    queryFn: () => fetch("/data/nfhs5_extra.json").then(r => r.json()),
    staleTime: Infinity,
  });

  const { data: decisionMatrix } = useQuery<any[]>({
    queryKey: ["decision-matrix"],
    queryFn: () => fetch("/data/decision_matrix.json").then(r => r.json()),
    staleTime: Infinity,
  });

  const { data: districtClimate } = useQuery<{districts: Record<string,any>; states: Record<string,any>; national: Record<string,any>}>({
    queryKey: ["district-climate"],
    queryFn: () => fetch("/data/district_climate.json").then(r => r.json()),
    staleTime: Infinity,
  });

  const { data: riverForecast } = useQuery<RiverForecast>({
    queryKey: ["river-forecast"],
    queryFn: () => fetch("/data/river_forecast.json").then(r => r.json()),
    staleTime: 30 * 60 * 1000,
  });

  // ─── Derived district data ────────────────────────────────────────────────

  const rank = useMemo(() =>
    rankings?.find(d => d.district === selectedDistrict) ?? null,
  [rankings, selectedDistrict]);

  const gap = useMemo(() =>
    gapData?.find(d => d.district === selectedDistrict) ?? null,
  [gapData, selectedDistrict]);

  const nfhsExtra = useMemo(() =>
    (selectedDistrict && nfhs5Extra) ? (nfhs5Extra[selectedDistrict] ?? null) : null,
  [nfhs5Extra, selectedDistrict]);

  const districtHexes = useMemo(() =>
    hexProps?.filter(h => h.district_name === selectedDistrict) ?? [],
  [hexProps, selectedDistrict]);

  const hexAgg = useMemo(() => {
    if (!districtHexes.length) return null;
    const avg = (field: string) =>
      districtHexes.reduce((s, h) => s + (h[field] || 0), 0) / districtHexes.length;
    const mode = (field: string): number | null => {
      const counts: Record<number, number> = {};
      districtHexes.forEach(h => { if (h[field] != null) counts[h[field]] = (counts[h[field]] || 0) + 1; });
      const entries = Object.entries(counts);
      return entries.length ? Number(entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0][0]) : null;
    };
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
      // Extended fields
      pm25: avg("pm25_annual"),
      pollution_risk: avg("pollution_risk"),
      cascade_count: avg("cascade_count"),
      burden_days: avg("total_burden_days"),
      stunting_pct: avg("wash_stunting_pct"),
      anaemia_pct: avg("wash_anaemia_pct"),
      electricity_pct: avg("wash_electricity_pct"),
      literacy_pct: avg("wash_literacy_pct"),
      vaccination_pct: avg("wash_vaccination_pct"),
      adaptive_capacity: avg("adaptive_capacity"),
      jjm_fhtc_hex: avg("jjm_fhtc_pct"),
      flood_peak_month: mode("flood_peak_month"),
      heat_peak_month: mode("heat_peak_month"),
      drought_peak_month: mode("drought_peak_month"),
      wetbulb_peak_month: mode("wetbulb_peak_month"),
      wetbulb_risk: avg("wetbulb_risk"),
    };
  }, [districtHexes]);

  const season = rank ? HAZARD_SEASONS[rank.dominant_hazard] ?? null : null;

  // SBM toilet type data — national dataset keyed STATE|DISTRICT
  const sbmData = useMemo(() => {
    if (!sbmToilets || !selectedDistrict) return null;
    // Primary: state|district composite key
    if (rank?.state) {
      const key = `${rank.state.toUpperCase()}|${selectedDistrict.toUpperCase()}`;
      if (sbmToilets[key]) return sbmToilets[key];
    }
    // Fallback: scan by district name only (handles state name mismatches)
    const distUpper = selectedDistrict.toUpperCase();
    const fallback = Object.values(sbmToilets).find(
      (v: any) => v.district === distUpper
    );
    return fallback ?? null;
  }, [sbmToilets, selectedDistrict, rank]);

  // JJM IMIS district FHTC data (Rajasthan districts for now)
  const jjmData = useMemo(() => {
    if (!jjmFhtc || !selectedDistrict) return null;
    return jjmFhtc[selectedDistrict.toUpperCase()] ?? null;
  }, [jjmFhtc, selectedDistrict]);

  // Decision matrix entry for selected district
  const dmEntry = useMemo(() =>
    decisionMatrix?.find(d => d.district === selectedDistrict) ?? null,
  [decisionMatrix, selectedDistrict]);

  // Future climate data for district
  const dcDistrict = useMemo(() =>
    (selectedDistrict && districtClimate) ? districtClimate.districts[selectedDistrict] ?? null : null,
  [districtClimate, selectedDistrict]);

  // State + national averages for comparison
  const stateAvg = useMemo(() =>
    (rank?.state && districtClimate) ? districtClimate.states[rank.state] ?? null : null,
  [districtClimate, rank]);

  const nationalAvg = useMemo(() => districtClimate?.national ?? null, [districtClimate]);

  // Nearest river discharge point to this district
  const riverPoint = useMemo((): RiverPoint | null => {
    if (!riverForecast || !districtHexes.length) return null;
    // Compute district centroid from first hex
    const [cLat, cLon] = cellToLatLng(districtHexes[0].h3_id);
    let best: RiverPoint | null = null;
    let bestDist = Infinity;
    for (const pt of riverForecast.points) {
      const d = Math.hypot(pt.lat - cLat, pt.lon - cLon);
      if (d < bestDist) { bestDist = d; best = pt; }
    }
    // Only return if within ~300km (~2.7° at India lat)
    return bestDist < 2.7 ? best : null;
  }, [riverForecast, districtHexes]);

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

  const handleMapDistrictSelect = useCallback((district: string) => {
    if (!district) { setSelectedDistrict(null); setSearch(""); return; }
    selectDistrict(district);
    setSearch(district);
  }, [selectDistrict]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          .print-full { width: 100% !important; max-width: none !important; overflow: visible !important; height: auto !important; }
          body { overflow: visible; }
        }
      `}</style>
      {/* Top bar */}
      <div className="shrink-0 z-20 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="px-4 py-2 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> Home
            </Button>
          </Link>
          <div className="w-px h-4 bg-border" />
          <Droplets className="w-4 h-4 text-[#00AEEF]" />
          <span className="font-semibold text-sm text-foreground">WASH Climate Assessment</span>
          <Badge variant="outline" className="text-[10px]">District-Level</Badge>
          <div className="relative ml-auto w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search district…"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              className="pl-8 h-7 text-xs"
            />
            {showDropdown && filtered.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-52 overflow-y-auto">
                {filtered.map(d => (
                  <button key={d} className="w-full text-left text-xs px-3 py-2 hover:bg-accent"
                    onMouseDown={() => selectDistrict(d)}>{d}</button>
                ))}
              </div>
            )}
          </div>
          {selectedDistrict && (
            <Button variant="ghost" size="sm"
              className="h-7 gap-1.5 text-xs print:hidden"
              onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
          )}
          <ThemeToggle />
        </div>
      </div>

      {/* Body: map (left) + assessment panel (right) */}
      <div className="flex-1 min-h-0 flex">

        {/* ── Map pane ───────────────────────────────────────────────────── */}
        <div className="print-hide flex-1 min-w-0 border-r border-border flex flex-col">
          {hexProps ? (
            <WashHexMap
              hexProps={hexProps}
              selectedDistrict={selectedDistrict}
              onSelectDistrict={handleMapDistrictSelect}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Loading hex grid…
            </div>
          )}
        </div>

        {/* ── Assessment pane ────────────────────────────────────────────── */}
        <div className="print-full w-[420px] shrink-0 overflow-y-auto">
          {!selectedDistrict ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
              <Droplets className="w-10 h-10 text-[#00AEEF]/40 mb-3" />
              <h2 className="text-base font-semibold text-foreground mb-1">Select a District</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Click a district on the map, or use the search. State boundaries (amber) zoom to state. District boundaries (white) select a district.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {["Araria", "Jaisalmer", "Wayanad", "Balasore"].map(d => (
                  <button key={d} onClick={() => { selectDistrict(d); setSearch(d); }}
                    className="text-xs px-3 py-1 rounded-full border border-border hover:border-[#00AEEF] hover:text-[#00AEEF] transition-colors">
                    {d}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4">
              {/* District header */}
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <h1 className="text-lg font-bold text-foreground leading-tight">{selectedDistrict}</h1>
                  <p className="text-muted-foreground text-xs">{rank?.state ?? "—"}{rank?.population_at_risk ? ` · Pop. ${(rank.population_at_risk / 1e6).toFixed(2)}M at-risk` : ""}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {rank && (
                    <div className="text-center">
                      <div className="text-lg font-bold" style={{ color: season?.color ?? "#888" }}>{rank.risk_score.toFixed(1)}</div>
                      <div className="text-[10px] text-muted-foreground">Risk</div>
                    </div>
                  )}
                  <div className="text-center">
                    <div className="text-lg font-bold" style={{ color: completeness > 75 ? "#22c55e" : completeness > 50 ? "#f97316" : "#ef4444" }}>{completeness}%</div>
                    <div className="text-[10px] text-muted-foreground">Complete</div>
                  </div>
                </div>
              </div>

          {/* Top vulnerabilities */}
          {rank?.top_vulnerabilities?.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {rank.top_vulnerabilities.map((v: string) => (
                <span key={v} className="text-[11px] px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 border border-red-500/20">
                  ⚠ {v}
                </span>
              ))}
            </div>
          )}

          {/* Gap Summary */}
          {dmEntry && dmEntry.gaps.length > 0 && (
            <div className="mb-4 border border-red-500/20 bg-red-500/5 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs font-semibold text-red-400">{dmEntry.gaps.length} WASH Gap{dmEntry.gaps.length > 1 ? "s" : ""} Identified</span>
                <span className="ml-auto text-[10px] text-muted-foreground">Gap score: {dmEntry.gap_score?.toFixed(1)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {dmEntry.gaps.map((g: string) => {
                  const m = GAP_META_WA[g];
                  return m ? (
                    <span key={g} className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${m.color}`}>
                      {m.icon} {m.label}
                    </span>
                  ) : null;
                })}
              </div>
              {dmEntry.primary_intervention && (
                <p className="text-[10px] text-muted-foreground leading-snug">
                  <span className="text-foreground font-medium">Priority: </span>{dmEntry.primary_intervention}
                </p>
              )}
            </div>
          )}

          {/* 2050 Climate Outlook */}
          {gap && (
            <div className="mb-4 bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">2050 Climate Outlook</span>
                  <SourceBadge source="derived" />
                </div>
                {gap.priority_tier && (
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    gap.priority_tier === "critical" ? "bg-red-500/15 text-red-600 border-red-500/30" :
                    gap.priority_tier === "high"     ? "bg-orange-500/15 text-orange-600 border-orange-500/30" :
                    gap.priority_tier === "moderate" ? "bg-amber-500/15 text-amber-600 border-amber-500/30" :
                                                       "bg-green-500/15 text-green-600 border-green-500/30"
                  }`}>{gap.priority_tier.toUpperCase()} PRIORITY</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-6">
                <div>
                  <StatRow label="Present risk" value={gap.present_risk?.toFixed(1)} unit="/10" source="auto" />
                  <StatRow label="2050 risk (SSP2-4.5)" value={gap.future_risk_ssp245_2050?.toFixed(1)} unit="/10" source="derived" />
                  <StatRow label="2050 risk (SSP5-8.5)" value={gap.future_risk_ssp585_2050?.toFixed(1)} unit="/10" source="derived" />
                  <StatRow label="Risk escalation" value={gap.risk_escalation != null ? `${gap.risk_escalation >= 0 ? "+" : ""}${gap.risk_escalation.toFixed(2)}` : null} source="derived" />
                  <StatRow label="Capacity gap" value={gap.capacity_gap?.toFixed(2)} source="derived" />
                  {gap.hazard_shifted && <StatRow label="Hazard shift by 2050" value={gap.future_dominant_hazard} source="derived" />}
                  {dcDistrict && (
                    <>
                      <div className="mt-2 pt-2 border-t border-border/40">
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Future Hazard Exposure (SSP5-8.5)</div>
                        <StatRow label="🌡️ Heat days/yr 2050" value={dcDistrict.heat_days_ssp585_2050?.toFixed(0)} unit=" days" source="derived" />
                        <StatRow label="💦 Wet-bulb days/yr 2050" value={dcDistrict.wet_bulb_days_ssp585_2050?.toFixed(0)} unit=" days" source="derived" />
                        <StatRow label="🌊 Flood days/yr 2050" value={dcDistrict.flood_days_ssp585_2050?.toFixed(1)} unit=" days" source="derived" />
                        <StatRow label="🔥 Severe heat days 2050" value={dcDistrict.severe_heat_days_ssp585_2050?.toFixed(1)} unit=" days" source="derived" />
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <StatRow label="People at risk (now)" value={gap.people_at_risk_present != null ? (gap.people_at_risk_present / 1e5).toFixed(1) : null} unit=" L" source="auto" />
                  <StatRow label="People at risk (2050)" value={gap.people_at_risk_2050 != null ? (gap.people_at_risk_2050 / 1e5).toFixed(1) : null} unit=" L" source="derived" />
                  <StatRow label="Children <5 at risk (2050)" value={gap.children_u5_at_risk_2050 != null ? gap.children_u5_at_risk_2050.toLocaleString("en-IN") : null} source="derived" />
                  {dcDistrict && (
                    <>
                      <div className="mt-2 pt-2 border-t border-border/40">
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">SSP2-4.5 (moderate)</div>
                        <StatRow label="Heat days/yr 2050" value={dcDistrict.heat_days_ssp245_2050?.toFixed(0)} unit=" days" source="derived" />
                        <StatRow label="Wet-bulb days/yr 2050" value={dcDistrict.wet_bulb_days_ssp245_2050?.toFixed(0)} unit=" days" source="derived" />
                      </div>
                    </>
                  )}
                  {gap.gap_explanation && (
                    <p className="text-[10px] text-muted-foreground mt-2 italic leading-relaxed">{gap.gap_explanation}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 8-card grid */}
          <div className="grid grid-cols-2 gap-3">

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
              <StatRow label="Active hazards" value={hexAgg?.cascade_count != null ? Math.round(hexAgg.cascade_count).toString() : null} source="derived" />
              <StatRow label="Burden days/yr" value={hexAgg?.burden_days?.toFixed(0)} source="derived" />
              <StatRow label="PM2.5 (µg/m³)" value={hexAgg?.pm25?.toFixed(1)} source="derived" />
              <StatRow label="Air quality risk" value={hexAgg?.pollution_risk?.toFixed(2)} unit="/10" source="derived" />
              {/* River discharge — live GloFAS */}
              {riverPoint && (
                <div className="mt-2 pt-2 border-t border-border/30">
                  <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Nearest River — Live Discharge (GloFAS)
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <Waves className="h-3 w-3 shrink-0" style={{ color: RIVER_SEV_COLOR[riverPoint.max_severity_7d] }} />
                    <span className="text-[11px] font-semibold">{riverPoint.river} @ {riverPoint.location}</span>
                    <span className="text-[10px] font-bold ml-auto" style={{ color: RIVER_SEV_COLOR[riverPoint.max_severity_7d] }}>
                      {RIVER_SEV_LABEL[riverPoint.max_severity_7d]}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3 mb-1.5">
                    <span className="text-[10px] text-muted-foreground">Now:</span>
                    <span className="text-[11px] font-mono font-semibold">{riverPoint.current_discharge.toLocaleString()} m³/s</span>
                    {riverPoint.days[0]?.p75 && (
                      <span className="text-[9px] text-muted-foreground">p75: {riverPoint.days[0].p75.toLocaleString()} m³/s</span>
                    )}
                  </div>
                  {/* 7-day bar */}
                  <div className="flex gap-0.5 mb-0.5">
                    {riverPoint.days.map((d, j) => (
                      <div key={j} className="flex-1 h-2.5 rounded-sm"
                        style={{ backgroundColor: RIVER_SEV_COLOR[d.severity] + "99" }}
                        title={`${d.date}: ${d.discharge} m³/s`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[8px] text-muted-foreground">
                    <span>Today</span><span>+6d</span>
                  </div>
                  {riverPoint.max_severity_7d === "danger" || riverPoint.max_severity_7d === "extreme" ? (
                    <p className="text-[10px] text-red-400 leading-snug mt-1">
                      ⚠ River at {RIVER_SEV_LABEL[riverPoint.max_severity_7d]} — check toilet siting, water source contamination risk.
                    </p>
                  ) : riverPoint.max_severity_7d === "warning" ? (
                    <p className="text-[10px] text-orange-400 leading-snug mt-1">
                      ⚠ River above normal — monitor open defecation sites and hand-pump contamination.
                    </p>
                  ) : null}
                </div>
              )}
              {/* Climate-social callouts */}
              {hexAgg && (
                <div className="mt-2 pt-2 border-t border-border/30 space-y-1">
                  {(hexAgg.heat_risk ?? 0) > 1 && (
                    <p className="text-[10px] text-orange-400 leading-snug">
                      🌡️ Heat risk {hexAgg.heat_risk?.toFixed(1)} → associated with elevated anaemia (r=+0.30 nationally).
                      {hexAgg.anaemia_pct != null && nationalAvg ? ` Anaemia here: ${hexAgg.anaemia_pct.toFixed(0)}% vs national ${nationalAvg.wash_anaemia_pct}%.` : ""}
                    </p>
                  )}
                  {(hexAgg.pollution_risk ?? 0) > 2 && (
                    <p className="text-[10px] text-gray-400 leading-snug">
                      🏭 PM2.5 {hexAgg.pm25?.toFixed(0)} µg/m³ → elevated pollution linked to anaemia via chronic inflammation (r=+0.28).
                    </p>
                  )}
                  {(hexAgg.wetbulb_risk ?? 0) > 2 && (
                    <p className="text-[10px] text-blue-400 leading-snug">
                      💦 Wet-bulb heat risk present → limits outdoor work & healthcare access for women, compounds MHM barriers.
                    </p>
                  )}
                </div>
              )}
            </AssessCard>

            {/* 2. Seasonality */}
            <AssessCard
              icon={<Activity className="w-4 h-4" />}
              title="Hazard Seasonality"
              status={rank ? "good" : "missing"}
            >
              {season ? (
                <>
                  <div className="text-[10px] text-muted-foreground mb-1">Active months — {rank?.dominant_hazard}</div>
                  <MonthBar activeMonths={season.months} color={season.color} />
                </>
              ) : null}
              <div className="mt-2 space-y-0">
                <StatRow label="Disruption days/yr" value={rank?.wash_disruption_days?.toFixed(0)} source="auto" />
                {hexAgg?.flood_peak_month != null && (
                  <StatRow label="🌊 Flood peak" value={MONTHS[(hexAgg.flood_peak_month as number) - 1]} source="derived" />
                )}
                {hexAgg?.heat_peak_month != null && (
                  <StatRow label="🌡️ Heat peak" value={MONTHS[(hexAgg.heat_peak_month as number) - 1]} source="derived" />
                )}
                {hexAgg?.drought_peak_month != null && (
                  <StatRow label="☀️ Drought peak" value={MONTHS[(hexAgg.drought_peak_month as number) - 1]} source="derived" />
                )}
                {hexAgg?.wetbulb_peak_month != null && (
                  <StatRow label="💦 Wet-bulb peak" value={MONTHS[(hexAgg.wetbulb_peak_month as number) - 1]} source="derived" />
                )}
              </div>
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
              <CmpRow label="Water access" value={dcDistrict?.wash_water_pct} stateVal={stateAvg?.wash_water_pct} natVal={nationalAvg?.wash_water_pct} />
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
              <CmpRow label="Sanitation" value={dcDistrict?.wash_sanitation_pct} stateVal={stateAvg?.wash_sanitation_pct} natVal={nationalAvg?.wash_sanitation_pct} />
              {sbmData ? (
                <>
                  <div className="text-[10px] text-muted-foreground mt-1 mb-0.5">Toilet type breakdown (SBM)</div>
                  <ToiletTypeBar sbmData={sbmData} />
                  <StatRow label="Total IHHL" value={sbmData.total_ihhl?.toLocaleString("en-IN")} source="auto" />
                  <p className="text-[10px] text-blue-500/80 mt-1">Source: SBM Phase 2 IMIS · {sbmData.date}</p>
                </>
              ) : (
                <>
                  <StatRow label="Twin pit toilet" value={manual.toilet_twin_pit_pct} unit="%" source={manual.toilet_twin_pit_pct ? "manual" : undefined} />
                  <StatRow label="Septic tank" value={manual.toilet_septic_pct} unit="%" source={manual.toilet_septic_pct ? "manual" : undefined} />
                  <StatRow label="Open defecation" value={manual.toilet_od_pct} unit="%" source={manual.toilet_od_pct ? "manual" : undefined} />
                  <p className="text-[11px] text-muted-foreground italic mt-1">SBM data not available for this state.</p>
                </>
              )}
              {/* Climate-sanitation callout */}
              {rank?.dominant_hazard === "flood" && (sbmData?.single_pit_pct ?? 0) > 30 && (
                <p className="text-[10px] text-red-400 mt-2 leading-snug">
                  ⚠ Flood district + {sbmData?.single_pit_pct?.toFixed(0)}% single-pit toilets: pit collapse during floods contaminates groundwater. Twin-pit retrofit is critical.
                </p>
              )}
              {rank?.dominant_hazard === "flood" && !sbmData && (
                <p className="text-[10px] text-orange-400 mt-2 leading-snug">
                  ⚠ Flood district — toilet type data needed. Single-pit toilets fail during floods; twin-pit is the flood-resilient standard.
                </p>
              )}
            </AssessCard>

            {/* 6. Hygiene & MHM */}
            <AssessCard
              icon={<Sprout className="w-4 h-4" />}
              title="Hygiene & MHM"
              status={
                nfhsExtra?.menstrual_hygiene_pct != null
                  ? statusFromPct(nfhsExtra.menstrual_hygiene_pct, [70, 50])
                  : statusFromPct(hwwsPct, [70, 40])
              }
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
              {!manual.hwws_pct && <p className="text-[10px] text-muted-foreground italic">HWWS not in NFHS-5 — enter manually.</p>}
              <StatRow label="Menstrual hygiene (MHM)" value={nfhsExtra?.menstrual_hygiene_pct?.toFixed(1)} unit="%" source="auto" />
              <CmpRow label="MHM" value={nfhsExtra?.menstrual_hygiene_pct} stateVal={stateAvg?.wash_sanitation_pct ? undefined : undefined} natVal={undefined} />
              <StatRow label="ORS use (diarrhoea)" value={nfhsExtra?.ors_diarrhoea_pct?.toFixed(1)} unit="%" source="auto" />
              <StatRow label="Diarrhoea prevalence" value={hexAgg?.diarrhoea_pct?.toFixed(1)} unit="%" source="auto" />
              <StatRow label="ARI prevalence" value={nfhsExtra?.ari_prevalence_pct?.toFixed(1)} unit="%" source="auto" />
              <StatRow label="Vaccination coverage" value={hexAgg?.vaccination_pct?.toFixed(1)} unit="%" source="auto" />
              {/* MHM-antenatal climate-social link */}
              {nfhsExtra?.menstrual_hygiene_pct != null && nfhsExtra.menstrual_hygiene_pct < 55 && (
                <p className="text-[10px] text-pink-400 mt-1 leading-snug">
                  🩸 Low MHM ({nfhsExtra.menstrual_hygiene_pct.toFixed(0)}%) → predicts low antenatal care uptake (r=+0.42 nationally). Same access barrier.
                </p>
              )}
              {(hexAgg?.heat_risk ?? 0) > 1 && nfhsExtra?.menstrual_hygiene_pct != null && nfhsExtra.menstrual_hygiene_pct < 60 && (
                <p className="text-[10px] text-orange-400 mt-1 leading-snug">
                  🌡️ Heat risk compounds MHM barriers — hotter districts show lower coverage (r=−0.19 nationally).
                </p>
              )}
            </AssessCard>

            {/* 6b. Social & Adaptive Capacity */}
            <AssessCard
              icon={<Baby className="w-4 h-4" />}
              title="Social Indicators"
              status={
                nfhsExtra?.child_marriage_pct != null && nfhsExtra.child_marriage_pct > 35 ? "critical" :
                nfhsExtra?.antenatal_4visit_pct != null && nfhsExtra.antenatal_4visit_pct < 50 ? "at-risk" : "good"
              }
            >
              <StatRow label="Antenatal 4+ visits" value={nfhsExtra?.antenatal_4visit_pct?.toFixed(1)} unit="%" source="auto" />
              <StatRow label="Child marriage rate" value={nfhsExtra?.child_marriage_pct?.toFixed(1)} unit="%" source="auto" />
              <StatRow label="Health insurance" value={nfhsExtra?.health_insurance_pct?.toFixed(1)} unit="%" source="auto" />
              <StatRow label="Clean cooking fuel" value={nfhsExtra?.clean_fuel_pct?.toFixed(1)} unit="%" source="auto" />
              <StatRow label="Electricity access" value={hexAgg?.electricity_pct?.toFixed(1)} unit="%" source="auto" />
              <StatRow label="Literacy rate" value={hexAgg?.literacy_pct?.toFixed(1)} unit="%" source="auto" />
              <StatRow label="Adaptive capacity" value={hexAgg?.adaptive_capacity?.toFixed(3)} source="derived" />
              <CmpRow label="Literacy" value={dcDistrict?.wash_literacy_pct} stateVal={stateAvg?.wash_literacy_pct} natVal={nationalAvg?.wash_literacy_pct} />
              <CmpRow label="Electricity" value={dcDistrict?.wash_electricity_pct} stateVal={stateAvg?.wash_electricity_pct} natVal={nationalAvg?.wash_electricity_pct} />
              {nfhsExtra?.child_marriage_pct != null && nfhsExtra.child_marriage_pct > 30 && nfhsExtra?.menstrual_hygiene_pct != null && nfhsExtra.menstrual_hygiene_pct < 50 && (
                <p className="text-[10px] text-purple-400 mt-1 leading-snug">
                  💍 High child marriage + low MHM: antenatal coverage in similar districts is ~28% vs 60% elsewhere. Structural deprivation compound.
                </p>
              )}
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

          {/* Health & Adaptive Capacity — full-width */}
          {hexAgg && (
            <div className="mt-3 bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Heart className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Health & Adaptive Capacity</span>
                <SourceBadge source="auto" />
              </div>
              <div className="grid grid-cols-4 gap-x-6 gap-y-0">
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
                    <Heart className="w-3 h-3" /> Child Health
                  </div>
                  <StatRow label="Stunting" value={hexAgg.stunting_pct?.toFixed(1)} unit="%" source="auto" />
                  <CmpRow label="Stunting" value={dcDistrict?.wash_stunting_pct} stateVal={stateAvg?.wash_stunting_pct} natVal={nationalAvg?.wash_stunting_pct} higherIsBetter={false} />
                  <StatRow label="Anaemia (women)" value={hexAgg.anaemia_pct?.toFixed(1)} unit="%" source="auto" />
                  <CmpRow label="Anaemia" value={dcDistrict?.wash_anaemia_pct} stateVal={stateAvg?.wash_anaemia_pct} natVal={nationalAvg?.wash_anaemia_pct} higherIsBetter={false} />
                  <StatRow label="Vaccination" value={hexAgg.vaccination_pct?.toFixed(1)} unit="%" source="auto" />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Infrastructure
                  </div>
                  <StatRow label="Electricity" value={hexAgg.electricity_pct?.toFixed(1)} unit="%" source="auto" />
                  <CmpRow label="Electricity" value={dcDistrict?.wash_electricity_pct} stateVal={stateAvg?.wash_electricity_pct} natVal={nationalAvg?.wash_electricity_pct} />
                  <StatRow label="JJM FHTC" value={hexAgg.jjm_fhtc_hex?.toFixed(1)} unit="%" source="derived" />
                  <CmpRow label="JJM FHTC" value={dcDistrict?.jjm_fhtc_pct} stateVal={stateAvg?.jjm_fhtc_pct} natVal={nationalAvg?.jjm_fhtc_pct} />
                  <StatRow label="Diarrhoea" value={hexAgg.diarrhoea_pct?.toFixed(1)} unit="%" source="auto" />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
                    <BookOpen className="w-3 h-3" /> Social
                  </div>
                  <StatRow label="Literacy" value={hexAgg.literacy_pct?.toFixed(1)} unit="%" source="auto" />
                  <CmpRow label="Literacy" value={dcDistrict?.wash_literacy_pct} stateVal={stateAvg?.wash_literacy_pct} natVal={nationalAvg?.wash_literacy_pct} />
                  <StatRow label="Adaptive capacity" value={hexAgg.adaptive_capacity?.toFixed(3)} source="derived" />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Burden
                  </div>
                  <StatRow label="Burden days/yr" value={hexAgg.burden_days?.toFixed(0)} source="derived" />
                  <StatRow label="Active hazards" value={hexAgg.cascade_count != null ? Math.round(hexAgg.cascade_count).toString() : null} source="derived" />
                  <StatRow label="Air quality" value={hexAgg.pollution_risk?.toFixed(2)} unit="/10" source="derived" />
                </div>
              </div>
            </div>
          )}

          {/* Action Plan */}
          {(dmEntry || rank) && (
            <div className="mt-4 bg-card border border-[#00AEEF]/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <ListChecks className="w-4 h-4 text-[#00AEEF]" />
                <span className="text-sm font-semibold">Action Plan</span>
                <SourceBadge source="derived" />
                <Link href={`/report/${encodeURIComponent(selectedDistrict!)}`}
                  className="ml-auto text-[10px] text-[#00AEEF] hover:underline">
                  Full report →
                </Link>
              </div>

              {/* Data-backed interventions from decision_matrix */}
              {dmEntry?.interventions?.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Priority Interventions (data-backed)</div>
                  <ol className="space-y-1.5">
                    {dmEntry.interventions.map((iv: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          i === 0 ? "bg-red-500/20 text-red-400" :
                          i === 1 ? "bg-orange-500/20 text-orange-400" :
                          "bg-muted text-muted-foreground"
                        }`}>{i + 1}</span>
                        <span className="text-foreground">{iv}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Domain recommendations from district_rankings (by hazard) */}
              {rank?.recommendations && Object.keys(rank.recommendations).length > 0 && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Program Recommendations by WASH System</div>
                  <div className="space-y-2">
                    {Object.entries(rank.recommendations as Record<string, {measures: string[]; schemes: string[]}>).map(([system, rec]) => (
                      <div key={system} className="border border-border/50 rounded-lg p-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#00AEEF] mb-1">{system}</div>
                        {rec.measures?.length > 0 && (
                          <ul className="space-y-0.5">
                            {rec.measures.slice(0, 3).map((m: string, i: number) => (
                              <li key={i} className="text-[10px] text-foreground flex items-start gap-1.5">
                                <span className="text-[#00AEEF] shrink-0 mt-0.5">→</span>{m}
                              </li>
                            ))}
                          </ul>
                        )}
                        {rec.schemes?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {rec.schemes.map((s: string) => (
                              <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-[#00AEEF]/10 text-[#00AEEF] border border-[#00AEEF]/20">{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
        </div>
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
