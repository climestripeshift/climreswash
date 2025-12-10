import { useRoute, Link } from "wouter";
import { getTechnologyBySlug, getTechnologiesByCategory } from "@/lib/technologyContent";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ThemeToggle";
import { 
  ArrowLeft, 
  CheckCircle, 
  AlertTriangle, 
  Droplets, 
  Trash2, 
  Bath,
  Wrench,
  DollarSign,
  CloudRain,
  Leaf
} from "lucide-react";

export default function TechnologyPage() {
  const [match, params] = useRoute("/technology/:slug");
  
  if (!match || !params?.slug) {
    return <TechnologyIndex />;
  }

  const tech = getTechnologyBySlug(params.slug);
  
  if (!tech) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 bg-slate-900 text-white">
          <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
            <Link href="/" className="font-bold text-lg" data-testid="link-home">ClimateAdapt India</Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Technology Not Found</h2>
              <p className="text-muted-foreground mb-4">The technology you're looking for doesn't exist.</p>
              <Link href="/technology">
                <Button data-testid="button-back-to-technologies">View All Technologies</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'sanitation': return <Bath className="h-5 w-5" />;
      case 'water': return <Droplets className="h-5 w-5" />;
      case 'waste': return <Trash2 className="h-5 w-5" />;
      default: return <Leaf className="h-5 w-5" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'sanitation': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'water': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'waste': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Low': return 'bg-green-500/10 text-green-500';
      case 'Medium': return 'bg-yellow-500/10 text-yellow-500';
      case 'High': return 'bg-red-500/10 text-red-500';
      default: return 'bg-gray-500/10 text-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid={`page-technology-${tech.slug}`}>
      <header className="sticky top-0 z-10 bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="font-bold text-lg" data-testid="link-home">ClimateAdapt India</Link>
          <nav className="flex items-center gap-4">
            <Link href="/technology" className="text-sm text-slate-300 hover:text-white" data-testid="link-technologies">Technologies</Link>
            <Link href="/" className="text-sm text-slate-300 hover:text-white" data-testid="link-dashboard">Dashboard</Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <Link href="/technology" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6" data-testid="link-back">
          <ArrowLeft className="h-4 w-4" />
          Back to Technologies
        </Link>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <Badge variant="outline" className={getCategoryColor(tech.category)}>
                    {getCategoryIcon(tech.category)}
                    <span className="ml-1 capitalize">{tech.category}</span>
                  </Badge>
                  <CardTitle className="text-2xl mt-3" data-testid="text-technology-title">{tech.title}</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Badge className={getLevelColor(tech.maintenanceLevel)}>
                    <Wrench className="h-3 w-3 mr-1" />
                    {tech.maintenanceLevel} Maintenance
                  </Badge>
                  <Badge className={getLevelColor(tech.costLevel)}>
                    <DollarSign className="h-3 w-3 mr-1" />
                    {tech.costLevel} Cost
                  </Badge>
                </div>
              </div>
              <CardDescription className="text-base mt-2" data-testid="text-technology-description">
                {tech.description}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CloudRain className="h-5 w-5 text-blue-500" />
                Climate Resilience
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground" data-testid="text-climate-resilience">{tech.climateResilience}</p>
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Related Climate Hazards</h4>
                <div className="flex flex-wrap gap-2">
                  {tech.relatedHazards.map((hazard, i) => (
                    <Badge key={i} variant="secondary" className="bg-orange-500/10 text-orange-500" data-testid={`badge-hazard-${i}`}>
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {hazard}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-500">
                  <CheckCircle className="h-5 w-5" />
                  Advantages
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {tech.advantages.map((adv, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" data-testid={`text-advantage-${i}`}>
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      {adv}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-500">
                  <AlertTriangle className="h-5 w-5" />
                  Limitations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {tech.limitations.map((lim, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" data-testid={`text-limitation-${i}`}>
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      {lim}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Suitable Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-3">
                {tech.suitableConditions.map((condition, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-secondary/50 p-3 rounded-lg" data-testid={`text-condition-${i}`}>
                    <Leaf className="h-4 w-4 text-green-500 shrink-0" />
                    {condition}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function TechnologyIndex() {
  const sanitationTech = getTechnologiesByCategory('sanitation');
  const waterTech = getTechnologiesByCategory('water');
  const wasteTech = getTechnologiesByCategory('waste');

  return (
    <div className="min-h-screen bg-background" data-testid="page-technology-index">
      <header className="sticky top-0 z-10 bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="font-bold text-lg" data-testid="link-home">ClimateAdapt India</Link>
          <nav className="flex items-center gap-4">
            <Link href="/" className="text-sm text-slate-300 hover:text-white" data-testid="link-dashboard">Dashboard</Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4" data-testid="link-back-home">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Climate-Resilient WASH Technologies</h1>
          <p className="text-muted-foreground mt-2">
            Explore technologies suited to different climate conditions and infrastructure needs.
          </p>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
              <Bath className="h-5 w-5 text-emerald-500" />
              Sanitation Technologies
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {sanitationTech.map(tech => (
                <TechnologyCard key={tech.slug} tech={tech} />
              ))}
            </div>
          </section>

          <Separator />

          <section>
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
              <Droplets className="h-5 w-5 text-blue-500" />
              Water Technologies
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {waterTech.map(tech => (
                <TechnologyCard key={tech.slug} tech={tech} />
              ))}
            </div>
          </section>

          <Separator />

          <section>
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
              <Trash2 className="h-5 w-5 text-orange-500" />
              Waste Management Technologies
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {wasteTech.map(tech => (
                <TechnologyCard key={tech.slug} tech={tech} />
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function TechnologyCard({ tech }: { tech: { slug: string; title: string; description: string; maintenanceLevel: string; costLevel: string } }) {
  return (
    <Link href={`/technology/${tech.slug}`} data-testid={`link-technology-${tech.slug}`}>
      <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer hover:border-primary/50">
        <CardHeader>
          <CardTitle className="text-lg">{tech.title}</CardTitle>
          <CardDescription className="line-clamp-2">{tech.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs">
              <Wrench className="h-3 w-3 mr-1" />
              {tech.maintenanceLevel} Maint.
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <DollarSign className="h-3 w-3 mr-1" />
              {tech.costLevel} Cost
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
