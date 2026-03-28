import { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext } from "react";
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
  Droplets, Activity, Shield, Zap, Wind, Heart, ArrowLeft, ExternalLink,
  Wrench, Droplet, FlaskConical, Leaf, ArrowRight, MapPin, X
} from "lucide-react";
import { getRecommendedTechnologies } from "@/lib/technologyContent";

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
  schoolToiletPercent: {
    title: "Improve School Sanitation",
    tips: [
      "Prioritise construction of gender-separated, lockable toilets in all government schools under SBMG-Phase 2",
      "Ensure all school toilets have running water, soap and are maintained daily by Swachh Bharat Swachh Vidyalaya (SBSV) norms",
      "Link school toilet coverage to midday meal access — functional toilets improve attendance, especially for girls",
      "Conduct biannual WASH in Schools (WinS) audits with School Management Committees (SMCs)"
    ],
    impact: "5–10 point drop in school dropout rate with fully functional, gender-separated school toilets"
  },
  schoolWaterPercent: {
    title: "Improve School Water Access",
    tips: [
      "Install piped water connections or overhead tanks in all schools under Jal Jeevan Mission (JJM) — school priority category",
      "Set up school-level water quality testing committees and display results publicly",
      "Provide safe drinking water stations (ceramic/candle filters) in schools lacking piped supply",
      "Integrate school water access data into district education planning dashboards"
    ],
    impact: "Improved learning outcomes and attendance for 100% of enrolled children with clean water in classrooms"
  },
  anganwadiToiletPercent: {
    title: "Improve Anganwadi Sanitation",
    tips: [
      "Construct toilets in all ICDS Anganwadi Centres (AWCs) — target 100% coverage under Mission Poshan 2.0",
      "Ensure AWC toilets are child-friendly (low height, easy flush) and cleaned daily by Anganwadi Workers (AWWs)",
      "Provide hygiene kits (soap, disinfectant) to all AWCs on a monthly basis through the district ICDS office",
      "Link AWC sanitation data with malnutrition programme monitoring — safe sanitation reduces diarrhoeal disease burden"
    ],
    impact: "3–5 point reduction in child malnutrition rates with clean, functional Anganwadi WASH facilities"
  },
  anganwadiWaterPercent: {
    title: "Improve Anganwadi Water Access",
    tips: [
      "Ensure piped water connections in all AWCs under JJM institutional connections programme",
      "Install food-grade water storage containers (50-litre minimum) in AWCs without piped connections",
      "Train AWWs on safe water handling, boiling and chlorination protocols for infant feeding areas",
      "Prioritise AWCs with children under 2 for emergency water supply during drought and heatwave periods"
    ],
    impact: "10–15% reduction in childhood diarrhoea incidence with safe water in all Anganwadi feeding centres"
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

// ── Mappable indicator config ─────────────────────────────────────────────────
const INDICATOR_CONFIG: Record<string, { label: string; inverse?: boolean; min: number; max: number; unit?: string }> = {
  waterAccessPercent:          { label: "Safe Water Access",          min: 0, max: 100, unit: "%" },
  toiletCoveragePercent:       { label: "Toilet Coverage (ODF)",      min: 0, max: 100, unit: "%" },
  handwashingFacilityPercent:  { label: "Handwashing Facility",       min: 0, max: 100, unit: "%" },
  schoolToiletPercent:         { label: "School Toilet Coverage",     min: 0, max: 100, unit: "%" },
  schoolWaterPercent:          { label: "School Water Access",        min: 0, max: 100, unit: "%" },
  anganwadiToiletPercent:      { label: "Anganwadi Toilet Coverage",  min: 0, max: 100, unit: "%" },
  anganwadiWaterPercent:       { label: "Anganwadi Water Access",     min: 0, max: 100, unit: "%" },
  malnutritionStunting:        { label: "Stunting %",    inverse: true, min: 0, max: 60, unit: "%" },
  malnutritionWasting:         { label: "Wasting %",     inverse: true, min: 0, max: 30, unit: "%" },
  malnutritionUnderweight:     { label: "Underweight %", inverse: true, min: 0, max: 60, unit: "%" },
  infantMortalityRate:         { label: "Infant Mortality",  inverse: true, min: 0, max: 80,  unit: "/1k" },
  maternalMortalityRatio:      { label: "Maternal Mortality", inverse: true, min: 0, max: 500, unit: "/100k" },
  vulnerabilityScore:          { label: "Vulnerability Score", inverse: true, min: 0, max: 1 },
  adaptationScore:             { label: "Adaptation Score",           min: 0, max: 1 },
};

// 5-tier color scale: low→high coverage = red→green; inverted for "lower is better"
function getIndicatorColor(pct: number, inverse?: boolean): string {
  const v = inverse ? 100 - pct : pct;
  if (v < 20) return '#ef4444';
  if (v < 40) return '#f97316';
  if (v < 60) return '#eab308';
  if (v < 80) return '#22c55e';
  return '#16a34a';
}

// Available hazards for filter pills
const HAZARD_PILLS = ['Flood', 'Drought', 'Heatwave', 'Cyclone', 'Dust Storm', 'Heavy Rainfall'];

// ── MapIt Context ─────────────────────────────────────────────────────────────
const MapItContext = createContext<{
  activeIndicator: string | null;
  onMapIt: (key: string) => void;
}>({ activeIndicator: null, onMapIt: () => {} });

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
  const { activeIndicator, onMapIt } = useContext(MapItContext);
  const isMappable = tipKey && INDICATOR_CONFIG[tipKey];
  const isActiveOnMap = isMappable && activeIndicator === tipKey;

  const tip = tipKey ? IMPROVE_TIPS[tipKey] : null;
  const displayMax = max ?? 100;
  const pct = value != null ? Math.min(100, (value / displayMax) * 100) : 0;
  const status = value != null ? getStatus(pct, inverse) : { label: "N/A", color: "#94a3b8", bg: "#f8fafc" };

  return (
    <div
      className="border rounded-lg overflow-hidden mb-2 transition-all"
      style={{ borderColor: isActiveOnMap ? U : undefined, boxShadow: isActiveOnMap ? `0 0 0 2px ${U}33` : undefined }}
    >
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <div className="text-sm font-medium text-foreground">{label}</div>
          {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-right min-w-[80px]">
            <span className="text-lg font-bold text-foreground">
              {value != null ? (Number.isInteger(value) || value > 10 ? Math.round(value) : value.toFixed(3)) : "—"}
            </span>
            {unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
          </div>
          <div className="w-28 h-2 bg-muted rounded-full overflow-hidden">
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
          {isMappable && (
            <Button
              variant={isActiveOnMap ? "default" : "outline"}
              size="sm"
              className="text-xs h-7 gap-1 shrink-0"
              style={isActiveOnMap
                ? { background: U, color: 'white', borderColor: U }
                : { borderColor: U, color: U }}
              onClick={() => onMapIt(tipKey!)}
              data-testid={`mapit-${tipKey}`}
              title={isActiveOnMap ? "Clear map filter" : "Show on map"}
            >
              <MapPin className="h-3 w-3" />
              {isActiveOnMap ? "On Map" : "Map It"}
            </Button>
          )}
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
              Improve
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
  geoJsonData, districtDataMap, idStateMap, selState, selDistrict, onSelectDistrict,
  activeIndicator, activeHazardFilter
}: {
  geoJsonData: any;
  districtDataMap: Record<string, any>;
  idStateMap: Record<string, { state: string; name: string }>;
  selState: string;
  selDistrict: string;
  onSelectDistrict: (stateName: string, districtId: string) => void;
  activeIndicator: string | null;
  activeHazardFilter: string | null;
}) {
  const getVulnColor = (score: number) => {
    if (score > 0.7) return '#ef4444';
    if (score > 0.5) return '#f97316';
    if (score > 0.3) return '#eab308';
    if (score > 0.15) return '#22c55e';
    return '#16a34a';
  };

  const indCfg = activeIndicator ? INDICATOR_CONFIG[activeIndicator] : null;

  const getDistrictIndicatorColor = (data: any): string => {
    if (!indCfg || !activeIndicator) return getVulnColor(data.vulnerabilityScore ?? 0);
    const raw = data[activeIndicator];
    if (raw == null) return '#475569';
    const span = indCfg.max - indCfg.min;
    const pct = span > 0 ? Math.min(100, Math.max(0, ((raw - indCfg.min) / span) * 100)) : 0;
    return getIndicatorColor(pct, indCfg.inverse);
  };

  const getFeatureState = useCallback((feature: any) => {
    const id = feature.properties.ID;
    return idStateMap[String(id)]?.state || feature.properties.STATE || '';
  }, [idStateMap]);

  const style = useCallback((feature: any) => {
    const name = feature.properties.DISTRICT?.toUpperCase();
    const featureState = getFeatureState(feature);
    const data = name ? districtDataMap[name] : undefined;

    if (!data) return { fillColor: '#1e293b', weight: 0.3, opacity: 0.5, color: '#0f172a', fillOpacity: 0.3 };

    const isSelectedDistrict = data.id === selDistrict;
    const isInSelectedState = selState ? featureState === selState : true;

    if (isSelectedDistrict) {
      return { fillColor: U, weight: 3, opacity: 1, color: '#fff', fillOpacity: 0.95 };
    }
    if (selState && !isInSelectedState) {
      return { fillColor: '#334155', weight: 0.3, opacity: 0.5, color: '#1e293b', fillOpacity: 0.12 };
    }

    // Hazard filter: dim districts that don't have the active hazard
    const hasHazard = !activeHazardFilter ||
      (data.climateRisks || []).some((r: string) => r.toLowerCase() === activeHazardFilter.toLowerCase());

    if (!hasHazard) {
      return { fillColor: '#1e293b', weight: 0.3, opacity: 0.5, color: '#0f172a', fillOpacity: 0.15 };
    }

    const color = getDistrictIndicatorColor(data);
    const baseOpacity = selState && isInSelectedState ? 0.88 : selState ? 0.2 : 0.72;
    // Boost opacity for hazard-filtered districts (so they stand out from dimmed ones)
    const opacity = activeHazardFilter ? 0.9 : baseOpacity;
    return { fillColor: color, weight: isInSelectedState && selState ? 1 : 0.5, opacity: 1, color: '#1e293b', fillOpacity: opacity };
  }, [districtDataMap, idStateMap, selState, selDistrict, getFeatureState, activeIndicator, activeHazardFilter, indCfg]);

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
        const hasHazard = !activeHazardFilter ||
          (data.climateRisks || []).some((r: string) => r.toLowerCase() === activeHazardFilter.toLowerCase());
        e.target.setStyle({
          weight: isSelectedDistrict ? 3 : isInSelectedState && selState ? 1 : 0.5,
          color: isSelectedDistrict ? '#fff' : '#1e293b',
          fillOpacity: isSelectedDistrict ? 0.95 : !hasHazard ? 0.15 : isInSelectedState ? 0.75 : selState ? 0.12 : 0.65,
        });
      },
      click: () => {
        onSelectDistrict(featureState, data.id);
      },
    });

    // Build tooltip — show indicator value when active
    const vulnLine = `Vulnerability: <strong style="color:${getVulnColor(data.vulnerabilityScore)}">${data.vulnerabilityCategory || (data.vulnerabilityScore * 100).toFixed(0) + '%'}</strong>`;
    const indLine = indCfg && activeIndicator
      ? `${indCfg.label}: <strong style="color:${getDistrictIndicatorColor(data)}">${data[activeIndicator] != null ? Math.round(data[activeIndicator]) + (indCfg.unit || '') : 'No data'}</strong>`
      : null;
    const hazLine = activeHazardFilter
      ? `Hazard filter: <span style="color:${(data.climateRisks || []).some((r: string) => r.toLowerCase() === activeHazardFilter.toLowerCase()) ? '#22c55e' : '#ef4444'}">${activeHazardFilter}</span>`
      : null;

    (layer as any).bindTooltip(
      `<div style="font-size:12px;line-height:1.6">
        <strong>${data.name}</strong><br/>
        <span style="color:#94a3b8">${featureState}</span><br/>
        ${vulnLine}
        ${indLine ? '<br/>' + indLine : ''}
        ${hazLine ? '<br/>' + hazLine : ''}
      </div>`,
      { sticky: true, className: 'leaflet-hazard-tooltip' }
    );
  }, [districtDataMap, idStateMap, selState, selDistrict, onSelectDistrict, getFeatureState, activeIndicator, activeHazardFilter, indCfg]);

  if (!geoJsonData || Object.keys(districtDataMap).length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-950 rounded-xl text-white text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-2 mr-2" style={{ borderColor: U, borderTopColor: 'transparent' }} />
        Loading map…
      </div>
    );
  }

  // Dynamic legend
  const legendTitle = indCfg ? indCfg.label : "Vulnerability";
  const legendItems = indCfg
    ? (indCfg.inverse
        ? [['#16a34a','Very Low (best)'],['#22c55e','Low'],['#eab308','Moderate'],['#f97316','High'],['#ef4444','Very High (worst)']]
        : [['#ef4444','Poor (<20%)'],['#f97316','Low (20–40%)'],['#eab308','Moderate (40–60%)'],['#22c55e','Good (60–80%)'],['#16a34a','High (80%+)']])
    : [['#ef4444','Very High'],['#f97316','High'],['#eab308','Moderate'],['#22c55e','Low'],['#16a34a','Very Low']];

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden">
      <MapContainer
        key={`${selState}-${selDistrict}-${activeIndicator}-${activeHazardFilter}`}
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
          key={`geo-${selState}-${selDistrict}-${activeIndicator}-${activeHazardFilter}-${Object.keys(districtDataMap).length}`}
          data={geoJsonData}
          style={style}
          onEachFeature={onEachFeature}
        />
      </MapContainer>

      {/* Active filter chips on the map */}
      {(activeIndicator || activeHazardFilter) && (
        <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5">
          {activeIndicator && indCfg && (
            <div className="flex items-center gap-1 bg-black/80 backdrop-blur border px-2 py-1 rounded-full text-xs text-white" style={{ borderColor: U }}>
              <MapPin className="h-3 w-3 shrink-0" style={{ color: U }} />
              <span style={{ color: U }}>{indCfg.label}</span>
            </div>
          )}
          {activeHazardFilter && (
            <div className="flex items-center gap-1 bg-black/80 backdrop-blur border border-orange-400/60 px-2 py-1 rounded-full text-xs text-white">
              <Wind className="h-3 w-3 shrink-0 text-orange-400" />
              <span className="text-orange-300">{activeHazardFilter} filter</span>
            </div>
          )}
        </div>
      )}
      {!activeIndicator && !activeHazardFilter && (
        <div className="absolute top-3 left-3 z-[1000] bg-black/60 backdrop-blur px-2 py-1 rounded text-xs text-white/70">
          Click district to filter · Use "Map It" to change coloring
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-[1000] bg-black/70 backdrop-blur border border-white/10 p-2 rounded-lg text-xs space-y-1 text-white max-w-[140px]">
        <div className="font-semibold text-[10px] uppercase tracking-wider text-white/60 mb-1 truncate">{legendTitle}</div>
        {legendItems.map(([c, l]) => (
          <div key={l} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c }} />
            <span className="text-white/80 text-[10px]">{l}</span>
          </div>
        ))}
        {activeHazardFilter && (
          <div className="flex items-center gap-1.5 pt-1 border-t border-white/10">
            <span className="w-2 h-2 rounded-full shrink-0 bg-slate-600" />
            <span className="text-white/50 text-[10px]">No {activeHazardFilter}</span>
          </div>
        )}
        {selDistrict && (
          <div className="flex items-center gap-1.5 pt-1 border-t border-white/10">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: U }} />
            <span className="text-white/80 text-[10px]">Selected</span>
          </div>
        )}
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
  const [activeIndicator, setActiveIndicator] = useState<string | null>(null);
  const [activeHazardFilter, setActiveHazardFilter] = useState<string | null>(null);
  const mapClickRef = useRef(false);

  const handleMapIt = useCallback((key: string) => {
    setActiveIndicator(prev => prev === key ? null : key);
  }, []);

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
      schoolToiletPercent: get("schoolToiletPercent"),
      schoolWaterPercent: get("schoolWaterPercent"),
      anganwadiToiletPercent: get("anganwadiToiletPercent"),
      anganwadiWaterPercent: get("anganwadiWaterPercent"),
      topHazards,
      hazardIntensities,
      adaptationStrategies: isSingle ? (d.adaptationStrategies || []) : [],
      districtCount: filtered.length,
    };
  }, [filtered]);

  const levelLabel = selDistrict
    ? districtList.find(d => d.id === selDistrict)?.name || "District"
    : selState || "All India";

  // Technology recommendations for the selected single district
  const recommendations = useMemo(() => {
    if (!selDistrict) return [];
    const d = enriched.find(x => x.id === selDistrict);
    if (!d) return [];
    return getRecommendedTechnologies(d);
  }, [selDistrict, enriched]);

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
          <div className="hidden lg:flex lg:flex-col w-[42%] sticky top-14 gap-2" style={{ height: 'calc(100vh - 3.6rem)' }}>
            {/* Hazard filter pills */}
            <div className="flex flex-wrap gap-1.5 px-1">
              <span className="text-xs text-muted-foreground self-center mr-1">Hazard:</span>
              {HAZARD_PILLS.map(h => (
                <button
                  key={h}
                  onClick={() => setActiveHazardFilter(prev => prev === h ? null : h)}
                  data-testid={`hazard-pill-${h}`}
                  className="text-xs px-2.5 py-1 rounded-full border transition-all"
                  style={activeHazardFilter === h
                    ? { background: '#f97316', borderColor: '#f97316', color: 'white', fontWeight: 600 }
                    : { borderColor: 'var(--border)', color: 'var(--muted-foreground)', background: 'transparent' }
                  }
                >
                  {h}
                </button>
              ))}
              {(activeIndicator || activeHazardFilter) && (
                <button
                  onClick={() => { setActiveIndicator(null); setActiveHazardFilter(null); }}
                  className="text-xs px-2 py-1 rounded-full border border-dashed border-red-400/60 text-red-400 flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Clear all
                </button>
              )}
            </div>
            <div className="flex-1 min-h-0">
              <LiveMap
                geoJsonData={geoJsonData}
                districtDataMap={districtDataMap}
                idStateMap={idStateMap}
                selState={selState}
                selDistrict={selDistrict}
                onSelectDistrict={onSelectDistrict}
                activeIndicator={activeIndicator}
                activeHazardFilter={activeHazardFilter}
              />
            </div>
          </div>

          {/* Right: Indicators */}
          <div className="flex-1 space-y-4 pb-6">
        <MapItContext.Provider value={{ activeIndicator, onMapIt: handleMapIt }}>
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
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 mt-4 mb-2">WASH Coverage — Household</div>
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
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 mt-4 mb-2">WASH Coverage — Schools</div>
              <IndicatorRow
                label="School Toilet Coverage"
                value={metrics.schoolToiletPercent}
                unit="%"
                max={100}
                tipKey="schoolToiletPercent"
                description="Government schools with functional, gender-separated toilet facilities (SBSV norms)"
              />
              <IndicatorRow
                label="School Water Access"
                value={metrics.schoolWaterPercent}
                unit="%"
                max={100}
                tipKey="schoolWaterPercent"
                description="Government schools with safe drinking water available for students (JJM school priority)"
              />
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 mt-4 mb-2">WASH Coverage — Anganwadis (ICDS)</div>
              <IndicatorRow
                label="Anganwadi Toilet Coverage"
                value={metrics.anganwadiToiletPercent}
                unit="%"
                max={100}
                tipKey="anganwadiToiletPercent"
                description="ICDS Anganwadi Centres with child-friendly, functional toilet facilities (Mission Poshan 2.0)"
              />
              <IndicatorRow
                label="Anganwadi Water Access"
                value={metrics.anganwadiWaterPercent}
                unit="%"
                max={100}
                tipKey="anganwadiWaterPercent"
                description="Anganwadi Centres with safe piped water for child feeding and food preparation (JJM AWC connections)"
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

            {/* ── RECOMMENDED TECHNOLOGIES PANEL ── */}
            {selDistrict && recommendations.length > 0 && (
              <Card className="border-2" style={{ borderColor: U + "40" }}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: U }}>
                      <Wrench className="h-4 w-4 text-white" />
                    </div>
                    Recommended WASH Technologies
                    <Badge variant="outline" className="ml-auto text-xs">{levelLabel}</Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Context-matched technologies based on hazard profile, soil type, and WASH coverage gaps
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recommendations.map(({ tech, reason, priority }) => {
                      const catIcon =
                        tech.category === 'water' ? <Droplet className="h-3.5 w-3.5" /> :
                        tech.category === 'adaptation' ? <Leaf className="h-3.5 w-3.5" /> :
                        tech.category === 'waste' ? <FlaskConical className="h-3.5 w-3.5" /> :
                        <Wrench className="h-3.5 w-3.5" />;
                      const catColor =
                        tech.category === 'water' ? '#3b82f6' :
                        tech.category === 'adaptation' ? '#22c55e' :
                        tech.category === 'waste' ? '#8b5cf6' : '#f97316';
                      const priColor =
                        priority === 'High' ? '#ef4444' :
                        priority === 'Medium' ? '#f97316' : '#22c55e';
                      return (
                        <div
                          key={tech.slug}
                          className="rounded-lg border border-border p-3 flex flex-col gap-2 hover:border-blue-300 transition-colors"
                          data-testid={`tech-rec-${tech.slug}`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="w-7 h-7 rounded flex items-center justify-center shrink-0 mt-0.5" style={{ background: catColor + "20" }}>
                              <span style={{ color: catColor }}>{catIcon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm leading-tight">{tech.title}</div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 capitalize border-0"
                                  style={{ background: catColor + "20", color: catColor }}
                                >
                                  {tech.category}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 border-0"
                                  style={{ background: priColor + "20", color: priColor }}
                                >
                                  {priority} Priority
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{reason}</p>
                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span>Cost: <span className="font-medium text-foreground">{tech.costLevel}</span></span>
                              <span>·</span>
                              <span>Upkeep: <span className="font-medium text-foreground">{tech.maintenanceLevel}</span></span>
                            </div>
                            <Link href={`/technology/${tech.slug}`}>
                              <button
                                className="text-xs flex items-center gap-1 font-medium hover:underline"
                                style={{ color: U }}
                                data-testid={`tech-rec-link-${tech.slug}`}
                              >
                                Details <ArrowRight className="h-3 w-3" />
                              </button>
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Recommendations are automatically generated from {levelLabel}&apos;s hazard profile and WASH gaps.
                    </p>
                    <Link href="/technology">
                      <button
                        className="text-xs flex items-center gap-1 font-medium hover:underline shrink-0"
                        style={{ color: U }}
                        data-testid="tech-library-link"
                      >
                        Full Library <ArrowRight className="h-3 w-3" />
                      </button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}

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
        </MapItContext.Provider>
          </div>
        </div>
      </div>
    </div>
  );
}
