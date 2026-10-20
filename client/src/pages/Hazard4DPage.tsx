import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import DeckGL from "@deck.gl/react";
import { MapView } from "@deck.gl/core";
import { BitmapLayer } from "@deck.gl/layers";
import { H3HexagonLayer, TileLayer } from "@deck.gl/geo-layers";
import { cellToLatLng } from "h3-js";
import { Loader2, Pause, Play } from "lucide-react";

// 4-D hazard view: x/y = place (H3 hex), z = height = hazard score, 4th dimension = time
// (month of the year, animated). One component for every hazard; data comes from
// scripts/compute_heat_4d.py / compute_flood_4d.py (same file layout), see HAZARD_4D below.

interface Heat4DIndex {
  h3_ids: string[]; months: string[]; scenarios: Record<string, string>; horizons: string[];
  warming_c: Record<string, Record<string, number>>;
  mean_warming_c?: Record<string, Record<string, number>>;
  month_note?: string;
  coverage_note?: string;
  coverage?: { pct_hexes: number; pct_pop: number };
  aggregates: Record<string, { india: {
    pop_weighted_mean: number[]; pct_pop_high_or_extreme: number[];
    people_high?: number[]; children_u5_high?: number[];
    hottest_month: { pop_weighted_mean: number; pct_pop_high_or_extreme: number };
  } }>;
}
interface Row { hex: string; s: number[] } // s = 12 monthly scores, 0..10; every month -1 = no estimate (input data missing)
const NO_EST: [number, number, number, number] = [236, 148, 176, 190]; // rose: 'no estimate' (distinct from every hazard ramp)

const key = (scenario: string, horizon: string) =>
  scenario === "baseline" ? "baseline_1991-2020" : `${scenario}_${horizon}`;

type RGB = [number, number, number];
export interface Hazard4DConfig {
  dataDir: string;               // /data/<dataDir>/index.json + <scenario>_<horizon>.json
  title: string; icon: string; tab: string; // tab = short label for the hazard switch
  what: string;                  // "heat-wave hazard"
  ramp: [number, RGB][];         // fixed 0-10 colour stops
  noneColor: [number, number, number, number];
  defaultScenario: string; defaultHorizon: string; defaultMonth: number;
  warmingField: "warming_c" | "mean_warming_c";
  warmingLabel: string;          // shown next to the assumed warming
  highWord: string;              // "high/extreme heat"
  footer: string;
}

export type HazardId = "heat" | "flood" | "drought" | "wetbulb" | "landslide" | "coldwave" | "flashflood";
export const HAZARD_IDS: HazardId[] = ["heat", "flood", "drought", "wetbulb", "landslide", "coldwave", "flashflood"];

export const HAZARD_4D: Record<HazardId, Hazard4DConfig> = {
  heat: {
    dataDir: "heat_4d", title: "Heat 4-D", icon: "🔥", tab: "Heat", what: "heat-wave hazard",
    ramp: [[0, [34, 197, 94]], [2.5, [234, 179, 8]], [5, [249, 115, 22]], [7.5, [220, 38, 38]], [10, [127, 29, 29]]],
    noneColor: [148, 163, 184, 90],
    defaultScenario: "ssp585", defaultHorizon: "2050", defaultMonth: 4, // May: India's heat peak
    warmingField: "warming_c", warmingLabel: "assumed hot-day warming", highWord: "high/extreme heat",
    footer: "Hazard from ERA5 1991–2020 (Copernicus) + approximate IPCC AR6 warming · basemap © Esri",
  },
  flood: {
    dataDir: "flood_4d", title: "Flood 4-D", icon: "🌊", tab: "Flood", what: "flood hazard",
    ramp: [[0, [186, 230, 253]], [2.5, [56, 189, 248]], [5, [37, 99, 235]], [7.5, [30, 58, 138]], [10, [88, 28, 135]]],
    noneColor: [148, 163, 184, 70],
    defaultScenario: "ssp585", defaultHorizon: "2050", defaultMonth: 7, // August: monsoon peak
    warmingField: "mean_warming_c", warmingLabel: "assumed mean warming (+7%/°C heavy rain)", highWord: "high/extreme flood hazard",
    footer: "Seasonality from ERA5 1991–2020 (Copernicus) · 10-yr storm and floodplain from hex layers · approximate IPCC AR6 warming · basemap © Esri",
  },
  drought: {
    dataDir: "drought_4d", title: "Drought 4-D", icon: "🏜️", tab: "Drought", what: "drought hazard (1-in-10-year rainfall shortfall)",
    ramp: [[0, [254, 243, 199]], [2.5, [252, 211, 77]], [5, [217, 119, 6]], [7.5, [146, 64, 14]], [10, [67, 20, 7]]],
    noneColor: [148, 163, 184, 70],
    defaultScenario: "ssp585", defaultHorizon: "2050", defaultMonth: 8, // Sep = Jul-Sep window, the monsoon core
    warmingField: "mean_warming_c", warmingLabel: "assumed mean warming (+5%/°C rainfall variability)", highWord: "high/extreme drought hazard",
    footer: "Rainfall variability from ERA5 1991–2020 (Copernicus) · IMD deficit classes · approximate IPCC AR6 warming · basemap © Esri",
  },
  wetbulb: {
    dataDir: "wetbulb_4d", title: "Wet-bulb 4-D", icon: "💦", tab: "Wet-bulb", what: "humid-heat (wet-bulb) hazard",
    ramp: [[0, [207, 250, 254]], [2.5, [34, 211, 238]], [5, [217, 70, 239]], [7.5, [190, 24, 93]], [10, [76, 5, 25]]],
    noneColor: [148, 163, 184, 70],
    defaultScenario: "ssp585", defaultHorizon: "2050", defaultMonth: 5, // June: pre-monsoon humid heat
    warmingField: "mean_warming_c", warmingLabel: "assumed mean warming (constant humidity)", highWord: "high/extreme humid heat",
    footer: "Afternoon temperature and dewpoint from ERA5 1991–2020 (Copernicus) · Stull wet-bulb · approximate IPCC AR6 warming · basemap © Esri",
  },
  landslide: {
    dataDir: "landslide_4d", title: "Landslide 4-D", icon: "⛰️", tab: "Landslide", what: "landslide hazard (steep-slope susceptibility × heavy-rain trigger)",
    ramp: [[0, [236, 252, 203]], [2.5, [163, 230, 53]], [5, [101, 163, 13]], [7.5, [63, 98, 18]], [10, [26, 46, 5]]],
    noneColor: [148, 163, 184, 60],
    defaultScenario: "ssp585", defaultHorizon: "2050", defaultMonth: 7, // August: monsoon peak
    warmingField: "mean_warming_c", warmingLabel: "assumed mean warming (+7%/°C heavy rain)", highWord: "high/extreme landslide hazard",
    footer: "Steepest-decile slope (Copernicus DEM) · NDVI · heavy-rain days (CHIRPS) and seasonality (ERA5 1991–2020) · approximate IPCC AR6 warming · basemap © Esri",
  },
  coldwave: {
    dataDir: "coldwave_4d", title: "Cold wave 4-D", icon: "🥶", tab: "Cold wave", what: "cold-wave hazard (IMD criteria)",
    ramp: [[0, [241, 245, 249]], [2.5, [147, 197, 253]], [5, [59, 130, 246]], [7.5, [30, 64, 175]], [10, [23, 25, 80]]],
    noneColor: [148, 163, 184, 60],
    defaultScenario: "baseline", defaultHorizon: "2050", defaultMonth: 0, // January
    warmingField: "mean_warming_c", warmingLabel: "assumed mean warming (cold nights warm)", highWord: "high/extreme cold-wave hazard",
    footer: "Dawn temperature from ERA5 1991–2020 (Copernicus) · IMD cold-wave thresholds · approximate IPCC AR6 warming · basemap © Esri",
  },
  flashflood: {
    dataDir: "flashflood_4d", title: "Flash flood 4-D", icon: "🌧️", tab: "Flash flood", what: "flash-flood hazard (catchment potential × heavy-rain trigger)",
    ramp: [[0, [204, 251, 241]], [2.5, [45, 212, 191]], [5, [13, 148, 136]], [7.5, [19, 78, 74]], [10, [4, 30, 31]]],
    noneColor: [148, 163, 184, 60],
    defaultScenario: "ssp585", defaultHorizon: "2050", defaultMonth: 7, // August
    warmingField: "mean_warming_c", warmingLabel: "assumed mean warming (+7%/°C heavy rain)", highWord: "high/extreme flash-flood hazard",
    footer: "Steepest-decile slope (Copernicus DEM) · cover and soil · heavy-rain days (CHIRPS) and seasonality (ERA5 1991–2020) · approximate IPCC AR6 warming · basemap © Esri",
  },
};

function colorFor(cfg: Hazard4DConfig, score: number): [number, number, number, number] {
  const STOPS = cfg.ramp;
  if (score <= 0.05) return cfg.noneColor; // no hazard: faint, near-flat
  for (let i = 1; i < STOPS.length; i++) {
    const [v1, c1] = STOPS[i];
    if (score <= v1) {
      const [v0, c0] = STOPS[i - 1];
      const t = (score - v0) / (v1 - v0);
      return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * t)).concat(235) as [number, number, number, number];
    }
  }
  return [...STOPS[STOPS.length - 1][1], 235] as [number, number, number, number];
}
const bandOf = (s: number) => (s < 0.5 ? "none" : s < 2.5 ? "low" : s < 5 ? "moderate" : s < 7.5 ? "high" : "extreme");

const INITIAL_VIEW = { longitude: 80, latitude: 22.5, zoom: 4.4, pitch: 52, bearing: -12, minZoom: 3, maxZoom: 9 };
const METERS_PER_POINT = 25000; // 10/10 -> 250 km tall at exaggeration 1

export function Hazard4DPage({ initialHazard = "heat" }: { initialHazard?: HazardId }) {
  const [hazard, setHazard] = useState<HazardId>(initialHazard);
  const [view, setView] = useState<"3d" | "flat">("3d");
  const cfg = HAZARD_4D[hazard];
  const [scenario, setScenario] = useState(cfg.defaultScenario);
  const [horizon, setHorizon] = useState(cfg.defaultHorizon);
  const [month, setMonth] = useState(cfg.defaultMonth);
  const [playing, setPlaying] = useState(false);
  const [exaggeration, setExaggeration] = useState(1);
  const [stressMetric, setStressMetric] = useState<"people" | "children" | "pct" | "mean">("people");

  const indexQ = useQuery<Heat4DIndex>({
    queryKey: [`${cfg.dataDir}-index`],
    queryFn: () => fetch(`/data/${cfg.dataDir}/index.json`).then((r) => { if (!r.ok) throw new Error(`index ${r.status}`); return r.json(); }),
    staleTime: Infinity,
  });
  const dataKey = key(scenario, horizon);
  const dataQ = useQuery<{ score: number[][] }>({
    queryKey: [`${cfg.dataDir}-data`, dataKey],
    queryFn: () => fetch(`/data/${cfg.dataDir}/${dataKey}.json`).then((r) => { if (!r.ok) throw new Error(`${dataKey} ${r.status}`); return r.json(); }),
    staleTime: Infinity,
    placeholderData: (prev) => prev, // keep the old bars on screen while a new scenario loads
  });

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setMonth((m) => (m + 1) % 12), 900);
    return () => clearInterval(id);
  }, [playing]);

  const rows = useMemo<Row[]>(() => {
    const ids = indexQ.data?.h3_ids, sc = dataQ.data?.score;
    if (!ids || !sc) return [];
    return ids.map((hex, i) => ({ hex, s: sc[i].map((v) => (v < 0 ? -1 : v / 10)) }));
  }, [indexQ.data, dataQ.data]);

  const layers = [
    new TileLayer({
      id: "basemap",
      data: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      minZoom: 0, maxZoom: 8, tileSize: 256,
      renderSubLayers: (props: any) => {
        const { west, south, east, north } = props.tile.bbox;
        return new BitmapLayer(props, { data: undefined, image: props.data, bounds: [west, south, east, north] });
      },
    }),
    new H3HexagonLayer<Row>({
      id: `${hazard}-hexes`,
      data: rows,
      getHexagon: (d) => d.hex,
      extruded: view === "3d",
      coverage: 0.9,
      pickable: true,
      elevationScale: view === "3d" ? METERS_PER_POINT * exaggeration : 1,
      getElevation: (d) => Math.max(0, d.s[month]),
      getFillColor: (d) => (d.s[month] < 0 ? NO_EST : colorFor(cfg, d.s[month])),
      material: { ambient: 0.55, diffuse: 0.7, shininess: 24, specularColor: [60, 60, 60] },
      transitions: { getElevation: 600, getFillColor: 600 },
      updateTriggers: { getElevation: [month, dataKey, hazard], getFillColor: [month, dataKey, hazard] },
    }),
  ];

  const idx = indexQ.data;
  const agg = idx?.aggregates[dataKey]?.india;
  const dT = scenario === "baseline" ? 0 : idx?.[cfg.warmingField]?.[scenario]?.[horizon];
  const maxMean = agg ? Math.max(...agg.pop_weighted_mean, 1) : 1;
  const loading = indexQ.isLoading || dataQ.isFetching;
  const failed = indexQ.isError || dataQ.isError;
  const sel = "w-full mt-0.5 px-2 py-1.5 text-xs rounded bg-muted/50 border border-border text-foreground disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-background text-foreground">
      <DeckGL
        views={new MapView({ repeat: false })}
        key={view}
        initialViewState={view === "3d" ? INITIAL_VIEW : { ...INITIAL_VIEW, pitch: 0, bearing: 0 }}
        controller={{ dragRotate: view === "3d", touchRotate: view === "3d" }}
        layers={layers}
        getTooltip={({ object }: any) => {
          if (!object) return null;
          const r = object as Row;
          if (r.s[month] < 0) {
            const [la, lo] = cellToLatLng(r.hex);
            return {
              html: `<div style="font:12px system-ui"><b>No estimate</b><br/>Input data missing for this area<br/><span style="opacity:.7">${la.toFixed(2)}°N, ${lo.toFixed(2)}°E</span></div>`,
              style: { background: "rgba(15,23,42,.92)", color: "#f8fafc", borderRadius: "6px", padding: "6px 8px" },
            };
          }
          const [lat, lon] = cellToLatLng(r.hex);
          const peak = r.s.indexOf(Math.max(...r.s));
          const now = r.s[month];
          return {
            html: `<div style="font:12px system-ui"><b>${idx?.months[month] ?? ""}: ${now.toFixed(1)}/10 (${bandOf(now)})</b><br/>` +
              `Worst month: ${idx?.months[peak] ?? peak + 1} (${r.s[peak].toFixed(1)})<br/>` +
              `<span style="opacity:.7">${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E</span></div>`,
            style: { background: "rgba(15,23,42,.92)", color: "#f8fafc", borderRadius: "6px", padding: "6px 8px" },
          };
        }}
      />

      {/* Controls */}
      <div className="absolute top-3 left-3 z-10 w-72 max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-lg border border-border bg-background/92 backdrop-blur p-3 shadow-lg space-y-2.5">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold">4-D hazard maps</h1>
          <Link href="/grid" className="text-[11px] text-muted-foreground underline">2-D grid</Link>
        </div>
        <div className="grid grid-cols-4 gap-1" role="tablist" aria-label="Hazard">
          {HAZARD_IDS.map((h) => (
            <button key={h} role="tab" aria-selected={hazard === h} onClick={() => { setHazard(h); setMonth(HAZARD_4D[h].defaultMonth); }}
              className={`py-1.5 px-0.5 text-[11px] rounded-md leading-tight transition-colors ${hazard === h ? "bg-amber-500/25 text-amber-600 dark:text-amber-300 font-semibold" : "bg-muted/40 text-muted-foreground hover:bg-muted/60"}`}>
              {HAZARD_4D[h].icon} {HAZARD_4D[h].tab}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1" role="tablist" aria-label="View">
          {([["3d", "3-D columns"], ["flat", "Flat map"]] as const).map(([v, label]) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`py-1 text-[11px] rounded-md transition-colors ${view === v ? "bg-foreground/10 font-semibold" : "text-muted-foreground hover:bg-muted/60"}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {view === "3d" ? <>Height and colour = {cfg.what} (0–10). Drag to pan, right-drag or Ctrl-drag to tilt and rotate.</> : <>Colour = {cfg.what} (0–10).</>}
          {" "}The 4th dimension is time: use the month slider or press play.
        </p>

        <label className="block text-[11px] text-muted-foreground">Scenario
          <select className={sel} value={scenario} onChange={(e) => setScenario(e.target.value)}>
            {Object.entries(idx?.scenarios ?? { baseline: "Baseline 1991-2020" }).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="block text-[11px] text-muted-foreground">Horizon
          <select className={sel} value={horizon} disabled={scenario === "baseline"} onChange={(e) => setHorizon(e.target.value)}>
            {(idx?.horizons ?? ["2030", "2050", "2080"]).map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>

        <div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Time (month of year)</span>
            <span className="font-semibold text-foreground">{idx?.months[month] ?? ""}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}
              className="h-7 w-7 shrink-0 grid place-items-center rounded-md bg-amber-500/20 text-amber-500 hover:bg-amber-500/30">
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <input type="range" min={0} max={11} step={1} value={month} className="w-full accent-amber-500"
              onChange={(e) => { setPlaying(false); setMonth(Number(e.target.value)); }} />
          </div>
          {idx?.month_note && <div className="text-[10px] text-muted-foreground mt-1 leading-snug">{idx.month_note}</div>}
        </div>

        {view === "3d" && (<label className="block text-[11px] text-muted-foreground">Height exaggeration ×{exaggeration.toFixed(1)}
          <input type="range" min={0.5} max={3} step={0.1} value={exaggeration} className="w-full accent-amber-500"
            onChange={(e) => setExaggeration(Number(e.target.value))} />
        </label>)}

        {agg && (
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">
              All-India population-weighted score by month
              {dT != null ? ` · ${cfg.warmingLabel} +${dT}°C` : ""}
            </div>
            <div className="flex items-end gap-[3px] h-14">
              {agg.pop_weighted_mean.map((v, i) => (
                <button key={i} onClick={() => { setPlaying(false); setMonth(i); }} title={`${idx!.months[i]}: ${v.toFixed(2)}`}
                  className="flex-1 flex flex-col justify-end h-full">
                  <div className={`w-full rounded-sm ${i === month ? "bg-amber-500" : "bg-muted-foreground/40"}`}
                    style={{ height: `${Math.max(3, (v / maxMean) * 100)}%` }} />
                </button>
              ))}
            </div>
            <div className="flex gap-[3px] text-[8px] text-muted-foreground mt-0.5">
              {idx!.months.map((m) => <span key={m} className="flex-1 text-center">{m[0]}</span>)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {idx!.months[month]}: <b className="text-foreground">{agg.pop_weighted_mean[month].toFixed(2)}</b>/10,{" "}
              <b className="text-foreground">{agg.pct_pop_high_or_extreme[month].toFixed(1)}%</b> of people in {cfg.highWord}
            </div>
            {idx?.coverage && idx.coverage.pct_hexes < 99.95 && (
              <div className="text-[10px] text-muted-foreground mt-1 leading-snug flex items-start gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0 mt-0.5" style={{ background: `rgb(${NO_EST[0]},${NO_EST[1]},${NO_EST[2]})` }} />
                <span>{(100 - idx.coverage.pct_hexes).toFixed(1)}% of hexes have no estimate (rose). Summary covers {idx.coverage.pct_pop.toFixed(1)}% of people; {(100 - idx.coverage.pct_pop).toFixed(1)}% live in areas with no estimate.</span>
              </div>
            )}
            {idx?.coverage_note && <div className="text-[10px] text-muted-foreground mt-1 leading-snug">{idx.coverage_note}</div>}
          </div>
        )}

        {/* Stress comparison: the selected month under every scenario and horizon */}
        {idx && (() => {
          const val = (k: string): number | null => {
            const a = idx.aggregates[k]?.india;
            if (!a) return null;
            if (stressMetric === "people") return a.people_high ? a.people_high[month] / 1e6 : null;
            if (stressMetric === "children") return a.children_u5_high ? a.children_u5_high[month] / 1e6 : null;
            if (stressMetric === "pct") return a.pct_pop_high_or_extreme[month];
            return a.pop_weighted_mean[month];
          };
          const fmt = (v: number | null) => (v == null ? "–" : stressMetric === "people" ? v.toFixed(0) : stressMetric === "children" ? v.toFixed(1) : stressMetric === "pct" ? `${v.toFixed(1)}` : v.toFixed(2));
          const unit = { people: "million people in high/extreme", children: "million children under 5 in high/extreme", pct: "% of people in high/extreme", mean: "population-weighted mean score" }[stressMetric];
          const ssps = Object.keys(idx.scenarios).filter((k) => k !== "baseline");
          const cell = (k: string, sc: string, hz: string) => {
            const on = scenario === sc && horizon === hz;
            return (
              <button key={k} onClick={() => { setScenario(sc); setHorizon(hz); }}
                className={`py-0.5 rounded text-[10px] tabular-nums ${on ? "bg-amber-500/25 font-semibold text-foreground" : "hover:bg-muted/60 text-foreground/90"}`}>
                {fmt(val(k))}
              </button>
            );
          };
          return (
            <div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Stress comparison · {idx.months[month]}</span>
                <select className="text-[10px] bg-muted/40 border border-border/40 rounded px-1 py-0.5 text-foreground" value={stressMetric}
                  onChange={(e) => setStressMetric(e.target.value as typeof stressMetric)} aria-label="Stress comparison metric">
                  <option value="people">People</option><option value="children">Children &lt;5</option>
                  <option value="pct">% of people</option><option value="mean">Mean score</option>
                </select>
              </div>
              <div className="grid grid-cols-[1fr_repeat(3,minmax(0,1fr))] gap-x-1 gap-y-0.5 mt-1 items-center">
                <span className="text-[9px] text-muted-foreground" />
                {idx.horizons.map((h) => <span key={h} className="text-[9px] text-muted-foreground text-center">{h}</span>)}
                <button onClick={() => setScenario("baseline")} className={`text-left text-[10px] ${scenario === "baseline" ? "font-semibold" : "text-muted-foreground"}`}>Baseline</button>
                <button onClick={() => setScenario("baseline")} className={`col-span-3 py-0.5 rounded text-[10px] tabular-nums ${scenario === "baseline" ? "bg-amber-500/25 font-semibold" : "hover:bg-muted/60"}`}>{fmt(val("baseline_1991-2020"))}</button>
                {ssps.map((sc) => (
                  <Fragment key={sc}>
                    <span className="text-[10px] text-muted-foreground truncate" title={idx.scenarios[sc]}>{sc.replace("ssp", "SSP").replace(/(\d)(\d)(\d)$/, "$1-$2.$3")}</span>
                    {idx.horizons.map((h) => cell(`${sc}_${h}`, sc, h))}
                  </Fragment>
                ))}
              </div>
              <div className="text-[9px] text-muted-foreground mt-1 leading-snug">{unit}. Same month, India grid population (2020), score ≥ 5. Click a cell to show that scenario.</div>
            </div>
          );
        })()}

        {/* Legend */}
        <div>
          <div className="h-2 rounded"
            style={{ background: `linear-gradient(90deg,${cfg.ramp.map(([v, c]) => `rgb(${c.join(",")}) ${v * 10}%`).join(",")})` }} />
          <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5"><span>0</span><span>2.5</span><span>5</span><span>7.5</span><span>10</span></div>
        </div>
      </div>

      {loading && !failed && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-background/90 border border-border rounded-full px-4 py-1.5 text-xs text-muted-foreground shadow-lg">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading {cfg.title} data…
        </div>
      )}
      {failed && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-background/90 border border-destructive rounded-full px-4 py-1.5 text-xs text-destructive shadow-lg">
          {cfg.title} data failed to load
        </div>
      )}
      <div className="absolute bottom-1 right-2 z-10 text-[9px] text-muted-foreground">
        {cfg.footer}
      </div>
    </div>
  );
}
