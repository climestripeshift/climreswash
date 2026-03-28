import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import L from "leaflet";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChevronDown, ChevronUp, TrendingUp, Users, AlertTriangle,
  Droplets, Activity, Shield, Zap, Wind, Heart, ArrowLeft, ExternalLink
} from "lucide-react";

const U = "#00AEEF";

// ── Improve Score recommendations per indicator ─────────────────────────────
const IMPROVE_TIPS: Record<string, { title: string; tips: string[]; impact: string }> = {
  hazardScore: {
    title: "Reduce Hazard Exposure",
    tips: [
      "Install community-level early warning systems (SMS alerts, sirens) for flood and heatwave events",
      "Develop district-level Disaster Risk Reduction (DRR) plans aligned with NDMA guidelines",
      "Establish real-time weather monitoring with automated triggers for evacuation protocols",
      "Create nature-based buffers: wetlands, green belts and reforestation for flood/heat mitigation"
    ],
    impact: "Potential 10–20% reduction in effective hazard intensity within 3 years"
  },
  exposureScore: {
    title: "Reduce Population Exposure",
    tips: [
      "Relocate high-risk settlements away from flood plains and drought-prone zones",
      "Strengthen climate-proof shelters and community safe rooms for children and elderly",
      "Map at-risk sub-populations (U5 children, pregnant women, elderly) with geo-tagged registers",
      "Integrate exposure data into ICDS and Anganwadi programme planning"
    ],
    impact: "5–15% reduction in at-risk population through targeted relocation and shelter programs"
  },
  vulnerabilityScore: {
    title: "Reduce Overall Vulnerability",
    tips: [
      "Converge WASH, health and nutrition schemes at the district level under a single vulnerability index",
      "Prioritise multi-sector interventions in Very High and High vulnerability districts",
      "Strengthen social protection (PMGSY, MGNREGA) to reduce household vulnerability",
      "Build district-level climate vulnerability profiles updated annually with new survey data"
    ],
    impact: "15–25% composite vulnerability score improvement with integrated programming"
  },
  malnutritionStunting: {
    title: "Reduce Stunting",
    tips: [
      "Intensify POSHAN Abhiyaan implementation — prioritise districts with stunting >40%",
      "Strengthen complementary feeding practices through Anganwadi workers and ASHAs",
      "Improve safe water access for formula preparation and complementary feeding hygiene",
      "Link stunting data with WASH coverage gaps for co-located interventions"
    ],
    impact: "5-point stunting reduction achievable in 2–3 years with POSHAN convergence"
  },
  malnutritionWasting: {
    title: "Reduce Wasting",
    tips: [
      "Scale up CMAM (Community-based Management of Acute Malnutrition) programmes",
      "Strengthen RUTF (Ready-to-Use Therapeutic Food) supply chains to sub-district level",
      "Train frontline workers to identify and refer SAM/MAM children within 48 hours",
      "Integrate wasting screening into monsoon/heatwave early warning dashboards"
    ],
    impact: "3–5 point wasting rate reduction over 18 months with CMAM scale-up"
  },
  malnutritionUnderweight: {
    title: "Reduce Underweight Prevalence",
    tips: [
      "Ensure 100% coverage of Supplementary Nutrition Programme (SNP) in Anganwadis",
      "Strengthen monthly growth monitoring and promotion (GMP) sessions",
      "Increase dietary diversity through kitchen garden programmes for WASH-sensitive nutrition",
      "Address household food security through PDS, mid-day meals and MGNREGA linkages"
    ],
    impact: "8–12 point underweight reduction within 3 years with integrated nutrition interventions"
  },
  infantMortalityRate: {
    title: "Reduce Infant Mortality",
    tips: [
      "Strengthen newborn care and SNCU (Special Newborn Care Units) in district hospitals",
      "Increase skilled birth attendance and improve cold-chain for immunisation programmes",
      "Accelerate WASH access in health facilities — hand hygiene before/after deliveries",
      "Deploy community health workers for neonatal home visits (HBNC protocol)"
    ],
    impact: "5–10 point IMR reduction with strengthened MNCH and facility WASH"
  },
  maternalMortalityRatio: {
    title: "Reduce Maternal Mortality",
    tips: [
      "Ensure all deliveries occur in facilities with clean water, sanitation and hygiene (WASH)",
      "Strengthen EmOC (Emergency Obstetric Care) at CHC and district hospital level",
      "Eliminate open defecation among pregnant women — deploy targeted SBM-G2 convergence",
      "Improve ANC quality with nutrition counselling and safe water messaging at every contact"
    ],
    impact: "20–30% MMR reduction achievable with facility WASH and skilled attendance improvement"
  },
  childMarriageRate: {
    title: "Reduce Child Marriage",
    tips: [
      "Strengthen Beti Bachao Beti Padhao convergence with district administration",
      "Support girls' education continuity — school WASH and girl-friendly toilets are key enablers",
      "Engage community leaders and self-help groups in awareness and accountability campaigns",
      "Establish district child protection committees with monitoring dashboards"
    ],
    impact: "Measurable reduction in 2–3 years with sustained community and school-level interventions"
  },
  dropoutRate: {
    title: "Reduce School Dropout",
    tips: [
      "Install gender-separated, lockable toilets with running water in all government schools",
      "Provide menstrual hygiene management (MHM) kits and counselling for adolescent girls",
      "Use climate risk data to plan school calendars around peak hazard periods (heatwaves, floods)",
      "Establish mid-day meal programmes with safe water to keep children in school"
    ],
    impact: "5–8 point dropout reduction annually with school WASH and climate-responsive calendars"
  },
  waterAccessPercent: {
    title: "Improve Water Access",
    tips: [
      "Accelerate Jal Jeevan Mission (JJM) household tap connections in lagging districts",
      "Invest in climate-resilient water sources: covered wells, rainwater harvesting, solar pumps",
      "Establish water quality monitoring committees at Gram Panchayat level",
      "Prioritise WASH for health facilities, schools and Anganwadis as first-mile access points"
    ],
    impact: "10–20% coverage increase possible within 2 years with JJM accelerated delivery"
  },
  toiletCoveragePercent: {
    title: "Improve Sanitation Coverage",
    tips: [
      "Achieve ODF-Plus status through SBM-G Phase 2 — focus on usage and maintenance",
      "Promote twin-pit pour-flush latrines as a permanent solution in high water-table areas",
      "Conduct community-led total sanitation (CLTS) campaigns in low-coverage GPs",
      "Ensure school and health facility toilets are functional and clean — monitor monthly"
    ],
    impact: "15–25% toilet coverage and usage increase with ODF-Plus programming"
  },
  handwashingFacilityPercent: {
    title: "Improve Handwashing Coverage",
    tips: [
      "Install tippy taps and handwashing stations at all schools and Anganwadis",
      "Promote behaviour change using Global Handwashing Day campaigns and ASHA-led demos",
      "Bundle soap distribution with immunisation and nutrition outreach programmes",
      "Design handwashing stations using local materials to ensure sustainability and replication"
    ],
    impact: "20–30% increase in households with soap and water within 12 months"
  },
  adaptationScore: {
    title: "Strengthen Adaptive Capacity",
    tips: [
      "Develop district-level Climate Adaptation Plans (CAPs) with SDMA and line departments",
      "Invest in community-based adaptation: drought-tolerant crops, watershed management",
      "Strengthen social protection nets (MGNREGA, PMJDY) as climate shock buffers",
      "Create district climate risk funds for rapid-response adaptation programming"
    ],
    impact: "Adaptive capacity score improvement of 10–20 points over 3–5 years with systematic planning"
  },
  riskScore: {
    title: "Reduce Composite Climate Risk",
    tips: [
      "Integrate Hazard × Exposure × Vulnerability reduction across all line departments",
      "Establish a District Climate Risk Cell that coordinates across health, WASH and agriculture",
      "Use this dashboard to prioritise investments in districts with highest compound risk scores",
      "Track annual progress against baseline and report through state climate action plan reviews"
    ],
    impact: "15–30% composite risk score reduction with integrated multi-sector programming"
  }
};

// ── Score status helper ──────────────────────────────────────────────────────
function getStatus(value: number, inverse = false, thresholds = [25, 50, 75]): {
  label: string; color: string; bg: string;
} {
  const v = inverse ? 100 - value : value;
  if (v < thresholds[0]) return { label: "Critical", color: "#ef4444", bg: "#fef2f2" };
  if (v < thresholds[1]) return { label: "High Risk", color: "#f97316", bg: "#fff7ed" };
  if (v < thresholds[2]) return { label: "Moderate", color: "#eab308", bg: "#fefce8" };
  return { label: "Good", color: "#22c55e", bg: "#f0fdf4" };
}

function scoreStatus(score: number): { label: string; color: string } {
  if (score > 0.7) return { label: "Very High", color: "#ef4444" };
  if (score > 0.5) return { label: "High", color: "#f97316" };
  if (score > 0.3) return { label: "Moderate", color: "#eab308" };
  if (score > 0.15) return { label: "Low", color: "#22c55e" };
  return { label: "Very Low", color: "#16a34a" };
}

// ── Indicator Row Component ──────────────────────────────────────────────────
function IndicatorRow({
  label, value, unit, max, inverse, tipKey, description
}: {
  label: string; value: number | null; unit?: string; max?: number;
  inverse?: boolean; tipKey?: string; description?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const tip = tipKey ? IMPROVE_TIPS[tipKey] : null;
  const displayMax = max ?? 100;
  const pct = value != null ? Math.min(100, (value / displayMax) * 100) : 0;
  const status = value != null ? getStatus(pct, inverse) : { label: "N/A", color: "#94a3b8", bg: "#f8fafc" };

  return (
    <div className="border border-border rounded-lg overflow-hidden mb-2">
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <div className="text-sm font-medium text-foreground">{label}</div>
          {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-right min-w-[80px]">
            <span className="text-lg font-bold text-foreground">
              {value != null ? (Number.isInteger(value) || value > 10 ? Math.round(value) : value.toFixed(3)) : "—"}
            </span>
            {unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
          </div>
          <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: status.color }}
            />
          </div>
          <Badge
            className="text-xs shrink-0 border-0"
            style={{ background: status.bg, color: status.color }}
          >
            {status.label}
          </Badge>
          {tip && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1 border-dashed shrink-0"
              style={{ borderColor: U, color: U }}
              onClick={() => setExpanded(e => !e)}
              data-testid={`improve-${tipKey}`}
            >
              <TrendingUp className="h-3 w-3" />
              Improve Score
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
        </div>
      </div>
      {expanded && tip && (
        <div className="border-t border-border bg-muted/30 px-4 py-3">
          <div className="text-xs font-semibold mb-2" style={{ color: U }}>{tip.title}</div>
          <ul className="space-y-1.5 mb-3">
            {tip.tips.map((t, i) => (
              <li key={i} className="text-xs text-muted-foreground flex gap-2">
                <span className="mt-0.5 shrink-0" style={{ color: U }}>→</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="text-xs rounded px-3 py-1.5 inline-block" style={{ background: "#e0f5ff", color: "#0369a1" }}>
            📈 {tip.impact}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Panel Component ──────────────────────────────────────────────────────────
function ScorePanel({
  icon, title, score, scoreMax = 1, scoreLabel, color, children
}: {
  icon: React.ReactNode; title: string; score: number | null;
  scoreMax?: number; scoreLabel?: string; color: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const pct = score != null ? Math.min(100, (score / scoreMax) * 100) : 0;
  const { label } = score != null ? scoreStatus(scoreMax <= 1 ? score : score / scoreMax) : { label: "N/A" };

  return (
    <Card className="mb-4">
      <CardHeader
        className="cursor-pointer select-none pb-3"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white" style={{ background: color }}>
              {icon}
            </div>
            <CardTitle className="text-base">{title}</CardTitle>
            {score != null && (
              <Badge className="border-0 text-white text-xs" style={{ background: color }}>
                {scoreMax <= 1 ? score.toFixed(3) : Math.round(score)} · {scoreLabel || label}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="w-28 h-2 bg-muted rounded-full overflow-hidden hidden sm:block">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
            </div>
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon, color }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; color: string;
}) {
  return (
    <div className="rounded-xl border border-border p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ background: color }}>
        {icon}
      </div>
      <div>
        <div className="text-xl font-bold text-foreground">{value}</div>
        <div className="text-xs font-medium text-foreground">{label}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function avg(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function sum(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0);
}
function fmtN(n: number) {
  if (n >= 1e7) return (n / 1e7).toFixed(1) + " Cr";
  if (n >= 1e5) return (n / 1e5).toFixed(1) + " L";
  if (n >= 1000) return (n / 1000).toFixed(0) + "K";
  return String(Math.round(n));
}

// ── Main Component ────────────────────────────────────────────────────────────
// ── Live Map Component ────────────────────────────────────────────────────────
function LiveMap({
  geoJsonData, districtDataMap, idStateMap, selState, selDistrict, onSelectDistrict
}: {
  geoJsonData: any;
  districtDataMap: Record<string, any>;
  idStateMap: Record<string, { state: string; name: string }>;
  selState: string;
  selDistrict: string;
  onSelectDistrict: (stateName: string, districtId: string) => void;
}) {
  const getVulnColor = (score: number) => {
    if (score > 0.7) return '#ef4444';
    if (score > 0.5) return '#f97316';
    if (score > 0.3) return '#eab308';
    if (score > 0.15) return '#22c55e';
    return '#16a34a';
  };

  const getFeatureState = useCallback((feature: any) => {
    const id = feature.properties.ID;
    return idStateMap[String(id)]?.state || feature.properties.STATE || '';
  }, [idStateMap]);

  const style = useCallback((feature: any) => {
    const name = feature.properties.DISTRICT?.toUpperCase();
    const featureState = getFeatureState(feature);
    const data = name ? districtDataMap[name] : undefined;

    const isSelectedDistrict = data && data.id === selDistrict;
    const isInSelectedState = selState ? featureState === selState : true;

    if (!data) return { fillColor: '#475569', weight: 0.5, opacity: 1, color: '#1e293b', fillOpacity: 0.2 };

    if (isSelectedDistrict) {
      return { fillColor: U, weight: 3, opacity: 1, color: '#fff', fillOpacity: 0.95 };
    }
    if (selState && !isInSelectedState) {
      return { fillColor: '#334155', weight: 0.3, opacity: 0.5, color: '#1e293b', fillOpacity: 0.12 };
    }

    const color = getVulnColor(data.vulnerabilityScore ?? 0);
    const opacity = selState && isInSelectedState ? 0.85 : selState ? 0.2 : 0.65;
    return { fillColor: color, weight: isInSelectedState && selState ? 1 : 0.5, opacity: 1, color: '#1e293b', fillOpacity: opacity };
  }, [districtDataMap, idStateMap, selState, selDistrict, getFeatureState]);

  const onEachFeature = useCallback((feature: any, layer: L.Layer) => {
    const name = feature.properties.DISTRICT?.toUpperCase();
    const featureState = getFeatureState(feature);
    const data = name ? districtDataMap[name] : undefined;
    if (!data) return;

    (layer as any).on({
      mouseover: (e: any) => {
        e.target.setStyle({ weight: 2, color: '#ffffff', fillOpacity: 0.95 });
        e.target.bringToFront();
      },
      mouseout: (e: any) => {
        const isSelectedDistrict = data.id === selDistrict;
        const isInSelectedState = selState ? featureState === selState : true;
        e.target.setStyle({
          weight: isSelectedDistrict ? 3 : isInSelectedState && selState ? 1 : 0.5,
          color: isSelectedDistrict ? '#fff' : '#1e293b',
          fillOpacity: isSelectedDistrict ? 0.95 : isInSelectedState ? 0.75 : selState ? 0.12 : 0.65,
        });
      },
      click: () => {
        onSelectDistrict(featureState, data.id);
      },
    });

    (layer as any).bindTooltip(
      `<div style="font-size:12px;line-height:1.5">
        <strong>${data.name}</strong><br/>
        <span style="color:#94a3b8">${featureState}</span><br/>
        Vulnerability: <strong style="color:${getVulnColor(data.vulnerabilityScore)}">${data.vulnerabilityCategory || (data.vulnerabilityScore * 100).toFixed(0) + '%'}</strong>
      </div>`,
      { sticky: true, className: 'leaflet-hazard-tooltip' }
    );
  }, [districtDataMap, idStateMap, selState, selDistrict, onSelectDistrict, getFeatureState]);

  if (!geoJsonData || Object.keys(districtDataMap).length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-950 rounded-xl text-white text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-2 mr-2" style={{ borderColor: U, borderTopColor: 'transparent' }} />
        Loading map…
      </div>
    );
  }

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden">
      <MapContainer
        key={`${selState}-${selDistrict}`}
        center={[22.5, 82.5]}
        zoom={selState ? 6 : 5}
        style={{ height: '100%', width: '100%', background: '#0f172a' }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution="© CartoDB"
        />
        <GeoJSON
          key={`geo-${selState}-${selDistrict}-${Object.keys(districtDataMap).length}`}
          data={geoJsonData}
          style={style}
          onEachFeature={onEachFeature}
        />
      </MapContainer>
      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-[1000] bg-black/70 backdrop-blur border border-white/10 p-2 rounded-lg text-xs space-y-1 text-white">
        <div className="font-semibold text-[10px] uppercase tracking-wider text-white/60 mb-1">Vulnerability</div>
        {[['#ef4444','Very High'],['#f97316','High'],['#eab308','Moderate'],['#22c55e','Low'],['#16a34a','Very Low']].map(([c,l]) => (
          <div key={l} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c }} />
            <span className="text-white/80">{l}</span>
          </div>
        ))}
        {selState && (
          <div className="flex items-center gap-1.5 pt-1 border-t border-white/10">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: U }} />
            <span className="text-white/80">Selected</span>
          </div>
        )}
      </div>
      {/* Hint */}
      <div className="absolute top-3 left-3 z-[1000] bg-black/60 backdrop-blur px-2 py-1 rounded text-xs text-white/70">
        Click district to filter
      </div>
    </div>
  );
}

export default function LiveDataPage() {
  const [geoData, setGeoData] = useState<Record<string, string>>({});
  const [geoJsonData, setGeoJsonData] = useState<any>(null);
  const [idStateMap, setIdStateMap] = useState<Record<string, { state: string; name: string }>>({});
  const [selState, setSelState] = useState<string>("");
  const [selDistrict, setSelDistrict] = useState<string>("");
  const mapClickRef = useRef(false);

  const { data: allDistricts = [], isLoading } = useQuery<any[]>({
    queryKey: ["districts"],
    queryFn: () => fetch("/api/districts").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  // Load GeoJSON and reliable district-state map
  useEffect(() => {
    Promise.all([
      fetch("/data/india.json").then(r => r.json()),
      fetch("/data/districtStateMap.json").then(r => r.json()),
    ]).then(([geo, stateMap]: [any, any]) => {
      setGeoJsonData(geo);
      setIdStateMap(stateMap);
      // Also build a name-based fallback for districts not in idStateMap
      const map: Record<string, string> = {};
      geo.features.forEach((f: any) => {
        const name = f.properties.NAME || f.properties.DISTRICT;
        const id = f.properties.ID;
        const state = stateMap[String(id)]?.state || f.properties.STATE;
        if (name && state) map[name.toUpperCase()] = state;
      });
      setGeoData(map);
    }).catch(console.error);
  }, []);

  // Enrich districts with state (use idStateMap first, fall back to geoData name-lookup)
  const enriched = useMemo(() =>
    allDistricts.map(d => ({
      ...d,
      stateName: idStateMap[d.id]?.state || geoData[d.name?.toUpperCase()] || "Unknown"
    })),
    [allDistricts, idStateMap, geoData]
  );

  const stateList = useMemo(() =>
    [...new Set(enriched.map(d => d.stateName).filter(s => s !== "Unknown"))].sort(),
    [enriched]
  );

  const districtList = useMemo(() =>
    selState
      ? enriched.filter(d => d.stateName === selState).sort((a, b) => a.name.localeCompare(b.name))
      : [],
    [enriched, selState]
  );

  // When state changes via DROPDOWN, reset district (but not when a map click sets both together)
  useEffect(() => {
    if (mapClickRef.current) { mapClickRef.current = false; return; }
    setSelDistrict("");
  }, [selState]);

  // Filtered dataset for aggregation
  const filtered = useMemo(() => {
    if (selDistrict) return enriched.filter(d => d.id === selDistrict);
    if (selState) return enriched.filter(d => d.stateName === selState);
    return enriched;
  }, [enriched, selState, selDistrict]);

  // Compute aggregated metrics
  const metrics = useMemo(() => {
    if (!filtered.length) return null;
    const isSingle = filtered.length === 1;
    const d = filtered[0];

    const get = (field: string) =>
      isSingle ? d[field] ?? 0 : avg(filtered.map((x: any) => x[field] ?? 0));

    const hazardIntensities: Record<string, number> = isSingle
      ? (d.hazardIntensities || {})
      : {};

    const topHazards: string[] = isSingle
      ? (d.climateRisks || [])
      : [...new Set(filtered.flatMap((x: any) => x.climateRisks || []))].slice(0, 5);

    return {
      population: sum(filtered.map((x: any) => x.population ?? 0)),
      childrenAtRisk: sum(filtered.map((x: any) => x.childrenAtRisk ?? 0)),
      elderlyAtRisk: sum(filtered.map((x: any) => x.elderlyAtRisk ?? 0)),
      hazardScore: get("hazardScore"),
      exposureScore: get("exposureScore"),
      vulnerabilityScore: get("vulnerabilityScore"),
      riskScore: get("riskScore"),
      adaptationScore: get("adaptationScore"),
      vulnerabilityCategory: isSingle ? (d.vulnerabilityCategory || "—") : "Aggregated",
      riskCategory: isSingle ? (d.riskCategory || "—") : "Aggregated",
      waterAccessPercent: get("waterAccessPercent"),
      toiletCoveragePercent: get("toiletCoveragePercent"),
      handwashingFacilityPercent: get("handwashingFacilityPercent"),
      malnutritionStunting: get("malnutritionStunting"),
      malnutritionWasting: get("malnutritionWasting"),
      malnutritionUnderweight: get("malnutritionUnderweight"),
      infantMortalityRate: get("infantMortalityRate"),
      maternalMortalityRatio: get("maternalMortalityRatio"),
      childMarriageRate: get("childMarriageRate"),
      dropoutRate: get("dropoutRate"),
      topHazards,
      hazardIntensities,
      adaptationStrategies: isSingle ? (d.adaptationStrategies || []) : [],
      districtCount: filtered.length,
    };
  }, [filtered]);

  const levelLabel = selDistrict
    ? districtList.find(d => d.id === selDistrict)?.name || "District"
    : selState || "All India";

  // Build district data map keyed by uppercase name (for map lookup)
  const districtDataMap = useMemo(() => {
    const map: Record<string, any> = {};
    enriched.forEach(d => {
      if (d.name) map[d.name.toUpperCase()] = d;
    });
    return map;
  }, [enriched]);

  // Map click handler — set state & district (prevents the useEffect from resetting district)
  const onSelectDistrict = useCallback((stateName: string, districtId: string) => {
    mapClickRef.current = true;
    setSelState(stateName);
    setSelDistrict(districtId);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: U }}>
              <Droplets className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm hidden sm:block">ClimateAdapt India</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard">
              <Button variant="outline" size="sm" className="text-xs gap-1.5" data-testid="nav-demo-data">
                <Activity className="h-3.5 w-3.5" />
                Demo Map
              </Button>
            </Link>
            <Button size="sm" className="text-xs gap-1.5 text-white" style={{ background: U }} data-testid="nav-live-data">
              <Zap className="h-3.5 w-3.5" />
              Live Data
            </Button>
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="text-xs gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                Admin
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 pt-6">
        {/* Page Title */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold">Live Data Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            District-level climate vulnerability indicators · India · IPCC AR5 Framework
          </p>
        </div>

        {/* Filter Bar */}
        <Card className="mb-0">
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[140px]">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                  🌏 Country
                </label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value="IND"
                  readOnly
                  data-testid="filter-country"
                >
                  <option value="IND">India</option>
                </select>
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                  🗺️ State / UT
                </label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selState}
                  onChange={e => setSelState(e.target.value)}
                  data-testid="filter-state"
                >
                  <option value="">All States</option>
                  {stateList.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                  📍 District
                </label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selDistrict}
                  onChange={e => setSelDistrict(e.target.value)}
                  disabled={!selState}
                  data-testid="filter-district"
                >
                  <option value="">{selState ? "All Districts" : "Select a state first"}</option>
                  {districtList.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end pb-0.5">
                {(selState || selDistrict) && (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => { setSelState(""); setSelDistrict(""); }}
                    data-testid="filter-reset"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
            {metrics && (
              <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
                <span>Showing:</span>
                <Badge variant="outline" className="text-xs">{levelLabel}</Badge>
                <span>·</span>
                <span>{metrics.districtCount} district{metrics.districtCount !== 1 ? "s" : ""} aggregated</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Two-column layout: map left, indicators right */}
      <div className="max-w-7xl mx-auto px-4 pb-8 mt-4">
        <div className="flex gap-4 items-start">

          {/* Left: Map (sticky) — hidden on small screens */}
          <div className="hidden lg:block w-[42%] sticky top-14" style={{ height: 'calc(100vh - 3.6rem)' }}>
            <LiveMap
              geoJsonData={geoJsonData}
              districtDataMap={districtDataMap}
              idStateMap={idStateMap}
              selState={selState}
              selDistrict={selDistrict}
              onSelectDistrict={onSelectDistrict}
            />
          </div>

          {/* Right: Indicators */}
          <div className="flex-1 space-y-4 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent mr-3" style={{ borderColor: U, borderTopColor: "transparent" }} />
            Loading data…
          </div>
        ) : !metrics ? (
          <div className="text-center text-muted-foreground py-20">No data available</div>
        ) : (
          <>
            {/* KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <KpiCard
                label="Total Population" value={fmtN(metrics.population)}
                sub={`${metrics.districtCount} district${metrics.districtCount !== 1 ? "s" : ""}`}
                icon={<Users className="h-5 w-5" />} color="#3b82f6"
              />
              <KpiCard
                label="Children at Risk" value={fmtN(metrics.childrenAtRisk)}
                sub="Under climate hazards"
                icon={<Heart className="h-5 w-5" />} color="#ef4444"
              />
              <KpiCard
                label="Elderly at Risk" value={fmtN(metrics.elderlyAtRisk)}
                sub="60+ population exposed"
                icon={<Users className="h-5 w-5" />} color="#f97316"
              />
              <KpiCard
                label="Composite Risk" value={metrics.riskScore.toFixed(4)}
                sub={metrics.riskCategory}
                icon={<AlertTriangle className="h-5 w-5" />} color="#7c3aed"
              />
            </div>

            {/* ── HAZARD PANEL ── */}
            <ScorePanel
              icon={<Wind className="h-4 w-4" />}
              title="Hazard"
              score={metrics.hazardScore}
              color="#ef4444"
              scoreLabel={scoreStatus(metrics.hazardScore).label}
            >
              <IndicatorRow
                label="Composite Hazard Score"
                value={metrics.hazardScore}
                max={1}
                inverse
                tipKey="hazardScore"
                description="Weighted average of all climate hazard intensities"
              />
              <div className="mb-2 px-4 py-3 rounded-lg border border-border">
                <div className="text-sm font-medium mb-2">Primary Climate Hazards</div>
                <div className="flex flex-wrap gap-1.5">
                  {metrics.topHazards.map((h: string) => (
                    <Badge key={h} variant="outline" className="text-xs">{h}</Badge>
                  ))}
                  {!metrics.topHazards.length && <span className="text-xs text-muted-foreground">No data</span>}
                </div>
              </div>
              {Object.keys(metrics.hazardIntensities).length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Hazard Intensities</div>
                  {Object.entries(metrics.hazardIntensities).map(([h, v]) => (
                    <IndicatorRow
                      key={h}
                      label={h}
                      value={(v as number) * 100}
                      unit="%"
                      max={100}
                      inverse
                      description="0 = None, 100 = Extreme"
                    />
                  ))}
                </div>
              )}
            </ScorePanel>

            {/* ── EXPOSURE PANEL ── */}
            <ScorePanel
              icon={<Users className="h-4 w-4" />}
              title="Exposure"
              score={metrics.exposureScore}
              color="#f97316"
              scoreLabel={scoreStatus(metrics.exposureScore).label}
            >
              <IndicatorRow
                label="Composite Exposure Score"
                value={metrics.exposureScore}
                max={1}
                inverse
                tipKey="exposureScore"
                description="Population exposed to climate hazard events"
              />
              <IndicatorRow
                label="Children at Risk"
                value={Math.round((metrics.childrenAtRisk / (metrics.population || 1)) * 100)}
                unit="% of pop."
                max={100}
                inverse
                description={`${fmtN(metrics.childrenAtRisk)} children under climate hazard exposure`}
              />
              <IndicatorRow
                label="Elderly at Risk (60+)"
                value={Math.round((metrics.elderlyAtRisk / (metrics.population || 1)) * 100)}
                unit="% of pop."
                max={100}
                inverse
                description={`${fmtN(metrics.elderlyAtRisk)} elderly persons exposed to climate risks`}
              />
            </ScorePanel>

            {/* ── SENSITIVITY / VULNERABILITY PANEL ── */}
            <ScorePanel
              icon={<Activity className="h-4 w-4" />}
              title="Sensitivity (Vulnerability)"
              score={metrics.vulnerabilityScore}
              color="#eab308"
              scoreLabel={scoreStatus(metrics.vulnerabilityScore).label}
            >
              <IndicatorRow
                label="Composite Vulnerability Score"
                value={metrics.vulnerabilityScore}
                max={1}
                inverse
                tipKey="vulnerabilityScore"
                description="CEEW CVI vulnerability index (0 = least, 1 = most vulnerable)"
              />
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 mt-4 mb-2">Nutrition Indicators</div>
              <IndicatorRow
                label="Malnutrition — Stunting"
                value={metrics.malnutritionStunting}
                unit="%"
                max={100}
                inverse
                tipKey="malnutritionStunting"
                description="Children under 5 with height-for-age below −2SD (chronic undernutrition)"
              />
              <IndicatorRow
                label="Malnutrition — Wasting"
                value={metrics.malnutritionWasting}
                unit="%"
                max={100}
                inverse
                tipKey="malnutritionWasting"
                description="Children under 5 with weight-for-height below −2SD (acute undernutrition)"
              />
              <IndicatorRow
                label="Malnutrition — Underweight"
                value={metrics.malnutritionUnderweight}
                unit="%"
                max={100}
                inverse
                tipKey="malnutritionUnderweight"
                description="Children under 5 with weight-for-age below −2SD"
              />
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 mt-4 mb-2">Health Indicators</div>
              <IndicatorRow
                label="Infant Mortality Rate"
                value={metrics.infantMortalityRate}
                unit="per 1,000"
                max={150}
                inverse
                tipKey="infantMortalityRate"
                description="Deaths per 1,000 live births in the first year of life"
              />
              <IndicatorRow
                label="Maternal Mortality Ratio"
                value={metrics.maternalMortalityRatio}
                unit="per 1 L"
                max={500}
                inverse
                tipKey="maternalMortalityRatio"
                description="Maternal deaths per 100,000 live births"
              />
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 mt-4 mb-2">Social Indicators</div>
              <IndicatorRow
                label="Child Marriage Rate"
                value={metrics.childMarriageRate}
                unit="%"
                max={100}
                inverse
                tipKey="childMarriageRate"
                description="% of girls married before age 18"
              />
              <IndicatorRow
                label="School Dropout Rate"
                value={metrics.dropoutRate}
                unit="%"
                max={100}
                inverse
                tipKey="dropoutRate"
                description="% of students who leave school before completing primary education"
              />
            </ScorePanel>

            {/* ── RISK PANEL ── */}
            <ScorePanel
              icon={<AlertTriangle className="h-4 w-4" />}
              title="Composite Climate Risk"
              score={metrics.riskScore}
              scoreMax={0.1}
              color="#7c3aed"
              scoreLabel={metrics.riskCategory || scoreStatus(metrics.riskScore * 10).label}
            >
              <IndicatorRow
                label="Composite Risk Score"
                value={metrics.riskScore}
                max={0.1}
                inverse
                tipKey="riskScore"
                description="Hazard × Exposure × Vulnerability / Adaptive Capacity (IPCC AR5 framework)"
              />
              <div className="px-4 py-3 rounded-lg border border-border mt-2">
                <div className="text-sm font-medium mb-2">Risk Framework</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
                  {[
                    { l: "Hazard", v: metrics.hazardScore.toFixed(3), c: "#ef4444" },
                    { l: "Exposure", v: metrics.exposureScore.toFixed(3), c: "#f97316" },
                    { l: "Vulnerability", v: metrics.vulnerabilityScore.toFixed(3), c: "#eab308" },
                    { l: "Adaptive Cap.", v: (metrics.adaptationScore / 100).toFixed(3), c: "#22c55e" },
                  ].map(({ l, v, c }) => (
                    <div key={l} className="rounded-lg py-2 px-1" style={{ background: c + "20" }}>
                      <div className="font-bold text-base" style={{ color: c }}>{v}</div>
                      <div className="text-muted-foreground">{l}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-muted-foreground text-center">
                  Risk = Hazard × Exposure × Vulnerability / Adaptive Capacity
                </div>
              </div>
            </ScorePanel>

            {/* ── ADAPTIVE CAPACITY PANEL ── */}
            <ScorePanel
              icon={<Shield className="h-4 w-4" />}
              title="Adaptive Capacity"
              score={metrics.adaptationScore}
              scoreMax={100}
              color="#22c55e"
              scoreLabel={
                metrics.adaptationScore >= 80 ? "Very Good"
                  : metrics.adaptationScore >= 60 ? "Good"
                  : metrics.adaptationScore >= 40 ? "Moderate"
                  : metrics.adaptationScore >= 20 ? "Low" : "Critical"
              }
            >
              <IndicatorRow
                label="Adaptive Capacity Score"
                value={metrics.adaptationScore}
                unit="/ 100"
                max={100}
                tipKey="adaptationScore"
                description="Composite score of WASH infrastructure and social resilience indicators"
              />
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 mt-4 mb-2">WASH Coverage</div>
              <IndicatorRow
                label="Safe Water Access"
                value={metrics.waterAccessPercent}
                unit="%"
                max={100}
                tipKey="waterAccessPercent"
                description="Households with access to a safe and adequate water source (JJM, handpumps, piped)"
              />
              <IndicatorRow
                label="Toilet Coverage (ODF)"
                value={metrics.toiletCoveragePercent}
                unit="%"
                max={100}
                tipKey="toiletCoveragePercent"
                description="Households with access to a sanitary toilet facility (SBM-G Phase 2)"
              />
              <IndicatorRow
                label="Handwashing Facility"
                value={metrics.handwashingFacilityPercent}
                unit="%"
                max={100}
                tipKey="handwashingFacilityPercent"
                description="Households with soap and water available for handwashing"
              />
              {metrics.adaptationStrategies.length > 0 && (
                <div className="mt-3 px-4 py-3 rounded-lg border border-border">
                  <div className="text-sm font-medium mb-2">Adaptation Strategies in Place</div>
                  <div className="flex flex-wrap gap-1.5">
                    {metrics.adaptationStrategies.map((s: string) => (
                      <Badge key={s} className="text-xs border-0 text-white" style={{ background: "#22c55e" }}>{s}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </ScorePanel>

            {/* Admin edit note */}
            <div className="mt-4 p-4 rounded-lg border border-dashed border-border text-sm text-muted-foreground flex items-center gap-3">
              <ExternalLink className="h-4 w-4 shrink-0" style={{ color: U }} />
              <span>
                Data for each indicator can be updated from the{" "}
                <Link href="/admin" className="font-medium underline" style={{ color: U }}>
                  Admin Console
                </Link>
                . Dynamic data import from national surveys will be available in a future release.
              </span>
            </div>
          </>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
