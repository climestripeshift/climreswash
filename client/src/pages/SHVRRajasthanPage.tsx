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
  new_classroom_requirement: boolean;
  classroom_repair_needed: boolean;
  classrooms_needing_repair: number;
  building_dilapidated: boolean;
  dilapidated_classroom_count: number;
  girls_toilet_required: number | null;
  toilet_match_method: "name_match" | null;
}

interface InfraStats {
  school_count: number; avg_rating?: number | null;
  toilet_required_count: number; classroom_repair_needed_count: number;
  new_classroom_requirement_count: number; building_dilapidated_count: number;
  toilet_required_pct?: number; classroom_repair_pct?: number;
  new_classroom_pct?: number; dilapidated_pct?: number;
}

interface InfraSummary {
  meta: { sources: string[]; note: string };
  by_rating: Record<string, InfraStats>;
  by_district: Record<string, InfraStats>;
}

interface DistrictSummary {
  meta: { source: string; note: string; missing_districts: string[] };
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
};
const STATUS_COLOR: Record<string, string> = {
  completed: "text-emerald-400", not_assigned: "text-muted-foreground", in_progress: "text-amber-400", yet_to_start: "text-red-400",
};

// ── Layer definitions ──────────────────────────────────────────────────────

interface LayerDef { key: string; label: string; icon: string; group: "rating" | "hazard" | "future" | "infra"; domain: [number, number] }

// infra layer key -> field name in InfraStats (by_district / by_rating)
const INFRA_FIELD: Record<string, keyof InfraStats> = {
  infra_toilet_pct: "toilet_required_pct",
  infra_repair_pct: "classroom_repair_pct",
  infra_new_classroom_pct: "new_classroom_pct",
  infra_dilapidated_pct: "dilapidated_pct",
};

const LAYERS: LayerDef[] = [
  { key: "shvr_rating",         label: "SHVR Star Rating",        icon: "⭐", group: "rating", domain: [1, 5] },
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
  return layer.group === "rating" ? ratingColor(value) : hazardColor(value, layer.domain);
}

// district-level infra %, used both for hex fill (uniform per district) and the district choropleth
function infraDistrictValue(layer: LayerDef, district: string, infraByDistrict: Record<string, InfraStats> | undefined): number | null {
  const field = INFRA_FIELD[layer.key];
  const v = infraByDistrict?.[district]?.[field];
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

function RajasthanHexMap({ hexes, hexByH3Id, ratings, infraByDistrict, schools, mode, layer, districtMarkers, viewMode, districtGeo }: {
  hexes: any[]; hexByH3Id: Record<string, any>; ratings: Record<string, HexRating>;
  infraByDistrict: Record<string, InfraStats> | undefined; schools: School[];
  mode: "all" | "completed"; layer: LayerDef; districtMarkers: DistrictMarker[];
  viewMode: "hex" | "district"; districtGeo: any;
}) {
  const mapRef = useRef<LeafletMap | null>(null);

  const geoData = useMemo(() => ({
    type: "FeatureCollection",
    features: hexes.map((p) => {
      const boundary = cellToBoundary(p.h3_id);
      const coords = boundary.map(([lat, lng]: [number, number]) => [lng, lat]);
      coords.push(coords[0]);
      let value: number | null;
      if (layer.group === "rating") {
        const r = ratings[p.h3_id];
        value = r ? (mode === "all" ? r.avg_rating_all : r.avg_rating_completed_only) : null;
      } else if (layer.group === "infra") {
        value = infraDistrictValue(layer, p.district_name, infraByDistrict);
      } else {
        value = p[layer.key] ?? null;
      }
      return {
        type: "Feature",
        properties: { h3_id: p.h3_id, district: p.district_name, value },
        geometry: { type: "Polygon", coordinates: [coords] },
      };
    }),
  }), [hexes, ratings, infraByDistrict, mode, layer]);

  const styleFeature = useCallback((feature: any) => ({
    fillColor: layerColor(layer, feature.properties.value), fillOpacity: 0.78, color: "#1e293b", weight: 0.3, renderer: canvasRenderer,
  }), [layer]);

  const onEachFeature = useCallback((feature: any, leafletLayer: any) => {
    const p = feature.properties;
    const label = p.value != null ? (layer.group === "rating" ? `${p.value.toFixed(2)}★` : `${p.value.toFixed(1)}/10`) : "No data";
    leafletLayer.bindTooltip(`<b>${p.district}</b><br/>${layer.label}: ${label}`, { sticky: true });
  }, [layer]);

  return (
    <MapContainer center={[26.5, 73.8]} zoom={7} style={{ height: "100%", width: "100%" }} scrollWheelZoom ref={mapRef}>
      <SetupCanvas />
      <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>' />
      {viewMode === "hex" && <GeoJSON key={`${mode}-${layer.key}`} data={geoData as any} style={styleFeature} onEachFeature={onEachFeature} />}
      {viewMode === "district" && districtGeo && (
        <GeoJSON key={`districts-${mode}-${layer.key}`} data={districtGeo as any}
          style={(feature: any) => ({
            fillColor: layerColor(layer, feature.properties.value), fillOpacity: 0.65, color: "#1e293b", weight: 1, renderer: canvasRenderer,
          })}
          onEachFeature={(feature: any, leafletLayer: any) => {
            const p = feature.properties;
            const label = p.value != null ? (layer.group === "rating" ? `${p.value.toFixed(2)}★` : layer.group === "infra" ? `${p.value.toFixed(1)}%` : `${p.value.toFixed(1)}/10`) : "No data";
            leafletLayer.bindTooltip(`<b>${p.district}</b><br/>${layer.label}: ${label}`, { sticky: true });
          }} />
      )}
      <SchoolPointsLayer schools={schools} hexByH3Id={hexByH3Id} layer={layer} mode={mode} />
      {districtMarkers.map((m) => (
        <CircleMarker key={m.district} center={[m.lat, m.lng]}
          radius={Math.max(5, Math.min(22, Math.sqrt(m.school_count) * 1.1))}
          pathOptions={{ color: "#ffffff", weight: 1.5, fillColor: ratingColor(m.rating), fillOpacity: 0.75, dashArray: "2 2" }}>
          <Tooltip sticky>
            <div style={{ fontSize: 11 }}>
              <b>{m.district}</b> — district centroid (address not matched)<br />
              🏫 {m.school_count.toLocaleString()} SHVR schools · {m.rating != null ? `${m.rating.toFixed(2)}★ avg` : "no rating"}<br />
              {layer.group !== "rating" && m.layerAvg != null && <>{layer.icon} {layer.label}: <b>{m.layerAvg.toFixed(1)}/10</b> (district avg)</>}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

function Legend({ layer }: { layer: LayerDef }) {
  const ramp = layer.group === "rating" ? RATING_RAMP : RISK_RAMP;
  const [lo, hi] = layer.domain;
  const fmt = (v: number) => layer.group === "rating" ? `${v}★` : layer.group === "infra" ? `${v}%` : `${v}`;
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
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schools.filter((s) => {
      if (districtFilter !== "All" && s.district !== districtFilter) return false;
      if (statusFilter !== "All" && s.status !== statusFilter) return false;
      if (q && !s.name?.toLowerCase().includes(q) && !s.udise_code?.includes(q)) return false;
      return true;
    });
  }, [schools, search, districtFilter, statusFilter]);

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
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{filtered.length.toLocaleString()} schools</span>
      </div>

      <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background border-b border-border/30">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">School</th>
              <th className="px-3 py-2 font-medium">UDISE Code</th>
              <th className="px-3 py-2 font-medium">District</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Infra Needs</th>
              <th className="px-3 py-2 font-medium text-right">Rating</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((s, i) => (
              <tr key={i} className="border-b border-border/10 hover:bg-muted/20">
                <td className="px-3 py-1.5">{s.name}</td>
                <td className="px-3 py-1.5 font-mono text-muted-foreground">{s.udise_code}</td>
                <td className="px-3 py-1.5">{s.district}</td>
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

function InfraByRatingTable({ data }: { data: InfraSummary }) {
  const rows = ["5", "4", "3", "2", "1", "unrated"].filter((k) => data.by_rating[k]?.school_count > 0);
  const pctColor = (pct: number | undefined) => {
    if (pct == null) return "";
    return pct >= 50 ? "#dc2626" : pct >= 25 ? "#ea580c" : pct >= 10 ? "#d97706" : "#16a34a";
  };
  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-border/30 bg-muted/20">
        <div className="text-xs font-semibold">🏗️ Infrastructure Needs by SHVR Rating</div>
        <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
          From UNICEF Rajasthan CSR requirement lists (new classroom / repair / dilapidated building — joined by UDISE
          code; toilet requirement — the source file's UDISE column was found broken, matched by school name within
          district instead, lower confidence).
        </div>
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
              const v = data.by_rating[k];
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

function DistrictInfraTable({ data, avgRatingByDistrict }: { data: InfraSummary; avgRatingByDistrict: Record<string, number | null> }) {
  const [sortBy, setSortBy] = useState<keyof InfraStats>("classroom_repair_pct");
  const pctColor = (pct: number | undefined) => {
    if (pct == null) return "";
    return pct >= 50 ? "#dc2626" : pct >= 25 ? "#ea580c" : pct >= 10 ? "#d97706" : "#16a34a";
  };
  const rows = useMemo(() =>
    Object.entries(data.by_district).sort((a, b) => ((b[1][sortBy] as number) ?? 0) - ((a[1][sortBy] as number) ?? 0)),
  [data, sortBy]);

  const SortHeader = ({ field, children }: { field: keyof InfraStats; children: React.ReactNode }) => (
    <th className="px-3 py-2 font-medium text-right cursor-pointer hover:text-foreground select-none" onClick={() => setSortBy(field)}>
      {children}{sortBy === field && " ▾"}
    </th>
  );

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-border/30 bg-muted/20">
        <div className="text-xs font-semibold">🗺️ Infrastructure Needs by District</div>
        <div className="text-[10px] text-muted-foreground mt-1">Click a column header to sort. Same sources as the rating breakdown above.</div>
      </div>
      <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background border-b border-border/30">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">District</th>
              <th className="px-3 py-2 font-medium text-right">Avg Rating</th>
              <th className="px-3 py-2 font-medium text-right">Schools</th>
              <SortHeader field="toilet_required_pct">🚽 Toilet</SortHeader>
              <SortHeader field="classroom_repair_pct">🔧 Repair</SortHeader>
              <SortHeader field="new_classroom_pct">🏗️ New Room</SortHeader>
              <SortHeader field="dilapidated_pct">🧱 Dilapidated</SortHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map(([district, v]) => (
              <tr key={district} className="border-b border-border/10 hover:bg-muted/20">
                <td className="px-3 py-1.5 font-medium">{district}</td>
                <td className="px-3 py-1.5 text-right" style={{ color: ratingColor(avgRatingByDistrict[district] ?? null) }}>
                  {avgRatingByDistrict[district] != null ? `${avgRatingByDistrict[district]!.toFixed(2)}★` : "—"}
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{v.school_count.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right font-semibold" style={{ color: pctColor(v.toilet_required_pct) }}>{v.toilet_required_pct}%</td>
                <td className="px-3 py-1.5 text-right font-semibold" style={{ color: pctColor(v.classroom_repair_pct) }}>{v.classroom_repair_pct}%</td>
                <td className="px-3 py-1.5 text-right font-semibold" style={{ color: pctColor(v.new_classroom_pct) }}>{v.new_classroom_pct}%</td>
                <td className="px-3 py-1.5 text-right font-semibold" style={{ color: pctColor(v.dilapidated_pct) }}>{v.dilapidated_pct}%</td>
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
  const districtBoundaryQ = useQuery<any>({
    queryKey: ["india-districts-boundary"],
    queryFn: () => fetch("/data/india.json").then((r) => r.json()),
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
    const matched = schoolsQ.data?.filter((s) => s.location_precision === "village_match").length ?? 0;
    return { total, matched };
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

  const avgRatingByDistrict = useMemo<Record<string, number | null>>(() => {
    if (!districtSummaryQ.data) return {};
    return Object.fromEntries(Object.entries(districtSummaryQ.data.districts).map(([d, v]) =>
      [d, mode === "all" ? v.avg_rating_all : v.avg_rating_completed_only]));
  }, [districtSummaryQ.data, mode]);

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

  const districtGeo = useMemo(() => {
    if (!districtBoundaryQ.data) return null;
    const features = districtBoundaryQ.data.features.filter((f: any) => f.properties.STATE === "Rajasthan");
    return {
      type: "FeatureCollection",
      features: features.map((f: any) => {
        const district = f.properties.NAME;
        let value: number | null;
        if (layer.group === "rating") value = avgRatingByDistrict[district] ?? null;
        else if (layer.group === "infra") value = infraDistrictValue(layer, district, infraSummaryQ.data?.by_district);
        else value = hexAvgByDistrict[district] ?? null;
        return { ...f, properties: { ...f.properties, district, value } };
      }),
    };
  }, [districtBoundaryQ.data, layer, avgRatingByDistrict, hexAvgByDistrict, infraSummaryQ.data]);

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
          ⚠️ Covers {districts.length} of Rajasthan's 33 districts (old/undivided boundaries) — missing:{" "}
          <strong className="text-foreground">{districtSummaryQ.data.meta.missing_districts.join(", ")}</strong>.{" "}
          {matchStats.total > 0 && (
            <><strong className="text-emerald-400">{matchStats.matched.toLocaleString()}</strong> of {matchStats.total.toLocaleString()} schools
            ({(100 * matchStats.matched / matchStats.total).toFixed(0)}%) matched their address to a real village location
            (dots below); the rest sit at their district's centroid (dashed circles) since SHVR gives no coordinates and their
            address text didn't resolve. Includes all records regardless of evaluation status — most are "Not Assigned" and
            their rating may be a stale placeholder.</>
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">School rating basis:</span>
            <button onClick={() => setMode("all")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium ${mode === "all" ? "bg-emerald-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
              All records ({schoolsQ.data?.length.toLocaleString() ?? "…"})
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
                infraByDistrict={infraSummaryQ.data?.by_district} schools={visibleSchools} mode={mode} layer={layer}
                districtMarkers={districtMarkers} viewMode={viewMode} districtGeo={districtGeo} />
              <div className="absolute bottom-3 left-3 z-[800]"><Legend layer={layer} /></div>
            </>
          )}
        </div>

        {infraSummaryQ.data && <InfraByRatingTable data={infraSummaryQ.data} />}
        {infraSummaryQ.data && <DistrictInfraTable data={infraSummaryQ.data} avgRatingByDistrict={avgRatingByDistrict} />}

        {schoolsQ.isLoading ? (
          <div className="text-xs text-muted-foreground py-4 text-center">Loading school list…</div>
        ) : schoolsQ.data ? (
          <SchoolTable schools={schoolsQ.data} districts={districts} />
        ) : null}
      </div>
    </div>
  );
}
