import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSONLayer } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ArrowLeft, ChevronDown, AlertTriangle, Loader2, Grid3X3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";

// ── Attribute definitions ─────────────────────────────────────────────────────

const ATTRIBUTES = [
  {
    key:    "elevation_mean" as const,
    label:  "Elevation",
    icon:   "⛰️",
    unit:   "m",
    domain: [0, 5000] as [number, number],
    desc:   "Mean elevation per hex (SRTM 90m, real data)",
    group:  "terrain" as const,
  },
  {
    key:    "ndvi_mean" as const,
    label:  "NDVI",
    icon:   "🌿",
    unit:   "",
    domain: [0, 0.8] as [number, number],
    desc:   "Mean annual NDVI (0–0.8 scale) — mock data",
    group:  "terrain" as const,
  },
  {
    key:    "land_use" as const,
    label:  "Land Use",
    icon:   "🗺️",
    unit:   "",
    domain: [0, 1] as [number, number],
    desc:   "Dominant land cover class per hex — mock data",
    group:  "terrain" as const,
  },
  {
    key:    "flood_risk" as const,
    label:  "Flood",
    icon:   "🌊",
    unit:   "",
    domain: [0, 3] as [number, number],
    desc:   "Pluvial flood risk (50mm monsoon scenario × terrain × district exposure)",
    group:  "risk" as const,
  },
  {
    key:    "heat_risk" as const,
    label:  "Heat",
    icon:   "🔥",
    unit:   "",
    domain: [0, 2] as [number, number],
    desc:   "Heatwave risk (44°C × urban heat × district exposure)",
    group:  "risk" as const,
  },
  {
    key:    "cyclone_risk" as const,
    label:  "Cyclone",
    icon:   "🌀",
    unit:   "",
    domain: [0, 3] as [number, number],
    desc:   "Cyclone risk (cat-3 storm × coastal proximity × Bay of Bengal funnel)",
    group:  "risk" as const,
  },
  {
    key:    "drought_risk" as const,
    label:  "Drought",
    icon:   "☀️",
    unit:   "",
    domain: [0, 2] as [number, number],
    desc:   "Drought risk (aridity proxy from NDVI + sand content)",
    group:  "risk" as const,
  },
  {
    key:    "wetbulb_risk" as const,
    label:  "Wet Bulb",
    icon:   "💧",
    unit:   "",
    domain: [0, 1] as [number, number],
    desc:   "Wet-bulb heat stress (lethal humidity × heat combo, coastal + riverine)",
    group:  "risk" as const,
  },
  {
    key:    "landslide_risk" as const,
    label:  "Landslide",
    icon:   "⛰️",
    unit:   "",
    domain: [0, 2] as [number, number],
    desc:   "Landslide risk (steep slope + deforestation + monsoon)",
    group:  "risk" as const,
  },
  {
    key:    "coldwave_risk" as const,
    label:  "Cold Wave",
    icon:   "❄️",
    unit:   "",
    domain: [0, 3] as [number, number],
    desc:   "Cold wave risk (northern plains + high altitude winter exposure)",
    group:  "risk" as const,
  },
  {
    key:    "flashflood_risk" as const,
    label:  "Flash Flood",
    icon:   "⚡",
    unit:   "",
    domain: [0, 2] as [number, number],
    desc:   "Flash flood risk (steep terrain + sudden monsoon runoff)",
    group:  "risk" as const,
  },
  {
    key:    "sealevel_risk" as const,
    label:  "Sea Level",
    icon:   "🌊",
    unit:   "",
    domain: [0, 4] as [number, number],
    desc:   "Sea level rise exposure (low-elevation coastal hexes)",
    group:  "risk" as const,
  },
  {
    key:    "fire_risk" as const,
    label:  "Fire",
    icon:   "🔥",
    unit:   "",
    domain: [0, 2] as [number, number],
    desc:   "Forest fire risk (dry deciduous forests + scrubland)",
    group:  "risk" as const,
  },
  {
    key:    "hex_risk" as const,
    label:  "Max Risk",
    icon:   "⚠️",
    unit:   "",
    domain: [0, 4] as [number, number],
    desc:   "Highest risk across all 10 hazard channels for this hex",
    group:  "risk" as const,
  },
] as const;

type AttrKey = typeof ATTRIBUTES[number]["key"];

// ── Color scales ──────────────────────────────────────────────────────────────

// Viridis-approximated for elevation (5 stops)
const VIRIDIS: [number, number, number][] = [
  [68,  1,   84 ],  // deep purple
  [59,  82,  139],  // blue
  [33,  145, 140],  // teal
  [94,  201, 98 ],  // green
  [253, 231, 37 ],  // bright yellow
];

// Greens for NDVI (5 stops)
const GREENS: [number, number, number][] = [
  [255, 255, 255],  // white
  [199, 233, 192],  // very light green
  [116, 196, 118],  // medium green
  [49,  163, 84 ],  // dark green
  [0,   109, 44 ],  // very dark green
];

// Blues for flood sensitivity (5 stops)
const BLUES: [number, number, number][] = [
  [240, 249, 255],
  [189, 215, 231],
  [107, 174, 214],
  [33,  113, 181],
  [8,   48,  107],
];

// Oranges for heat sensitivity (5 stops)
const ORANGES: [number, number, number][] = [
  [255, 255, 229],
  [254, 217, 142],
  [254, 153, 41 ],
  [217, 95,  14 ],
  [153, 52,  4  ],
];

// Risk gradient for hazard scores 0–10 (green → red → dark)
const RISK: [number, number, number][] = [
  [34,  197, 94 ],
  [234, 179, 8  ],
  [249, 115, 22 ],
  [239, 68,  68 ],
  [153, 27,  27 ],
];

const LAND_USE_COLORS: Record<string, string> = {
  tree:     "#2d6a4f",
  shrub:    "#95d5b2",
  grass:    "#d8f3dc",
  crop:     "#f4d35e",
  built:    "#d62828",
  barren:   "#c9b79c",
  water:    "#1d4e89",
  wetland:  "#84a59d",
  snow:     "#dbeafe",
  mangrove: "#52b788",
};

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): string {
  return `rgb(${a.map((c, i) => Math.round(c + t * (b[i] - c))).join(",")})`;
}

function gradientColor(
  ramp: [number, number, number][],
  t: number
): string {
  t = Math.max(0, Math.min(1, t));
  const scaled = t * (ramp.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(lo + 1, ramp.length - 1);
  return lerp3(ramp[lo], ramp[hi], scaled - lo);
}

const ATTR_RAMP: Record<string, [number, number, number][]> = {
  elevation_mean:    VIRIDIS,
  ndvi_mean:         GREENS,
  flood_risk:        BLUES,
  heat_risk:         ORANGES,
  cyclone_risk:      RISK,
  drought_risk:      ORANGES,
  wetbulb_risk:      BLUES,
  landslide_risk:    VIRIDIS,
  coldwave_risk:     BLUES,
  flashflood_risk:   BLUES,
  sealevel_risk:     BLUES,
  fire_risk:         ORANGES,
  hex_risk:          RISK,
};

function hexColor(props: any, attr: AttrKey, domain: [number, number]): string {
  if (attr === "land_use") return LAND_USE_COLORS[props.land_use] ?? "#94a3b8";
  const val = props[attr] ?? 0;
  const [lo, hi] = domain;
  const t = hi > lo ? (val - lo) / (hi - lo) : 0;
  return gradientColor(ATTR_RAMP[attr] ?? GREENS, t);
}

// ── Attribute selector ────────────────────────────────────────────────────────

function AttributeSelector({
  active,
  onChange,
}: {
  active: AttrKey;
  onChange: (k: AttrKey) => void;
}) {
  const terrain = ATTRIBUTES.filter((a) => a.group === "terrain");
  const risk    = ATTRIBUTES.filter((a) => a.group === "risk");

  const btn = (a: typeof ATTRIBUTES[number], activeColor: string) => (
    <button
      key={a.key}
      onClick={() => onChange(a.key)}
      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1 ${
        active === a.key
          ? `${activeColor} text-white`
          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <span className="text-xs">{a.icon}</span>
      {a.label}
    </button>
  );

  return (
    <div className="flex items-center gap-1">
      {terrain.map((a) => btn(a, "bg-emerald-600"))}
      <div className="h-4 w-px bg-border/50 mx-0.5" />
      {risk.map((a) => btn(a, "bg-red-600"))}
    </div>
  );
}

// ── State filter ──────────────────────────────────────────────────────────────

function DropdownFilter({
  items,
  selected,
  onChange,
  allLabel = "All India",
  allValue = "All India",
}: {
  items: string[];
  selected: string;
  onChange: (s: string) => void;
  allLabel?: string;
  allValue?: string;
}) {
  return (
    <div className="relative flex items-center gap-1.5">
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground" />
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-md border border-border/50 bg-muted/40 pl-2.5 pr-7 py-1.5 text-xs outline-none cursor-pointer text-foreground max-w-[160px]"
      >
        <option value={allValue}>{allLabel}</option>
        {items.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend({ attr, domain }: { attr: AttrKey; domain: [number, number] }) {
  const meta = ATTRIBUTES.find((a) => a.key === attr)!;

  if (attr === "land_use") {
    const classes = Object.entries(LAND_USE_COLORS);
    return (
      <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-3 shadow-lg w-44">
        <p className="text-[10px] font-semibold text-foreground mb-2">{meta.icon} {meta.label}</p>
        <div className="space-y-1">
          {classes.map(([cls, color]) => (
            <div key={cls} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
              <span className="text-[10px] capitalize text-muted-foreground">{cls}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const ramp = ATTR_RAMP[attr] ?? GREENS;
  const stops = Array.from({ length: 5 }, (_, i) => gradientColor(ramp, i / 4));
  const [lo, hi] = domain;
  const fmtVal = (v: number) =>
    attr === "elevation_mean" ? `${v}m` : v.toFixed(2);

  return (
    <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-3 shadow-lg w-48">
      <p className="text-[10px] font-semibold text-foreground mb-1.5">{meta.icon} {meta.label}</p>
      <div
        className="h-3 w-full rounded-sm mb-1"
        style={{ background: `linear-gradient(to right, ${stops.join(", ")})` }}
      />
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>{fmtVal(lo)}</span>
        <span>{fmtVal(hi)}</span>
      </div>
    </div>
  );
}

// ── Canvas renderer setup (runs once inside MapContainer) ────────────────────

const canvasRenderer = L.canvas({ padding: 0.5 });

function SetupCanvas() {
  const map = useMap();
  useEffect(() => {
    (map as any).options.renderer = canvasRenderer;
  }, [map]);
  return null;
}

// ── Clicked hex info panel ────────────────────────────────────────────────────

function HexInfoPanel({ props, onClose }: { props: any; onClose: () => void }) {
  return (
    <div className="bg-background/95 backdrop-blur border border-border/40 rounded-lg shadow-lg p-3 w-52">
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
        <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Terrain</div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">⛰️ Elevation</span>
          <span className="font-medium">{props.elevation_mean}m</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">🌿 NDVI</span>
          <span className="font-medium">{props.ndvi_mean}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">🗺️ Land Use</span>
          <span className="font-medium capitalize">{props.land_use}</span>
        </div>
        <div className="border-t border-border/30 my-1 pt-1" />
        <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Risk by hazard</div>
        {[
          ["🌊", "Flood",      "flood_risk"],
          ["🔥", "Heat",       "heat_risk"],
          ["🌀", "Cyclone",    "cyclone_risk"],
          ["☀️", "Drought",    "drought_risk"],
          ["💧", "Wet Bulb",   "wetbulb_risk"],
          ["⛰️", "Landslide",  "landslide_risk"],
          ["❄️", "Cold Wave",  "coldwave_risk"],
          ["⚡", "Flash Flood", "flashflood_risk"],
          ["🌊", "Sea Level",  "sealevel_risk"],
          ["🔥", "Fire",       "fire_risk"],
        ].map(([icon, label, key]) => (
          <div key={key} className="flex justify-between">
            <span className="text-muted-foreground">{icon} {label}</span>
            <span className={`font-medium ${props[key] > 0.5 ? "text-red-400" : ""}`}>{props[key] ?? "—"}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold border-t border-border/30 pt-1 mt-1">
          <span className="text-muted-foreground">⚠️ Max Risk</span>
          <span>{props.hex_risk ?? "—"}</span>
        </div>
        <div className="border-t border-border/30 my-1 pt-1" />
        <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">District baseline</div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Hazard</span>
          <span className="font-medium">{props.district_hazard ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Exposure</span>
          <span className="font-medium">{props.district_exposure ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Vulnerability</span>
          <span className="font-medium">{props.district_vulnerability ?? "—"}</span>
        </div>
      </div>
      <div className="mt-2 text-[9px] text-muted-foreground/50 truncate">
        {props.district_name} · {props.h3_id}
      </div>
    </div>
  );
}

// ── Leaflet map ───────────────────────────────────────────────────────────────

function HexMap({
  geoData,
  attr,
  selectedState,
  selectedDistrict,
  mapRef,
  onHexClick,
  domain,
}: {
  geoData: any;
  attr: AttrKey;
  selectedState: string;
  selectedDistrict: string;
  mapRef: React.MutableRefObject<LeafletMap | null>;
  onHexClick: (props: any) => void;
  domain: [number, number];
}) {
  const geoJsonRef = useRef<LeafletGeoJSONLayer | null>(null);

  const filtered = useMemo(() => {
    if (!geoData) return null;
    let feats = geoData.features;
    if (selectedState !== "All India")
      feats = feats.filter((f: any) => f.properties.state === selectedState);
    if (selectedDistrict !== "All")
      feats = feats.filter((f: any) => f.properties.district_name === selectedDistrict);
    return { ...geoData, features: feats };
  }, [geoData, selectedState, selectedDistrict]);

  const styleFeature = useCallback(
    (feature: any) => ({
      fillColor:   hexColor(feature.properties, attr, domain),
      fillOpacity: 0.75,
      color:       "#64748b",
      weight:      0.3,
      renderer:    canvasRenderer,
    }),
    [attr, domain]
  );

  // Re-colour without rebuilding the layer when attribute changes
  useEffect(() => {
    geoJsonRef.current?.setStyle(styleFeature);
  }, [styleFeature]);

  const onEachFeature = useCallback(
    (feature: any, layer: any) => {
      const p = feature.properties;
      const val = attr === "land_use" ? p.land_use : p[attr];
      const label = attr === "elevation_mean" ? `${val}m` : `${val}`;
      const district = p.district_name ? `${p.district_name}, ` : "";
      layer.bindTooltip(`<b>${district}${p.state}</b><br/>${label}`, { sticky: true });
      layer.on("click", () => onHexClick(p));
    },
    [attr, onHexClick]
  );

  if (!filtered) return null;

  return (
    <MapContainer
      center={[22.5, 80]}
      zoom={5}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
      maxBounds={[[6, 68], [37, 98]]}
      minZoom={4}
      maxZoom={10}
      ref={mapRef}
    >
      <SetupCanvas />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />
      <GeoJSON
        ref={geoJsonRef}
        key={`${selectedState}-${selectedDistrict}`}
        data={filtered}
        style={styleFeature}
        onEachFeature={onEachFeature}
      />
    </MapContainer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HexMapPage() {
  const [attr, setAttr]                       = useState<AttrKey>("hex_risk");
  const [selectedState, setSelectedState]     = useState("All India");
  const [selectedDistrict, setSelectedDistrict] = useState("All");
  const [clickedHex, setClickedHex]           = useState<any | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  const hexQ = useQuery<any>({
    queryKey: ["india-hex-grid"],
    queryFn:  () => fetch("/data/india_hex_grid.geojson").then((r) => r.json()),
    staleTime: Infinity,
  });

  const features: any[] = hexQ.data?.features ?? [];

  const stateList = useMemo(
    () =>
      Array.from(new Set(features.map((f: any) => f.properties.state).filter(Boolean))).sort() as string[],
    [features]
  );

  const districtList = useMemo(() => {
    if (selectedState === "All India") return [];
    return Array.from(
      new Set(
        features
          .filter((f: any) => f.properties.state === selectedState)
          .map((f: any) => f.properties.district_name)
          .filter(Boolean)
      )
    ).sort() as string[];
  }, [features, selectedState]);

  // Effective filter key for GeoJSON layer
  const filterKey = selectedDistrict !== "All"
    ? `district:${selectedDistrict}`
    : selectedState;

  // Dynamic domain: actual min/max for the active attribute across visible features
  const dataDomain = useMemo((): [number, number] => {
    if (!features.length || attr === "land_use") return [0, 1];
    let visible = features;
    if (selectedState !== "All India")
      visible = visible.filter((f: any) => f.properties.state === selectedState);
    if (selectedDistrict !== "All")
      visible = visible.filter((f: any) => f.properties.district_name === selectedDistrict);
    const vals = visible
      .map((f: any) => f.properties[attr])
      .filter((v: any) => v != null && isFinite(v));
    if (!vals.length) return [0, 1];
    return [Math.min(...vals), Math.max(...vals)];
  }, [features, attr, selectedState, selectedDistrict]);

  const fitToFeatures = useCallback(
    (feats: any[]) => {
      if (!mapRef.current || !feats.length) return;
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
      for (const f of feats) {
        for (const ring of (f.geometry.type === "Polygon"
          ? f.geometry.coordinates
          : f.geometry.coordinates.flat())) {
          for (const [lng, lat] of ring) {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
          }
        }
      }
      mapRef.current.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [20, 20] });
    }, []
  );

  const handleStateChange = useCallback(
    (state: string) => {
      setSelectedState(state);
      setSelectedDistrict("All");
      if (state === "All India" || !hexQ.data) return;
      fitToFeatures(hexQ.data.features.filter((f: any) => f.properties.state === state));
    },
    [hexQ.data, fitToFeatures]
  );

  const handleDistrictChange = useCallback(
    (district: string) => {
      setSelectedDistrict(district);
      if (district === "All" || !hexQ.data) return;
      fitToFeatures(hexQ.data.features.filter((f: any) => f.properties.district_name === district));
    },
    [hexQ.data, fitToFeatures]
  );

  const activeMeta = ATTRIBUTES.find((a) => a.key === attr)!;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur z-50 shrink-0">
        <div className="h-14 px-4 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8 shrink-0">
              <ArrowLeft className="h-3.5 w-3.5" /> Home
            </Button>
          </Link>

          <div className="h-4 w-px bg-border/50 shrink-0" />

          <div className="flex items-center gap-2 shrink-0">
            <Grid3X3 className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold">Hex Grid Base Map</span>
            <Badge variant="outline" className="text-[10px] h-5 border-emerald-500/30 text-emerald-500 bg-emerald-500/10">
              {features.length ? `${features.length.toLocaleString()} hexes` : "H3 res 5"}
            </Badge>
          </div>

          <div className="h-4 w-px bg-border/50 shrink-0" />

          {/* Attribute selector */}
          <AttributeSelector active={attr} onChange={setAttr} />

          <div className="flex-1" />

          {/* State + District filters */}
          {stateList.length > 0 && (
            <DropdownFilter
              items={stateList}
              selected={selectedState}
              onChange={handleStateChange}
              allLabel="All India"
              allValue="All India"
            />
          )}
          {districtList.length > 0 && (
            <DropdownFilter
              items={districtList}
              selected={selectedDistrict}
              onChange={handleDistrictChange}
              allLabel="All Districts"
              allValue="All"
            />
          )}

          <ThemeToggle />
        </div>

        {/* Description sub-bar */}
        <div className="px-4 pb-2">
          <p className="text-[10px] text-muted-foreground">
            {activeMeta.desc}
            {selectedState !== "All India" && (
              <span className="ml-2 text-emerald-500/70">· Filtered: {selectedState}</span>
            )}
          </p>
        </div>
      </header>

      {/* ── Map ───────────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {hexQ.isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-2 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading 12,705 hexes…
          </div>
        ) : hexQ.isError ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-red-400 text-sm">
            <AlertTriangle className="h-5 w-5" /> Failed to load hex grid
          </div>
        ) : (
          <HexMap
            geoData={hexQ.data}
            attr={attr}
            selectedState={selectedState}
            selectedDistrict={selectedDistrict}
            mapRef={mapRef}
            onHexClick={setClickedHex}
            domain={dataDomain}
          />
        )}

        {/* Clicked hex info — top-right */}
        {clickedHex && (
          <div className="absolute top-3 right-3 z-[800]">
            <HexInfoPanel props={clickedHex} onClose={() => setClickedHex(null)} />
          </div>
        )}

        {/* Legend — bottom-left */}
        {features.length > 0 && (
          <div className="absolute bottom-8 left-3 z-[800]">
            <Legend attr={attr} domain={dataDomain} />
          </div>
        )}
      </div>
    </div>
  );
}
