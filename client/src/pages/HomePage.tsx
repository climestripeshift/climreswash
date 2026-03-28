import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";

function useCounter(target: number, duration = 1800, delay = 0): [number, React.RefObject<HTMLSpanElement | null>] {
  const [val, setVal] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStarted(true); }, { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    if (!started) return;
    const t = setTimeout(() => {
      const steps = 60;
      const inc = target / steps;
      let step = 0;
      const id = setInterval(() => {
        step++;
        const cur = Math.min(target, Math.round(inc * step));
        setVal(cur);
        if (step >= steps) clearInterval(id);
      }, duration / steps);
      return () => clearInterval(id);
    }, delay);
    return () => clearTimeout(t);
  }, [started, target, duration, delay]);
  return [val, ref];
}

function CountUp({ to, suffix = "", duration = 1800, delay = 0 }: { to: number; suffix?: string; duration?: number; delay?: number }) {
  const [val, ref] = useCounter(to, duration, delay);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

const IMPACT_CARDS = [
  {
    value: "\u2193 30%",
    title: "Disaster Response Costs",
    detail: "Early warning alerts triggered 72hrs in advance enable pre-positioned WASH supplies and contingency activation \u2014 shifting from reactive to proactive response.",
    cite: "UNDRR, 2022",
    icon: "\u26A1",
    color: "#E53E3E",
    bg: "#FFF5F5",
    border: "#FED7D7",
  },
  {
    value: "1.4B",
    title: "People Risk-Screened",
    detail: "Every district\u2019s population covered by WASH climate risk assessment \u2014 identifying who is most exposed to heatwave, flood, drought and cyclone impacts.",
    cite: "National census aggregates",
    icon: "\uD83D\uDC67",
    color: "#00AEEF",
    bg: "#E6F7FF",
    border: "#BAE7FF",
  },
  {
    value: "\u20B94.09T",
    title: "Investment Gaps Mapped",
    detail: "District-level funding needs quantified across Mitigation and Adaptation requirements \u2014 turning vulnerability scores into actionable investment proposals.",
    cite: "Platform calculation, IPCC AR5",
    icon: "\u25C8",
    color: "#0077B6",
    bg: "#EBF8FF",
    border: "#BEE3F8",
  },
];

const SECONDARY_STATS = [
  { value: "72hr", label: "Advance alert window", icon: "\uD83D\uDD50" },
  { value: "735", label: "Districts covered", icon: "\uD83D\uDCCD" },
  { value: "100%", label: "WASH technology mapped", icon: "\uD83D\uDCA7" },
  { value: "4-tier", label: "Alert severity system", icon: "\uD83D\uDD14" },
];

const PILLARS = [
  {
    icon: "\u26A1",
    color: "#E53E3E",
    bg: "#FFF5F5",
    label: "Disaster Preparedness",
    headline: "Up to 30% reduction",
    sub: "in disaster response costs",
    cite: "UNDRR, 2022 \u2014 early warning systems reduce response expenditure by 25\u201335%",
    body: "The platform issues 72-hour advance risk alerts across all 735 districts for heatwave, flood, drought and air quality events. This enables WASH engineers and district administrations to pre-position water supplies, activate contingency protocols and protect children before a disaster strikes \u2014 not after.",
    stats: [
      { n: 72, suffix: "hr", label: "Advance climate event warning window" },
      { n: 735, suffix: "", label: "Districts with active early warning monitoring" },
      { n: 4, suffix: "", label: "Severity tiers: Advisory \u2192 Watch \u2192 Warning \u2192 Emergency" },
    ],
  },
  {
    icon: "\uD83D\uDCA7",
    color: "#00AEEF",
    bg: "#E6F7FF",
    label: "WASH System Resilience",
    headline: "1.4 Billion people",
    sub: "covered by WASH climate risk assessment",
    cite: "District population aggregates, national census",
    body: "Every district is assessed against climate hazard intensity and matched to specific WASH technology recommendations \u2014 flood-resilient sanitation, dual-source water systems, drought-resistant infrastructure. Abstract risk scores become concrete technology choices for programme teams.",
    stats: [
      { n: 124, suffix: "", label: "Districts classified Very High WASH climate risk" },
      { n: 218, suffix: "", label: "Districts classified High risk \u2014 priority for intervention" },
      { n: 100, suffix: "%", label: "Districts linked to climate-resilient technology guidance" },
    ],
  },
  {
    icon: "\uD83D\uDCCA",
    color: "#0077B6",
    bg: "#EBF8FF",
    label: "Climate Investment Intelligence",
    headline: "\u20B94.09 Trillion",
    sub: "in climate investment needs identified",
    cite: "Platform model, IPCC AR5 risk framing across 735 districts",
    body: "Without subnational intelligence, climate finance flows to the loudest voices \u2014 not the most vulnerable children. This platform quantifies investment gaps at district level, enabling governments and development partners to build evidence-based funding proposals.",
    stats: [
      { n: 61, suffix: "%", label: "Investment need concentrated in top 20% highest-risk districts" },
      { n: 39, suffix: "%", label: "Mitigation requirement share" },
      { n: 61, suffix: "%", label: "Adaptation requirement share \u2014 where children are most at risk" },
    ],
  },
];

const FEATURES = [
  { icon: "\uD83D\uDDFA\uFE0F", title: "District Risk Maps", desc: "Interactive GeoJSON maps of all 735 districts \u2014 colour-coded by Hazard, Exposure, Vulnerability, Risk and Adaptation Readiness", tag: "Analytics" },
  { icon: "\u26A1", title: "Early Warning System", desc: "Real-time 4-tier alerts for heatwave, flood, drought and air quality \u2014 with 72hr advance signals to trigger WASH preparedness", tag: "Preparedness" },
  { icon: "\uD83D\uDCA7", title: "WASH Risk Screening", desc: "District-level WASH coverage gaps mapped against climate hazard \u2014 with climate-resilient technology recommendations by typology", tag: "WASH" },
  { icon: "\uD83D\uDCB0", title: "Investment Gap Modelling", desc: "Per-capita funding needs estimated by hazard score, WASH deficit and health burden \u2014 disaggregated by district", tag: "Finance" },
  { icon: "\uD83D\uDC67", title: "Child Vulnerability Index", desc: "Children and elderly at risk quantified per district \u2014 including stunting, malnutrition, dropout rates and infant mortality indicators", tag: "Children" },
  { icon: "\uD83D\uDD2C", title: "Technology Guidance", desc: "Each district matched to suitable WASH technologies based on flood, drought or heat stress typology \u2014 actionable for engineers", tag: "Technology" },
];

const METHODOLOGY = [
  { n: "01", label: "Hazard Assessment", desc: "Climate extremes: heatwave, flood, drought, cyclone \u2014 frequency and magnitude at district level" },
  { n: "02", label: "Exposure Mapping", desc: "Population density, WASH infrastructure coverage and service delivery reach" },
  { n: "03", label: "Vulnerability Scoring", desc: "WASH access gaps, malnutrition, infant mortality, dropout rates \u2014 child-centred indicators" },
  { n: "04", label: "Risk Computation", desc: "Risk = f(Hazard \u00D7 Exposure \u00D7 Vulnerability) \u2014 IPCC AR5 standard framework" },
  { n: "05", label: "Investment Modelling", desc: "Per-capita needs across Mitigation and Adaptation requirements, by district" },
  { n: "06", label: "Early Warning Integration", desc: "4-tier severity alerts \u2014 Advisory, Watch, Warning, Emergency \u2014 with 72hr lead time" },
];

const U = "#00AEEF";
const UDARK = "#0077B6";
const ULIGHT = "#E6F7FF";

export default function HomePage() {
  const [activePillar, setActivePillar] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const pillar = PILLARS[activePillar];

  return (
    <div data-testid="page-home" style={{ fontFamily: "'Gill Sans', 'Trebuchet MS', Arial, sans-serif", background: "#FFFFFF", color: "#1A1A2E", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;600;700;800;900&family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap');

        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:1;} 50%{transform:scale(1.3);opacity:0.7;} }
        @keyframes wave { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-5px);} }

        .f1 { animation: fadeUp 0.6s 0.1s both; }
        .f2 { animation: fadeUp 0.6s 0.2s both; }
        .f3 { animation: fadeUp 0.6s 0.35s both; }
        .f4 { animation: fadeUp 0.6s 0.5s both; }
        .f5 { animation: fadeUp 0.6s 0.65s both; }

        .hp-nav-a { color: rgba(255,255,255,0.8); text-decoration:none; font-size:13px; font-weight:600; letter-spacing:0.5px; transition:color 0.2s; }
        .hp-nav-a:hover { color:white; }

        .hp-btn-white { background:white; color:${U}; border:none; padding:13px 28px; font-size:14px; font-weight:700; border-radius:4px; cursor:pointer; transition:all 0.25s; font-family:inherit; display:inline-flex; align-items:center; gap:8px; text-decoration:none; }
        .hp-btn-white:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,0.2); }
        .hp-btn-outline-w { background:transparent; color:white; border:2px solid rgba(255,255,255,0.5); padding:11px 24px; font-size:14px; font-weight:600; border-radius:4px; cursor:pointer; transition:all 0.25s; font-family:inherit; text-decoration:none; }
        .hp-btn-outline-w:hover { border-color:white; background:rgba(255,255,255,0.1); }

        .hp-impact-card { background:white; border-radius:12px; padding:24px; border:1px solid rgba(0,0,0,0.07); transition:all 0.3s ease; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
        .hp-impact-card:hover { transform:translateY(-4px); box-shadow:0 16px 40px rgba(0,174,239,0.15); border-color:rgba(0,174,239,0.3); }

        .hp-feat-card { background:#FAFAFA; border:1px solid rgba(0,0,0,0.06); border-radius:10px; padding:20px; transition:all 0.25s; }
        .hp-feat-card:hover { background:white; border-color:rgba(0,174,239,0.3); box-shadow:0 8px 24px rgba(0,174,239,0.1); transform:translateY(-2px); }

        .hp-pillar-btn { padding:14px 20px; border:1px solid rgba(0,0,0,0.08); border-radius:8px; cursor:pointer; text-align:left; transition:all 0.3s ease; background:white; }
        .hp-pillar-btn.active { border-color:${U}; background:${ULIGHT}; box-shadow:0 4px 16px rgba(0,174,239,0.15); }
        .hp-pillar-btn:hover:not(.active) { border-color:rgba(0,174,239,0.3); }

        .hp-method-row { display:flex; gap:20px; padding:18px 0; border-bottom:1px solid rgba(0,0,0,0.06); align-items:flex-start; }
        .hp-method-row:last-child { border-bottom:none; }

        .hp-tag { display:inline-block; background:${ULIGHT}; color:${UDARK}; padding:2px 8px; border-radius:3px; font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; }
        .hp-live-dot { width:7px; height:7px; border-radius:50%; background:#00C853; display:inline-block; animation:pulse 2s ease-in-out infinite; }
        .hp-wave-icon { animation:wave 3s ease-in-out infinite; display:inline-block; }

        @media (max-width: 768px) {
          .hp-hero-grid { grid-template-columns: 1fr !important; }
          .hp-hero-right { display: none !important; }
          .hp-impact-grid-3 { grid-template-columns: 1fr !important; }
          .hp-stats-grid-4 { grid-template-columns: repeat(2, 1fr) !important; }
          .hp-pillar-grid { grid-template-columns: 1fr !important; }
          .hp-features-grid { grid-template-columns: 1fr !important; }
          .hp-method-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .hp-who-grid { grid-template-columns: 1fr !important; }
          .hp-scale-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .hp-hero-h1 { font-size: 32px !important; }
          .hp-nav-text-links { display: none !important; }
          .hp-section { padding: 48px 16px !important; }
          .hp-header-grid { grid-template-columns: 1fr !important; }
          .hp-mobile-pad { padding-left: 16px !important; padding-right: 16px !important; }
        }
      `}</style>

      <nav className="hp-mobile-pad" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? `${U}F5` : U,
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(0,0,0,0.1)" : "none",
        transition: "all 0.3s", padding: "0 40px",
      }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", height: 60, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }} className="hp-wave-icon">{"\uD83D\uDCA7"}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "white", letterSpacing: 0.3, fontFamily: "'Nunito', sans-serif" }}>ClimateAdapt India</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 }}>UNICEF · WASH Climate Intelligence</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <a href="#impact" className="hp-nav-a hp-nav-text-links">Impact</a>
            <a href="#platform" className="hp-nav-a hp-nav-text-links">Platform</a>
            <a href="#methodology" className="hp-nav-a hp-nav-text-links">Methodology</a>
            <Link href="/dashboard" className="hp-btn-white" style={{ padding: "8px 18px", fontSize: 13 }} data-testid="nav-dashboard-link">Dashboard {"\u2192"}</Link>
          </div>
        </div>
      </nav>

      <section style={{
        background: `linear-gradient(135deg, ${U} 0%, ${UDARK} 100%)`,
        paddingTop: 60, minHeight: "100vh", display: "flex", alignItems: "center",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: "-10%", right: "-5%", width: 500, height: 500, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-15%", left: "-8%", width: 600, height: 600, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "20%", right: "5%", width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />

        <div className="hp-mobile-pad" style={{ maxWidth: 1160, margin: "0 auto", padding: "60px 40px", width: "100%" }}>
          <div className="hp-hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 60, alignItems: "center" }}>

            <div>
              <div className="f1" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 20, padding: "6px 14px", marginBottom: 24, fontSize: 12, color: "white", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>
                <span className="hp-live-dot" /> For Every Child · A Climate-Safe Future
              </div>

              <h1 className="f2 hp-hero-h1" style={{ fontFamily: "'Nunito', sans-serif", fontSize: 52, fontWeight: 900, color: "white", lineHeight: 1.1, marginBottom: 20, letterSpacing: -0.5 }}>
                Protecting Children<br />
                from Climate Risk,<br />
                <span style={{ fontWeight: 400, fontStyle: "italic", opacity: 0.9 }}>District by District.</span>
              </h1>

              <p className="f3" style={{ fontSize: 17, color: "rgba(255,255,255,0.85)", lineHeight: 1.75, marginBottom: 28, maxWidth: 540, fontWeight: 300 }}>
                India's first district-level WASH climate risk platform {"\u2014"} covering <strong style={{ color: "white", fontWeight: 700 }}>735 districts</strong> and <strong style={{ color: "white", fontWeight: 700 }}>1.4 billion people</strong> {"\u2014"} built on the UNICEF-CEEW methodology to protect children from heatwave, flood, drought and cyclone impacts.
              </p>

              <div className="f4" style={{ display: "flex", gap: 12, marginBottom: 36, flexWrap: "wrap" }}>
                <Link href="/dashboard" className="hp-btn-white" data-testid="hero-dashboard-link">{"\uD83D\uDCA7"} View District Risk Map</Link>
                <a href="#methodology" className="hp-btn-outline-w">Read Methodology</a>
              </div>

              <div className="f5">
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: 2.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
                  Measurable Impact
                </div>

                <div className="hp-impact-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
                  {IMPACT_CARDS.map((c, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, padding: "16px 14px", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.5)", borderRadius: "10px 10px 0 0" }} />
                      <div style={{ fontSize: 20, marginBottom: 6 }}>{c.icon}</div>
                      <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 28, fontWeight: 900, color: "white", lineHeight: 1, marginBottom: 5 }}>{c.value}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 2 }}>{c.title}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginBottom: 6, lineHeight: 1.4 }}>{c.detail.substring(0, 60)}{"\u2026"}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{"\u2197"} {c.cite}</div>
                    </div>
                  ))}
                </div>

                <div className="hp-stats-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {SECONDARY_STATS.map((s, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{s.icon}</span>
                      <div>
                        <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 16, fontWeight: 800, color: "white", lineHeight: 1 }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 2, lineHeight: 1.3 }}>{s.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="f3 hp-hero-right" style={{ background: "rgba(255,255,255,0.95)", borderRadius: 14, padding: 26, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, paddingBottom: 14, borderBottom: `2px solid ${ULIGHT}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#6B7280" }}>National Risk Snapshot</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#00C853", fontWeight: 700 }}>
                  <span className="hp-live-dot" /> Live
                </div>
              </div>

              {[
                { label: "Very High Risk", n: 124, total: 735, color: "#E53E3E" },
                { label: "High Risk", n: 218, total: 735, color: "#DD6B20" },
                { label: "Moderate Risk", n: 243, total: 735, color: "#D69E2E" },
                { label: "Low / Very Low", n: 150, total: 735, color: U },
              ].map((r, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                    <span style={{ fontWeight: 600, color: "#1A1A2E" }}>{r.label}</span>
                    <span style={{ color: r.color, fontWeight: 800, fontFamily: "'Nunito', sans-serif" }}>{r.n} districts</span>
                  </div>
                  <div style={{ height: 6, background: "#F0F0F0", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(r.n / r.total) * 100}%`, background: r.color, borderRadius: 3, transition: "width 1.5s ease" }} />
                  </div>
                </div>
              ))}

              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${ULIGHT}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ background: ULIGHT, borderRadius: 8, padding: 12, textAlign: "center" }}>
                  <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 20, fontWeight: 900, color: UDARK }}>160M+</div>
                  <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>Children in flood-risk areas</div>
                </div>
                <div style={{ background: "#FFF5F5", borderRadius: 8, padding: 12, textAlign: "center" }}>
                  <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 20, fontWeight: 900, color: "#E53E3E" }}>115M+</div>
                  <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>Children in drought areas</div>
                </div>
              </div>

              <div style={{ marginTop: 12, background: `linear-gradient(135deg, ${U}, ${UDARK})`, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginBottom: 4, fontWeight: 600, letterSpacing: 1 }}>TOTAL INVESTMENT NEED</div>
                <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 22, fontWeight: 900, color: "white" }}>{"\u20B9"}4,09,460 Cr</div>
                <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>Mitigation: {"\u20B9"}1,59,303 Cr</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>Adaptation: {"\u20B9"}2,50,157 Cr</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="impact" className="hp-section" style={{ padding: "80px 40px", background: "#F8FCFF" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ display: "inline-block", background: ULIGHT, color: UDARK, padding: "4px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14 }}>Evidence-Based Impact</div>
            <h2 style={{ fontFamily: "'Nunito', sans-serif", fontSize: 38, fontWeight: 900, color: "#1A1A2E", marginBottom: 12 }}>Impact Across Three Pillars</h2>
            <p style={{ fontSize: 15, color: "#6B7280", maxWidth: 540, margin: "0 auto", lineHeight: 1.7 }}>All figures grounded in peer-reviewed evidence. Conservative estimates applied where ranges exist.</p>
          </div>

          <div className="hp-impact-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 40 }}>
            {IMPACT_CARDS.map((c, i) => (
              <div key={i} className="hp-impact-card" style={{ borderTop: `4px solid ${c.color}` }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{c.icon}</div>
                <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 40, fontWeight: 900, color: c.color, lineHeight: 1, marginBottom: 6 }}>{c.value}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A2E", marginBottom: 8 }}>{c.title}</div>
                <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.65, marginBottom: 12 }}>{c.detail}</p>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 4, padding: "4px 10px", fontSize: 11, color: c.color, fontWeight: 700 }}>
                  {"\u2197"} {c.cite}
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
            <div className="hp-pillar-grid" style={{ display: "grid", gridTemplateColumns: "280px 1fr" }}>
              <div style={{ borderRight: "1px solid rgba(0,0,0,0.06)", padding: 16, background: "#FAFAFA" }}>
                {PILLARS.map((p, i) => (
                  <button key={i} onClick={() => setActivePillar(i)} className={`hp-pillar-btn ${activePillar === i ? "active" : ""}`} style={{ width: "100%", marginBottom: 8 }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{p.icon}</div>
                    <div style={{ fontSize: 11, color: activePillar === i ? UDARK : "#6B7280", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>{p.label}</div>
                    <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 16, fontWeight: 800, color: activePillar === i ? U : "#1A1A2E" }}>{p.headline}</div>
                  </button>
                ))}
              </div>
              <div style={{ padding: 36 }}>
                <div style={{ fontSize: 11, color: U, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>{pillar.label}</div>
                <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 36, fontWeight: 900, color: "#1A1A2E", marginBottom: 4 }}>{pillar.headline}</div>
                <div style={{ fontSize: 16, color: "#6B7280", marginBottom: 14 }}>{pillar.sub}</div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: ULIGHT, border: `1px solid ${U}40`, borderRadius: 4, padding: "4px 10px", fontSize: 11, color: UDARK, fontWeight: 600, marginBottom: 18 }}>{"\u2197"} {pillar.cite}</div>
                <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.75, marginBottom: 24 }}>{pillar.body}</p>
                <div className="hp-impact-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  {pillar.stats.map((s, i) => (
                    <div key={i} style={{ background: ULIGHT, borderRadius: 8, padding: "14px 12px", textAlign: "center" }}>
                      <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 28, fontWeight: 900, color: U }}>
                        <CountUp to={s.n} suffix={s.suffix} duration={1400} delay={i * 150} />
                      </div>
                      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4, lineHeight: 1.4 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="hp-mobile-pad" style={{ background: `linear-gradient(135deg, ${U}, ${UDARK})`, padding: "48px 40px" }}>
        <div className="hp-scale-grid" style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
          {[
            { n: 735, suffix: "", label: "Districts Analysed", sub: "India national coverage" },
            { val: "1.4B", label: "People Covered", sub: "Aggregate district populations" },
            { n: 21, suffix: "M+", label: "Children Under 5 at Risk", sub: "In vulnerable districts" },
            { val: "IPCC AR5", label: "Risk Framework", sub: "International standard" },
          ].map((s: any, i) => (
            <div key={i} style={{ textAlign: "center", padding: "0 24px", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.2)" : "none" }}>
              <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 40, fontWeight: 900, color: "white", lineHeight: 1 }}>
                {s.val ? s.val : <CountUp to={s.n} suffix={s.suffix} />}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginTop: 6 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="platform" className="hp-section" style={{ padding: "80px 40px", background: "white" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto" }}>
          <div className="hp-header-grid" style={{ marginBottom: 48, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "end" }}>
            <div>
              <div style={{ width: 40, height: 4, background: U, borderRadius: 2, marginBottom: 14 }} />
              <h2 style={{ fontFamily: "'Nunito', sans-serif", fontSize: 36, fontWeight: 900, color: "#1A1A2E" }}>Platform Capabilities</h2>
            </div>
            <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.75, fontWeight: 300 }}>
              Built for government departments and development partners who need district-level intelligence to design climate-resilient WASH interventions.
            </p>
          </div>
          <div className="hp-features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {FEATURES.map((f, i) => (
              <div key={i} className="hp-feat-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <span style={{ fontSize: 28 }}>{f.icon}</span>
                  <span className="hp-tag">{f.tag}</span>
                </div>
                <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 15, fontWeight: 800, color: "#1A1A2E", marginBottom: 6 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="methodology" className="hp-section" style={{ padding: "80px 40px", background: "#F8FCFF", borderTop: "1px solid rgba(0,174,239,0.1)" }}>
        <div className="hp-method-grid" style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80 }}>
          <div>
            <div style={{ width: 40, height: 4, background: U, borderRadius: 2, marginBottom: 14 }} />
            <h2 style={{ fontFamily: "'Nunito', sans-serif", fontSize: 34, fontWeight: 900, color: "#1A1A2E", marginBottom: 14 }}>Methodology</h2>
            <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.75, marginBottom: 24, fontWeight: 300 }}>
              Aligned with the <strong style={{ color: "#1A1A2E", fontWeight: 700 }}>UNICEF-CEEW Climate Extremes & WASH Risk Study</strong> {"\u2014"} using IPCC AR5 risk framing to produce defensible, district-level vulnerability scores.
            </p>
            <div style={{ background: "white", border: `2px solid ${ULIGHT}`, borderLeft: `4px solid ${U}`, borderRadius: 8, padding: 18, marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 6, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>Core Formula</div>
              <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 20, fontWeight: 900, color: U }}>Risk = f(Hazard {"\u00D7"} Exposure {"\u00D7"} Vulnerability)</div>
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>IPCC AR5 standard · UNICEF-CEEW methodology</div>
            </div>
            <div style={{ background: "white", border: `2px solid ${ULIGHT}`, borderLeft: `4px solid ${UDARK}`, borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 6, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>Data Sources</div>
              <div style={{ fontSize: 13, color: "#1A1A2E", lineHeight: 1.65 }}>National census, NFHS health indicators, IMD climate data, CEEW hazard indices {"\u2014"} normalised, weighted and combined into district-level composite scores</div>
            </div>
          </div>
          <div>
            {METHODOLOGY.map((s, i) => (
              <div key={i} className="hp-method-row">
                <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 20, fontWeight: 900, color: `${U}55`, minWidth: 32 }}>{s.n}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A2E", marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="hp-section" style={{ padding: "80px 40px", background: "white" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Nunito', sans-serif", fontSize: 34, fontWeight: 900, color: "#1A1A2E", marginBottom: 40, textAlign: "center" }}>Who Can Use This Dashboard?</h2>
          <div className="hp-who-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {[
              { icon: "\uD83C\uDFDB\uFE0F", who: "Government & Line Departments", points: ["Identify high-risk districts for climate-resilient WASH investment", "Support Jal Jeevan Mission, SBM and state climate action plans", "Strengthen convergence between WASH, DRR and climate programmes"] },
              { icon: "\uD83C\uDF0D", who: "Development Partners", points: ["Prioritise geographies for child-centred climate adaptation programming", "Use district profiles in programme design and donor proposals", "Track climate risk evolution as data improves over time"] },
              { icon: "\uD83E\uDD1D", who: "NGOs & Practitioners", points: ["Target high-risk districts for field interventions", "Choose technologies suited to local climate typology", "Support advocacy with visual evidence of climate risk"] },
            ].map((c, i) => (
              <div key={i} style={{ border: `1px solid rgba(0,174,239,0.15)`, borderTop: `4px solid ${U}`, borderRadius: 10, padding: 24, background: "white" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{c.icon}</div>
                <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 16, fontWeight: 800, color: "#1A1A2E", marginBottom: 14 }}>{c.who}</div>
                {c.points.map((p, j) => (
                  <div key={j} style={{ display: "flex", gap: 8, fontSize: 13, color: "#6B7280", marginBottom: 8, lineHeight: 1.5 }}>
                    <span style={{ color: U, fontWeight: 700, flexShrink: 0 }}>{"\u2713"}</span> {p}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="hp-mobile-pad" style={{ background: `linear-gradient(135deg, ${U} 0%, ${UDARK} 100%)`, padding: "72px 40px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -60, top: "50%", transform: "translateY(-50%)", fontSize: 240, opacity: 0.05, pointerEvents: "none" }}>{"\uD83D\uDCA7"}</div>
        <div style={{ maxWidth: 640, margin: "0 auto", position: "relative" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>{"\uD83D\uDC67\uD83C\uDFFD"}</div>
          <h2 style={{ fontFamily: "'Nunito', sans-serif", fontSize: 38, fontWeight: 900, color: "white", marginBottom: 14, lineHeight: 1.2 }}>
            Every Child Deserves<br />a Climate-Safe Future.
          </h2>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.75)", marginBottom: 36, lineHeight: 1.7, fontWeight: 300 }}>
            Built on UNICEF-CEEW methodology. 735 districts. 1.4 billion people. District-level intelligence to protect the most vulnerable.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/dashboard" className="hp-btn-white" style={{ fontSize: 15, padding: "14px 32px" }} data-testid="cta-dashboard-link">{"\uD83D\uDCA7"} Explore District Risk Map</Link>
            <a href="#methodology" className="hp-btn-outline-w" style={{ fontSize: 15, padding: "12px 24px" }}>Read Methodology</a>
          </div>
        </div>
      </section>

      <footer className="hp-mobile-pad" style={{ background: UDARK, padding: "24px 40px" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>ClimateAdapt India · A UNICEF Initiative for Climate-Resilient WASH · Built on UNICEF-CEEW Methodology</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>735 Districts · 1.4 Billion People · IPCC AR5 Framework</div>
        </div>
      </footer>
    </div>
  );
}
