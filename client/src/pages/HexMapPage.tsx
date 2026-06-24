import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSONLayer } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cellToBoundary } from "h3-js";
import {
  ArrowLeft, ChevronDown, ChevronRight, AlertTriangle, Loader2,
  Grid3X3, PanelLeftClose, PanelLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

// ── Attribute + category definitions ──────────────────────────────────────────

interface AttrDef {
  key: string;
  label: string;
  icon: string;
  desc: string;
  category: string;
}

const CATEGORIES = [
  { id: "overview",     label: "Overview",            icon: "⚠️" },
  { id: "demographics", label: "Demographics",        icon: "👥" },
  { id: "terrain",      label: "Terrain & Land",      icon: "⛰️" },
  { id: "climate",      label: "Climate Hazards",     icon: "🌀" },
  { id: "geographic",   label: "Geographic Hazards",  icon: "🏔️" },
  { id: "wash",         label: "WASH & Capacity",     icon: "🚰" },
];

const ATTRIBUTES: AttrDef[] = [
  // Overview
  { key: "hex_risk",      label: "Max Risk (all hazards)", icon: "⚠️",  category: "overview", desc: "Highest risk across all 10 hazard channels + cascade amplifiers" },
  { key: "population",    label: "Total Population",       icon: "👥",  category: "overview", desc: "WorldPop 2020 UN-adjusted 100m resolution" },
  { key: "hazard_count_5", label: "Hazards ≥5 (CCRR)",     icon: "🎯",  category: "overview", desc: "Number of hazards scoring ≥5.0 — UNICEF CCRR threshold" },
  { key: "hazard_count_3", label: "Hazards ≥3 (moderate)", icon: "🎯",  category: "overview", desc: "Number of hazards scoring ≥3.0 — moderate threshold" },
  { key: "cascade_count", label: "WASH Cascades",          icon: "🔗",  category: "overview", desc: "Number of WASH cascade rules triggered in this hex" },

  // Demographics
  { key: "pop_children_under_5", label: "Children Under 5",  icon: "👶", category: "demographics", desc: "Children aged 0-4 (WorldPop × Census age ratios)" },
  { key: "pop_elderly_60plus",   label: "Elderly 60+",       icon: "🧓", category: "demographics", desc: "Population aged 60+ (WorldPop × Census age ratios)" },
  { key: "pop_women_15_49",      label: "Women 15-49",       icon: "👩", category: "demographics", desc: "Women of reproductive age (WorldPop × Census age ratios)" },

  // Terrain
  { key: "elevation_mean", label: "Elevation (SRTM)",  icon: "⛰️",  category: "terrain", desc: "Mean elevation per hex — real SRTM 90m data" },
  { key: "ndvi_mean",      label: "Vegetation (NDVI)", icon: "🌿",  category: "terrain", desc: "Mean annual NDVI — real MODIS 2023 data" },
  { key: "land_use",       label: "Land Use (ESA)",    icon: "🗺️",  category: "terrain", desc: "Dominant land cover — real ESA WorldCover 2021" },

  // Climate hazards
  { key: "flood_risk",   label: "Pluvial Flood",    icon: "🌊", category: "climate", desc: "Flood risk from 50mm monsoon rainfall scenario" },
  { key: "heat_risk",    label: "Heatwave",          icon: "🔥", category: "climate", desc: "Heatwave risk at 44°C for 3 days" },
  { key: "cyclone_risk", label: "Cyclone",           icon: "🌀", category: "climate", desc: "Cat-3 cyclone risk (wind + rain band + coastal surge)" },
  { key: "drought_risk", label: "Drought",           icon: "☀️", category: "climate", desc: "Meteorological drought from aridity + low NDVI" },
  { key: "wetbulb_risk", label: "Wet-Bulb Heat",     icon: "💧", category: "climate", desc: "Lethal humidity × heat combination" },

  // Geographic hazards
  { key: "landslide_risk",  label: "Landslide",      icon: "🏔️", category: "geographic", desc: "Steep slope + deforestation + monsoon trigger" },
  { key: "coldwave_risk",   label: "Cold Wave",      icon: "❄️", category: "geographic", desc: "Northern plains + high altitude winter exposure" },
  { key: "flashflood_risk", label: "Flash Flood",    icon: "⚡", category: "geographic", desc: "Steep terrain + sudden monsoon runoff" },
  { key: "sealevel_risk",   label: "Sea Level Rise", icon: "🌊", category: "geographic", desc: "Low-elevation coastal inundation exposure" },
  { key: "fire_risk",       label: "Forest Fire",    icon: "🔥", category: "geographic", desc: "Dry deciduous forest + scrubland fire risk" },

  // WASH & district baseline (real NFHS-5 district-level data)
  { key: "adaptive_capacity",      label: "Adaptive Capacity",      icon: "🛡️", category: "wash", desc: "WASH-based coping capacity (NFHS-5 district-level)" },
  { key: "wash_sanitation_pct",    label: "Sanitation %",            icon: "🚽", category: "wash", desc: "Improved sanitation coverage (NFHS-5 district)" },
  { key: "wash_water_pct",         label: "Water Access %",         icon: "💧", category: "wash", desc: "Improved water source coverage (NFHS-5 district)" },
  { key: "wash_health_pct",        label: "Health Access %",        icon: "🏥", category: "wash", desc: "Institutional births as health access proxy (NFHS-5)" },
  { key: "wash_stunting_pct",      label: "Child Stunting %",       icon: "📉", category: "wash", desc: "Children under 5 stunted (NFHS-5 district)" },
  { key: "wash_diarrhoea_pct",     label: "Diarrhoea Prevalence",   icon: "🦠", category: "wash", desc: "Diarrhoea prevalence in children (NFHS-5 district)" },
  { key: "wash_anaemia_pct",       label: "Child Anaemia %",        icon: "🩸", category: "wash", desc: "Children with anaemia (NFHS-5 district)" },
];

// ── Color scales ──────────────────────────────────────────────────────────────

const VIRIDIS: [number,number,number][] = [[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]];
const GREENS:  [number,number,number][] = [[255,255,255],[199,233,192],[116,196,118],[49,163,84],[0,109,44]];
const BLUES:   [number,number,number][] = [[240,249,255],[189,215,231],[107,174,214],[33,113,181],[8,48,107]];
const ORANGES: [number,number,number][] = [[255,255,229],[254,217,142],[254,153,41],[217,95,14],[153,52,4]];
const RISK:    [number,number,number][] = [[34,197,94],[234,179,8],[249,115,22],[239,68,68],[153,27,27]];

const ATTR_RAMP: Record<string, [number,number,number][]> = {
  elevation_mean: VIRIDIS, ndvi_mean: GREENS, population: ORANGES,
  hazard_count_5: RISK, hazard_count_3: RISK,
  pop_children_under_5: ORANGES, pop_elderly_60plus: ORANGES, pop_women_15_49: ORANGES,
  flood_risk: BLUES, heat_risk: ORANGES, cyclone_risk: RISK, drought_risk: ORANGES,
  wetbulb_risk: BLUES, landslide_risk: VIRIDIS, coldwave_risk: BLUES,
  flashflood_risk: BLUES, sealevel_risk: BLUES, fire_risk: ORANGES,
  hex_risk: RISK, cascade_count: RISK,
  adaptive_capacity: GREENS,
  wash_sanitation_pct: GREENS, wash_water_pct: BLUES, wash_health_pct: GREENS,
  wash_stunting_pct: RISK, wash_diarrhoea_pct: RISK, wash_anaemia_pct: RISK,
};

const LAND_USE_COLORS: Record<string, string> = {
  tree: "#2d6a4f", shrub: "#95d5b2", grass: "#d8f3dc", crop: "#f4d35e",
  built: "#d62828", barren: "#c9b79c", water: "#1d4e89", wetland: "#84a59d",
  snow: "#dbeafe", mangrove: "#52b788",
};

// Fixed absolute domains — green always means safe, red always means danger
const FIXED_DOMAIN: Record<string, [number, number]> = {
  hex_risk: [0, 10], population: [0, 5000000], cascade_count: [0, 4],
  hazard_count_5: [0, 5], hazard_count_3: [0, 6],
  pop_children_under_5: [0, 500000], pop_elderly_60plus: [0, 500000], pop_women_15_49: [0, 1500000],
  elevation_mean: [0, 5000], ndvi_mean: [0, 0.8], land_use: [0, 1],
  flood_risk: [0, 10], heat_risk: [0, 10], cyclone_risk: [0, 10],
  drought_risk: [0, 10], wetbulb_risk: [0, 10], landslide_risk: [0, 10],
  coldwave_risk: [0, 10], flashflood_risk: [0, 10], sealevel_risk: [0, 10],
  fire_risk: [0, 10],
  adaptive_capacity: [0, 1],
  wash_sanitation_pct: [0, 100], wash_water_pct: [0, 100], wash_health_pct: [0, 100],
  wash_stunting_pct: [0, 60], wash_diarrhoea_pct: [0, 20], wash_anaemia_pct: [0, 80],
};

function lerp3(a: [number,number,number], b: [number,number,number], t: number) {
  return `rgb(${a.map((c,i) => Math.round(c + t * (b[i] - c))).join(",")})`;
}

function gradientColor(ramp: [number,number,number][], t: number) {
  t = Math.max(0, Math.min(1, t));
  const s = t * (ramp.length - 1);
  const lo = Math.floor(s);
  const hi = Math.min(lo + 1, ramp.length - 1);
  return lerp3(ramp[lo], ramp[hi], s - lo);
}

function hexColor(props: any, attr: string) {
  if (attr === "land_use") return LAND_USE_COLORS[props.land_use] ?? "#94a3b8";
  const val = props[attr] ?? 0;
  const [lo, hi] = FIXED_DOMAIN[attr] ?? [0, 10];
  const t = hi > lo ? (val - lo) / (hi - lo) : 0;
  return gradientColor(ATTR_RAMP[attr] ?? GREENS, t);
}

// ── Cross-filter types ────────────────────────────────────────────────────────

interface CrossFilter {
  key: string;
  op: ">=" | "<=" | ">";
  value: number;
}

const FILTERABLE_KEYS = ATTRIBUTES.filter((a) => a.key !== "land_use").map((a) => ({ key: a.key, label: a.label, icon: a.icon }));

// ── Sidebar ───────────────────────────────────────────────────────────────────

// ── Multi-Hazard Impact panel ─────────────────────────────────────────────────

const HAZARD_DEFS = [
  { key: "flood_risk",      label: "Flood",       icon: "🌊" },
  { key: "heat_risk",       label: "Heat",        icon: "🔥" },
  { key: "cyclone_risk",    label: "Cyclone",     icon: "🌀" },
  { key: "drought_risk",    label: "Drought",     icon: "☀️" },
  { key: "wetbulb_risk",    label: "Wet Bulb",    icon: "💧" },
  { key: "landslide_risk",  label: "Landslide",   icon: "🏔️" },
  { key: "coldwave_risk",   label: "Cold Wave",   icon: "❄️" },
  { key: "flashflood_risk", label: "Flash Flood",  icon: "⚡" },
  { key: "sealevel_risk",   label: "Sea Level",   icon: "🌊" },
  { key: "fire_risk",       label: "Fire",        icon: "🔥" },
];

function MultiHazardPanel({ features }: { features: any[] }) {
  const [selectedHazards, setSelectedHazards] = useState<Set<string>>(new Set(["flood_risk", "heat_risk", "cyclone_risk"]));
  const [threshold, setThreshold] = useState(5.0);

  const toggle = (key: string) => {
    setSelectedHazards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const stats = useMemo(() => {
    if (!features.length) return null;
    const breakdown: Record<number, { total: number; children: number; elderly: number; women: number }> = {};
    let maxK = 0;

    for (const f of features) {
      const p = f.properties;
      let count = 0;
      const hazardNames: string[] = [];
      for (const hk of Array.from(selectedHazards)) {
        if ((p[hk] ?? 0) >= threshold) { count++; hazardNames.push(hk); }
      }
      if (count > maxK) maxK = count;
      if (!breakdown[count]) breakdown[count] = { total: 0, children: 0, elderly: 0, women: 0 };
      breakdown[count].total    += p.population ?? 0;
      breakdown[count].children += p.pop_children_under_5 ?? 0;
      breakdown[count].elderly  += p.pop_elderly_60plus ?? 0;
      breakdown[count].women    += p.pop_women_15_49 ?? 0;
    }

    // Cumulative (k or more)
    const cumulative: Record<number, { total: number; children: number; elderly: number; women: number }> = {};
    for (let k = maxK; k >= 1; k--) {
      cumulative[k] = { total: 0, children: 0, elderly: 0, women: 0 };
      for (let j = k; j <= maxK; j++) {
        if (breakdown[j]) {
          cumulative[k].total    += breakdown[j].total;
          cumulative[k].children += breakdown[j].children;
          cumulative[k].elderly  += breakdown[j].elderly;
          cumulative[k].women    += breakdown[j].women;
        }
      }
    }

    return { breakdown, cumulative, maxK };
  }, [features, selectedHazards, threshold]);

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${n}`;

  return (
    <div className="px-3 pb-3 space-y-2">
      {/* Hazard checkboxes */}
      <div className="grid grid-cols-2 gap-1">
        {HAZARD_DEFS.map((h) => (
          <label key={h.key} className={`flex items-center gap-1 px-1.5 py-1 rounded text-[10px] cursor-pointer transition-colors ${
            selectedHazards.has(h.key) ? "bg-red-500/15 text-red-300" : "bg-muted/30 text-muted-foreground"
          }`}>
            <input type="checkbox" checked={selectedHazards.has(h.key)} onChange={() => toggle(h.key)}
              className="w-3 h-3 accent-red-500" />
            <span>{h.icon} {h.label}</span>
          </label>
        ))}
      </div>

      {/* Threshold */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-muted-foreground">Threshold</span>
        <input type="range" min={1} max={8} step={0.5} value={threshold}
          onChange={(e) => setThreshold(parseFloat(e.target.value))}
          className="flex-1 h-1 accent-red-500" />
        <span className="text-[10px] font-mono text-red-400 w-6">≥{threshold}</span>
      </div>

      {/* Results headline */}
      {stats && selectedHazards.size > 0 && (
        <div className="space-y-1.5">
          <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
            People facing N+ of {selectedHazards.size} selected hazards
          </div>
          {Array.from({ length: stats.maxK }, (_, i) => i + 1).map((k) => {
            const c = stats.cumulative[k];
            if (!c || c.total === 0) return null;
            return (
              <div key={k} className="bg-muted/20 rounded-md p-2">
                <div className="text-[11px] font-bold text-foreground mb-1">
                  {k}+ hazards
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">👥 Total</span><span className="font-semibold">{fmt(c.total)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">👶 Children</span><span className="font-semibold text-red-400">{fmt(c.children)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">🧓 Elderly</span><span className="font-semibold">{fmt(c.elderly)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">👩 Women</span><span className="font-semibold">{fmt(c.women)}</span></div>
                </div>
              </div>
            );
          })}
          {stats.maxK === 0 && (
            <div className="text-[10px] text-muted-foreground text-center py-2">
              No hexes meet threshold ≥{threshold} for selected hazards
            </div>
          )}
        </div>
      )}
      {selectedHazards.size === 0 && (
        <div className="text-[10px] text-muted-foreground text-center py-2">
          Select hazards above to see impact
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function FilterSidebar({
  collapsed, onToggle,
  attr, onAttrChange,
  selectedState, states, onStateChange,
  selectedDistrict, districts, onDistrictChange,
  crossFilters, onCrossFiltersChange, matchCount, totalCount,
  features,
  showDistricts, onShowDistrictsChange, showStates, onShowStatesChange,
}: {
  collapsed: boolean; onToggle: () => void;
  attr: string; onAttrChange: (k: string) => void;
  selectedState: string; states: string[]; onStateChange: (s: string) => void;
  selectedDistrict: string; districts: string[]; onDistrictChange: (d: string) => void;
  crossFilters: CrossFilter[]; onCrossFiltersChange: (f: CrossFilter[]) => void;
  matchCount: number; totalCount: number;
  features: any[];
  showDistricts: boolean; onShowDistrictsChange: (v: boolean) => void;
  showStates: boolean; onShowStatesChange: (v: boolean) => void;
}) {
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({ overview: true, climate: true });

  const toggleCat = (id: string) => setOpenCats((prev) => ({ ...prev, [id]: !prev[id] }));

  if (collapsed) {
    return (
      <div className="w-10 border-r border-border/40 bg-background flex flex-col items-center py-3 shrink-0">
        <button onClick={onToggle} className="text-muted-foreground hover:text-foreground mb-4">
          <PanelLeft className="h-4 w-4" />
        </button>
        {CATEGORIES.map((c) => (
          <div key={c.id} className="text-sm mb-2 cursor-pointer" title={c.label}
               onClick={() => { onToggle(); setOpenCats((p) => ({ ...p, [c.id]: true })); }}>
            {c.icon}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-border/40 bg-background flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Grid3X3 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold">Layers</span>
        </div>
        <button onClick={onToggle} className="text-muted-foreground hover:text-foreground">
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Location filters */}
      <div className="px-3 py-2 border-b border-border/30 space-y-1.5">
        <div className="relative">
          <ChevronDown className="pointer-events-none absolute right-2 top-1.5 h-3 w-3 text-muted-foreground" />
          <select value={selectedState} onChange={(e) => onStateChange(e.target.value)}
            className="w-full appearance-none rounded-md border border-border/50 bg-muted/40 pl-2 pr-6 py-1 text-xs outline-none cursor-pointer text-foreground">
            <option value="All India">All India</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {districts.length > 0 && (
          <div className="relative">
            <ChevronDown className="pointer-events-none absolute right-2 top-1.5 h-3 w-3 text-muted-foreground" />
            <select value={selectedDistrict} onChange={(e) => onDistrictChange(e.target.value)}
              className="w-full appearance-none rounded-md border border-border/50 bg-muted/40 pl-2 pr-6 py-1 text-xs outline-none cursor-pointer text-foreground">
              <option value="All">All Districts</option>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Boundary overlays */}
      <div className="px-3 py-2 border-b border-border/30 flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
          <input type="checkbox" checked={showStates} onChange={(e) => onShowStatesChange(e.target.checked)}
            className="w-3 h-3 accent-amber-500" />
          <span className="text-amber-400">State lines</span>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
          <input type="checkbox" checked={showDistricts} onChange={(e) => onShowDistrictsChange(e.target.checked)}
            className="w-3 h-3 accent-gray-500" />
          <span className="text-muted-foreground">District lines</span>
        </label>
      </div>

      {/* Category sections */}
      <div className="flex-1 overflow-y-auto">
        {CATEGORIES.map((cat) => {
          const catAttrs = ATTRIBUTES.filter((a) => a.category === cat.id);
          const isOpen = openCats[cat.id] ?? false;
          return (
            <div key={cat.id} className="border-b border-border/20">
              <button
                onClick={() => toggleCat(cat.id)}
                className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-muted/30 transition-colors"
              >
                {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                <span className="text-xs">{cat.icon}</span>
                <span className="text-[11px] font-semibold flex-1">{cat.label}</span>
                <span className="text-[9px] text-muted-foreground">{catAttrs.length}</span>
              </button>
              {isOpen && (
                <div className="px-2 pb-2">
                  {catAttrs.map((a) => (
                    <button
                      key={a.key}
                      onClick={() => onAttrChange(a.key)}
                      className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] flex items-center gap-2 transition-colors mb-0.5 ${
                        attr === a.key
                          ? "bg-emerald-600/15 text-emerald-400 font-semibold"
                          : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                      }`}
                    >
                      <span className="text-xs w-4 text-center">{a.icon}</span>
                      <span className="flex-1">{a.label}</span>
                      {attr === a.key && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cross-filter section */}
      <div className="border-t border-border/30">
        <button onClick={() => toggleCat("_crossfilter")}
          className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-muted/30">
          {openCats["_crossfilter"] ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          <span className="text-xs">🔍</span>
          <span className="text-[11px] font-semibold flex-1">Cross-Filter</span>
          {crossFilters.length > 0 && (
            <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 rounded font-semibold">
              {matchCount.toLocaleString()} / {totalCount.toLocaleString()}
            </span>
          )}
        </button>
        {openCats["_crossfilter"] && (
          <div className="px-3 pb-2 space-y-2">
            {crossFilters.map((cf, i) => (
              <div key={i} className="flex items-center gap-1">
                <select value={cf.key} onChange={(e) => {
                  const updated = [...crossFilters];
                  updated[i] = { ...cf, key: e.target.value };
                  onCrossFiltersChange(updated);
                }} className="flex-1 appearance-none rounded border border-border/50 bg-muted/40 px-1 py-0.5 text-[10px] outline-none text-foreground truncate">
                  {FILTERABLE_KEYS.map((k) => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}
                </select>
                <select value={cf.op} onChange={(e) => {
                  const updated = [...crossFilters];
                  updated[i] = { ...cf, op: e.target.value as CrossFilter["op"] };
                  onCrossFiltersChange(updated);
                }} className="w-10 appearance-none rounded border border-border/50 bg-muted/40 px-1 py-0.5 text-[10px] outline-none text-foreground text-center">
                  <option value=">=">≥</option>
                  <option value="<=">≤</option>
                  <option value=">">&gt;</option>
                </select>
                <input type="number" value={cf.value} onChange={(e) => {
                  const updated = [...crossFilters];
                  updated[i] = { ...cf, value: parseFloat(e.target.value) || 0 };
                  onCrossFiltersChange(updated);
                }} className="w-16 rounded border border-border/50 bg-muted/40 px-1 py-0.5 text-[10px] outline-none text-foreground text-right" />
                <button onClick={() => onCrossFiltersChange(crossFilters.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-red-400 text-[10px]">✕</button>
              </div>
            ))}
            <div className="flex gap-1">
              <button onClick={() => onCrossFiltersChange([...crossFilters, { key: "flood_risk", op: ">=", value: 5 }])}
                className="flex-1 px-2 py-1 rounded bg-muted/60 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground">
                + Add filter
              </button>
              {crossFilters.length > 0 && (
                <button onClick={() => onCrossFiltersChange([])}
                  className="px-2 py-1 rounded bg-red-500/10 text-[10px] text-red-400 hover:bg-red-500/20">
                  Clear
                </button>
              )}
            </div>
            {crossFilters.length === 0 && (
              <div className="text-[9px] text-muted-foreground">
                e.g. Children &lt;5 ≥ 10000 AND Flood risk ≥ 5
              </div>
            )}
          </div>
        )}
      </div>

      {/* Multi-Hazard Impact panel */}
      <div className="border-t border-border/30">
        <button onClick={() => toggleCat("_multihazard")}
          className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-muted/30">
          {openCats["_multihazard"] ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          <span className="text-xs">👶</span>
          <span className="text-[11px] font-semibold flex-1">Multi-Hazard Impact</span>
        </button>
        {openCats["_multihazard"] && <MultiHazardPanel features={features} />}
      </div>

      {/* Export */}
      <div className="px-3 py-2 border-t border-border/30">
        <button onClick={() => {
          const csvKeys = ["h3_id","state","district_name","population","pop_children_under_5","pop_elderly_60plus","pop_women_15_49","hex_risk","hazard_count_5","hazard_count_3","flood_risk","heat_risk","cyclone_risk","drought_risk","wetbulb_risk","landslide_risk","coldwave_risk","flashflood_risk","sealevel_risk","fire_risk","cascade_count","adaptive_capacity","wash_sanitation_pct","wash_water_pct","wash_health_pct","wash_stunting_pct","wash_diarrhoea_pct","wash_anaemia_pct","elevation_mean","ndvi_mean","land_use","slope_deg","dist_water_m"];
          const header = csvKeys.join(",");
          const rows = features.map((f: any) => csvKeys.map((k) => {
            const v = f.properties[k]; return v == null ? "" : typeof v === "string" && v.includes(",") ? `"${v}"` : v;
          }).join(","));
          const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
          a.download = "climreswash_hex_data.csv"; a.click();
        }} className="w-full px-2 py-1.5 rounded-md bg-muted/60 text-[10px] text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5">
          📥 Export CSV ({features.length} hexes)
        </button>
      </div>

      {/* Active layer info */}
      {(() => {
        const active = ATTRIBUTES.find((a) => a.key === attr);
        return active ? (
          <div className="px-3 py-2 border-t border-border/30 bg-muted/20">
            <div className="text-[10px] font-semibold text-foreground">{active.icon} {active.label}</div>
            <div className="text-[9px] text-muted-foreground mt-0.5">{active.desc}</div>
          </div>
        ) : null;
      })()}
    </div>
  );
}

// ── Canvas + map setup ────────────────────────────────────────────────────────

const canvasRenderer = L.canvas({ padding: 0.5 });

function SetupCanvas() {
  const map = useMap();
  useEffect(() => { (map as any).options.renderer = canvasRenderer; }, [map]);
  return null;
}

// ── Hex info panel ────────────────────────────────────────────────────────────

function HexInfoPanel({ props, onClose }: { props: any; onClose: () => void }) {
  return (
    <div className="bg-background/95 backdrop-blur border border-border/40 rounded-lg shadow-lg p-3 w-56 max-h-[70vh] overflow-y-auto">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-xs font-semibold">{props.district_name ?? props.state}</div>
          <div className="text-[10px] text-muted-foreground">{props.state}</div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-2">
          <span className="text-xs">✕</span>
        </button>
      </div>
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between"><span className="text-muted-foreground">⛰️ Elevation</span><span className="font-medium">{props.elevation_mean}m</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">🌿 NDVI</span><span className="font-medium">{props.ndvi_mean}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">🗺️ Land Use</span><span className="font-medium capitalize">{props.land_use}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">👥 Population</span><span className="font-medium">{(props.population ?? 0).toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">👶 Children &lt;5</span><span className="font-medium">{(props.pop_children_under_5 ?? 0).toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">🧓 Elderly 60+</span><span className="font-medium">{(props.pop_elderly_60plus ?? 0).toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">👩 Women 15-49</span><span className="font-medium">{(props.pop_women_15_49 ?? 0).toLocaleString()}</span></div>
        <div className="border-t border-border/30 my-1 pt-1" />
        {["flood_risk","heat_risk","cyclone_risk","drought_risk","wetbulb_risk","landslide_risk","coldwave_risk","flashflood_risk","sealevel_risk","fire_risk"].map((k) => {
          const v = props[k];
          if (!v || v < 0.01) return null;
          const label = k.replace("_risk","").replace("flood","Flood").replace("heat","Heat").replace("cyclone","Cyclone").replace("drought","Drought").replace("wetbulb","Wet Bulb").replace("landslide","Landslide").replace("coldwave","Cold Wave").replace("flashflood","Flash Flood").replace("sealevel","Sea Level").replace("fire","Fire");
          return (
            <div key={k} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className={`font-medium ${v > 2 ? "text-red-400" : v > 1 ? "text-amber-400" : ""}`}>{v}</span>
            </div>
          );
        })}
        <div className="flex justify-between font-bold border-t border-border/30 pt-1 mt-1">
          <span>⚠️ Max Risk</span><span>{props.hex_risk ?? "—"}</span>
        </div>
        {props.cascade_count > 0 && (
          <div className="text-[10px] text-red-400 font-semibold mt-1">
            🔗 {props.cascade_count} WASH cascade{props.cascade_count > 1 ? "s" : ""} active
          </div>
        )}
      </div>
      <div className="mt-2 text-[9px] text-muted-foreground/50 truncate">{props.h3_id}</div>
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────────

function Legend({ attr }: { attr: string }) {
  const meta = ATTRIBUTES.find((a) => a.key === attr);
  if (!meta) return null;

  if (attr === "land_use") {
    return (
      <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-2.5 shadow-lg w-40">
        <p className="text-[10px] font-semibold mb-1.5">{meta.icon} {meta.label}</p>
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(LAND_USE_COLORS).map(([cls, color]) => (
            <div key={cls} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
              <span className="text-[9px] capitalize text-muted-foreground">{cls}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const ramp = ATTR_RAMP[attr] ?? GREENS;
  const stops = Array.from({ length: 5 }, (_, i) => gradientColor(ramp, i / 4));
  const [lo, hi] = FIXED_DOMAIN[attr] ?? [0, 10];
  const fmt = (v: number) => attr === "elevation_mean" ? `${Math.round(v)}m` : v.toFixed(2);

  return (
    <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-2.5 shadow-lg w-44">
      <p className="text-[10px] font-semibold mb-1">{meta.icon} {meta.label}</p>
      <div className="h-2.5 w-full rounded-sm mb-1" style={{ background: `linear-gradient(to right, ${stops.join(", ")})` }} />
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>{fmt(lo)}</span><span>{fmt(hi)}</span>
      </div>
    </div>
  );
}

// ── District summary ──────────────────────────────────────────────────────────

function DistrictSummary({ features, district, state }: { features: any[]; district: string; state: string }) {
  const [expanded, setExpanded] = useState(false);
  const d = features.filter((f: any) => f.properties.district_name === district);
  if (!d.length) return null;

  const pop = d.reduce((s: number, f: any) => s + (f.properties.population || 0), 0);
  const avg = d.reduce((s: number, f: any) => s + (f.properties.hex_risk || 0), 0) / d.length;
  const mx = Math.max(...d.map((f: any) => f.properties.hex_risk || 0));
  const cas = d.filter((f: any) => (f.properties.cascade_count || 0) > 0).length;

  const hazardKeys = ["flood_risk","heat_risk","cyclone_risk","drought_risk","wetbulb_risk","landslide_risk","coldwave_risk","flashflood_risk","sealevel_risk","fire_risk"];
  const hazardAvgs = hazardKeys.map((h) => ({
    key: h, label: h.replace("_risk",""),
    avg: d.reduce((s: number, f: any) => s + (f.properties[h] || 0), 0) / d.length,
    max: Math.max(...d.map((f: any) => f.properties[h] || 0)),
  })).sort((a,b) => b.avg - a.avg);

  const riskLevel = avg >= 7 ? "EXTREME" : avg >= 5 ? "HIGH" : avg >= 3 ? "MODERATE" : "LOW";
  const riskClr = avg >= 7 ? "text-red-500" : avg >= 5 ? "text-orange-400" : avg >= 3 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className={`bg-background/95 backdrop-blur border border-border/40 rounded-lg shadow-lg p-3 ${expanded ? "w-72" : "w-56"} max-h-[70vh] overflow-y-auto print:w-full print:max-h-none print:shadow-none print:border-0`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-bold">{district}</div>
          <div className="text-[10px] text-muted-foreground">{state} · {d.length} hexes</div>
        </div>
        <span className={`text-[10px] font-bold ${riskClr}`}>{riskLevel}</span>
      </div>

      <div className="space-y-1 text-[11px] mt-2">
        <div className="flex justify-between"><span className="text-muted-foreground">👥 Population</span><span className="font-medium">{pop.toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">⚠️ Avg Risk</span><span className="font-bold">{avg.toFixed(2)}/10</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">🔴 Max Risk</span><span className="font-bold text-red-400">{mx.toFixed(2)}/10</span></div>
        {cas > 0 && <div className="flex justify-between"><span className="text-red-400">🔗 WASH Cascades</span><span className="text-red-400 font-bold">{cas}/{d.length} hexes</span></div>}
      </div>

      {/* Hazard breakdown */}
      <button onClick={() => setExpanded((v) => !v)}
        className="w-full mt-2 text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Hazard breakdown
      </button>
      {expanded && (
        <div className="mt-1 space-y-1">
          {hazardAvgs.filter((h) => h.avg > 0.01).map((h) => (
            <div key={h.key} className="flex items-center gap-1.5 text-[10px]">
              <span className="w-16 text-muted-foreground capitalize truncate">{h.label}</span>
              <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, h.avg * 10)}%`, background: gradientColor(RISK, h.avg / 10) }} />
              </div>
              <span className="w-8 text-right font-mono" style={{ color: gradientColor(RISK, h.avg / 10) }}>{h.avg.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 mt-2 print:hidden">
        <Link href={`/report/${encodeURIComponent(district)}`}
          className="flex-1 px-2 py-1 rounded-md bg-muted/60 text-[10px] text-muted-foreground hover:bg-muted text-center transition-colors">
          📄 Report
        </Link>
        <Link href={`/forecast?state=${encodeURIComponent(state)}`}
          className="flex-1 px-2 py-1 rounded-md bg-red-600/20 text-[10px] text-red-400 hover:bg-red-600/30 text-center transition-colors">
          📡 Forecast
        </Link>
      </div>
    </div>
  );
}

// ── Leaflet map ───────────────────────────────────────────────────────────────

function BoundaryLayers({ showDistricts, showStates }: { showDistricts: boolean; showStates: boolean }) {
  const districtQ = useQuery<any>({
    queryKey: ["india-districts-boundary"],
    queryFn: () => fetch("/data/india.json").then((r) => r.json()),
    staleTime: Infinity,
    enabled: showDistricts,
  });
  const stateQ = useQuery<any>({
    queryKey: ["india-states-boundary"],
    queryFn: () => fetch("/data/india_states.geojson").then((r) => r.json()),
    staleTime: Infinity,
    enabled: showStates,
  });

  const districtStyle = useCallback(() => ({
    fillOpacity: 0, color: "#ffffff", weight: 1.5, dashArray: "5 3", opacity: 0.8,
  }), []);
  const stateStyle = useCallback(() => ({
    fillOpacity: 0, color: "#f59e0b", weight: 2.5,
  }), []);

  const onDistrictFeature = useCallback((feature: any, layer: any) => {
    layer.bindTooltip(`<b>${feature.properties.NAME}</b><br/>${feature.properties.STATE}`, { sticky: true });
  }, []);
  const onStateFeature = useCallback((feature: any, layer: any) => {
    layer.bindTooltip(`<b>${feature.properties.state || feature.properties.STATE}</b>`, { sticky: true });
  }, []);

  return (
    <>
      {showDistricts && districtQ.data && (
        <GeoJSON key="district-boundaries" data={districtQ.data} style={districtStyle}
          onEachFeature={onDistrictFeature} />
      )}
      {showStates && stateQ.data && (
        <GeoJSON key="state-boundaries" data={stateQ.data} style={stateStyle}
          onEachFeature={onStateFeature} />
      )}
    </>
  );
}

function HexMap({
  geoData, attr, selectedState, selectedDistrict, crossFilters, mapRef, onHexClick,
  showDistricts, showStates,
}: {
  geoData: any; attr: string; selectedState: string; selectedDistrict: string;
  crossFilters: CrossFilter[];
  mapRef: React.MutableRefObject<LeafletMap | null>;
  onHexClick: (p: any) => void;
  showDistricts: boolean; showStates: boolean;
}) {
  const geoJsonRef = useRef<LeafletGeoJSONLayer | null>(null);

  const filtered = useMemo(() => {
    if (!geoData) return null;
    let feats = geoData.features;
    if (selectedState !== "All India") feats = feats.filter((f: any) => f.properties.state === selectedState);
    if (selectedDistrict !== "All") feats = feats.filter((f: any) => f.properties.district_name === selectedDistrict);
    if (crossFilters.length > 0) {
      feats = feats.filter((f: any) => crossFilters.every((cf) => {
        const val = f.properties[cf.key] ?? 0;
        if (cf.op === ">=") return val >= cf.value;
        if (cf.op === "<=") return val <= cf.value;
        return val > cf.value;
      }));
    }
    return { ...geoData, features: feats };
  }, [geoData, selectedState, selectedDistrict, crossFilters]);

  const styleFeature = useCallback((feature: any) => ({
    fillColor: hexColor(feature.properties, attr),
    fillOpacity: 0.75, color: "#64748b", weight: 0.3, renderer: canvasRenderer,
  }), [attr]);

  useEffect(() => { geoJsonRef.current?.setStyle(styleFeature); }, [styleFeature]);

  const onEachFeature = useCallback((feature: any, layer: any) => {
    const p = feature.properties;
    const val = attr === "land_use" ? p.land_use : p[attr];
    const district = p.district_name ? `${p.district_name}, ` : "";
    layer.bindTooltip(`<b>${district}${p.state}</b><br/>${val}`, { sticky: true });
    layer.on("click", () => onHexClick(p));
  }, [attr, onHexClick]);

  if (!filtered) return null;

  return (
    <MapContainer center={[22.5, 80]} zoom={5} style={{ height: "100%", width: "100%" }}
      scrollWheelZoom maxBounds={[[6,68],[37,98]]} minZoom={4} maxZoom={10} ref={mapRef}>
      <SetupCanvas />
      <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>' />
      <GeoJSON ref={geoJsonRef} key={`${selectedState}-${selectedDistrict}-${crossFilters.length}-${crossFilters.map(f=>f.key+f.op+f.value).join(',')}`}
        data={filtered} style={styleFeature} onEachFeature={onEachFeature} />
      <BoundaryLayers showDistricts={showDistricts} showStates={showStates} />
    </MapContainer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HexMapPage() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const initialState = urlParams.get("state") || "All India";
  const initialDistrict = urlParams.get("district") || "All";
  const presentMode = urlParams.get("present") === "1";

  const [attr, setAttr]                       = useState("hex_risk");
  const [selectedState, setSelectedState]     = useState(initialState);
  const [selectedDistrict, setSelectedDistrict] = useState(initialDistrict);
  const [clickedHex, setClickedHex]           = useState<any | null>(null);
  const [sidebarOpen, setSidebarOpen]         = useState(!presentMode && window.innerWidth > 768);
  const [crossFilters, setCrossFilters]       = useState<CrossFilter[]>([]);
  const [showDistricts, setShowDistricts]     = useState(false);
  const [showStates, setShowStates]           = useState(true);
  const mapRef = useRef<LeafletMap | null>(null);

  const hexQ = useQuery<any>({
    queryKey: ["india-hex-props"],
    queryFn: async () => {
      try {
        const props: any[] = await fetch("/data/india_hex_props.json").then((r) => r.json());
        const features = props.map((p) => {
          const boundary = cellToBoundary(p.h3_id);
          const coords = boundary.map(([lat, lng]: [number, number]) => [lng, lat]);
          coords.push(coords[0]);
          return { type: "Feature", properties: p, geometry: { type: "Polygon", coordinates: [coords] } };
        });
        return { type: "FeatureCollection", features };
      } catch {
        // Fallback: load full GeoJSON (larger but has geometries)
        console.warn("h3-js reconstruction failed, falling back to GeoJSON");
        return fetch("/data/india_hex_grid.geojson").then((r) => r.json());
      }
    },
    staleTime: Infinity,
    retry: 1,
  });

  const features: any[] = hexQ.data?.features ?? [];

  const stateList = useMemo(
    () => Array.from(new Set(features.map((f: any) => f.properties.state).filter(Boolean))).sort() as string[],
    [features]
  );

  const districtList = useMemo(() => {
    if (selectedState === "All India") return [];
    return Array.from(new Set(
      features.filter((f: any) => f.properties.state === selectedState)
        .map((f: any) => f.properties.district_name).filter(Boolean)
    )).sort() as string[];
  }, [features, selectedState]);


  const fitToFeatures = useCallback((feats: any[]) => {
    if (!mapRef.current || !feats.length) return;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const f of feats) {
      for (const ring of (f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat())) {
        for (const [lng, lat] of ring) {
          if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
        }
      }
    }
    mapRef.current.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [20, 20] });
  }, []);

  const handleStateChange = useCallback((state: string) => {
    setSelectedState(state); setSelectedDistrict("All");
    if (state === "All India" || !hexQ.data) return;
    fitToFeatures(hexQ.data.features.filter((f: any) => f.properties.state === state));
  }, [hexQ.data, fitToFeatures]);

  const handleDistrictChange = useCallback((district: string) => {
    setSelectedDistrict(district);
    if (district === "All" || !hexQ.data) return;
    fitToFeatures(hexQ.data.features.filter((f: any) => f.properties.district_name === district));
  }, [hexQ.data, fitToFeatures]);

  useEffect(() => {
    if (!hexQ.data || initialState === "All India") return;
    const target = initialDistrict !== "All"
      ? hexQ.data.features.filter((f: any) => f.properties.district_name === initialDistrict)
      : hexQ.data.features.filter((f: any) => f.properties.state === initialState);
    if (target.length) fitToFeatures(target);
  }, [hexQ.data, initialState, initialDistrict, fitToFeatures]);

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <FilterSidebar
        collapsed={!sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)}
        attr={attr} onAttrChange={setAttr}
        selectedState={selectedState} states={stateList} onStateChange={handleStateChange}
        selectedDistrict={selectedDistrict} districts={districtList} onDistrictChange={handleDistrictChange}
        crossFilters={crossFilters} onCrossFiltersChange={setCrossFilters}
        features={features}
        showDistricts={showDistricts} onShowDistrictsChange={setShowDistricts}
        showStates={showStates} onShowStatesChange={setShowStates}
        matchCount={(() => {
          if (!crossFilters.length || !features.length) return features.length;
          return features.filter((f: any) => crossFilters.every((cf) => {
            const val = f.properties[cf.key] ?? 0;
            if (cf.op === ">=") return val >= cf.value;
            if (cf.op === "<=") return val <= cf.value;
            return val > cf.value;
          })).length;
        })()}
        totalCount={features.length}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Minimal top bar */}
        <header className={`h-10 px-3 border-b border-border/40 flex items-center gap-3 bg-background/95 backdrop-blur z-50 shrink-0 ${presentMode ? "hidden" : ""}`}>
          <Link href="/"><Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2"><ArrowLeft className="h-3 w-3" />Home</Button></Link>
          <div className="h-3 w-px bg-border/50" />
          <span className="text-xs font-semibold">ClimResWASH Hex Grid</span>
          <span className="text-[10px] text-muted-foreground">{features.length ? `${features.length.toLocaleString()} hexes` : ""}</span>
          <div className="flex-1" />
          <Link href="/forecast" className="text-[11px] text-red-400 hover:text-red-300 font-semibold">Live Forecast →</Link>
          <ThemeToggle />
        </header>

        {/* Map */}
        <div className="flex-1 relative">
          {hexQ.isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading hexes…
            </div>
          ) : hexQ.isError ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-red-400 text-sm">
              <AlertTriangle className="h-5 w-5" /> Failed to load data
            </div>
          ) : (
            <HexMap geoData={hexQ.data} attr={attr} selectedState={selectedState}
              selectedDistrict={selectedDistrict} crossFilters={crossFilters}
              mapRef={mapRef} onHexClick={setClickedHex}
              showDistricts={showDistricts} showStates={showStates} />
          )}

          {/* Clicked hex info */}
          {clickedHex && (
            <div className="absolute top-3 right-3 z-[800]">
              <HexInfoPanel props={clickedHex} onClose={() => setClickedHex(null)} />
            </div>
          )}

          {/* District summary */}
          {selectedDistrict !== "All" && (
            <div className="absolute bottom-8 right-3 z-[800]">
              <DistrictSummary features={features} district={selectedDistrict} state={selectedState} />
            </div>
          )}

          {/* Legend */}
          {features.length > 0 && (
            <div className="absolute bottom-8 left-3 z-[800]">
              <Legend attr={attr} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
