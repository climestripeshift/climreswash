import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowRight, Activity, MapPin, BarChart3, AlertTriangle, ShieldAlert, Droplets, Banknote, Users, Zap, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

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
    icon: <Zap className="w-8 h-8 text-destructive" />,
    colorClass: "text-destructive",
  },
  {
    value: "1.4B",
    title: "People Risk-Screened",
    detail: "Every district\u2019s population covered by WASH climate risk assessment \u2014 identifying who is most exposed to heatwave, flood, drought and cyclone impacts.",
    cite: "National census aggregates",
    icon: <Users className="w-8 h-8 text-primary" />,
    colorClass: "text-primary",
  },
  {
    value: "\u20B94.09T",
    title: "Investment Gaps Mapped",
    detail: "District-level funding needs quantified across Mitigation and Adaptation requirements \u2014 turning vulnerability scores into actionable investment proposals.",
    cite: "Platform calculation, IPCC AR5",
    icon: <Banknote className="w-8 h-8 text-chart-4" />,
    colorClass: "text-chart-4",
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
    icon: <AlertTriangle className="w-5 h-5 text-destructive" />,
    colorClass: "text-destructive",
    bgClass: "bg-destructive/10",
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
    icon: <Droplets className="w-5 h-5 text-primary" />,
    colorClass: "text-primary",
    bgClass: "bg-primary/10",
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
    icon: <BarChart3 className="w-5 h-5 text-chart-4" />,
    colorClass: "text-chart-4",
    bgClass: "bg-chart-4/10",
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
  { icon: "\uD83D\uDCC8", title: "2050 Climate Stress Test", desc: "AR6-based projections under 3 IPCC scenarios \u2014 Current Policies, NDCs, Net Zero 2050. Ranks districts by deterioration and avoided damage to 2050.", tag: "New", link: "/stress-test" },
];

const METHODOLOGY = [
  { n: "01", label: "Hazard Assessment", desc: "Climate extremes: heatwave, flood, drought, cyclone \u2014 frequency and magnitude at district level" },
  { n: "02", label: "Exposure Mapping", desc: "Population density, WASH infrastructure coverage and service delivery reach" },
  { n: "03", label: "Vulnerability Scoring", desc: "WASH access gaps, malnutrition, infant mortality, dropout rates \u2014 child-centred indicators" },
  { n: "04", label: "Risk Computation", desc: "Risk = f(Hazard \u00D7 Exposure \u00D7 Vulnerability) \u2014 IPCC AR5 standard framework" },
  { n: "05", label: "Investment Modelling", desc: "Per-capita needs across Mitigation and Adaptation requirements, by district" },
  { n: "06", label: "Early Warning Integration", desc: "4-tier severity alerts \u2014 Advisory, Watch, Warning, Emergency \u2014 with 72hr lead time" },
];

export default function HomePage() {
  const [activePillar, setActivePillar] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const pillar = PILLARS[activePillar];

  const fadeUpVariant = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
  };

  return (
    <div data-testid="page-home" className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      
      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-background/80 backdrop-blur-md border-b border-border shadow-sm' : 'bg-transparent'}`}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            <div className="flex items-center gap-3">
              <span className="text-2xl animate-pulse text-primary">{"\uD83D\uDCA7"}</span>
              <div>
                <div className={`font-bold text-lg leading-tight ${scrolled ? 'text-foreground' : 'text-primary-foreground'}`}>ClimateAdapt India</div>
                <div className={`text-[10px] tracking-wider uppercase font-semibold opacity-80 ${scrolled ? 'text-muted-foreground' : 'text-primary-foreground'}`}>UNICEF \u00B7 WASH Intelligence</div>
              </div>
            </div>
            
            <div className="hidden md:flex items-center gap-8">
              <a href="#impact" className={`text-sm font-semibold hover:opacity-100 transition-opacity ${scrolled ? 'text-muted-foreground hover:text-foreground' : 'text-primary-foreground/80'}`}>Impact</a>
              <a href="#platform" className={`text-sm font-semibold hover:opacity-100 transition-opacity ${scrolled ? 'text-muted-foreground hover:text-foreground' : 'text-primary-foreground/80'}`}>Platform</a>
              <a href="#methodology" className={`text-sm font-semibold hover:opacity-100 transition-opacity ${scrolled ? 'text-muted-foreground hover:text-foreground' : 'text-primary-foreground/80'}`}>Methodology</a>
              <Link href="/stress-test" className="text-sm font-bold text-yellow-400 hover:text-yellow-300 transition-colors" data-testid="nav-stress-test-link">
                2050 Projections \u2197
              </Link>
            </div>

            <div className="flex items-center gap-4">
              <div className={scrolled ? "" : "opacity-0 md:opacity-100"}>
                 <ThemeToggle />
              </div>
              <Link href="/dashboard" data-testid="nav-dashboard-link">
                <Button variant={scrolled ? "default" : "secondary"} className="gap-2">
                  Dashboard <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-primary text-primary-foreground">
        <div className="absolute inset-0 z-0 opacity-10 dark:opacity-5">
            <svg className="absolute w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M0 40V0h40" fill="none" stroke="currentColor" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid-pattern)"/>
            </svg>
        </div>

        <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[1fr_400px] gap-12 lg:gap-20 items-center">
            
            <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }}>
              <motion.div variants={fadeUpVariant} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-foreground/10 border border-primary-foreground/20 text-xs font-bold uppercase tracking-widest mb-6">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                For Every Child \u00B7 A Climate-Safe Future
              </motion.div>
              
              <motion.h1 variants={fadeUpVariant} className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6">
                Protecting Children<br />
                from Climate Risk,<br />
                <span className="font-medium italic opacity-90">District by District.</span>
              </motion.h1>
              
              <motion.p variants={fadeUpVariant} className="text-lg sm:text-xl opacity-90 leading-relaxed max-w-2xl mb-10 font-light">
                India's first district-level WASH climate risk platform \u2014 covering <strong className="font-bold">735 districts</strong> and <strong className="font-bold">1.4 billion people</strong> \u2014 built on the UNICEF-CEEW methodology to protect children from heatwave, flood, drought and cyclone impacts.
              </motion.p>
              
              <motion.div variants={fadeUpVariant} className="flex flex-wrap gap-4 mb-16">
                <Link href="/dashboard">
                  <Button size="lg" variant="secondary" className="gap-2 font-semibold">
                    {"\uD83D\uDCA7"} Demo Map
                  </Button>
                </Link>
                <Link href="/live-data">
                  <Button size="lg" variant="outline" className="gap-2 bg-transparent text-primary-foreground border-primary-foreground/30 hover:bg-primary-foreground/10">
                    <Activity className="w-4 h-4" /> Live Data Dashboard
                  </Button>
                </Link>
                <a href="#methodology" className="inline-flex items-center justify-center px-6 text-sm font-semibold hover:underline opacity-80 hover:opacity-100 transition-opacity">
                  Read Methodology
                </a>
              </motion.div>

              <motion.div variants={fadeUpVariant} className="hidden sm:block">
                <div className="text-xs font-bold tracking-widest uppercase opacity-60 mb-4">Measurable Impact</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {SECONDARY_STATS.map((stat, i) => (
                    <div key={i} className="flex items-center gap-3 bg-primary-foreground/5 rounded-lg p-3 border border-primary-foreground/10">
                      <span className="text-xl">{stat.icon}</span>
                      <div>
                        <div className="font-bold">{stat.value}</div>
                        <div className="text-[10px] opacity-70 leading-tight">{stat.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>

            {/* Right side stats card */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="bg-card text-card-foreground rounded-xl shadow-2xl p-6 border border-border"
            >
              <div className="flex items-center justify-between pb-4 border-b mb-4">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">National Risk Snapshot</div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-500 uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live
                </div>
              </div>

              <div className="space-y-4">
                {[
                  { label: "Very High Risk", n: 124, total: 735, color: "bg-destructive", textColor: "text-destructive" },
                  { label: "High Risk", n: 218, total: 735, color: "bg-orange-500", textColor: "text-orange-500" },
                  { label: "Moderate Risk", n: 243, total: 735, color: "bg-yellow-500", textColor: "text-yellow-500" },
                  { label: "Low / Very Low", n: 150, total: 735, color: "bg-primary", textColor: "text-primary" },
                ].map((r, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-semibold text-muted-foreground">{r.label}</span>
                      <span className={`font-bold ${r.textColor}`}>{r.n} districts</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(r.n / r.total) * 100}%` }}
                        transition={{ delay: 0.8 + (i * 0.1), duration: 1 }}
                        className={`h-full ${r.color} rounded-full`} 
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-6 pt-5 border-t">
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">160M+</div>
                  <div className="text-[10px] text-muted-foreground leading-tight mt-1">Children in flood-risk areas</div>
                </div>
                <div className="bg-destructive/10 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-destructive">115M+</div>
                  <div className="text-[10px] text-muted-foreground leading-tight mt-1">Children in drought areas</div>
                </div>
              </div>

              <div className="mt-4 bg-gradient-to-br from-primary to-blue-700 rounded-lg p-4 text-primary-foreground">
                <div className="text-[10px] font-bold tracking-wider opacity-80 mb-1">TOTAL INVESTMENT NEED</div>
                <div className="text-2xl font-extrabold mb-2">{"\u20B9"}4,09,460 Cr</div>
                <div className="flex gap-4 text-xs opacity-90">
                  <span>Mitig: {"\u20B9"}1.59L Cr</span>
                  <span>Adapt: {"\u20B9"}2.50L Cr</span>
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* Impact Section */}
      <section id="impact" className="py-24 bg-secondary/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4 text-primary border-primary/30 uppercase tracking-widest">Evidence-Based Impact</Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold mb-4 text-foreground">Impact Across Three Pillars</h2>
            <p className="text-muted-foreground">All figures grounded in peer-reviewed evidence. Conservative estimates applied where ranges exist.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {IMPACT_CARDS.map((card, i) => (
              <Card key={i} className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <CardHeader>
                  <div className="mb-4">{card.icon}</div>
                  <CardTitle className={`text-4xl font-black ${card.colorClass}`}>{card.value}</CardTitle>
                  <CardDescription className="text-lg font-bold text-foreground">{card.title}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{card.detail}</p>
                  <Badge variant="secondary" className="font-mono text-xs">{"\u2197"} {card.cite}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="overflow-hidden">
            <div className="grid lg:grid-cols-[300px_1fr] divide-y lg:divide-y-0 lg:divide-x">
              <div className="bg-secondary/30 p-4 space-y-2">
                {PILLARS.map((p, i) => (
                  <button 
                    key={i} 
                    onClick={() => setActivePillar(i)} 
                    className={`w-full text-left p-4 rounded-lg border transition-all duration-200 ${
                      activePillar === i 
                        ? 'bg-background border-primary shadow-sm' 
                        : 'bg-transparent border-transparent hover:bg-background/50 hover:border-border'
                    }`}
                  >
                    <div className="mb-2">{p.icon}</div>
                    <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${activePillar === i ? 'text-primary' : 'text-muted-foreground'}`}>{p.label}</div>
                    <div className={`font-bold ${activePillar === i ? 'text-foreground' : 'text-muted-foreground'}`}>{p.headline}</div>
                  </button>
                ))}
              </div>
              
              <div className="p-8 lg:p-12 bg-background">
                <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${pillar.colorClass}`}>{pillar.label}</div>
                <h3 className="text-3xl sm:text-4xl font-extrabold mb-2">{pillar.headline}</h3>
                <div className="text-xl text-muted-foreground mb-6">{pillar.sub}</div>
                
                <Badge variant="outline" className="mb-8 text-xs">{"\u2197"} {pillar.cite}</Badge>
                
                <p className="text-muted-foreground leading-relaxed max-w-3xl mb-12">
                  {pillar.body}
                </p>

                <div className="grid sm:grid-cols-3 gap-6">
                  {pillar.stats.map((s, i) => (
                    <div key={i} className={`p-6 rounded-xl text-center ${pillar.bgClass}`}>
                      <div className={`text-3xl font-black mb-2 ${pillar.colorClass}`}>
                        <CountUp to={s.n} suffix={s.suffix} duration={1400} delay={i * 150} />
                      </div>
                      <div className="text-xs font-medium text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Scale Section */}
      <section className="bg-primary text-primary-foreground py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0 divide-x-0 md:divide-x divide-primary-foreground/20">
            {[
              { n: 735, suffix: "", label: "Districts Analysed", sub: "India national coverage" },
              { val: "1.4B", label: "People Covered", sub: "Aggregate district populations" },
              { n: 21, suffix: "M+", label: "Children Under 5 at Risk", sub: "In vulnerable districts" },
              { val: "IPCC AR5", label: "Risk Framework", sub: "International standard" },
            ].map((s: any, i) => (
              <div key={i} className="text-center px-4">
                <div className="text-4xl sm:text-5xl font-black mb-3">
                  {s.val ? s.val : <CountUp to={s.n} suffix={s.suffix} />}
                </div>
                <div className="font-bold text-sm sm:text-base opacity-90">{s.label}</div>
                <div className="text-xs opacity-70 mt-1">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Features Section */}
      <section id="platform" className="py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
            <div className="max-w-xl">
              <div className="w-12 h-1.5 bg-primary rounded-full mb-6" />
              <h2 className="text-3xl sm:text-4xl font-extrabold">Platform Capabilities</h2>
            </div>
            <p className="text-muted-foreground max-w-md">
              Built for government departments and development partners who need district-level intelligence to design climate-resilient WASH interventions.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f: any, i: number) => {
              const isNew = f.tag === "New";
              
              const CardContent = (
                <Card className={`h-full transition-all duration-300 ${isNew ? 'border-yellow-500/50 bg-yellow-500/5 hover:border-yellow-500 dark:bg-yellow-500/10' : 'hover:border-primary/50 hover:shadow-md'}`}>
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-6">
                      <span className="text-3xl">{f.icon}</span>
                      <Badge variant={isNew ? "default" : "secondary"} className={isNew ? 'bg-yellow-500 hover:bg-yellow-600 text-yellow-950' : ''}>
                        {f.tag}
                      </Badge>
                    </div>
                    <h3 className="text-lg font-bold mb-3">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                    
                    {isNew && (
                      <div className="mt-6 flex items-center text-sm font-bold text-yellow-600 dark:text-yellow-400 group">
                        Open stress test <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                      </div>
                    )}
                  </div>
                </Card>
              );

              return f.link ? (
                <Link key={i} href={f.link} className="block h-full cursor-pointer">
                  {CardContent}
                </Link>
              ) : (
                <div key={i} className="h-full">
                  {CardContent}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Methodology Section */}
      <section id="methodology" className="py-24 bg-secondary/30 border-t border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">
            <div>
              <div className="w-12 h-1.5 bg-primary rounded-full mb-6" />
              <h2 className="text-3xl sm:text-4xl font-extrabold mb-6">Methodology</h2>
              <p className="text-muted-foreground text-lg mb-10">
                Aligned with the <strong className="text-foreground">UNICEF-CEEW Climate Extremes & WASH Risk Study</strong> \u2014 using IPCC AR5 risk framing to produce defensible, district-level vulnerability scores.
              </p>
              
              <div className="space-y-6">
                <Card className="border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <CardDescription className="uppercase tracking-widest font-bold text-xs">Core Formula</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl sm:text-2xl font-black text-primary mb-2">Risk = f(Hazard {"\u00D7"} Exposure {"\u00D7"} Vulnerability)</div>
                    <div className="text-sm text-muted-foreground">IPCC AR5 standard \u00B7 UNICEF-CEEW methodology</div>
                  </CardContent>
                </Card>
                
                <Card className="border-l-4 border-l-chart-4">
                  <CardHeader className="pb-2">
                    <CardDescription className="uppercase tracking-widest font-bold text-xs">Data Sources</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm font-medium leading-relaxed">National census, NFHS health indicators, IMD climate data, CEEW hazard indices \u2014 normalised, weighted and combined into district-level composite scores</div>
                  </CardContent>
                </Card>
              </div>
            </div>
            
            <div className="space-y-8">
              {METHODOLOGY.map((s, i) => (
                <div key={i} className="flex gap-6">
                  <div className="text-3xl font-black text-muted-foreground/30 leading-none">{s.n}</div>
                  <div>
                    <h4 className="text-lg font-bold mb-2">{s.label}</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Target Audience Section */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-center mb-16">Who Can Use This Dashboard?</h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: "\uD83C\uDFDB\uFE0F", who: "Government & Line Departments", points: ["Identify high-risk districts for climate-resilient WASH investment", "Support Jal Jeevan Mission, SBM and state climate action plans", "Strengthen convergence between WASH, DRR and climate programmes"] },
              { icon: "\uD83C\uDF0D", who: "Development Partners", points: ["Prioritise geographies for child-centred climate adaptation programming", "Use district profiles in programme design and donor proposals", "Track climate risk evolution as data improves over time"] },
              { icon: "\uD83E\uDD1D", who: "NGOs & Practitioners", points: ["Target high-risk districts for field interventions", "Choose technologies suited to local climate typology", "Support advocacy with visual evidence of climate risk"] },
            ].map((c, i) => (
              <Card key={i} className="border-t-4 border-t-primary h-full">
                <CardHeader>
                  <div className="text-4xl mb-4">{c.icon}</div>
                  <CardTitle className="text-xl">{c.who}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {c.points.map((p, j) => (
                    <div key={j} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                      <span className="text-sm text-muted-foreground leading-relaxed">{p}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 bg-primary text-primary-foreground overflow-hidden text-center">
        <div className="absolute top-1/2 right-0 transform -translate-y-1/2 text-[300px] opacity-5 pointer-events-none select-none">{"\uD83D\uDCA7"}</div>
        
        <div className="container relative z-10 mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-5xl mb-6">{"\uD83D\uDC67\uD83C\uDFFD"}</div>
            <h2 className="text-4xl sm:text-5xl font-black mb-6 leading-tight">
              Every Child Deserves<br />a Climate-Safe Future.
            </h2>
            <p className="text-lg sm:text-xl opacity-90 mb-10 font-light leading-relaxed">
              Built on UNICEF-CEEW methodology. 735 districts. 1.4 billion people. District-level intelligence to protect the most vulnerable.
            </p>
            
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/dashboard">
                <Button size="lg" variant="secondary" className="gap-2 text-base px-8">
                  {"\uD83D\uDCA7"} Demo Map
                </Button>
              </Link>
              <Link href="/live-data">
                <Button size="lg" variant="outline" className="gap-2 bg-transparent text-primary-foreground border-primary-foreground/30 hover:bg-primary-foreground/10 text-base px-8">
                  <Activity className="w-5 h-5" /> Live Data Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background border-t border-border py-8">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground text-center md:text-left">
          <div>ClimateAdapt India \u00B7 A UNICEF Initiative for Climate-Resilient WASH \u00B7 Built on UNICEF-CEEW Methodology</div>
          <div>735 Districts \u00B7 1.4 Billion People \u00B7 IPCC AR5 Framework</div>
        </div>
      </footer>
    </div>
  );
}
