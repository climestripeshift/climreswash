import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowRight, Activity, MapPin, BarChart3, AlertTriangle, Droplets, Banknote, Users, Zap, CheckCircle2, ShieldCheck, Sparkles, Globe } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";

function useCounter(target: number, duration = 2000, delay = 0): [number, React.RefObject<HTMLSpanElement | null>] {
  const [val, setVal] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStarted(true); }, { threshold: 0.1 });
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

function CountUp({ to, suffix = "", prefix = "", duration = 2000, delay = 0 }: { to: number; suffix?: string; prefix?: string; duration?: number; delay?: number }) {
  const [val, ref] = useCounter(to, duration, delay);
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}

// Data Arrays
const IMPACT_CARDS = [
  { value: 30, prefix: "\u2193 ", suffix: "%", title: "Disaster Response Costs", detail: "Early warning alerts triggered 72hrs in advance enable pre-positioned WASH supplies.", cite: "UNDRR, 2022", icon: <Zap className="w-6 h-6 text-cyan-400" /> },
  { value: 1.4, suffix: "B", title: "People Risk-Screened", detail: "Every district\u2019s population covered by WASH climate risk assessment.", cite: "National Census", icon: <Users className="w-6 h-6 text-cyan-400" /> },
  { value: 4.09, prefix: "\u20B9", suffix: "T", title: "Investment Gaps Mapped", detail: "District-level funding needs quantified across Mitigation and Adaptation.", cite: "IPCC AR5", icon: <Banknote className="w-6 h-6 text-cyan-400" /> },
];

const FEATURES = [
  { icon: <Globe className="w-6 h-6" />, title: "District Risk Maps", desc: "Interactive GeoJSON maps of all 735 districts \u2014 colour-coded by Hazard, Exposure, Vulnerability.", tag: "Analytics" },
  { icon: <AlertTriangle className="w-6 h-6" />, title: "Early Warning System", desc: "Real-time 4-tier alerts for heatwave, flood, drought with 72hr advance signals.", tag: "Preparedness" },
  { icon: <Droplets className="w-6 h-6" />, title: "WASH Risk Screening", desc: "Coverage gaps mapped against climate hazard with resilient technology recommendations.", tag: "WASH" },
  { icon: <Banknote className="w-6 h-6" />, title: "Investment Modelling", desc: "Per-capita funding needs estimated by hazard score, deficit and health burden.", tag: "Finance" },
  { icon: <ShieldCheck className="w-6 h-6" />, title: "Child Vulnerability", desc: "Children at risk quantified per district \u2014 including stunting and malnutrition.", tag: "Children" },
  { icon: <Activity className="w-6 h-6 text-yellow-400" />, title: "2050 Stress Test", desc: "AR6-based projections under 3 IPCC scenarios. Ranks districts by deterioration to 2050.", tag: "New", link: "/stress-test", highlight: true },
];

const METHODOLOGY = [
  { n: "01", label: "Hazard Assessment", desc: "Heatwave, flood, drought, cyclone frequency and magnitude at district level." },
  { n: "02", label: "Exposure Mapping", desc: "Population density and WASH infrastructure service delivery reach." },
  { n: "03", label: "Vulnerability Scoring", desc: "WASH access gaps, malnutrition, infant mortality \u2014 child-centred indicators." },
  { n: "04", label: "Risk Computation", desc: "Risk = f(Hazard \u00D7 Exposure \u00D7 Vulnerability) \u2014 IPCC AR5 standard framework." },
];

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const { scrollYProgress } = useScroll();
  const yBg = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const opacityHero = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.8, delay: i * 0.1 } })
  };

  return (
    <div data-testid="page-home" className="min-h-screen bg-background text-foreground overflow-hidden selection:bg-primary/30 relative">
      
      {/* Ambient Animated Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden flex items-center justify-center">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary/10 blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-blue-600/10 dark:bg-blue-500/10 blur-[150px] mix-blend-screen animate-pulse" style={{ animationDuration: '12s' }} />
        
        {/* Subtle Grid Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      {/* Glassmorphic Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-background/70 backdrop-blur-xl border-b border-border/50 py-3 shadow-lg shadow-black/5' : 'bg-transparent py-5'}`}>
        <div className="container mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 group cursor-pointer">
              <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 text-white shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow">
                <span className="text-xl">{"\uD83D\uDCA7"}</span>
              </div>
              <div>
                <div className="font-extrabold text-lg leading-none tracking-tight">ClimateAdapt</div>
                <div className="text-[10px] tracking-[0.2em] uppercase font-bold text-muted-foreground mt-0.5">UNICEF India</div>
              </div>
            </div>
            
            <div className="hidden md:flex items-center gap-8 px-6 py-2 rounded-full bg-foreground/5 backdrop-blur-md border border-foreground/10">
              <a href="#impact" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">Impact</a>
              <a href="#platform" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">Platform</a>
              <a href="#methodology" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">Methodology</a>
              <Link href="/stress-test" className="text-sm font-bold flex items-center gap-1 text-primary hover:text-primary/80 transition-colors">
                <Sparkles className="w-3.5 h-3.5" /> 2050 Test
              </Link>
            </div>

            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Link href="/dashboard">
                <Button className="rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all gap-2 group">
                  Dashboard <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Cinematic Hero Section */}
      <section className="relative pt-40 pb-20 lg:pt-56 lg:pb-32 z-10 flex flex-col items-center justify-center min-h-[90vh] text-center">
        <motion.div style={{ y: yBg, opacity: opacityHero }} className="container mx-auto px-4 flex flex-col items-center">
          
          <motion.div custom={0} initial="hidden" animate="visible" variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold uppercase tracking-widest text-primary mb-8 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Live District Intelligence
          </motion.div>
          
          <motion.h1 custom={1} initial="hidden" animate="visible" variants={fadeUp} className="text-5xl sm:text-6xl lg:text-8xl font-black tracking-tighter leading-[1.1] mb-6 max-w-5xl">
            Protecting Children from <br className="hidden sm:block" />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-blue-500 to-cyan-400">Climate Risk.</span>
          </motion.h1>
          
          <motion.p custom={2} initial="hidden" animate="visible" variants={fadeUp} className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mb-12 font-medium">
            India's first district-level WASH climate platform covering <strong className="text-foreground font-bold">735 districts</strong> and <strong className="text-foreground font-bold">1.4 billion people</strong>. Built to protect the most vulnerable.
          </motion.p>
          
          <motion.div custom={3} initial="hidden" animate="visible" variants={fadeUp} className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <Link href="/dashboard" className="w-full sm:w-auto">
              <Button size="lg" className="w-full h-14 px-8 text-base rounded-full shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all group">
                <MapPin className="w-5 h-5 mr-2 opacity-80" /> Open Risk Map
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="/live-data" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full h-14 px-8 text-base rounded-full bg-background/50 backdrop-blur-md hover:bg-muted/80 transition-all border-border/50">
                <Activity className="w-5 h-5 mr-2 text-primary" /> View Live Data
              </Button>
            </Link>
          </motion.div>

        </motion.div>
      </section>

      {/* Bento Box Impact Grid */}
      <section id="impact" className="relative py-24 z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-16">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight mb-4 text-center">Measurable Impact</h2>
            <p className="text-center text-muted-foreground max-w-2xl mx-auto">Evidence-based risk mapping grounded in the UNICEF-CEEW methodology.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {/* Large Hero Bento Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className="md:col-span-2 md:row-span-2 group relative overflow-hidden rounded-3xl bg-background/40 backdrop-blur-xl border border-border/50 shadow-2xl hover:border-primary/50 transition-all duration-500 flex flex-col justify-between p-8 sm:p-12"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -mr-20 -mt-20 group-hover:bg-primary/20 transition-colors duration-500" />
              
              <div>
                <div className="inline-flex p-3 rounded-2xl bg-primary/10 text-primary mb-6">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <h3 className="text-2xl sm:text-4xl font-bold mb-4">WASH System Resilience</h3>
                <p className="text-muted-foreground text-lg mb-8 max-w-md">Every district matched to specific climate-resilient technologies. Abstract vulnerability scores transformed into actionable engineering guidance.</p>
              </div>
              
              <div className="grid sm:grid-cols-3 gap-4 border-t border-border/50 pt-8 mt-8">
                <div>
                  <div className="text-3xl font-black text-foreground mb-1"><CountUp to={124} /></div>
                  <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Very High Risk</div>
                </div>
                <div>
                  <div className="text-3xl font-black text-foreground mb-1"><CountUp to={218} /></div>
                  <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider">High Risk Focus</div>
                </div>
                <div>
                  <div className="text-3xl font-black text-primary mb-1"><CountUp to={100} suffix="%" /></div>
                  <div className="text-xs text-primary/80 font-bold uppercase tracking-wider">Tech Coverage</div>
                </div>
              </div>
            </motion.div>

            {/* Smaller Bento Cards */}
            {IMPACT_CARDS.map((card, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="group relative overflow-hidden rounded-3xl bg-background/40 backdrop-blur-xl border border-border/50 shadow-xl hover:border-primary/30 transition-all duration-300 p-8 flex flex-col"
              >
                <div className="mb-4 bg-muted/50 w-12 h-12 rounded-xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  {card.icon}
                </div>
                <div className="text-3xl font-black mb-2 bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/70">
                  <CountUp to={card.value} prefix={card.prefix} suffix={card.suffix} delay={200} />
                </div>
                <h4 className="font-bold text-lg mb-2">{card.title}</h4>
                <p className="text-sm text-muted-foreground flex-1 mb-6">{card.detail}</p>
                <div className="text-[10px] font-bold uppercase tracking-widest text-primary/60 mt-auto pt-4 border-t border-border/30">Source: {card.cite}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Showcase Grid */}
      <section id="platform" className="relative py-24 z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight mb-6">Platform Capabilities</h2>
            <p className="text-lg text-muted-foreground">Comprehensive intelligence built for government line departments and development partners to design robust interventions.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {FEATURES.map((f, i) => {
              const CardContent = (
                <div className="h-full p-8 flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <div className={`p-3 rounded-2xl ${f.highlight ? 'bg-yellow-500/10 text-yellow-500' : 'bg-primary/10 text-primary'}`}>
                      {f.icon}
                    </div>
                    <Badge variant="outline" className={f.highlight ? 'border-yellow-500/30 text-yellow-500' : 'border-border'}>{f.tag}</Badge>
                  </div>
                  <h3 className="text-xl font-bold mb-3">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-6 flex-1">{f.desc}</p>
                  
                  {f.highlight && (
                    <div className="mt-auto flex items-center text-sm font-bold text-yellow-500 group-hover:translate-x-1 transition-transform">
                      Explore Projections <ArrowRight className="w-4 h-4 ml-1" />
                    </div>
                  )}
                </div>
              );

              return (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                  className={`group relative overflow-hidden rounded-3xl backdrop-blur-md border shadow-lg transition-all duration-300 hover:-translate-y-1 ${
                    f.highlight 
                      ? 'bg-yellow-500/5 border-yellow-500/30 hover:border-yellow-500/60 hover:shadow-yellow-500/10' 
                      : 'bg-background/60 border-border/50 hover:border-primary/40 hover:shadow-primary/5'
                  }`}
                >
                  {f.link ? (
                    <Link href={f.link} className="block h-full cursor-pointer">
                      {CardContent}
                    </Link>
                  ) : CardContent}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Modern Methodology Timeline */}
      <section id="methodology" className="relative py-24 z-10 bg-muted/30 border-y border-border/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <div className="mb-16">
            <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-0 mb-4 tracking-widest uppercase">Scientific Rigour</Badge>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight mb-4">Methodology</h2>
            <p className="text-muted-foreground text-lg">Grounded in the IPCC AR5 risk framework and the UNICEF-CEEW Climate Extremes study.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-x-12 gap-y-8">
            <div className="space-y-8">
              {METHODOLOGY.slice(0, 2).map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="flex gap-6 group">
                  <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-primary/80 to-primary/20 group-hover:from-primary group-hover:to-primary/40 transition-all">{s.n}</div>
                  <div>
                    <h4 className="text-xl font-bold mb-2">{s.label}</h4>
                    <p className="text-muted-foreground">{s.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="space-y-8">
              {METHODOLOGY.slice(2, 4).map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="flex gap-6 group">
                  <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-primary/80 to-primary/20 group-hover:from-primary group-hover:to-primary/40 transition-all">{s.n}</div>
                  <div>
                    <h4 className="text-xl font-bold mb-2">{s.label}</h4>
                    <p className="text-muted-foreground">{s.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="mt-16 p-8 rounded-3xl bg-gradient-to-br from-primary/10 to-blue-500/10 border border-primary/20 text-center backdrop-blur-sm"
          >
             <div className="text-xs font-bold tracking-widest uppercase text-primary mb-3">The Equation</div>
             <div className="text-2xl sm:text-3xl font-black font-mono">Risk = f(Hazard \u00D7 Exposure \u00D7 Vulnerability)</div>
          </motion.div>
        </div>
      </section>

      {/* Grand CTA */}
      <section className="relative py-32 z-10 overflow-hidden">
        <div className="absolute inset-0 bg-primary/5 dark:bg-primary/10" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,hsl(var(--background)))]" />
        
        <div className="container relative z-10 mx-auto px-4 text-center max-w-4xl">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <div className="inline-flex p-4 rounded-full bg-background shadow-xl border border-border mb-8">
              <span className="text-4xl">{"\uD83D\uDC67\uD83C\uDFFD"}</span>
            </div>
            <h2 className="text-4xl sm:text-6xl font-black tracking-tighter mb-6 leading-tight">
              Every Child Deserves<br />a Climate-Safe Future.
            </h2>
            <p className="text-xl text-muted-foreground mb-12">
              Transform data into action. Protect the most vulnerable districts in India with evidence-based intelligence.
            </p>
            
            <Link href="/dashboard">
              <Button size="lg" className="h-16 px-10 text-lg rounded-full shadow-2xl shadow-primary/20 hover:shadow-primary/40 hover:scale-105 transition-all group">
                Enter the Dashboard <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="relative z-10 border-t border-border/40 py-8 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground font-medium">ClimateAdapt India \u00B7 A UNICEF Initiative for Climate-Resilient WASH</p>
        </div>
      </footer>
    </div>
  );
}
