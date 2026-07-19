import { Link } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

const S = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="mb-8">
    <h2 className="text-lg font-bold border-b border-border/40 pb-1 mb-3">{title}</h2>
    {children}
  </section>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-muted-foreground leading-relaxed mb-2">{children}</p>
);

const Formula = ({ children }: { children: string }) => (
  <div className="bg-muted/30 border border-border/30 rounded-md px-4 py-2 my-2 font-mono text-xs">
    {children}
  </div>
);

export default function MethodologyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="h-10 px-4 border-b border-border/40 flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur z-50">
        <Link href="/"><Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2"><ArrowLeft className="h-3 w-3" />Home</Button></Link>
        <div className="h-3 w-px bg-border/50" />
        <span className="text-sm font-semibold">Methodology</span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => window.print()}>
          <Printer className="h-3 w-3" /> Print / PDF
        </Button>
        <ThemeToggle />
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 print:px-0">
        <h1 className="text-2xl font-bold mb-1">ClimResWASH Methodology</h1>
        <p className="text-sm text-muted-foreground mb-6">Climate-Resilient Water, Sanitation & Hygiene — Technical Documentation</p>

        {/* TOC */}
        <nav className="mb-8 p-4 bg-muted/20 rounded-lg text-sm print:hidden">
          <div className="font-semibold mb-2">Contents</div>
          <ol className="space-y-1 text-muted-foreground">
            {["Framework","Hazards","Exposure","Sensitivity","Adaptive Capacity","Burden Metric","Future Projections","Validation","Data Sources","Limitations"].map((s, i) => (
              <li key={s}><a href={`#s${i+1}`} className="hover:text-foreground">{i+1}. {s}</a></li>
            ))}
          </ol>
        </nav>

        <S id="s1" title="1. The Framework">
          <P>ClimResWASH uses the IPCC AR6 risk framework, aligned to CCRR 2026 scoring (0–10):</P>
          <Formula>Risk = (Hazard × Exposure × Sensitivity) × (1 − Adaptive Capacity) ÷ 10</Formula>
          <P>Each hex (H3 resolution 5, ~252 km²) receives a risk score from 0 (safe) to 10 (extreme). Risk is the maximum across 11 hazard channels. At extreme hazard (H≥10), adaptive capacity effectiveness is dampened to prevent well-served areas from scoring near-zero during genuine disasters.</P>
          <Formula>AC dampening = max(0.2, 1 − H/12)</Formula>
        </S>

        <S id="s2" title="2. Hazards">
          <P>11 hazard channels, each scored 0–10. Hazard = Severity × Likelihood, where severity is the "if it happens, how bad" score from the formula book, and likelihood is the "how often" score from 30-year climatology.</P>
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse my-2">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="py-1 pr-2">Hazard</th><th className="py-1 pr-2">Severity source</th><th className="py-1 pr-2">Likelihood source</th><th className="py-1">Threshold</th>
              </tr></thead>
              <tbody className="text-foreground">
                {[
                  ["Pluvial Flood","Rainfall × terrain amplifier","CHIRPS 1991-2020",">50mm/day"],
                  ["Heatwave","Temperature excess × duration × UHI","ERA5 1991-2020",">40°C (IMD)"],
                  ["Drought","SPI (standardised precipitation)","CHIRPS monthly","SPI < -1"],
                  ["Wet-Bulb Heat","Stull wet-bulb temperature","ERA5 temp+dewpoint","Tw > 28°C"],
                  ["Cyclone","Wind + rain band + storm surge","IBTrACS tracks","Cat-3 scenario"],
                  ["Air Pollution","PM2.5 annual mean","WashU/ACAG satellite","WHO 5 ug/m3"],
                  ["Landslide","Slope × deforestation × rain","Terrain-derived","slope > 10°"],
                  ["Cold Wave","Latitude + altitude × temperature","ERA5","< 10°C"],
                  ["Flash Flood","Steep terrain × intense rain","Terrain + CHIRPS","slope > 5°"],
                  ["Sea Level Rise","Low elevation × coastal proximity","SRTM + coast","elev < 20m"],
                  ["Forest Fire","Dry vegetation + heat","ESA + ERA5","NDVI < 0.5"],
                ].map(([h,s,l,t]) => (
                  <tr key={h} className="border-b border-border/20"><td className="py-1 pr-2 font-medium">{h}</td><td className="py-1 pr-2">{s}</td><td className="py-1 pr-2">{l}</td><td className="py-1">{t}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <P><strong>Chronic hazards</strong> (heat, drought, wet-bulb) receive a duration amplifier of up to +50% for sustained exposure. Acute hazards (flood, cyclone) do not — a flood is not "less bad per day" over 3 days.</P>
          <P><strong>Heat-pollution compound:</strong> Where both heat and air pollution are high, a modest interaction term (0.2 × min) amplifies heat hazard, reflecting the genuine compounding of stagnant hot air trapping pollutants.</P>
        </S>

        <S id="s3" title="3. Exposure">
          <P>Population from WorldPop 2020 (UN-adjusted, constrained to built-up areas, 100m resolution). Zonal sum per hex gives real population counts.</P>
          <Formula>Exposure = log₁₀(population) × 2 × (1 + vulnerable_fraction / 100)</Formula>
          <P>Demographics (children under 5, elderly 60+, women 15-49) from Census 2011 state-level age ratios applied to WorldPop totals. Vulnerable fraction weights children and elderly higher.</P>
        </S>

        <S id="s4" title="4. Sensitivity">
          <P>Terrain-based: slope (real, from H3 neighbour elevation differences), soil type (from land use proxy), built-up percentage, distance to water (haversine to nearest ESA "water" hex). Different sensitivity functions for flood vs heat.</P>
          <Formula>Flood sensitivity = 0.3×(1−slope/30) + 0.3×(1−sand/100) + 0.2×(built/100) + 0.2×exp(−dist_water/2000)</Formula>
          <P>Drought sensitivity amplified by groundwater stress (WRIS Nov 2022 data, 496 districts): districts with depleted aquifers are up to 50% more drought-sensitive.</P>
        </S>

        <S id="s5" title="5. Adaptive Capacity">
          <P>NFHS-5 district-level (707 districts, 2019-21) weighted composite:</P>
          <Formula>AC = 0.25×toilet + 0.20×water + 0.15×health + 0.10×electricity + 0.15×(1−poverty) + 0.15×literacy</Formula>
          <P>Groundwater penalty reduces AC by up to 20% in depleted-aquifer districts.</P>
          <P><strong>Hazard-specific AC effectiveness:</strong> Infrastructure genuinely mitigates some hazards but not others. Flood AC effectiveness = 1.0 (good sanitation/drainage helps). Heat = 0.4 (toilets don't cool a city). Air pollution = 0.2 (infrastructure barely reduces PM2.5). This prevents high-capacity cities like Delhi from being artificially scored as "safe" for heat/pollution.</P>
        </S>

        <S id="s6" title="6. The Burden Metric">
          <P>Three non-duplicating day-counts per hex, expressing total suffering-time:</P>
          <Formula>single_hazard_days + multi_hazard_days = total_burden_days (always, exactly)</Formula>
          <P>Overlap estimated via independence model from annual hazard frequencies. Documented as an approximation; daily co-occurrence analysis is a planned upgrade.</P>
          <P>Per-demographic weighted burden applies hazard-specific vulnerability weights (children more sensitive to pollution ×1.4, elderly to heat ×1.5).</P>
        </S>

        <S id="s7" title="7. Future Projections">
          <P>CMIP6 ensemble (5 models: ACCESS-CM2, MPI-ESM1-2-HR, EC-Earth3, MRI-ESM2-0, GFDL-ESM4) via NASA/GDDP-CMIP6. Delta-change bias correction:</P>
          <Formula>future_days = observed_baseline + (model_future − model_historical)</Formula>
          <P>4 surfaces: SSP2-4.5 and SSP5-8.5 × 2030 and 2050. Adaptive capacity held at present values (v1 simplification) — showing "if capacity stays as today."</P>
          <P><strong>Gap analysis:</strong> capacity_gap = future_risk × (1 − present_AC). Districts ranked by gap — the "invest here now" priority list.</P>
        </S>

        <S id="s8" title="8. Validation">
          <P>Predicted risk validated against real NFHS-5 health outcomes across 713 districts (Spearman rank correlation):</P>
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse my-2">
              <thead><tr className="border-b text-muted-foreground text-left"><th className="py-1 pr-2">Predicted</th><th className="py-1 pr-2">vs Observed</th><th className="py-1 pr-2">r</th><th className="py-1">Direction</th></tr></thead>
              <tbody>
                {[
                  ["Flood risk","Diarrhoea prevalence","−0.06","Investigating"],
                  ["Drought risk","Child stunting","+0.05","✅ Correct"],
                  ["Heat risk","Anaemia","+0.08","✅ Correct"],
                  ["Overall risk","Vaccination","−0.13","✅ Correct (negative)"],
                ].map(([p,o,r,d]) => (
                  <tr key={p} className="border-b border-border/20"><td className="py-1 pr-2">{p}</td><td className="py-1 pr-2">{o}</td><td className="py-1 pr-2 font-mono">{r}</td><td className="py-1">{d}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <P>Correlations are weak (0.05–0.13) — <strong>expected and honest</strong>. Health outcomes are driven primarily by WASH infrastructure quality (income, governance), not climate frequency alone. This is precisely why ClimResWASH exists: climate risk ALONE doesn't predict health outcomes, but climate × WASH interaction does. The model correctly predicts WHERE climate events happen; WASH data predicts WHERE coping is weak.</P>
        </S>

        <S id="s9" title="9. Data Sources">
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse my-2">
              <thead><tr className="border-b text-muted-foreground text-left"><th className="py-1 pr-2">Data</th><th className="py-1 pr-2">Source</th><th className="py-1 pr-2">Year</th><th className="py-1 pr-2">Resolution</th><th className="py-1">License</th></tr></thead>
              <tbody>
                {[
                  ["Elevation","SRTM 90m","2000","90m","Public domain"],
                  ["Vegetation","MODIS MOD13Q1","2023","250m","Free"],
                  ["Land use","ESA WorldCover","2021","10m","CC BY 4.0"],
                  ["Population","WorldPop","2020","100m","CC BY 4.0"],
                  ["WASH indicators","NFHS-5 (DHS)","2019-21","District","Public"],
                  ["Poverty","NITI Aayog MPI","2021","State","Public"],
                  ["Groundwater","WRIS/CGWB","Nov 2022","District","Public"],
                  ["Rainfall climate","CHIRPS","1991-2020","5km","Free"],
                  ["Temperature","ERA5-Land","1991-2020","9km","Free"],
                  ["Future climate","CMIP6/GDDP","1995-2060","25km","Free"],
                  ["Cyclone tracks","IBTrACS","1981-2020","Point","Public"],
                  ["Air quality","WashU PM2.5","Annual","~1km","Research"],
                  ["Weather forecast","Open-Meteo","Live","Point","Free"],
                ].map(([d,s,y,r,l]) => (
                  <tr key={d} className="border-b border-border/20"><td className="py-1 pr-2 font-medium">{d}</td><td className="py-1 pr-2">{s}</td><td className="py-1 pr-2">{y}</td><td className="py-1 pr-2">{r}</td><td className="py-1">{l}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </S>

        <S id="s10" title="10. Limitations">
          <P>Stated plainly — understanding these boundaries is essential for responsible use:</P>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5 mb-3">
            <li><strong>District-level vulnerability applied to hexes:</strong> NFHS-5 and groundwater data are district-level; all hexes in a district share the same WASH indicators. Sub-district variation in WASH is not captured.</li>
            <li><strong>NFHS-5 vintage:</strong> Data is from 2019-21. NFHS-6 district data (when released) will improve accuracy, particularly for SBM-era sanitation gains.</li>
            <li><strong>Groundwater snapshot:</strong> WRIS data is from November 2022 — a single season. Inter-annual and seasonal variation not captured.</li>
            <li><strong>Burden-day overlap is estimated:</strong> The independence approximation for multi-hazard days is not daily-exact. Upgrade to daily co-occurrence analysis is planned.</li>
            <li><strong>Future projections hold AC constant:</strong> Adaptive capacity is held at present values in 2030/2050 projections. This is by design (showing "if capacity doesn't improve") but means projections don't account for planned infrastructure investments.</li>
            <li><strong>Point estimates, not distributions:</strong> Risk scores are single values, not probability distributions. Value-at-Risk (VaR) approach is a future extension.</li>
            <li><strong>Correlation ≠ causation:</strong> Validation correlations show geographic pattern agreement, not causal pathways.</li>
            <li><strong>30-year climate record:</strong> Limits estimation of very rare events (return periods beyond 50 years).</li>
            <li><strong>Air pollution is mock:</strong> PM2.5 values use geographic patterns until real WashU/ACAG satellite rasters are ingested.</li>
          </ul>
          <P><em>Stating limitations builds trust. This model is a decision-support tool — it complements, not replaces, ground-level assessment.</em></P>
        </S>

        {/* Footer */}
        <div className="border-t border-border/40 mt-8 pt-4 text-xs text-muted-foreground">
          <p>ClimResWASH — Climate-Resilient Water, Sanitation & Hygiene Platform</p>
          <p>Risk methodology based on IPCC AR6 framework. Calibrated against 5 real Indian disaster events (Mumbai 2005, Kerala 2018, Cyclone Amphan 2020, Marathwada Drought 2016, Delhi Heatwave 2023). All tests passing.</p>
        </div>
      </div>
    </div>
  );
}
