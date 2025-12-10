import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { 
  MapPin, 
  AlertTriangle, 
  Droplets, 
  Thermometer, 
  Shield, 
  Users,
  Building2,
  Target,
  Zap,
  ChevronRight,
  Globe,
  FileText,
  CheckCircle,
  Heart,
  GraduationCap,
  Baby,
  HeartPulse
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background" data-testid="page-home">
      <header className="sticky top-0 z-10 bg-[#00AEEF] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
          <div className="font-bold text-base sm:text-lg flex items-center gap-2">
            <span>ClimateAdapt India</span>
          </div>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link href="#children" className="text-xs sm:text-sm text-white/80 hover:text-white hidden sm:inline">Children & Climate</Link>
            <Link href="#features" className="text-xs sm:text-sm text-white/80 hover:text-white hidden sm:inline">Features</Link>
            <Link href="/technology" className="text-xs sm:text-sm text-white/80 hover:text-white" data-testid="link-technologies">Tech Guide</Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <section className="bg-gradient-to-br from-[#00AEEF] to-[#0077B6] text-white py-10 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-5 gap-6 sm:gap-8">
            <div className="lg:col-span-3">
              <Badge className="mb-3 sm:mb-4 bg-white/20 text-white hover:bg-white/30 border-white/30">
                For Every Child, A Safe Future
              </Badge>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4" data-testid="text-hero-title">
                Protecting Children from Climate Risks
              </h1>
              <p className="text-base sm:text-lg lg:text-xl text-white/90 mb-4 sm:mb-6 leading-relaxed">
                Climate change is not just an environmental crisis - it is a child rights crisis. 
                This dashboard helps identify districts where children are most vulnerable to climate-related 
                disruptions to water, sanitation and health services.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/dashboard">
                  <Button size="lg" className="w-full sm:w-auto gap-2 bg-white text-[#00AEEF] hover:bg-white/90" data-testid="button-view-map">
                    <MapPin className="h-5 w-5" />
                    View District Risk Map
                  </Button>
                </Link>
                <Link href="#methodology">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto border-white text-white hover:bg-white/10" data-testid="button-methodology">
                    Read Methodology
                  </Button>
                </Link>
              </div>
            </div>

            <Card className="lg:col-span-2 bg-white/10 border-white/20 text-white">
              <CardHeader className="pb-2">
                <div className="text-xs uppercase text-white/70 tracking-wide">Built On</div>
                <CardTitle className="text-base sm:text-lg text-white">UNICEF-CEEW Climate Extremes & WASH Risk Study</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-white/80 mb-3">
                  A child-centred approach to climate adaptation, translating national risk assessments 
                  into actionable insights for protecting children's health and wellbeing.
                </p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-white mt-0.5 shrink-0" />
                    <span className="text-white/90">District-level WASH climate risk index</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-white mt-0.5 shrink-0" />
                    <span className="text-white/90">Child vulnerability indicators</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-white mt-0.5 shrink-0" />
                    <span className="text-white/90">Climate-resilient technology guidance</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-white mt-0.5 shrink-0" />
                    <span className="text-white/90">Early warning for mitigation planning</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        
        <section id="children" className="mb-10 sm:mb-16">
          <div className="text-center mb-8">
            <Badge className="mb-3 bg-[#00AEEF]/10 text-[#00AEEF] hover:bg-[#00AEEF]/20 border-[#00AEEF]/30">
              Children & Climate
            </Badge>
            <h2 className="text-xl sm:text-2xl font-bold mb-4" data-testid="text-children-title">
              How Climate Change Impacts Children's Lives
            </h2>
            <p className="text-muted-foreground max-w-3xl mx-auto">
              Children are among the most vulnerable to climate change. They are more susceptible to diseases, 
              malnutrition, and the long-term impacts of environmental degradation.
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card className="border-l-4 border-l-[#00AEEF]">
              <CardHeader className="pb-2">
                <Droplets className="h-8 w-8 text-[#00AEEF] mb-2" />
                <CardTitle className="text-base">Water Insecurity</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Droughts and floods contaminate water sources, leading to diarrheal diseases that claim 
                  thousands of children's lives each year. Children under 5 are most at risk.
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-[#00AEEF]">
              <CardHeader className="pb-2">
                <HeartPulse className="h-8 w-8 text-[#00AEEF] mb-2" />
                <CardTitle className="text-base">Health Impacts</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Heatwaves cause heat stress and dehydration. Air pollution from dust storms affects 
                  respiratory health. Malnutrition worsens as crops fail due to erratic weather.
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-[#00AEEF]">
              <CardHeader className="pb-2">
                <GraduationCap className="h-8 w-8 text-[#00AEEF] mb-2" />
                <CardTitle className="text-base">Education Disruption</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Extreme weather events damage schools and force closures. Children, especially girls, 
                  drop out to help families cope with climate disasters.
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-[#00AEEF]">
              <CardHeader className="pb-2">
                <Baby className="h-8 w-8 text-[#00AEEF] mb-2" />
                <CardTitle className="text-base">Stunting & Malnutrition</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Climate impacts on agriculture lead to food insecurity. Stunting and wasting rates 
                  increase in climate-affected districts, impacting lifelong development.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-[#00AEEF]/5 border-[#00AEEF]/20">
            <CardContent className="p-6">
              <div className="grid md:grid-cols-3 gap-6 text-center">
                <div>
                  <div className="text-3xl sm:text-4xl font-bold text-[#00AEEF]">160M+</div>
                  <div className="text-sm text-muted-foreground">Children in India live in high flood-risk areas</div>
                </div>
                <div>
                  <div className="text-3xl sm:text-4xl font-bold text-[#00AEEF]">115M+</div>
                  <div className="text-sm text-muted-foreground">Children exposed to high drought conditions</div>
                </div>
                <div>
                  <div className="text-3xl sm:text-4xl font-bold text-[#00AEEF]">21M+</div>
                  <div className="text-sm text-muted-foreground">Children under 5 affected by stunting in vulnerable districts</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section id="about" className="mb-10 sm:mb-16">
          <h2 className="text-xl sm:text-2xl font-bold mb-4" data-testid="text-about-title">Why This Dashboard?</h2>
          <div className="prose prose-sm sm:prose max-w-none text-muted-foreground">
            <p className="mb-4">
              India's drinking water and sanitation systems are increasingly exposed to climate extremes - 
              heatwaves, floods, droughts, intense rainfall and cyclones. These events disrupt water supply, 
              damage infrastructure and weaken service delivery for households, schools and health facilities 
              - with children bearing the greatest burden.
            </p>
            <p>
              ClimateAdapt India is a decision-support tool that converts the UNICEF-CEEW WASH climate risk 
              assessment into a visual, district-level dashboard. It is designed for government departments, 
              UNICEF and other development partners, and NGOs working on climate-resilient WASH to protect 
              children and their communities.
            </p>
          </div>
        </section>

        <section id="features" className="mb-10 sm:mb-16">
          <h2 className="text-xl sm:text-2xl font-bold mb-6" data-testid="text-features-title">Key Features</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <Globe className="h-8 w-8 text-[#00AEEF] mb-2" />
                <CardTitle className="text-base">District-Level WASH Climate Risk</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Each district is assigned a composite WASH climate risk category (Low, Medium, High, Very High) 
                  based on hazard, exposure and vulnerability indicators.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <Target className="h-8 w-8 text-[#00AEEF] mb-2" />
                <CardTitle className="text-base">Hazard-Exposure-Vulnerability Framework</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Uses the IPCC AR5 risk framing and the underlying UNICEF-CEEW methodology to reflect 
                  climate extremes, population and system fragility.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <Zap className="h-8 w-8 text-[#00AEEF] mb-2" />
                <CardTitle className="text-base">Technology Guidance by Climate & Typology</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Links district risk and typology to potential technology choices - for example, which water 
                  supply and sanitation options are more resilient in flood-prone, drought-prone or heat-stressed areas.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <AlertTriangle className="h-8 w-8 text-[#00AEEF] mb-2" />
                <CardTitle className="text-base">Early Warning Structure for Mitigation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Provides a structure to integrate heat, flood, drought and heavy rainfall alerts so that 
                  WASH systems can be prepared in advance and mitigation measures can be planned.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mb-10 sm:mb-16">
          <h2 className="text-xl sm:text-2xl font-bold mb-6">How It Helps Technology Choice & Mitigation</h2>
          <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
            <Card>
              <CardHeader>
                <div className="text-xs uppercase text-[#00AEEF] tracking-wide mb-1">Identify Technology by Climate & Typology</div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Different districts need different solutions. By combining climate risk with basic typology, this dashboard helps users:
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Droplets className="h-4 w-4 text-[#00AEEF] mt-0.5 shrink-0" />
                    See where groundwater-reliant systems may be stressed
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-[#00AEEF] mt-0.5 shrink-0" />
                    Understand where flood-resilient sanitation options are needed
                  </li>
                  <li className="flex items-start gap-2">
                    <Thermometer className="h-4 w-4 text-[#00AEEF] mt-0.5 shrink-0" />
                    Consider dual-source systems, storage and recharge where climate variability is high
                  </li>
                  <li className="flex items-start gap-2">
                    <Building2 className="h-4 w-4 text-[#00AEEF] mt-0.5 shrink-0" />
                    Prioritise low-maintenance, robust technologies in high-risk areas
                  </li>
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="text-xs uppercase text-[#00AEEF] tracking-wide mb-1">Early Warning Signals for Mitigation Planning</div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  The dashboard is structured to link with climate and hazard information systems so that:
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-[#00AEEF] mt-0.5 shrink-0" />
                    Upcoming heat, flood or drought warnings can flag at-risk districts
                  </li>
                  <li className="flex items-start gap-2">
                    <Users className="h-4 w-4 text-[#00AEEF] mt-0.5 shrink-0" />
                    WASH engineers and local governments can activate preparedness measures early
                  </li>
                  <li className="flex items-start gap-2">
                    <Target className="h-4 w-4 text-[#00AEEF] mt-0.5 shrink-0" />
                    Contingency planning and mitigation (tankering, storage, alternate sources) can be triggered in a timely way
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="methodology" className="mb-10 sm:mb-16">
          <h2 className="text-xl sm:text-2xl font-bold mb-4">Methodology - Aligned with UNICEF-CEEW Study</h2>
          <p className="text-muted-foreground mb-4">
            This dashboard follows the approach used in the UNICEF-CEEW study on climate risks to WASH systems in India.
          </p>
          <ul className="space-y-3 text-sm sm:text-base">
            <li className="flex items-start gap-3">
              <Badge variant="outline" className="shrink-0 mt-0.5 border-[#00AEEF] text-[#00AEEF]">Framework</Badge>
              <span className="text-muted-foreground">IPCC AR5 risk framing - <em>Risk = f(Hazard, Exposure, Vulnerability)</em></span>
            </li>
            <li className="flex items-start gap-3">
              <Badge variant="outline" className="shrink-0 mt-0.5 border-[#00AEEF] text-[#00AEEF]">Indicators</Badge>
              <span className="text-muted-foreground">A set of indicators representing climate extremes, WASH coverage and infrastructure, and socio-economic conditions, shortlisted through expert consultation</span>
            </li>
            <li className="flex items-start gap-3">
              <Badge variant="outline" className="shrink-0 mt-0.5 border-[#00AEEF] text-[#00AEEF]">Index Creation</Badge>
              <span className="text-muted-foreground">Indicators are normalised, weighted and combined into a composite district-level risk score, then grouped into categories (Low, Medium, High, Very High)</span>
            </li>
            <li className="flex items-start gap-3">
              <Badge variant="outline" className="shrink-0 mt-0.5 border-[#00AEEF] text-[#00AEEF]">Geographic Scale</Badge>
              <span className="text-muted-foreground">District-level analysis for all 735 districts in India, with potential to extend to block/ULB level in future phases</span>
            </li>
          </ul>
          <p className="text-sm text-muted-foreground mt-4 border-l-4 border-[#00AEEF] pl-4">
            Detailed indicator lists, weights and data sources will be refined and documented with WASH and climate experts as this prototype evolves.
          </p>
        </section>

        <section className="mb-10 sm:mb-16">
          <h2 className="text-xl sm:text-2xl font-bold mb-6">Who Can Use This Dashboard?</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <Building2 className="h-8 w-8 text-[#00AEEF] mb-2" />
                <CardTitle className="text-base">Government & Line Departments</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>Identify high-risk districts for climate-resilient WASH</li>
                  <li>Support planning under Jal Jeevan Mission, SBM and state climate action plans</li>
                  <li>Strengthen convergence between WASH, DRR and climate programmes</li>
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Globe className="h-8 w-8 text-[#00AEEF] mb-2" />
                <CardTitle className="text-base">UNICEF & Development Partners</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>Prioritise geographies for child-centred climate adaptation programming</li>
                  <li>Use district profiles in programme design and donor proposals</li>
                  <li>Track climate risk evolution over time as data improves</li>
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Users className="h-8 w-8 text-[#00AEEF] mb-2" />
                <CardTitle className="text-base">NGOs & Practitioners</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>Target high-risk districts for field interventions</li>
                  <li>Choose technologies and approaches suited to local climate typology</li>
                  <li>Support local advocacy with visual evidence of climate risk</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mb-10 sm:mb-16">
          <h2 className="text-xl sm:text-2xl font-bold mb-4">How to Use This Dashboard</h2>
          <ol className="space-y-3 text-sm sm:text-base text-muted-foreground">
            <li className="flex items-start gap-3">
              <span className="bg-[#00AEEF] text-white w-6 h-6 rounded-full flex items-center justify-center text-sm shrink-0">1</span>
              Select a state and district from the map or list
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-[#00AEEF] text-white w-6 h-6 rounded-full flex items-center justify-center text-sm shrink-0">2</span>
              View the district's WASH climate risk category (Low-Very High)
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-[#00AEEF] text-white w-6 h-6 rounded-full flex items-center justify-center text-sm shrink-0">3</span>
              Check key drivers of risk and the broad technology suitability considerations
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-[#00AEEF] text-white w-6 h-6 rounded-full flex items-center justify-center text-sm shrink-0">4</span>
              Use these insights to inform planning, discussions with states and partners, and the design of climate-resilient WASH interventions
            </li>
          </ol>
        </section>

        <section className="mb-10 sm:mb-16 text-center">
          <Link href="/dashboard">
            <Button size="lg" className="gap-2 bg-[#00AEEF] hover:bg-[#0098D1]" data-testid="button-explore-map">
              <MapPin className="h-5 w-5" />
              Explore the District Risk Map
              <ChevronRight className="h-5 w-5" />
            </Button>
          </Link>
        </section>

        <section className="mb-6 sm:mb-10">
          <h2 className="text-xl sm:text-2xl font-bold mb-4">Disclaimer & MVP Status</h2>
          <div className="bg-[#00AEEF]/5 border-l-4 border-[#00AEEF] p-4 rounded-r-lg">
            <p className="text-sm text-muted-foreground">
              This dashboard is an internal prototype (MVP) developed for discussion and learning. 
              It does not represent an official public-facing UNICEF product at this stage. 
              Indicators, weights, scores and visualisations are subject to refinement and technical review. 
              Please do not share externally without prior approval.
            </p>
          </div>
        </section>
      </main>

      <footer className="bg-[#00AEEF] text-white py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm text-white/80">
            ClimateAdapt India - A UNICEF Initiative for Climate-Resilient WASH
          </p>
        </div>
      </footer>
    </div>
  );
}
