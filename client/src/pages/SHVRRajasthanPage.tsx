import { useState, useMemo, useCallback, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, useMap } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cellToBoundary } from "h3-js";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

interface School {
  name: string;
  udise_code: string | null;
  address: string | null;
  school_type: string | null;
  nep_category: string | null;
  district_raw: string | null;
  district: string;
  status: string;
  rating: number | null;
  percentage: number | null;
  lat: number | null;
  lon: number | null;
  h3_id: string | null;
  matched_village: string | null;
  location_precision: "village_match" | "district_centroid";
  in_shvr: boolean;
  school_level: "PS" | "UPS" | "SR_SEC" | null;
  block: string | null;
  self_reported_rating: number | null;
  self_reported_percentage: number | null;
  location_rural_urban: "Rural" | "Urban" | null;
  management: string | null;
  residential: "Residential" | "Non Residential" | null;
  new_classroom_requirement: boolean;
  classroom_repair_needed: boolean;
  classrooms_needing_repair: number;
  building_dilapidated: boolean;
  dilapidated_classroom_count: number;
  girls_toilet_required: number | null;
  toilet_match_method: "name_match" | null;
}

interface InfraStats {
  school_count: number;
  toilet_required_count: number; classroom_repair_needed_count: number;
  new_classroom_requirement_count: number; building_dilapidated_count: number;
  toilet_required_pct?: number; classroom_repair_pct?: number;
  new_classroom_pct?: number; dilapidated_pct?: number;
}

interface InfraSummary {
  meta: { sources: string[]; note: string };
  by_rating: Record<string, InfraStats>;
  by_self_reported_rating: Record<string, InfraStats>;
}

// Government grade-level breakdown (PS/UPS/Secondary/Sr.Secondary), full unified registry —
// sourced from the CSR files' own "school type" column, ~80% coverage (the toilet-only file
// and un-joined schools have no source for it, grouped under "unknown").
interface LevelStats extends InfraStats {
  label: string; in_shvr_count: number; avg_rating: number | null;
}
interface LevelSummary {
  meta: { note: string };
  by_level: Record<"PS" | "UPS" | "SR_SEC" | "unknown", LevelStats>;
}
const LEVEL_ORDER: ("PS" | "UPS" | "SR_SEC" | "unknown")[] = ["PS", "UPS", "SR_SEC", "unknown"];

// Straight from Toilet_Requirement_List.xlsx, independent of SHVR — no name-matching or
// linking involved, just district totals as entered in the source sheet.
interface ToiletRawStats { school_count: number; toilet_units_required: number }
interface ToiletRawSummary {
  meta: { source: string; note: string };
  by_district: Record<string, ToiletRawStats>;
}

// Full unified registry (SHVR-rated ∪ every CSR-file school) per CURRENT district — real
// percentages for all 41 districts, since total_school_count is a genuine denominator now,
// not just the SHVR-rated subset.
interface RatingBucket { count: number; pct: number | null }
interface DistrictStats {
  total_school_count: number; in_shvr_count: number; has_shvr_rating: boolean;
  avg_rating: number | null;
  self_reported_rated_count: number; avg_self_reported_rating: number | null;
  rating_distribution: Record<string, RatingBucket>;
  self_reported_rating_distribution: Record<string, RatingBucket>;
  toilet_required_count: number; classroom_repair_needed_count: number;
  new_classroom_requirement_count: number; building_dilapidated_count: number;
  toilet_required_pct: number | null; classroom_repair_pct: number | null;
  new_classroom_pct: number | null; dilapidated_pct: number | null;
}
interface DistrictFullSummary {
  meta: { note: string };
  by_district: Record<string, DistrictStats>;
}

interface DistrictSummary {
  meta: { source: string; note: string; missing_districts: string[]; no_rating_districts: string[] };
  districts: Record<string, {
    school_count: number; completed_count: number; pct_completed: number | null;
    avg_rating_all: number | null; avg_rating_completed_only: number | null;
    rating_distribution_all: Record<string, number>;
    status_counts: Record<string, number>;
  }>;
}

type HexRating = { district: string; avg_rating_all: number; avg_rating_completed_only: number; school_count: number; pct_completed: number };

const STATUS_LABEL: Record<string, string> = {
  completed: "Completed", not_assigned: "Not Assigned", in_progress: "In Progress", yet_to_start: "Yet to Start",
  not_in_shvr: "Not in SHVR", self_reported_only: "Self-Reported Only",
};
const STATUS_COLOR: Record<string, string> = {
  completed: "text-emerald-400", not_assigned: "text-muted-foreground", in_progress: "text-amber-400", yet_to_start: "text-red-400",
  not_in_shvr: "text-sky-400", self_reported_only: "text-purple-400",
};

const LEVEL_LABEL: Record<string, string> = {
  PS: "Primary (PS)", UPS: "Upper Primary (UPS)", SR_SEC: "Sr./Higher Secondary (SSS)",
  unknown: "Unknown",
};
const LEVEL_SHORT: Record<string, string> = { PS: "PS", UPS: "UPS", SR_SEC: "HS", unknown: "—" };

// ── Layer definitions ──────────────────────────────────────────────────────

interface LayerDef {
  key: string; label: string; icon: string; group: "rating" | "hazard" | "future" | "infra"; domain: [number, number];
  colorMode?: "count"; // set when a rating layer is showing a per-star school COUNT (star filter active) instead of an average
}

type InfraPctField = "toilet_required_pct" | "classroom_repair_pct" | "new_classroom_pct" | "dilapidated_pct";
type InfraCountField = "toilet_required_count" | "classroom_repair_needed_count" | "new_classroom_requirement_count" | "building_dilapidated_count";

// infra layer key -> pct field name in DistrictStats (real denominator: full union registry)
const INFRA_FIELD: Record<string, InfraPctField> = {
  infra_toilet_pct: "toilet_required_pct",
  infra_repair_pct: "classroom_repair_pct",
  infra_new_classroom_pct: "new_classroom_pct",
  infra_dilapidated_pct: "dilapidated_pct",
};
// same layer key -> raw count field name in DistrictStats
const INFRA_ABSOLUTE_FIELD: Record<string, InfraCountField> = {
  infra_toilet_pct: "toilet_required_count",
  infra_repair_pct: "classroom_repair_needed_count",
  infra_new_classroom_pct: "new_classroom_requirement_count",
  infra_dilapidated_pct: "building_dilapidated_count",
};

const LAYERS: LayerDef[] = [
  { key: "shvr_rating",         label: "SHVR Star Rating (Verified)", icon: "⭐", group: "rating", domain: [1, 5] },
  { key: "shvr_self_reported_rating", label: "SHVR Star Rating (Self-Reported)", icon: "📝", group: "rating", domain: [1, 5] },
  { key: "infra_toilet_pct",         label: "Toilet Needed %",       icon: "🚽", group: "infra", domain: [0, 100] },
  { key: "infra_repair_pct",         label: "Classroom Repair %",    icon: "🔧", group: "infra", domain: [0, 100] },
  { key: "infra_new_classroom_pct",  label: "New Classroom %",       icon: "🏗️", group: "infra", domain: [0, 100] },
  { key: "infra_dilapidated_pct",    label: "Dilapidated Building %", icon: "🧱", group: "infra", domain: [0, 100] },
  { key: "hex_risk",            label: "Max Risk (all hazards)",  icon: "⚠️", group: "hazard", domain: [0, 10] },
  { key: "flood_risk",          label: "Pluvial Flood",           icon: "🌊", group: "hazard", domain: [0, 10] },
  { key: "heat_risk",           label: "Heatwave",                icon: "🔥", group: "hazard", domain: [0, 10] },
  { key: "cyclone_risk",        label: "Cyclone",                 icon: "🌀", group: "hazard", domain: [0, 10] },
  { key: "drought_risk",        label: "Drought",                 icon: "☀️", group: "hazard", domain: [0, 10] },
  { key: "wetbulb_risk",        label: "Wet-Bulb Heat",           icon: "💧", group: "hazard", domain: [0, 10] },
  { key: "landslide_risk",      label: "Landslide",               icon: "🏔️", group: "hazard", domain: [0, 10] },
  { key: "coldwave_risk",       label: "Cold Wave",               icon: "❄️", group: "hazard", domain: [0, 10] },
  { key: "flashflood_risk",     label: "Flash Flood",             icon: "⚡", group: "hazard", domain: [0, 10] },
  { key: "sealevel_risk",       label: "Sea Level Rise",          icon: "🌊", group: "hazard", domain: [0, 10] },
  { key: "fire_risk",           label: "Forest Fire",             icon: "🔥", group: "hazard", domain: [0, 10] },
  { key: "risk_ssp245_2030",    label: "Risk 2030 (SSP2-4.5)",    icon: "🔮", group: "future", domain: [0, 10] },
  { key: "risk_ssp245_2050",    label: "Risk 2050 (SSP2-4.5)",    icon: "🔮", group: "future", domain: [0, 10] },
  { key: "risk_ssp585_2030",    label: "Risk 2030 (SSP5-8.5)",    icon: "🔴", group: "future", domain: [0, 10] },
  { key: "risk_ssp585_2050",    label: "Risk 2050 (SSP5-8.5)",    icon: "🔴", group: "future", domain: [0, 10] },
];
const LAYER_BY_KEY = Object.fromEntries(LAYERS.map((l) => [l.key, l]));

const RATING_RAMP: [number, number, number][] = [[239, 68, 68], [249, 115, 22], [234, 179, 8], [132, 204, 22], [34, 197, 94]]; // low->high, red->green
const RISK_RAMP:   [number, number, number][] = [[34, 197, 94], [234, 179, 8], [249, 115, 22], [239, 68, 68], [153, 27, 27]]; // low->high, green->red

function round1(v: number) { return Math.round(v * 10) / 10; }

function emptyRatingDistribution(): Record<string, RatingBucket> {
  return { "1": { count: 0, pct: null }, "2": { count: 0, pct: null }, "3": { count: 0, pct: null },
    "4": { count: 0, pct: null }, "5": { count: 0, pct: null } };
}

function gradientColor(ramp: [number, number, number][], t: number) {
  t = Math.max(0, Math.min(1, t));
  const s = t * (ramp.length - 1);
  const lo = Math.floor(s), hi = Math.min(lo + 1, ramp.length - 1);
  const f = s - lo;
  const a = ramp[lo], b = ramp[hi];
  return `rgb(${a.map((c, i) => Math.round(c + f * (b[i] - c))).join(",")})`;
}

function ratingColor(rating: number | null) {
  if (rating == null) return "#374151";
  return gradientColor(RATING_RAMP, (rating - 1) / 4);
}

function hazardColor(value: number | null, domain: [number, number]) {
  if (value == null) return "#374151";
  return gradientColor(RISK_RAMP, (value - domain[0]) / (domain[1] - domain[0]));
}

function layerColor(layer: LayerDef, value: number | null) {
  if (layer.colorMode === "count") return hazardColor(value, layer.domain);
  return layer.group === "rating" ? ratingColor(value) : hazardColor(value, layer.domain);
}

type InfraUnit = "pct" | "absolute";

// district-level infra value (% or raw count, both against the real full-registry
// denominator), used both for hex fill (uniform per district) and the district choropleth
function infraDistrictValue(layer: LayerDef, district: string, unit: InfraUnit,
  districtStats: Record<string, DistrictStats> | undefined): number | null {
  const field = unit === "absolute" ? INFRA_ABSOLUTE_FIELD[layer.key] : INFRA_FIELD[layer.key];
  const v = districtStats?.[district]?.[field];
  return typeof v === "number" ? v : null;
}

const canvasRenderer = L.canvas({ padding: 0.5 });
function SetupCanvas() {
  const map = useMap();
  useMemo(() => { (map as any).options.renderer = canvasRenderer; }, [map]);
  return null;
}

// ── Map ───────────────────────────────────────────────────────────────────

interface DistrictMarker { district: string; lat: number; lng: number; school_count: number; rating: number | null; layerAvg: number | null }

// Individual village-matched school points — canvas-rendered like the OSM
// schools layer on /grid, since there can be tens of thousands of them.
function SchoolPointsLayer({ schools, hexByH3Id, layer, mode }: {
  schools: School[]; hexByH3Id: Record<string, any>; layer: LayerDef; mode: "all" | "completed";
}) {
  const geoData = useMemo(() => {
    const visible = schools.filter((s) =>
      s.location_precision === "village_match" && s.lat != null && s.lon != null &&
      (mode === "all" || s.status === "completed"));
    return {
      type: "FeatureCollection",
      features: visible.map((s) => ({
        type: "Feature",
        properties: {
          name: s.name, rating: s.rating, status: s.status, village: s.matched_village, district: s.district,
          layerValue: layer.group !== "rating" ? (s.h3_id ? hexByH3Id[s.h3_id]?.[layer.key] ?? null : null) : null,
        },
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      })),
    };
  }, [schools, hexByH3Id, layer, mode]);

  const pointToLayer = useCallback((feature: any, latlng: L.LatLng) =>
    L.circleMarker(latlng, {
      radius: 3, weight: 0.6, color: "#ffffff", fillColor: ratingColor(feature.properties.rating), fillOpacity: 0.9, renderer: canvasRenderer,
    }), []);

  const onEachFeature = useCallback((feature: any, leafletLayer: any) => {
    const p = feature.properties;
    const parts = [`<b>${p.name}</b>`, `📍 ${p.village}, ${p.district}`, `${p.rating != null ? `${p.rating}★` : "no rating"} (${STATUS_LABEL[p.status] ?? p.status})`];
    if (layer.group !== "rating" && p.layerValue != null) parts.push(`${layer.icon} ${layer.label}: <b>${p.layerValue.toFixed(1)}/10</b> (this hex)`);
    leafletLayer.bindTooltip(parts.join("<br/>"), { sticky: true });
  }, [layer]);

  if (!geoData.features.length) return null;
  return <GeoJSON key={`schools-${layer.key}-${mode}`} data={geoData as any} pointToLayer={pointToLayer} onEachFeature={onEachFeature} />;
}

function RajasthanHexMap({ hexes, hexByH3Id, ratings, infraUnit, oldDistrictStats, schools, mode, layer, districtMarkers, viewMode, districtGeo, showDistrictLabels, starFilter }: {
  hexes: any[]; hexByH3Id: Record<string, any>; ratings: Record<string, HexRating>;
  infraUnit: InfraUnit;
  oldDistrictStats: Record<string, DistrictStats> | undefined; schools: School[];
  mode: "all" | "completed"; layer: LayerDef; districtMarkers: DistrictMarker[];
  viewMode: "hex" | "district"; districtGeo: any; showDistrictLabels: boolean; starFilter: number | null;
}) {
  const fmtValue = (v: number, pct?: number | null) =>
    layer.colorMode === "count" ? `${v.toLocaleString()} schools${pct != null ? ` (${pct}%)` : ""}`
    : layer.group === "rating" ? `${v.toFixed(2)}★`
    : layer.group === "infra" ? (infraUnit === "absolute" ? v.toLocaleString() : `${v.toFixed(1)}%`)
    : `${v.toFixed(1)}/10`;
  const mapRef = useRef<LeafletMap | null>(null);

  const geoData = useMemo(() => ({
    type: "FeatureCollection",
    features: hexes.map((p) => {
      const boundary = cellToBoundary(p.h3_id);
      const coords = boundary.map(([lat, lng]: [number, number]) => [lng, lat]);
      coords.push(coords[0]);
      let value: number | null;
      let pct: number | null = null;
      if (layer.group === "rating" && starFilter != null) {
        const dist = layer.key === "shvr_self_reported_rating"
          ? oldDistrictStats?.[p.district_name]?.self_reported_rating_distribution
          : oldDistrictStats?.[p.district_name]?.rating_distribution;
        const bucket = dist?.[String(starFilter)];
        value = bucket?.count ?? null;
        pct = bucket?.pct ?? null;
      } else if (layer.key === "shvr_self_reported_rating") {
        value = oldDistrictStats?.[p.district_name]?.avg_self_reported_rating ?? null;
      } else if (layer.group === "rating") {
        const r = ratings[p.h3_id];
        value = r ? (mode === "all" ? r.avg_rating_all : r.avg_rating_completed_only) : null;
      } else if (layer.group === "infra") {
        value = infraDistrictValue(layer, p.district_name, infraUnit, oldDistrictStats);
      } else {
        value = p[layer.key] ?? null;
      }
      return {
        type: "Feature",
        properties: { h3_id: p.h3_id, district: p.district_name, value, pct },
        geometry: { type: "Polygon", coordinates: [coords] },
      };
    }),
  }), [hexes, ratings, oldDistrictStats, infraUnit, mode, layer, starFilter]);

  const styleFeature = useCallback((feature: any) => ({
    fillColor: layerColor(layer, feature.properties.value), fillOpacity: 0.78, color: "#1e293b", weight: 0.3, renderer: canvasRenderer,
  }), [layer]);

  const onEachFeature = useCallback((feature: any, leafletLayer: any) => {
    const p = feature.properties;
    const label = p.value != null ? fmtValue(p.value, p.pct) : "No data";
    leafletLayer.bindTooltip(`<b>${p.district}</b><br/>${layer.label}: ${label}`, { sticky: true });
  }, [layer, infraUnit]);

  return (
    <MapContainer center={[26.5, 73.8]} zoom={7} style={{ height: "100%", width: "100%" }} scrollWheelZoom ref={mapRef}>
      <SetupCanvas />
      <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>' />
      {viewMode === "hex" && <GeoJSON key={`${mode}-${layer.key}-${infraUnit}-${starFilter}`} data={geoData as any} style={styleFeature} onEachFeature={onEachFeature} />}
      {viewMode === "district" && districtGeo && (
        <>
          <style>{`
            .district-label-tooltip { background: transparent; border: none; box-shadow: none; padding: 0;
              font-weight: 800; font-size: 12px; color: #0f172a; text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff; }
            .district-label-tooltip::before { display: none; }
          `}</style>
          <GeoJSON key={`districts-${mode}-${layer.key}-${infraUnit}-${showDistrictLabels}-${starFilter}`} data={districtGeo as any}
            style={(feature: any) => ({
              fillColor: layerColor(layer, feature.properties.value), fillOpacity: 0.7, color: "#1e293b", weight: 1, renderer: canvasRenderer,
            })}
            onEachFeature={(feature: any, leafletLayer: any) => {
              const p = feature.properties;
              const label = p.value != null ? fmtValue(p.value, p.pct) : "—";
              if (showDistrictLabels) {
                leafletLayer.bindTooltip(`${p.district}<br/>${label}`, { permanent: true, direction: "center", className: "district-label-tooltip" });
              } else {
                leafletLayer.bindTooltip(`${p.district}<br/>${label}`, { sticky: true });
              }
            }} />
        </>
      )}
      {viewMode === "hex" && <SchoolPointsLayer schools={schools} hexByH3Id={hexByH3Id} layer={layer} mode={mode} />}
      {viewMode === "hex" && districtMarkers.map((m) => (
        <CircleMarker key={m.district} center={[m.lat, m.lng]}
          radius={Math.max(5, Math.min(22, Math.sqrt(m.school_count) * 1.1))}
          pathOptions={{ color: "#ffffff", weight: 1.5, fillColor: ratingColor(m.rating), fillOpacity: 0.75, dashArray: "2 2" }}>
          <Tooltip sticky>
            <div style={{ fontSize: 11 }}>
              <b>{m.district}</b> — district centroid (address not matched)<br />
              🏫 {m.school_count.toLocaleString()} schools · {m.rating != null ? `${m.rating.toFixed(2)}★ avg (rated subset)` : "no SHVR rating"}<br />
              {layer.group !== "rating" && m.layerAvg != null && <>{layer.icon} {layer.label}: <b>{m.layerAvg.toFixed(1)}/10</b> (district avg)</>}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

function Legend({ layer, infraUnit }: { layer: LayerDef; infraUnit: InfraUnit }) {
  const ramp = layer.colorMode === "count" ? RISK_RAMP : layer.group === "rating" ? RATING_RAMP : RISK_RAMP;
  const [lo, hi] = layer.domain;
  const fmt = (v: number) => layer.colorMode === "count" ? Math.round(v).toLocaleString()
    : layer.group === "rating" ? `${v}★`
    : layer.group === "infra" ? (infraUnit === "absolute" ? Math.round(v).toLocaleString() : `${v}%`)
    : `${v}`;
  return (
    <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-2.5 shadow-lg w-48">
      <p className="text-[10px] font-semibold mb-1.5">{layer.icon} {layer.label}</p>
      <div className="h-2.5 w-full rounded-sm mb-1" style={{ background: `linear-gradient(to right, ${ramp.map((c) => `rgb(${c.join(",")})`).join(", ")})` }} />
      <div className="flex justify-between text-[9px] text-muted-foreground mb-1.5">
        <span>{fmt(lo)}</span><span>{fmt(hi)}</span>
      </div>
      <div className="flex items-center gap-1.5 mb-1">
        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#374151" }} />
        <span className="text-[9px] text-muted-foreground">No data for this hex</span>
      </div>
      <div className="flex items-center gap-1.5 mb-1">
        <div className="w-2 h-2 rounded-full border border-white" style={{ background: "#16a34a" }} />
        <span className="text-[9px] text-muted-foreground">🏫 individual school (real village location)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full border border-white border-dashed" style={{ background: "#16a34a", opacity: 0.75 }} />
        <span className="text-[9px] text-muted-foreground">district centroid (address not matched — size = count)</span>
      </div>
    </div>
  );
}

const PAGE_SIZE = 50;

function SchoolTable({ schools, districts }: { schools: School[]; districts: string[] }) {
  const [search, setSearch] = useState("");
  const [districtFilter, setDistrictFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [levelFilter, setLevelFilter] = useState("All");
  const [ratingFilter, setRatingFilter] = useState("All");
  const [toiletFilter, setToiletFilter] = useState("All");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schools.filter((s) => {
      if (districtFilter !== "All" && s.district !== districtFilter) return false;
      if (statusFilter !== "All" && s.status !== statusFilter) return false;
      if (levelFilter !== "All" && (s.school_level ?? "unknown") !== levelFilter) return false;
      if (ratingFilter === "verified_rated" && s.rating == null) return false;
      if (ratingFilter === "verified_unrated" && s.rating != null) return false;
      if (ratingFilter === "self_rated" && s.self_reported_rating == null) return false;
      if (ratingFilter === "self_unrated" && s.self_reported_rating != null) return false;
      if (toiletFilter === "needed" && s.girls_toilet_required == null) return false;
      if (toiletFilter === "not_flagged" && s.girls_toilet_required != null) return false;
      if (q && !s.name?.toLowerCase().includes(q) && !s.udise_code?.includes(q)) return false;
      return true;
    });
  }, [schools, search, districtFilter, statusFilter, levelFilter, ratingFilter, toiletFilter]);

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-border/30 flex flex-wrap gap-2 items-center bg-muted/20">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search school name or UDISE code..."
            className="w-full pl-7 pr-2 py-1.5 rounded-md border border-border/50 bg-background text-xs outline-none"
          />
        </div>
        <select value={districtFilter} onChange={(e) => { setDistrictFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs outline-none">
          <option value="All">All Districts</option>
          {districts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs outline-none">
          <option value="All">All Statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={levelFilter} onChange={(e) => { setLevelFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs outline-none">
          <option value="All">All Levels</option>
          {LEVEL_ORDER.map((k) => <option key={k} value={k}>{LEVEL_LABEL[k]}</option>)}
        </select>
        <select value={ratingFilter} onChange={(e) => { setRatingFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs outline-none">
          <option value="All">All Ratings</option>
          <option value="verified_rated">Has Verified Rating</option>
          <option value="verified_unrated">No Verified Rating</option>
          <option value="self_rated">Has Self-Reported Rating</option>
          <option value="self_unrated">No Self-Reported Rating</option>
        </select>
        <select value={toiletFilter} onChange={(e) => { setToiletFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs outline-none">
          <option value="All">All Toilet Status</option>
          <option value="needed">🚽 Toilet Needed</option>
          <option value="not_flagged">Not Flagged</option>
        </select>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{filtered.length.toLocaleString()} schools</span>
      </div>

      <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background border-b border-border/30">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">School</th>
              <th className="px-3 py-2 font-medium">UDISE Code</th>
              <th className="px-3 py-2 font-medium">District</th>
              <th className="px-3 py-2 font-medium">Level</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Infra Needs</th>
              <th className="px-3 py-2 font-medium text-right" title="State-verified rating">Rating</th>
              <th className="px-3 py-2 font-medium text-right" title="Self-reported rating">Self-Rpt.</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((s, i) => (
              <tr key={i} className="border-b border-border/10 hover:bg-muted/20">
                <td className="px-3 py-1.5">{s.name}</td>
                <td className="px-3 py-1.5 font-mono text-muted-foreground">{s.udise_code}</td>
                <td className="px-3 py-1.5">
                  {s.district}
                  {s.block && <span className="text-muted-foreground"> · {s.block}</span>}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground" title={LEVEL_LABEL[s.school_level ?? "unknown"]}>
                  {LEVEL_SHORT[s.school_level ?? "unknown"]}
                </td>
                <td className="px-3 py-1.5">
                  {s.location_precision === "village_match"
                    ? <span className="text-emerald-400">📍 {s.matched_village}</span>
                    : <span className="text-muted-foreground">district centroid</span>}
                </td>
                <td className={`px-3 py-1.5 ${STATUS_COLOR[s.status] ?? ""}`}>{STATUS_LABEL[s.status] ?? s.status}</td>
                <td className="px-3 py-1.5 space-x-1">
                  {s.building_dilapidated && <span title="Building dilapidated">🧱</span>}
                  {s.classroom_repair_needed && <span title={`${s.classrooms_needing_repair} classroom(s) need repair`}>🔧</span>}
                  {s.new_classroom_requirement && <span title="New classroom required">🏗️</span>}
                  {s.girls_toilet_required != null && <span title={`${s.girls_toilet_required} girls' toilet(s) required (name-matched)`}>🚽</span>}
                </td>
                <td className="px-3 py-1.5 text-right font-semibold" style={{ color: ratingColor(s.rating) }}>
                  {s.rating != null ? `${s.rating}★` : "—"}
                </td>
                <td className="px-3 py-1.5 text-right font-semibold" style={{ color: ratingColor(s.self_reported_rating) }}>
                  {s.self_reported_rating != null ? `${s.self_reported_rating}★` : "—"}
                </td>
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

function InfraByRatingTable({ data, title, subtitle }: { data: Record<string, InfraStats>; title: string; subtitle: string }) {
  const rows = ["5", "4", "3", "2", "1", "unrated"].filter((k) => data[k]?.school_count > 0);
  const pctColor = (pct: number | undefined) => {
    if (pct == null) return "";
    return pct >= 50 ? "#dc2626" : pct >= 25 ? "#ea580c" : pct >= 10 ? "#d97706" : "#16a34a";
  };
  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-border/30 bg-muted/20">
        <div className="text-xs font-semibold">{title}</div>
        <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{subtitle}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-border/30 bg-muted/10">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Rating</th>
              <th className="px-3 py-2 font-medium text-right">Schools</th>
              <th className="px-3 py-2 font-medium text-right">🚽 Toilet Needed</th>
              <th className="px-3 py-2 font-medium text-right">🔧 Repair Needed</th>
              <th className="px-3 py-2 font-medium text-right">🏗️ New Classroom</th>
              <th className="px-3 py-2 font-medium text-right">🧱 Dilapidated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => {
              const v = data[k];
              return (
                <tr key={k} className="border-b border-border/10">
                  <td className="px-3 py-1.5 font-semibold" style={{ color: k === "unrated" ? undefined : ratingColor(Number(k)) }}>
                    {k === "unrated" ? "Unrated" : `${k}★`}
                  </td>
                  <td className="px-3 py-1.5 text-right">{v.school_count.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-semibold" style={{ color: pctColor(v.toilet_required_pct) }}>
                    {v.toilet_required_pct}% <span className="text-muted-foreground font-normal">({v.toilet_required_count})</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold" style={{ color: pctColor(v.classroom_repair_pct) }}>
                    {v.classroom_repair_pct}% <span className="text-muted-foreground font-normal">({v.classroom_repair_needed_count})</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold" style={{ color: pctColor(v.new_classroom_pct) }}>
                    {v.new_classroom_pct}% <span className="text-muted-foreground font-normal">({v.new_classroom_requirement_count})</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold" style={{ color: pctColor(v.dilapidated_pct) }}>
                    {v.dilapidated_pct}% <span className="text-muted-foreground font-normal">({v.building_dilapidated_count})</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InfraByLevelTable({ data }: { data: LevelSummary }) {
  const rows = LEVEL_ORDER.filter((k) => data.by_level[k]?.school_count > 0);
  const pctColor = (pct: number | undefined) => {
    if (pct == null) return "";
    return pct >= 50 ? "#dc2626" : pct >= 25 ? "#ea580c" : pct >= 10 ? "#d97706" : "#16a34a";
  };
  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-border/30 bg-muted/20">
        <div className="text-xs font-semibold">🏫 Infrastructure Needs by School Level (GPS / UPS / HS)</div>
        <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
          Government grade-level classification (Primary 1-5 / Upper Primary 1-8 / Senior-Higher Secondary 1-12),
          sourced from the CSR files' own "school type" column — only the 3 UDISE-joined files carry it, so the{" "}
          {data.by_level.unknown?.school_count.toLocaleString() ?? 0} schools reached only via the name-matched
          toilet file (or not in any CSR file) fall under "Unknown". A distinct plain-"Secondary" bucket was dropped:
          the source spreadsheet uses bare "SS" inconsistently (spot-checking showed many of those rows' own school
          name says "Senior Secondary"), so it wasn't reliable enough to classify separately.
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-border/30 bg-muted/10">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Level</th>
              <th className="px-3 py-2 font-medium text-right">Schools (in SHVR)</th>
              <th className="px-3 py-2 font-medium text-right">Avg Rating</th>
              <th className="px-3 py-2 font-medium text-right">🚽 Toilet Needed</th>
              <th className="px-3 py-2 font-medium text-right">🔧 Repair Needed</th>
              <th className="px-3 py-2 font-medium text-right">🏗️ New Classroom</th>
              <th className="px-3 py-2 font-medium text-right">🧱 Dilapidated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => {
              const v = data.by_level[k];
              return (
                <tr key={k} className="border-b border-border/10">
                  <td className="px-3 py-1.5 font-semibold">{v.label}</td>
                  <td className="px-3 py-1.5 text-right">
                    {v.school_count.toLocaleString()} <span className="text-muted-foreground font-normal">({v.in_shvr_count.toLocaleString()})</span>
                  </td>
                  <td className="px-3 py-1.5 text-right" style={{ color: ratingColor(v.avg_rating) }}>
                    {v.avg_rating != null ? `${v.avg_rating.toFixed(2)}★` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold" style={{ color: pctColor(v.toilet_required_pct) }}>
                    {v.toilet_required_pct}% <span className="text-muted-foreground font-normal">({v.toilet_required_count})</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold" style={{ color: pctColor(v.classroom_repair_pct) }}>
                    {v.classroom_repair_pct}% <span className="text-muted-foreground font-normal">({v.classroom_repair_needed_count})</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold" style={{ color: pctColor(v.new_classroom_pct) }}>
                    {v.new_classroom_pct}% <span className="text-muted-foreground font-normal">({v.new_classroom_requirement_count})</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold" style={{ color: pctColor(v.dilapidated_pct) }}>
                    {v.dilapidated_pct}% <span className="text-muted-foreground font-normal">({v.building_dilapidated_count})</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ToiletRawByDistrictTable({ data }: { data: ToiletRawSummary }) {
  const rows = Object.entries(data.by_district).sort((a, b) => b[1].toilet_units_required - a[1].toilet_units_required);
  const totalSchools = rows.reduce((s, [, v]) => s + v.school_count, 0);
  const totalUnits = rows.reduce((s, [, v]) => s + v.toilet_units_required, 0);
  const maxUnits = Math.max(1, ...rows.map(([, v]) => v.toilet_units_required));
  const barColor = (v: number) => {
    const t = v / maxUnits;
    return t >= 0.5 ? "#dc2626" : t >= 0.25 ? "#ea580c" : t >= 0.1 ? "#d97706" : "#16a34a";
  };
  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-border/30 bg-muted/20">
        <div className="text-xs font-semibold">🚽 Girls' Toilet Requirement by District — straight from source, no SHVR link</div>
        <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
          Directly from {data.meta.source} — {rows.length} districts, {totalSchools.toLocaleString()} schools flagged,{" "}
          {totalUnits.toLocaleString()} toilet units required in total. Not matched or linked to any SHVR/CSR school
          record (that link is separately attempted elsewhere at lower confidence, since this file's UDISE code column
          is broken) — these are the raw district totals as entered in the sheet.
        </div>
      </div>
      <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background border-b border-border/30">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">District</th>
              <th className="px-3 py-2 font-medium text-right">Schools Flagged</th>
              <th className="px-3 py-2 font-medium text-right">Toilet Units Required</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([district, v]) => (
              <tr key={district} className="border-b border-border/10 hover:bg-muted/20">
                <td className="px-3 py-1.5 font-medium">{district}</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{v.school_count.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right font-semibold" style={{ color: barColor(v.toilet_units_required) }}>
                  {v.toilet_units_required.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/30 font-semibold">
              <td className="px-3 py-1.5">Total ({rows.length} districts)</td>
              <td className="px-3 py-1.5 text-right">{totalSchools.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right">{totalUnits.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

interface DistrictTableRow {
  district: string; avgRating: number | null; avgSelfReportedRating: number | null;
  totalSchoolCount: number; inShvrCount: number;
  toilet: number | null; repair: number | null; newRoom: number | null; dilapidated: number | null;
  hasShvrRating: boolean;
}

function DistrictInfraTable({ data, infraUnit }: { data: DistrictFullSummary; infraUnit: InfraUnit }) {
  const [sortBy, setSortBy] = useState<"toilet" | "repair" | "newRoom" | "dilapidated">("repair");
  const colorScale = (v: number | null, max: number) => {
    if (v == null) return "";
    const t = v / max;
    return t >= 0.5 ? "#dc2626" : t >= 0.25 ? "#ea580c" : t >= 0.1 ? "#d97706" : "#16a34a";
  };

  const rows = useMemo<DistrictTableRow[]>(() => {
    const field = INFRA_ABSOLUTE_FIELD, pctField = INFRA_FIELD;
    return Object.entries(data.by_district).map(([district, v]) => ({
      district, avgRating: v.avg_rating, avgSelfReportedRating: v.avg_self_reported_rating,
      totalSchoolCount: v.total_school_count, inShvrCount: v.in_shvr_count,
      hasShvrRating: v.has_shvr_rating,
      toilet: infraUnit === "absolute" ? v[field.infra_toilet_pct] as number : v[pctField.infra_toilet_pct] as number | null,
      repair: infraUnit === "absolute" ? v[field.infra_repair_pct] as number : v[pctField.infra_repair_pct] as number | null,
      newRoom: infraUnit === "absolute" ? v[field.infra_new_classroom_pct] as number : v[pctField.infra_new_classroom_pct] as number | null,
      dilapidated: infraUnit === "absolute" ? v[field.infra_dilapidated_pct] as number : v[pctField.infra_dilapidated_pct] as number | null,
    }));
  }, [data, infraUnit]);

  const maxes = useMemo(() => ({
    toilet: Math.max(1, ...rows.map((r) => r.toilet ?? 0)),
    repair: Math.max(1, ...rows.map((r) => r.repair ?? 0)),
    newRoom: Math.max(1, ...rows.map((r) => r.newRoom ?? 0)),
    dilapidated: Math.max(1, ...rows.map((r) => r.dilapidated ?? 0)),
  }), [rows]);

  const sortedRows = useMemo(() => [...rows].sort((a, b) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0)), [rows, sortBy]);

  const fmt = (v: number | null) => v == null ? "—" : infraUnit === "absolute" ? v.toLocaleString() : `${v}%`;

  const SortHeader = ({ field, children }: { field: typeof sortBy; children: React.ReactNode }) => (
    <th className="px-3 py-2 font-medium text-right cursor-pointer hover:text-foreground select-none" onClick={() => setSortBy(field)}>
      {children}{sortBy === field && " ▾"}
    </th>
  );

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-border/30 bg-muted/20">
        <div className="text-xs font-semibold">🗺️ Infrastructure Needs by District — {rows.length} districts, {infraUnit === "absolute" ? "absolute counts" : "% of all known schools"}</div>
        <div className="text-[10px] text-muted-foreground mt-1">
          Click a column header to sort. Every district's total is the full union registry (SHVR-rated schools plus every
          school in the CSR requirement files), so counts and percentages are real for all 41 districts — including the
          ones SHVR never rated a school in (marked "no SHVR").
        </div>
      </div>
      <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background border-b border-border/30">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">District</th>
              <th className="px-3 py-2 font-medium text-right" title="State-verified rating">Avg Rating</th>
              <th className="px-3 py-2 font-medium text-right" title="Self-reported rating">Self-Rpt. Rating</th>
              <th className="px-3 py-2 font-medium text-right">Schools (in SHVR)</th>
              <SortHeader field="toilet">🚽 Toilet</SortHeader>
              <SortHeader field="repair">🔧 Repair</SortHeader>
              <SortHeader field="newRoom">🏗️ New Room</SortHeader>
              <SortHeader field="dilapidated">🧱 Dilapidated</SortHeader>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.district} className="border-b border-border/10 hover:bg-muted/20">
                <td className="px-3 py-1.5 font-medium">
                  {r.district}{!r.hasShvrRating && <span className="ml-1.5 text-[9px] text-amber-400" title="No SHVR rating for this district">no SHVR</span>}
                </td>
                <td className="px-3 py-1.5 text-right" style={{ color: ratingColor(r.avgRating) }}>
                  {r.avgRating != null ? `${r.avgRating.toFixed(2)}★` : "—"}
                </td>
                <td className="px-3 py-1.5 text-right" style={{ color: ratingColor(r.avgSelfReportedRating) }}>
                  {r.avgSelfReportedRating != null ? `${r.avgSelfReportedRating.toFixed(2)}★` : "—"}
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">
                  {r.totalSchoolCount.toLocaleString()} <span className="text-[10px]">({r.inShvrCount.toLocaleString()})</span>
                </td>
                <td className="px-3 py-1.5 text-right font-semibold" style={{ color: colorScale(r.toilet, maxes.toilet) }}>{fmt(r.toilet)}</td>
                <td className="px-3 py-1.5 text-right font-semibold" style={{ color: colorScale(r.repair, maxes.repair) }}>{fmt(r.repair)}</td>
                <td className="px-3 py-1.5 text-right font-semibold" style={{ color: colorScale(r.newRoom, maxes.newRoom) }}>{fmt(r.newRoom)}</td>
                <td className="px-3 py-1.5 text-right font-semibold" style={{ color: colorScale(r.dilapidated, maxes.dilapidated) }}>{fmt(r.dilapidated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function SHVRRajasthanPage() {
  const [mode, setMode] = useState<"all" | "completed">("all");
  const [attr, setAttr] = useState("shvr_rating");
  const [viewMode, setViewMode] = useState<"hex" | "district">("hex");
  const [infraUnit, setInfraUnit] = useState<InfraUnit>("pct");
  const [showDistrictLabels, setShowDistrictLabels] = useState(true);
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const layer = LAYER_BY_KEY[attr];

  const hexQ = useQuery<any[]>({
    queryKey: ["india-hex-props-raw"],
    queryFn: () => fetch("/data/india_hex_props.json").then((r) => r.json()),
    staleTime: Infinity,
  });
  const futureQ = useQuery<any[]>({
    queryKey: ["india-hex-future"],
    queryFn: () => fetch("/data/india_hex_future.json").then((r) => r.json()),
    staleTime: Infinity,
    enabled: layer.group === "future",
  });
  const ratingsQ = useQuery<Record<string, HexRating>>({
    queryKey: ["shvr-hex-ratings"],
    queryFn: () => fetch("/data/shvr_hex_ratings_rajasthan.json").then((r) => r.json()),
    staleTime: Infinity,
  });
  const districtSummaryQ = useQuery<DistrictSummary>({
    queryKey: ["shvr-district-summary"],
    queryFn: () => fetch("/data/shvr_district_summary_rajasthan.json").then((r) => r.json()),
    staleTime: Infinity,
  });
  const schoolsQ = useQuery<School[]>({
    queryKey: ["shvr-schools-infra"],
    queryFn: () => fetch("/data/shvr_schools_infra_rajasthan.json").then((r) => r.json()),
    staleTime: Infinity,
  });
  const infraSummaryQ = useQuery<InfraSummary>({
    queryKey: ["shvr-infra-summary"],
    queryFn: () => fetch("/data/shvr_infra_by_rating_rajasthan.json").then((r) => r.json()),
    staleTime: Infinity,
  });
  const levelSummaryQ = useQuery<LevelSummary>({
    queryKey: ["shvr-infra-by-level"],
    queryFn: () => fetch("/data/shvr_infra_by_level_rajasthan.json").then((r) => r.json()),
    staleTime: Infinity,
  });
  const toiletRawQ = useQuery<ToiletRawSummary>({
    queryKey: ["shvr-toilet-raw-by-district"],
    queryFn: () => fetch("/data/shvr_toilet_raw_by_district_rajasthan.json").then((r) => r.json()),
    staleTime: Infinity,
  });
  const districtBoundaryQ = useQuery<any>({
    queryKey: ["rajasthan-districts-current"],
    queryFn: () => fetch("/data/rajasthan_districts_current.geojson").then((r) => r.json()),
    staleTime: Infinity,
  });
  const districtAbsoluteQ = useQuery<DistrictFullSummary>({
    queryKey: ["shvr-district-absolute"],
    queryFn: () => fetch("/data/shvr_district_absolute_infra_rajasthan.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const rajHexes = useMemo(() => {
    const base = hexQ.data?.filter((p) => p.state === "Rajasthan") ?? [];
    if (!futureQ.data || layer.group !== "future") return base;
    const futMap: Record<string, any> = {};
    for (const f of futureQ.data) futMap[f.h3_id] = f;
    return base.map((p) => ({ ...p, ...(futMap[p.h3_id] ?? {}) }));
  }, [hexQ.data, futureQ.data, layer.group]);

  const hexByH3Id = useMemo(() => Object.fromEntries(rajHexes.map((p) => [p.h3_id, p])), [rajHexes]);

  const districts = useMemo(() => Object.keys(districtSummaryQ.data?.districts ?? {}).sort(), [districtSummaryQ.data]);

  const visibleSchools = useMemo(() =>
    schoolsQ.data?.filter((s) => mode === "all" || s.status === "completed") ?? [],
  [schoolsQ.data, mode]);

  const matchStats = useMemo(() => {
    const total = schoolsQ.data?.length ?? 0;
    const inShvr = schoolsQ.data?.filter((s) => s.in_shvr).length ?? 0;
    // a subset of SHVR-portal districts were exported from a "school directory" view with no
    // star rating at all (not low-rated — genuinely absent), distinct from CSR-only schools
    const rated = schoolsQ.data?.filter((s) => s.in_shvr && s.rating != null).length ?? 0;
    const inShvrUnrated = inShvr - rated;
    const notInShvr = total - inShvr;
    // village-matching only ran against SHVR-portal schools — CSR-only additions always
    // sit at their district centroid, since they never went through address geocoding.
    const matched = schoolsQ.data?.filter((s) => s.location_precision === "village_match").length ?? 0;
    return { total, inShvr, rated, inShvrUnrated, notInShvr, matched };
  }, [schoolsQ.data]);

  // District centroids for the REMAINDER only — schools whose address didn't match a
  // village get an aggregate marker here; matched ones render as individual points instead.
  const districtMarkers = useMemo<DistrictMarker[]>(() => {
    if (!rajHexes.length || !visibleSchools.length) return [];
    const unmatched = visibleSchools.filter((s) => s.location_precision === "district_centroid");
    const centroidByDistrict: Record<string, { lat: number; lng: number; n: number; layerVals: number[] }> = {};
    for (const p of rajHexes) {
      const d = p.district_name;
      if (!d) continue;
      const boundary = cellToBoundary(p.h3_id);
      const clat = boundary.reduce((s: number, b: number[]) => s + b[0], 0) / boundary.length;
      const clng = boundary.reduce((s: number, b: number[]) => s + b[1], 0) / boundary.length;
      const entry = (centroidByDistrict[d] ??= { lat: 0, lng: 0, n: 0, layerVals: [] });
      entry.lat += clat; entry.lng += clng; entry.n += 1;
      if (layer.group !== "rating" && p[layer.key] != null) entry.layerVals.push(p[layer.key]);
    }
    const byDistrict: Record<string, { rated: number[]; count: number }> = {};
    for (const s of unmatched) {
      const entry = (byDistrict[s.district] ??= { rated: [], count: 0 });
      entry.count += 1;
      if (s.rating != null) entry.rated.push(s.rating);
    }
    return Object.entries(byDistrict).map(([district, v]) => {
      const c = centroidByDistrict[district];
      if (!c) return null;
      return {
        district, lat: c.lat / c.n, lng: c.lng / c.n,
        school_count: v.count,
        rating: v.rated.length ? v.rated.reduce((s, x) => s + x, 0) / v.rated.length : null,
        layerAvg: c.layerVals.length ? c.layerVals.reduce((s, x) => s + x, 0) / c.layerVals.length : null,
      };
    }).filter((m): m is DistrictMarker => m !== null);
  }, [rajHexes, visibleSchools, layer]);

  // Per-district average of a hazard/future hex value — used to color the district choropleth
  const hexAvgByDistrict = useMemo<Record<string, number | null>>(() => {
    if (layer.group === "rating" || layer.group === "infra" || !rajHexes.length) return {};
    const sums: Record<string, { total: number; n: number }> = {};
    for (const p of rajHexes) {
      const d = p.district_name;
      const v = p[layer.key];
      if (!d || v == null) continue;
      const entry = (sums[d] ??= { total: 0, n: 0 });
      entry.total += v; entry.n += 1;
    }
    return Object.fromEntries(Object.entries(sums).map(([d, s]) => [d, s.total / s.n]));
  }, [rajHexes, layer]);

  // Full per-current-district stats (rating + infra, real denominator across the whole union
  // registry) come straight from the backend now — no client-side recomputation needed.
  const currentDistrictStats = districtAbsoluteQ.data?.by_district ?? {};

  // Total statewide school count at each star (1-5), for the active rating layer — shown
  // directly on the star-filter buttons. District AVERAGES cluster too tightly around 3★ to
  // be useful for filtering (see starFilter below, which instead shows per-district counts).
  const starTotalCounts = useMemo<Record<number, number>>(() => {
    const src = attr === "shvr_self_reported_rating" ? infraSummaryQ.data?.by_self_reported_rating : infraSummaryQ.data?.by_rating;
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const star of [1, 2, 3, 4, 5]) counts[star] = src?.[String(star)]?.school_count ?? 0;
    return counts;
  }, [infraSummaryQ.data, attr]);

  // Rolled up to OLD district boundaries (summed counts across current-boundary children,
  // pct recomputed against the summed total) — used for hex-view coloring, since hexes only
  // know the old/coarser district.
  const oldDistrictStats = useMemo<Record<string, DistrictStats>>(() => {
    if (!districtBoundaryQ.data || !districtAbsoluteQ.data) return {};
    const byOld: Record<string, DistrictStats> = {};
    const selfReportedWeightedSum: Record<string, number> = {};
    for (const f of districtBoundaryQ.data.features) {
      const current = f.properties.NAME;
      const old = f.properties.OLD_DISTRICT ?? current;
      const stats = districtAbsoluteQ.data.by_district[current];
      if (!stats) continue;
      const entry = (byOld[old] ??= {
        total_school_count: 0, in_shvr_count: 0, has_shvr_rating: false, avg_rating: null,
        self_reported_rated_count: 0, avg_self_reported_rating: null,
        rating_distribution: emptyRatingDistribution(), self_reported_rating_distribution: emptyRatingDistribution(),
        toilet_required_count: 0, classroom_repair_needed_count: 0, new_classroom_requirement_count: 0, building_dilapidated_count: 0,
        toilet_required_pct: null, classroom_repair_pct: null, new_classroom_pct: null, dilapidated_pct: null,
      });
      entry.total_school_count += stats.total_school_count;
      entry.in_shvr_count += stats.in_shvr_count;
      entry.toilet_required_count += stats.toilet_required_count;
      entry.classroom_repair_needed_count += stats.classroom_repair_needed_count;
      entry.new_classroom_requirement_count += stats.new_classroom_requirement_count;
      entry.building_dilapidated_count += stats.building_dilapidated_count;
      entry.has_shvr_rating = entry.has_shvr_rating || stats.has_shvr_rating;
      entry.self_reported_rated_count += stats.self_reported_rated_count;
      if (stats.avg_self_reported_rating != null) {
        selfReportedWeightedSum[old] = (selfReportedWeightedSum[old] ?? 0) + stats.avg_self_reported_rating * stats.self_reported_rated_count;
      }
      for (const r of ["1", "2", "3", "4", "5"]) {
        entry.rating_distribution[r].count += stats.rating_distribution[r]?.count ?? 0;
        entry.self_reported_rating_distribution[r].count += stats.self_reported_rating_distribution[r]?.count ?? 0;
      }
    }
    for (const [old, entry] of Object.entries(byOld)) {
      if (entry.self_reported_rated_count) {
        entry.avg_self_reported_rating = round1((selfReportedWeightedSum[old] ?? 0) / entry.self_reported_rated_count);
      }
      if (!entry.total_school_count) continue;
      entry.toilet_required_pct = round1(100 * entry.toilet_required_count / entry.total_school_count);
      entry.classroom_repair_pct = round1(100 * entry.classroom_repair_needed_count / entry.total_school_count);
      entry.new_classroom_pct = round1(100 * entry.new_classroom_requirement_count / entry.total_school_count);
      entry.dilapidated_pct = round1(100 * entry.building_dilapidated_count / entry.total_school_count);
      for (const r of ["1", "2", "3", "4", "5"]) {
        entry.rating_distribution[r].pct = round1(100 * entry.rating_distribution[r].count / entry.total_school_count);
        entry.self_reported_rating_distribution[r].pct = round1(100 * entry.self_reported_rating_distribution[r].count / entry.total_school_count);
      }
    }
    return byOld;
  }, [districtBoundaryQ.data, districtAbsoluteQ.data]);

  // Infra layers colored in absolute mode need a data-driven domain (repair counts range into
  // the thousands, toilet counts into the hundreds) — rating/hazard/future/pct keep fixed domains.
  // A rating layer with the star filter active switches to showing a per-district SCHOOL COUNT
  // at that exact star (not an average), which needs the same data-driven domain treatment.
  const effectiveLayer = useMemo<LayerDef>(() => {
    if (layer.group === "rating" && starFilter != null && districtAbsoluteQ.data) {
      const distKey = layer.key === "shvr_self_reported_rating" ? "self_reported_rating_distribution" : "rating_distribution";
      const max = Math.max(1, ...Object.values(districtAbsoluteQ.data.by_district).map((d) => d[distKey]?.[String(starFilter)]?.count ?? 0));
      // 1-2★ = a bad rating, so MORE of them is worse → red=high (domain [0,max], the default).
      // 3-5★ = a good rating, so MORE of them is better → flip to green=high (domain [max,0]).
      const domain: [number, number] = starFilter >= 3 ? [max, 0] : [0, max];
      return { ...layer, domain, colorMode: "count" };
    }
    if (layer.group !== "infra" || infraUnit !== "absolute" || !districtAbsoluteQ.data) return layer;
    const field = INFRA_ABSOLUTE_FIELD[layer.key];
    const max = Math.max(1, ...Object.values(districtAbsoluteQ.data.by_district).map((d) => d[field] ?? 0));
    return { ...layer, domain: [0, max] };
  }, [layer, infraUnit, districtAbsoluteQ.data, starFilter]);

  const districtGeo = useMemo(() => {
    if (!districtBoundaryQ.data) return null;
    return {
      type: "FeatureCollection",
      features: districtBoundaryQ.data.features.map((f: any) => {
        const district = f.properties.NAME;
        const oldDistrict = f.properties.OLD_DISTRICT ?? district;
        let value: number | null;
        let pct: number | null = null;
        if (layer.group === "rating" && starFilter != null) {
          const dist = layer.key === "shvr_self_reported_rating"
            ? currentDistrictStats[district]?.self_reported_rating_distribution
            : currentDistrictStats[district]?.rating_distribution;
          const bucket = dist?.[String(starFilter)];
          value = bucket?.count ?? null;
          pct = bucket?.pct ?? null;
        } else if (layer.key === "shvr_self_reported_rating") value = currentDistrictStats[district]?.avg_self_reported_rating ?? null;
        else if (layer.group === "rating") value = currentDistrictStats[district]?.avg_rating ?? null;
        else if (layer.group === "infra") value = infraDistrictValue(layer, district, infraUnit, currentDistrictStats);
        else value = hexAvgByDistrict[oldDistrict] ?? null;
        return { ...f, properties: { ...f.properties, district, value, pct } };
      }),
    };
  }, [districtBoundaryQ.data, layer, infraUnit, currentDistrictStats, hexAvgByDistrict, districtAbsoluteQ.data, starFilter]);

  const isLoading = hexQ.isLoading || ratingsQ.isLoading || districtSummaryQ.isLoading || (layer.group === "future" && futureQ.isLoading);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <header className="h-10 px-3 border-b border-border/40 flex items-center gap-3 bg-background/95 backdrop-blur z-50 shrink-0">
        <Link href="/"><Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2"><ArrowLeft className="h-3 w-3" />Home</Button></Link>
        <div className="h-3 w-px bg-border/50" />
        <span className="text-xs font-semibold">SHVR School Ratings — Rajasthan</span>
        <div className="flex-1" />
        <ThemeToggle />
      </header>

      {districtSummaryQ.data && (
        <div className="px-4 py-2 border-b border-border/30 bg-amber-500/5 text-[11px] text-muted-foreground leading-relaxed">
          ⚠️ This is the full union of every school that appears in either data source —{" "}
          <strong className="text-foreground">{matchStats.total.toLocaleString()} schools</strong> total:{" "}
          <strong className="text-emerald-400">{matchStats.inShvr.toLocaleString()}</strong> appear on the SHVR portal
          ({matchStats.rated.toLocaleString()} with a completed star rating; {matchStats.inShvrUnrated.toLocaleString()} more
          from districts only exported as a school directory listing — real SHVR records, but no rating column at all){" "}
          {districtSummaryQ.data.meta.missing_districts.length > 0 && (
            <>(missing entirely: <strong className="text-foreground">{districtSummaryQ.data.meta.missing_districts.join(", ")}</strong>) </>
          )}
          — covering {districts.length} of Rajasthan's 33 old/undivided districts on the SHVR portal
          {districtSummaryQ.data.meta.no_rating_districts.length > 0 && (
            <>, though <strong className="text-foreground">{districtSummaryQ.data.meta.no_rating_districts.join(", ")}</strong> have
            no rated school at all yet (school-directory-only districts)</>
          )} — plus{" "}
          <strong className="text-sky-400">{matchStats.notInShvr.toLocaleString()}</strong> more that never appear on the SHVR
          portal at all but do appear in the UNICEF CSR infrastructure-requirement files (repair / new classroom / dilapidated
          building / toilet), which cover all 41 current districts directly. Infrastructure percentages below are computed
          against this full total, not just the rated subset — so a district can show a real repair rate even with no star
          rating.{" "}
          {matchStats.total > 0 && (
            <><strong className="text-emerald-400">{matchStats.matched.toLocaleString()}</strong> of the {matchStats.inShvr.toLocaleString()}{" "}
            SHVR-portal schools ({(100 * matchStats.matched / Math.max(1, matchStats.inShvr)).toFixed(0)}%) matched their address to a real
            village location (dots below); the rest — including all CSR-only schools, which were never geocoded — sit at their
            district's centroid (dashed circles).</>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Map layer:</span>
            <select value={attr} onChange={(e) => setAttr(e.target.value)}
              className="rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs outline-none">
              <optgroup label="School Ratings">
                {LAYERS.filter((l) => l.group === "rating").map((l) => <option key={l.key} value={l.key}>{l.icon} {l.label}</option>)}
              </optgroup>
              <optgroup label="Infrastructure Needs">
                {LAYERS.filter((l) => l.group === "infra").map((l) => <option key={l.key} value={l.key}>{l.icon} {l.label}</option>)}
              </optgroup>
              <optgroup label="Current Hazards">
                {LAYERS.filter((l) => l.group === "hazard").map((l) => <option key={l.key} value={l.key}>{l.icon} {l.label}</option>)}
              </optgroup>
              <optgroup label="Future Projections">
                {LAYERS.filter((l) => l.group === "future").map((l) => <option key={l.key} value={l.key}>{l.icon} {l.label}</option>)}
              </optgroup>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Map view:</span>
            <button onClick={() => setViewMode("hex")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium ${viewMode === "hex" ? "bg-emerald-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
              ⬡ Hex Grid
            </button>
            <button onClick={() => setViewMode("district")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium ${viewMode === "district" ? "bg-emerald-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
              🗺️ Districts
            </button>
          </div>
          {viewMode === "district" && (
            <button onClick={() => setShowDistrictLabels((v) => !v)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium ${showDistrictLabels ? "bg-emerald-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
              {showDistrictLabels ? "🏷️ Labels On" : "🏷️ Labels Off"}
            </button>
          )}
          {layer.group === "infra" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Show as:</span>
              <button onClick={() => setInfraUnit("pct")}
                className={`px-2.5 py-1 rounded text-[11px] font-medium ${infraUnit === "pct" ? "bg-emerald-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
                % of schools
              </button>
              <button onClick={() => setInfraUnit("absolute")}
                className={`px-2.5 py-1 rounded text-[11px] font-medium ${infraUnit === "absolute" ? "bg-emerald-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
                # schools (all 41 districts)
              </button>
            </div>
          )}
          {layer.group === "rating" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground" title="Selecting a star colors each district by how many of ITS schools have that exact rating (count + % of the district's total), instead of the district-wide average.">
                Star filter (schools per district):
              </span>
              <button onClick={() => setStarFilter(null)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium ${starFilter === null ? "bg-emerald-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
                Avg. Rating
              </button>
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} onClick={() => setStarFilter(star === starFilter ? null : star)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium ${starFilter === star ? "bg-emerald-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
                  {star}★ ({starTotalCounts[star].toLocaleString()})
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">School rating basis:</span>
            <button onClick={() => setMode("all")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium ${mode === "all" ? "bg-emerald-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
              All schools ({schoolsQ.data?.length.toLocaleString() ?? "…"})
            </button>
            <button onClick={() => setMode("completed")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium ${mode === "completed" ? "bg-emerald-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
              Completed only ({districtSummaryQ.data ? Object.values(districtSummaryQ.data.districts).reduce((s, d) => s + d.completed_count, 0).toLocaleString() : "…"})
            </button>
          </div>
        </div>

        <div className="h-[60vh] rounded-lg overflow-hidden border border-border/40 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading Rajasthan hexes…
            </div>
          ) : (
            <>
              <RajasthanHexMap hexes={rajHexes} hexByH3Id={hexByH3Id} ratings={ratingsQ.data ?? {}}
                infraUnit={infraUnit} oldDistrictStats={oldDistrictStats}
                schools={visibleSchools} mode={mode} layer={effectiveLayer}
                districtMarkers={districtMarkers} viewMode={viewMode} districtGeo={districtGeo}
                showDistrictLabels={showDistrictLabels} starFilter={layer.group === "rating" ? starFilter : null} />
              <div className="absolute bottom-3 left-3 z-[800]"><Legend layer={effectiveLayer} infraUnit={infraUnit} /></div>
            </>
          )}
        </div>

        {infraSummaryQ.data && (
          <InfraByRatingTable data={infraSummaryQ.data.by_rating} title="🏗️ Infrastructure Needs by SHVR Rating (Verified)"
            subtitle="From UNICEF Rajasthan CSR requirement lists, keyed by the state-VERIFIED rating (only 26 of 33 old districts have one — the other 7's schools fall under Unrated here, not because they scored low)." />
        )}
        {infraSummaryQ.data && (
          <InfraByRatingTable data={infraSummaryQ.data.by_self_reported_rating} title="📝 Infrastructure Needs by SHVR Rating (Self-Reported)"
            subtitle="Same breakdown, keyed by the school's own self-assessment rating instead — covers all 41 current districts. Unrated here means the school never appears in the self-reported SHVR export (mostly CSR-only schools)." />
        )}
        {levelSummaryQ.data && <InfraByLevelTable data={levelSummaryQ.data} />}
        {toiletRawQ.data && <ToiletRawByDistrictTable data={toiletRawQ.data} />}
        {districtAbsoluteQ.data && (
          <DistrictInfraTable data={districtAbsoluteQ.data} infraUnit={infraUnit} />
        )}

        {schoolsQ.isLoading ? (
          <div className="text-xs text-muted-foreground py-4 text-center">Loading school list…</div>
        ) : schoolsQ.data ? (
          <SchoolTable schools={schoolsQ.data} districts={districts} />
        ) : null}
      </div>
    </div>
  );
}
