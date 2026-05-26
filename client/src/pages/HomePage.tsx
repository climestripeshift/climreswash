import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { 
  ArrowRight, 
  Activity, 
  MapPin, 
  AlertTriangle, 
  Droplets, 
  Banknote, 
  Users, 
  Zap, 
  ShieldCheck, 
  Sparkles, 
  Globe,
  LineChart,
  BookOpen
} from "lucide-react";

// --- Utility Components ---
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

// --- Data ---
const IMPACT_CARDS = [
  { value: 30, prefix: "", suffix: "%", title: "Reduced Response Costs", detail: "Early warning alerts triggered 72 hours in advance enable pre-positioned WASH supplies.", cite: "UNDRR, 2022", icon: <Zap className="w-5 h-5 text-primary" /> },
  { value: 1.4, suffix: "B", title: "People Risk-Screened", detail: "Every district's population covered by our comprehensive WASH climate risk assessment.", cite: "National Census", icon: <Users className="w-5 h-5 text-primary" /> },
  { value: 4.09, prefix: "\u20B9", suffix: "T", title: "Investment Gaps Mapped", detail: "District-level funding needs quantified across Mitigation and Adaptation.", cite: "IPCC AR5", icon: <Banknote className="w-5 h-5 text-primary" /> },
];

const FEATURES = [
  { icon: <Globe className="w-5 h-5 text-primary" />, title: "District Risk Maps", desc: "Interactive maps of all 735 districts, categorised by Hazard, Exposure, and Vulnerability.", tag: "Analytics" },
  { icon: <AlertTriangle className="w-5 h-5 text-primary" />, title: "Early Warning System", desc: "Real-time 4-tier alerts for heatwaves, floods, and droughts with 72-hour advance signals.", tag: "Preparedness" },
  { icon: <Droplets className="w-5 h-5 text-primary" />, title: "WASH Risk Screening", desc: "Coverage gaps mapped against climate hazards with resilient technology recommendations.", tag: "WASH" },
  { icon: <Banknote className="w-5 h-5 text-primary" />, title: "Investment Modelling", desc: "Per-capita funding needs estimated by hazard score, deficit, and health burden.", tag: "Finance" },
  { icon: <ShieldCheck className="w-5 h-5 text-primary" />, title: "Child Vulnerability", desc: "Children at risk quantified per district, including stunting and malnutrition metrics.", tag: "Children" },
  { icon: <Activity className="w-5 h-5 text-primary" />, title: "2050 Stress Test", desc: "AR6-based projections under 3 IPCC scenarios. Ranks districts by deterioration to 2050.", tag: "New", link: "/stress-test", highlight: true },
];

const METHODOLOGY = [
  { n: "01", label: "Hazard Assessment", desc: "Heatwave, flood, drought, cyclone frequency and magnitude at district level." },
  { n: "02", label: "Exposure Mapping", desc: "Population density and WASH infrastructure service delivery reach." },
  { n: "03", label: "Vulnerability Scoring", desc: "WASH access gaps, malnutrition, infant mortality." },
  { n: "04", label: "Risk Computation", desc: "Risk = Hazard x Exposure x Vulnerability (IPCC AR5 standard framework)." },
];

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div data-testid="page-home" className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 selection:bg-primary/20 font-sans">
      
      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${scrolled ? 'bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 py-4 shadow-sm' : 'bg-transparent py-6'}`}>
        <div className="container mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between">
            
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
                <Droplets className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg leading-none tracking-tight text-slate-900 dark:text-white">ClimateAdapt</span>
                <span className="text-[10px] font-semibold tracking-widest uppercase text-slate-500 dark:text-slate-400 mt-1">UNICEF India</span>
              </div>
            </div>
            
            {/* Links */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#impact" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary transition-colors">Impact</a>
              <a href="#platform" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary transition-colors">Platform</a>
              <a href="#methodology" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary transition-colors">Methodology</a>
              <Link href="/stress-test" className="text-sm font-semibold flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors">
                <Sparkles className="w-3.5 h-3.5" /> 2050 Test
              </Link>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Link href="/dashboard">
                <Button className="rounded-md font-semibold px-6 gap-2">
                  Dashboard <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 flex flex-col items-center justify-center text-center bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
        <div className="container mx-auto px-4 flex flex-col items-center">
          
          <Badge variant="outline" className="px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase text-primary border-primary/20 bg-primary/5 mb-8">
            Live District Intelligence
          </Badge>
          
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6 max-w-4xl text-slate-900 dark:text-white">
            Protecting Children from <br className="hidden sm:block" />
            <span className="text-primary">Climate Risk.</span>
          </h1>
          
          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mb-12">
            India's first district-level WASH climate platform covering <strong className="text-slate-900 dark:text-white font-semibold">735 districts</strong> and <strong className="text-slate-900 dark:text-white font-semibold">1.4 billion people</strong>. Built to protect the most vulnerable communities.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <Link href="/dashboard" className="w-full sm:w-auto">
              <Button size="lg" className="w-full h-14 px-8 text-base font-semibold rounded-md shadow-sm">
                <MapPin className="w-5 h-5 mr-2" /> Open Risk Map
              </Button>
            </Link>
            <Link href="/live-data" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full h-14 px-8 text-base font-semibold rounded-md bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900">
                <Activity className="w-5 h-5 mr-2 text-primary" /> View Live Data
              </Button>
            </Link>
          </div>

        </div>
      </section>

      {/* Impact Section */}
      <section id="impact" className="py-24 bg-white dark:bg-slate-950">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16 md:flex md:items-end md:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 text-slate-900 dark:text-white">Measurable Impact</h2>
              <p className="text-lg text-slate-600 dark:text-slate-300">
                Evidence-based risk mapping grounded in the UNICEF-CEEW methodology.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl">
            {IMPACT_CARDS.map((card, i) => (
              <Card key={i} className="border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-slate-950 rounded-xl overflow-hidden">
                <CardContent className="p-8">
                  <div className="mb-6 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    {card.icon}
                  </div>
                  <div className="text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
                    <CountUp to={card.value} prefix={card.prefix} suffix={card.suffix} delay={100} />
                  </div>
                  <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-3">{card.title}</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-6">{card.detail}</p>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 pt-4 border-t border-slate-100 dark:border-slate-800">
                    Source: {card.cite}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Features Grid */}
      <section id="platform" className="py-24 bg-slate-50 dark:bg-slate-900/30 border-y border-slate-200 dark:border-slate-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 text-slate-900 dark:text-white">Platform Capabilities</h2>
            <p className="text-lg text-slate-600 dark:text-slate-300">
              Comprehensive intelligence built for government line departments and development partners to design robust interventions.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
            {FEATURES.map((f, i) => {
              const content = (
                <div className="h-full p-8 flex flex-col bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm hover:border-primary/50 transition-colors">
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-900">
                      {f.icon}
                    </div>
                    <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">{f.tag}</Badge>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{f.title}</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed flex-1">{f.desc}</p>
                  
                  {f.highlight && (
                    <div className="mt-6 flex items-center text-sm font-bold text-primary group">
                      Explore Projections <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                    </div>
                  )}
                </div>
              );

              return f.link ? (
                <Link key={i} href={f.link} className="block h-full outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl group">
                  {content}
                </Link>
              ) : (
                <div key={i} className="h-full">
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Methodology Timeline */}
      <section id="methodology" className="py-24 bg-white dark:bg-slate-950">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 text-slate-900 dark:text-white">Scientific Rigour</h2>
            <p className="text-lg text-slate-600 dark:text-slate-300">
              Grounded in the IPCC AR5 risk framework and the UNICEF-CEEW Climate Extremes study.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-10">
              {METHODOLOGY.slice(0, 2).map((s, i) => (
                <div key={i} className="flex gap-6 items-start">
                  <div className="text-3xl font-black text-slate-200 dark:text-slate-800 leading-none">{s.n}</div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{s.label}</h4>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-10">
              {METHODOLOGY.slice(2, 4).map((s, i) => (
                <div key={i} className="flex gap-6 items-start">
                  <div className="text-3xl font-black text-slate-200 dark:text-slate-800 leading-none">{s.n}</div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{s.label}</h4>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="mt-16 p-8 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-center max-w-2xl mx-auto">
             <div className="text-xs font-bold tracking-widest uppercase text-slate-500 dark:text-slate-400 mb-3">The Core Equation</div>
             <div className="text-xl sm:text-2xl font-bold font-mono text-slate-900 dark:text-white">Risk = f(Hazard x Exposure x Vulnerability)</div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-slate-900 dark:bg-slate-900 text-white text-center">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="inline-flex items-center justify-center p-4 rounded-xl bg-white/10 text-white mb-8">
            <LineChart className="w-8 h-8" />
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6">
            Data-Driven Climate Resilience
          </h2>
          <p className="text-lg text-slate-300 mb-10 max-w-2xl mx-auto">
            Transform data into action. Protect the most vulnerable districts in India with evidence-based intelligence and targeted interventions.
          </p>
          
          <Link href="/dashboard">
            <Button size="lg" className="h-14 px-8 text-base font-semibold rounded-md bg-primary hover:bg-primary/90 text-white">
              Open the Dashboard <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-8 bg-white dark:bg-slate-950">
        <div className="container mx-auto px-4 text-center flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            ClimateAdapt India - A UNICEF Initiative
          </p>
          <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5"><BookOpen className="w-4 h-4" /> Built on UNICEF-CEEW Data</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
