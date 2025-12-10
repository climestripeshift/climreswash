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
  CheckCircle
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background" data-testid="page-home">
      <header className="sticky top-0 z-10 bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
          <div className="font-bold text-base sm:text-lg">ClimateAdapt India</div>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link href="#about" className="text-xs sm:text-sm text-slate-300 hover:text-white hidden sm:inline">About</Link>
            <Link href="#features" className="text-xs sm:text-sm text-slate-300 hover:text-white hidden sm:inline">Features</Link>
            <Link href="/technology" className="text-xs sm:text-sm text-slate-300 hover:text-white" data-testid="link-technologies">Tech Guide</Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <section className="grid lg:grid-cols-5 gap-6 sm:gap-8 mb-10 sm:mb-16">
          <div className="lg:col-span-3">
            <Badge className="mb-3 sm:mb-4 bg-blue-100 text-blue-700 hover:bg-blue-100">
              MVP - Internal Prototype
            </Badge>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-3 sm:mb-4" data-testid="text-hero-title">
              ClimateAdapt India - WASH Climate Risk & Technology Guidance
            </h1>
            <p className="text-sm sm:text-base lg:text-lg text-muted-foreground mb-4 sm:mb-6 leading-relaxed">
              A district-level dashboard based on UNICEF-CEEW climate extremes and WASH risk assessment. 
              It helps identify where drinking water and sanitation systems are most exposed to climate extremes 
              - and which technologies are better suited to those conditions.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/dashboard">
                <Button size="lg" className="w-full sm:w-auto gap-2" data-testid="button-view-map">
                  <MapPin className="h-5 w-5" />
                  View District Risk Map
                </Button>
              </Link>
              <Link href="#methodology">
                <Button variant="outline" size="lg" className="w-full sm:w-auto" data-testid="button-methodology">
                  Read Methodology
                </Button>
              </Link>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-4">
              Prototype for internal discussion. Not for public release.
            </p>
          </div>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="text-xs uppercase text-muted-foreground tracking-wide">Built On</div>
              <CardTitle className="text-base sm:text-lg">UNICEF-CEEW Climate Extremes & WASH Risk Study</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Translates a national assessment of climate risks to drinking water, sanitation and hygiene 
                systems into a simple, interactive tool for planners and programme teams.
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  District-level WASH climate risk index
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  Hazard-Exposure-Vulnerability framework (IPCC AR5)
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  Technology guidance by climate & typology
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  Structure for early warning and mitigation planning
                </li>
              </ul>
            </CardContent>
          </Card>
        </section>

        <section id="about" className="mb-10 sm:mb-16">
          <h2 className="text-xl sm:text-2xl font-bold mb-4" data-testid="text-about-title">Why This Dashboard?</h2>
          <div className="prose prose-sm sm:prose max-w-none text-muted-foreground">
            <p className="mb-4">
              India's drinking water and sanitation systems are increasingly exposed to climate extremes - 
              heatwaves, floods, droughts, intense rainfall and cyclones. These events disrupt water supply, 
              damage infrastructure and weaken service delivery for households, schools and health facilities.
            </p>
            <p>
              ClimateAdapt India is a decision-support MVP that converts the UNICEF-CEEW WASH climate risk 
              assessment into a visual, district-level dashboard. It is designed for government departments, 
              UNICEF and other development partners, and NGOs working on climate-resilient WASH.
            </p>
          </div>
        </section>

        <section id="features" className="mb-10 sm:mb-16">
          <h2 className="text-xl sm:text-2xl font-bold mb-6" data-testid="text-features-title">Key Features</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <Globe className="h-8 w-8 text-blue-500 mb-2" />
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
                <Target className="h-8 w-8 text-orange-500 mb-2" />
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
                <Zap className="h-8 w-8 text-green-500 mb-2" />
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
                <AlertTriangle className="h-8 w-8 text-red-500 mb-2" />
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
                <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">Identify Technology by Climate & Typology</div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Different districts need different solutions. By combining climate risk with basic typology, this dashboard helps users:
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Droplets className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    See where groundwater-reliant systems may be stressed
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    Understand where flood-resilient sanitation options are needed
                  </li>
                  <li className="flex items-start gap-2">
                    <Thermometer className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    Consider dual-source systems, storage and recharge where climate variability is high
                  </li>
                  <li className="flex items-start gap-2">
                    <Building2 className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    Prioritise low-maintenance, robust technologies in high-risk areas
                  </li>
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">Early Warning Signals for Mitigation Planning</div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  The dashboard is structured to link with climate and hazard information systems so that:
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                    Upcoming heat, flood or drought warnings can flag at-risk districts
                  </li>
                  <li className="flex items-start gap-2">
                    <Users className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                    WASH engineers and local governments can activate preparedness measures early
                  </li>
                  <li className="flex items-start gap-2">
                    <Target className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
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
            This MVP follows the approach used in the UNICEF-CEEW study on climate risks to WASH systems in India.
          </p>
          <ul className="space-y-3 text-sm sm:text-base">
            <li className="flex items-start gap-3">
              <Badge variant="outline" className="shrink-0 mt-0.5">Framework</Badge>
              <span className="text-muted-foreground">IPCC AR5 risk framing - <em>Risk = f(Hazard, Exposure, Vulnerability)</em></span>
            </li>
            <li className="flex items-start gap-3">
              <Badge variant="outline" className="shrink-0 mt-0.5">Indicators</Badge>
              <span className="text-muted-foreground">A set of indicators representing climate extremes, WASH coverage and infrastructure, and socio-economic conditions, shortlisted through expert consultation</span>
            </li>
            <li className="flex items-start gap-3">
              <Badge variant="outline" className="shrink-0 mt-0.5">Index Creation</Badge>
              <span className="text-muted-foreground">Indicators are normalised, weighted and combined into a composite district-level risk score, then grouped into categories (Low, Medium, High, Very High)</span>
            </li>
            <li className="flex items-start gap-3">
              <Badge variant="outline" className="shrink-0 mt-0.5">Geographic Scale</Badge>
              <span className="text-muted-foreground">District-level analysis for all 735 districts in India, with potential to extend to block/ULB level in future phases</span>
            </li>
          </ul>
          <p className="text-sm text-muted-foreground mt-4 border-l-4 border-muted pl-4">
            Detailed indicator lists, weights and data sources will be refined and documented with WASH and climate experts as this prototype evolves.
          </p>
        </section>

        <section className="mb-10 sm:mb-16">
          <h2 className="text-xl sm:text-2xl font-bold mb-6">Who Can Use This Dashboard?</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <Building2 className="h-8 w-8 text-blue-500 mb-2" />
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
                <Globe className="h-8 w-8 text-green-500 mb-2" />
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
                <Users className="h-8 w-8 text-orange-500 mb-2" />
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
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm shrink-0">1</span>
              Select a state and district from the map or list
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm shrink-0">2</span>
              View the district's WASH climate risk category (Low-Very High)
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm shrink-0">3</span>
              Check key drivers of risk and the broad technology suitability considerations
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm shrink-0">4</span>
              Use these insights to inform planning, discussions with states and partners, and the design of climate-resilient WASH interventions
            </li>
          </ol>
        </section>

        <section className="mb-10 sm:mb-16 text-center">
          <Link href="/dashboard">
            <Button size="lg" className="gap-2" data-testid="button-explore-map">
              <MapPin className="h-5 w-5" />
              Explore the District Risk Map
              <ChevronRight className="h-5 w-5" />
            </Button>
          </Link>
        </section>

        <section className="mb-6 sm:mb-10">
          <h2 className="text-xl sm:text-2xl font-bold mb-4">Disclaimer & MVP Status</h2>
          <div className="bg-muted/50 border-l-4 border-muted-foreground/30 p-4 rounded-r-lg">
            <p className="text-sm text-muted-foreground">
              This dashboard is an internal prototype (MVP) developed for discussion and learning. 
              It does not represent an official public-facing UNICEF product at this stage. 
              Indicators, weights, scores and visualisations are subject to refinement and technical review. 
              Please do not share externally without prior approval.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
