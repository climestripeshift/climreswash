import { useState, useMemo, useCallback, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
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
    desc:   "Mean elevation per hex (SRTM 90m) — mock data",
  },
  {
    key:    "ndvi_mean" as const,
    label:  "Vegetation (NDVI)",
    icon:   "🌿",
    unit:   "",
    domain: [0, 0.8] as [number, number],
    desc:   "Mean annual NDVI (MODIS 2023, 0–0.8 scale) — mock data",
  },
  {
    key:    "land_use" as const,
    label:  "Land Use",
    icon:   "🗺️",
    unit:   "",
    domain: [0, 1] as [number, number],
    desc:   "Dominant ESA WorldCover class per hex — mock data",
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

function hexColor(props: any, attr: AttrKey): string {
  if (attr === "elevation_mean") {
    const val = props.elevation_mean ?? 0;
    return gradientColor(VIRIDIS, val / 5000);
  }
  if (attr === "ndvi_mean") {
    const val = props.ndvi_mean ?? 0;
    return gradientColor(GREENS, val / 0.8);
  }
  // land_use
  return LAND_USE_COLORS[props.land_use] ?? "#94a3b8";
}

// ── Attribute selector ────────────────────────────────────────────────────────

function AttributeSelector({
  active,
  onChange,
}: {
  active: AttrKey;
  onChange: (k: AttrKey) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {ATTRIBUTES.map((a) => (
        <button
          key={a.key}
          onClick={() => onChange(a.key)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            active === a.key
              ? "bg-emerald-600 text-white"
              : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <span>{a.icon}</span>
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ── State filter ──────────────────────────────────────────────────────────────

function StateFilter({
  states,
  selected,
  onChange,
}: {
  states: string[];
  selected: string;
  onChange: (s: string) => void;
}) {
  return (
    <div className="relative flex items-center gap-1.5">
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground" />
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-md border border-border/50 bg-muted/40 pl-2.5 pr-7 py-1.5 text-xs outline-none cursor-pointer text-foreground"
      >
        <option value="All India">All India</option>
        {states.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend({ attr }: { attr: AttrKey }) {
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

  const ramp = attr === "elevation_mean" ? VIRIDIS : GREENS;
  const stops = Array.from({ length: 5 }, (_, i) => gradientColor(ramp, i / 4));
  const [lo, hi] = meta.domain;
  const fmtVal = (v: number) =>
    attr === "elevation_mean" ? `${v}m` : v.toFixed(1);

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

// ── Leaflet map ───────────────────────────────────────────────────────────────

function HexMap({
  geoData,
  attr,
  selectedState,
  mapRef,
}: {
  geoData: any;
  attr: AttrKey;
  selectedState: string;
  mapRef: React.MutableRefObject<LeafletMap | null>;
}) {
  const filtered = useMemo(() => {
    if (!geoData) return null;
    if (selectedState === "All India") return geoData;
    return {
      ...geoData,
      features: geoData.features.filter(
        (f: any) => f.properties.state === selectedState
      ),
    };
  }, [geoData, selectedState]);

  const styleFeature = useCallback(
    (feature: any) => ({
      fillColor:   hexColor(feature.properties, attr),
      fillOpacity: 0.75,
      color:       "#64748b",
      weight:      0.3,
    }),
    [attr]
  );

  const onEachFeature = useCallback(
    (feature: any, layer: any) => {
      const p = feature.properties;
      const popupHtml = `
        <div style="font-size:12px;line-height:1.6">
          <div style="font-weight:600;margin-bottom:4px">${p.state}</div>
          ⛰️ Elevation: <b>${p.elevation_mean ?? "—"}m</b><br/>
          🌿 NDVI: <b>${p.ndvi_mean ?? "—"}</b><br/>
          🗺️ Land Use: <b style="text-transform:capitalize">${p.land_use ?? "—"}</b><br/>
          <div style="font-size:10px;color:#94a3b8;margin-top:4px">${p.h3_id}</div>
        </div>
      `;
      layer.bindPopup(popupHtml);
      layer.on("mouseover", (e: any) => {
        e.target.setStyle({ weight: 1.2, fillOpacity: 0.95 });
        e.target.openTooltip();
      });
      layer.on("mouseout", (e: any) => {
        e.target.setStyle(styleFeature(feature));
        e.target.closeTooltip();
      });
      const attr_label =
        attr === "elevation_mean"
          ? `${p.elevation_mean}m`
          : attr === "ndvi_mean"
          ? `NDVI ${p.ndvi_mean}`
          : p.land_use;
      layer.bindTooltip(`<strong>${p.state}</strong> · ${attr_label}`, {
        sticky: true,
      });
    },
    [attr, styleFeature]
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
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />
      <GeoJSON
        key={`${attr}-${selectedState}`}
        data={filtered}
        style={styleFeature}
        onEachFeature={onEachFeature}
      />
    </MapContainer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HexMapPage() {
  const [attr, setAttr]             = useState<AttrKey>("elevation_mean");
  const [selectedState, setSelectedState] = useState("All India");
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

  const handleStateChange = useCallback(
    (state: string) => {
      setSelectedState(state);
      if (state === "All India" || !mapRef.current || !hexQ.data) return;
      const stateFeatues = hexQ.data.features.filter(
        (f: any) => f.properties.state === state
      );
      if (!stateFeatues.length) return;
      // Compute bounding box of state hexes and fit
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
      for (const f of stateFeatues) {
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
    },
    [hexQ.data]
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

          {/* State filter */}
          {stateList.length > 0 && (
            <StateFilter
              states={stateList}
              selected={selectedState}
              onChange={handleStateChange}
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
            mapRef={mapRef}
          />
        )}

        {/* Legend — bottom-left */}
        {features.length > 0 && (
          <div className="absolute bottom-8 left-3 z-[800]">
            <Legend attr={attr} />
          </div>
        )}
      </div>
    </div>
  );
}
