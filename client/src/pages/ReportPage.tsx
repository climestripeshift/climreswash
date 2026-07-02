import { useMemo } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { technologyContent } from "@/lib/technologyContent";

// Maps hex risk field → technologyContent hazardSuitability key
const RISK_TO_TECH_HAZARD: Record<string, string> = {
  flood_risk:     "Flood",
  heat_risk:      "Heatwave",
  cyclone_risk:   "Cyclone",
  drought_risk:   "Drought",
  wetbulb_risk:   "Heatwave",
  coldwave_risk:  "Cold Wave",
  flashflood_risk:"Flash Flood",
  sealevel_risk:  "Coastal Flooding",
  landslide_risk: "Rocky Terrain",
};

const CATEGORY_META: Record<string, { icon: string; label: string; color: string }> = {
  sanitation: { icon: "🚽", label: "Sanitation",   color: "bg-blue-50 border-blue-200 text-blue-800" },
  water:      { icon: "💧", label: "Water Supply", color: "bg-cyan-50 border-cyan-200 text-cyan-800" },
  waste:      { icon: "♻️", label: "Liquid Waste", color: "bg-green-50 border-green-200 text-green-800" },
  adaptation: { icon: "🌱", label: "Adaptation",   color: "bg-amber-50 border-amber-200 text-amber-800" },
};

const COST_COLOR: Record<string, string> = { Low: "text-green-700", Medium: "text-amber-700", High: "text-red-700" };

const HAZARD_META: Record<string, { icon: string; label: string }> = {
  flood_risk: { icon: "🌊", label: "Pluvial Flood" },
  heat_risk: { icon: "🔥", label: "Heatwave" },
  cyclone_risk: { icon: "🌀", label: "Cyclone" },
  drought_risk: { icon: "☀️", label: "Drought" },
  wetbulb_risk: { icon: "💧", label: "Wet-Bulb Heat" },
  landslide_risk: { icon: "🏔️", label: "Landslide" },
  coldwave_risk: { icon: "❄️", label: "Cold Wave" },
  flashflood_risk: { icon: "⚡", label: "Flash Flood" },
  sealevel_risk: { icon: "🌊", label: "Sea Level Rise" },
  fire_risk: { icon: "🔥", label: "Forest Fire" },
};

const CASCADE_ACTIONS: Record<string, string> = {
  flood_pit_toilet: "Replace pit toilets with sealed septic tanks or DEWATS. Chlorinate all water sources within 48h of flooding.",
  flood_open_defecation: "Deploy mobile toilet units. Distribute ORS packets. Chlorinate all drinking water. Set up diarrhoea treatment centres.",
  drought_water_scarcity: "Deploy water tankers. Monitor bore well levels. Activate rainwater harvesting. Restrict non-essential water use.",
  heat_no_electricity: "Open public cooling shelters. Deploy mobile medical units with IV fluids. Issue heat advisory via SMS.",
  cyclone_poor_sanitation: "Pre-position ORS, water purification tablets, temporary latrines. Plan sanitation restoration within 72h.",
  wetbulb_no_health: "Deploy mobile health units to high wet-bulb areas. Stock IV fluids and cooling equipment. Restrict outdoor labour.",
  landslide_remote: "Pre-position rescue equipment at block HQ. Establish helicopter landing zones. Activate community first responders.",
  flood_low_literacy: "Deliver early warnings via voice messages (not SMS). Set up child-safe evacuation points. Deploy ASHA workers for house-to-house alerts.",
  drought_poverty: "Activate MGNREGA drought works. Distribute drought-resistant seeds. Set up fodder camps. Expedite crop insurance payouts.",
  coldwave_exposure: "Distribute blankets and warm clothing. Open 24/7 night shelters. Deploy hot meal distribution. Alert hospitals for hypothermia cases.",
};

function RiskBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value >= 7 ? "bg-red-500" : value >= 4 ? "bg-amber-500" : value >= 2 ? "bg-yellow-400" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-mono">{value.toFixed(1)}</span>
    </div>
  );
}

export default function ReportPage() {
  const params = useParams<{ district: string }>();
  const districtName = decodeURIComponent(params.district || "");

  const hexQ = useQuery<any[]>({
    queryKey: ["hex-props-report"],
    queryFn: () => fetch("/data/india_hex_props.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const report = useMemo(() => {
    if (!hexQ.data || !districtName) return null;
    const hexes = hexQ.data.filter((p: any) => p.district_name === districtName);
    if (!hexes.length) return null;

    const n = hexes.length;
    const state = hexes[0].state;
    const pop = hexes.reduce((s: number, p: any) => s + (p.population || 0), 0);
    const avgRisk = hexes.reduce((s: number, p: any) => s + (p.hex_risk || 0), 0) / n;
    const maxRisk = Math.max(...hexes.map((p: any) => p.hex_risk || 0));
    const cascadeHexes = hexes.filter((p: any) => (p.cascade_count || 0) > 0).length;

    const hazards = Object.keys(HAZARD_META).map((key) => ({
      key,
      ...HAZARD_META[key],
      avg: hexes.reduce((s: number, p: any) => s + (p[key] || 0), 0) / n,
      max: Math.max(...hexes.map((p: any) => p[key] || 0)),
    })).sort((a, b) => b.avg - a.avg);

    const avgElev = hexes.reduce((s: number, p: any) => s + (p.elevation_mean || 0), 0) / n;
    const avgNdvi = hexes.reduce((s: number, p: any) => s + (p.ndvi_mean || 0), 0) / n;
    const landUse: Record<string, number> = {};
    for (const p of hexes) {
      const lu = p.land_use || "unknown";
      landUse[lu] = (landUse[lu] || 0) + 1;
    }
    const topLandUse = Object.entries(landUse).sort((a, b) => b[1] - a[1]).slice(0, 4);

    const riskLevel = avgRisk >= 7 ? "EXTREME" : avgRisk >= 5 ? "HIGH" : avgRisk >= 3 ? "MODERATE" : "LOW";

    // Determine which cascade rules likely fire
    const activeCascades: string[] = [];
    const topHazard = hazards[0];
    if (topHazard.avg > 3) {
      if (topHazard.key.includes("flood")) { activeCascades.push("flood_pit_toilet"); activeCascades.push("flood_low_literacy"); }
      if (topHazard.key.includes("drought")) { activeCascades.push("drought_water_scarcity"); activeCascades.push("drought_poverty"); }
      if (topHazard.key.includes("heat")) activeCascades.push("heat_no_electricity");
      if (topHazard.key.includes("cyclone")) activeCascades.push("cyclone_poor_sanitation");
      if (topHazard.key.includes("wetbulb")) activeCascades.push("wetbulb_no_health");
      if (topHazard.key.includes("coldwave")) activeCascades.push("coldwave_exposure");
      if (topHazard.key.includes("landslide")) activeCascades.push("landslide_remote");
    }

    // Technology action plan
    const activeHazardKeys = hazards
      .filter((h) => h.key in RISK_TO_TECH_HAZARD && h.avg >= 2.5)
      .map((h) => RISK_TO_TECH_HAZARD[h.key]);
    const uniqueActiveHazards = activeHazardKeys.filter((h, i) => activeHazardKeys.indexOf(h) === i);

    // Score each technology by how many active hazards it is 'recommended' for
    const techScores: { slug: string; score: number; coveredHazards: string[] }[] = [];
    for (const [slug, tech] of Object.entries(technologyContent)) {
      if (!tech.hazardSuitability) continue;
      const covered = uniqueActiveHazards.filter(
        (h) => tech.hazardSuitability![h] === "recommended"
      );
      if (covered.length > 0) {
        techScores.push({ slug, score: covered.length, coveredHazards: covered });
      }
    }
    // Top 6, ranked by score then cost (Low first)
    const COST_RANK: Record<string, number> = { Low: 0, Medium: 1, High: 2 };
    techScores.sort((a, b) =>
      b.score - a.score || COST_RANK[technologyContent[a.slug].costLevel] - COST_RANK[technologyContent[b.slug].costLevel]
    );
    const recommendedTechs = techScores.slice(0, 6);

    return { state, n, pop, avgRisk, maxRisk, riskLevel, cascadeHexes, hazards, avgElev, avgNdvi, topLandUse, activeCascades, uniqueActiveHazards, recommendedTechs };
  }, [hexQ.data, districtName]);

  if (hexQ.isLoading) return <div className="p-8 text-center text-muted-foreground">Loading report data...</div>;
  if (!report) return <div className="p-8 text-center text-muted-foreground">District "{districtName}" not found</div>;

  return (
    <div className="min-h-screen bg-white text-gray-900 print:text-black">
      {/* Navigation (hidden in print) */}
      <div className="print:hidden bg-background border-b px-4 py-2 flex items-center gap-3">
        <Link href="/grid"><Button variant="ghost" size="sm" className="gap-1 text-xs"><ArrowLeft className="h-3 w-3" />Grid</Button></Link>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => window.print()}>
          <Printer className="h-3 w-3" /> Print / PDF
        </Button>
      </div>

      {/* Report content */}
      <div className="max-w-3xl mx-auto px-8 py-6 print:px-0 print:py-4">
        {/* Header */}
        <div className="border-b-2 border-gray-900 pb-3 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{districtName}</h1>
              <p className="text-sm text-gray-500">{report.state} · {report.n} hex cells (H3 res-5, ~252 km² each)</p>
            </div>
            <div className="text-right">
              <div className={`text-xl font-black ${report.riskLevel === "EXTREME" ? "text-red-600" : report.riskLevel === "HIGH" ? "text-orange-500" : report.riskLevel === "MODERATE" ? "text-amber-500" : "text-emerald-600"}`}>
                {report.riskLevel}
              </div>
              <div className="text-xs text-gray-500">Risk Level</div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">ClimResWASH District Risk Profile · Generated {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}</p>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Population", value: report.pop.toLocaleString() },
            { label: "Avg Risk", value: `${report.avgRisk.toFixed(1)} / 10` },
            { label: "Max Risk", value: `${report.maxRisk.toFixed(1)} / 10` },
            { label: "WASH Cascades", value: `${report.cascadeHexes} / ${report.n} hexes` },
          ].map((m) => (
            <div key={m.label} className="border rounded-lg p-3 text-center">
              <div className="text-lg font-bold">{m.value}</div>
              <div className="text-xs text-gray-500">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Hazard profile */}
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Hazard Profile (10 channels)</h2>
        <div className="space-y-2 mb-6">
          {report.hazards.map((h) => (
            <div key={h.key} className="flex items-center gap-3">
              <span className="w-5 text-center">{h.icon}</span>
              <span className="w-28 text-xs">{h.label}</span>
              <div className="flex-1"><RiskBar value={h.avg} /></div>
              <span className="text-[10px] text-gray-400 w-16 text-right">max {h.max.toFixed(1)}</span>
            </div>
          ))}
        </div>

        {/* Terrain */}
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Terrain Characteristics</h2>
        <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
          <div><span className="text-gray-500">Avg Elevation:</span> <b>{Math.round(report.avgElev)}m</b></div>
          <div><span className="text-gray-500">Avg NDVI:</span> <b>{report.avgNdvi.toFixed(2)}</b></div>
          <div>
            <span className="text-gray-500">Land Use:</span>{" "}
            {report.topLandUse.map(([lu, count]) => (
              <span key={lu} className="inline-block mr-2"><b className="capitalize">{lu}</b> ({count})</span>
            ))}
          </div>
        </div>

        {/* WASH Recommendations */}
        {report.activeCascades.length > 0 && (
          <>
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">WASH Intervention Recommendations</h2>
            <div className="space-y-3 mb-6">
              {report.activeCascades.map((ruleId) => CASCADE_ACTIONS[ruleId] && (
                <div key={ruleId} className="border-l-4 border-red-500 pl-3 py-1">
                  <div className="text-xs font-semibold text-red-700 capitalize mb-0.5">{ruleId.replace(/_/g, " ")}</div>
                  <div className="text-xs text-gray-700">{CASCADE_ACTIONS[ruleId]}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Technology Action Plan */}
        {report.recommendedTechs.length > 0 && (
          <>
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-1 mt-6">
              WASH Technology Action Plan
            </h2>
            <p className="text-[10px] text-gray-400 mb-3">
              Technologies recommended for {districtName}'s active hazards:{" "}
              {report.uniqueActiveHazards.join(", ")}
            </p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {report.recommendedTechs.map(({ slug, coveredHazards }) => {
                const tech = technologyContent[slug];
                const catMeta = CATEGORY_META[tech.category];
                return (
                  <div key={slug} className={`border rounded-lg p-3 ${catMeta.color}`}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold leading-tight">{tech.title}</span>
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-white/60 border font-medium">
                        {catMeta.icon} {catMeta.label}
                      </span>
                    </div>
                    <p className="text-[10px] leading-relaxed mb-2 opacity-80 line-clamp-2">
                      {tech.climateResilience}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] space-x-2">
                        <span>Cost: <b className={COST_COLOR[tech.costLevel]}>{tech.costLevel}</b></span>
                        <span>Maint: <b className={COST_COLOR[tech.maintenanceLevel]}>{tech.maintenanceLevel}</b></span>
                      </div>
                      <Link href={`/technology/${slug}`}>
                        <span className="print:hidden text-[10px] underline text-blue-600 hover:text-blue-800 cursor-pointer">
                          Details →
                        </span>
                      </Link>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {coveredHazards.map((h) => (
                        <span key={h} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/50 border font-medium">
                          ✓ {h}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="border-t pt-3 mt-8 text-[10px] text-gray-400">
          <p>Data sources: SRTM 90m (elevation), MODIS 2023 (NDVI), ESA WorldCover 2021 (land use), NFHS-5/DHS (WASH), NITI Aayog MPI (poverty), Census 2011 (population), Open-Meteo/ECMWF (forecast).</p>
          <p className="mt-1">Risk methodology: ClimResWASH formula book (IPCC AR6 framework). Calibrated against 5 real disaster events. {report.n} H3 res-5 hexagons at ~252 km² each.</p>
          <p className="mt-1 font-semibold">ClimResWASH — Climate-Resilient Water, Sanitation & Hygiene Platform</p>
        </div>
      </div>
    </div>
  );
}
