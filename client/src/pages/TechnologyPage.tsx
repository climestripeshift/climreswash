import { useState } from "react";
import { useRoute, Link } from "wouter";
import { getTechnologyBySlug, getAllTechnologies, ALL_HAZARDS, ALL_TYPOLOGIES, TechnologyInfo } from "@/lib/technologyContent";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Input } from "@/components/ui/input";
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
  Leaf,
  Search,
  X,
  Filter,
  Sprout
} from "lucide-react";

const HAZARD_ICONS: Record<string, string> = {
  'Drought': '☀️',
  'Flood': '🌊',
  'Heatwave': '🌡️',
  'Cyclone': '🌀',
  'Cold Wave': '❄️',
  'Dust Storm': '🌪️',
  'Groundwater Depletion': '💧',
};

const TYPOLOGY_ICONS: Record<string, string> = {
  'Desert / Arid': '🏜️',
  'Rain Intensive': '🌧️',
  'Flood Prone': '🌊',
  'Rocky / Hilly': '⛰️',
  'Plains / Alluvial': '🌾',
  'Coastal': '🏖️',
};

export default function TechnologyPage() {
  const [match, params] = useRoute("/technology/:slug");

  if (!match || !params?.slug) {
    return <TechnologyIndex />;
  }

  const tech = getTechnologyBySlug(params.slug);

  if (!tech) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader />
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

  return <TechnologyDetail tech={tech} />;
}

function PageHeader({ showTechLink = false }: { showTechLink?: boolean }) {
  return (
    <header className="sticky top-0 z-10 bg-[#00AEEF] text-white shadow-md">
      <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
        <Link href="/" className="font-bold text-lg flex items-center gap-2" data-testid="link-home">
          <span>💧</span> ClimateAdapt India
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-white/80 hover:text-white font-medium" data-testid="link-dashboard">Map Dashboard</Link>
          {showTechLink && (
            <Link href="/technology" className="text-sm text-white/80 hover:text-white font-medium" data-testid="link-technologies">Technologies</Link>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

function TechnologyDetail({ tech }: { tech: TechnologyInfo }) {
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'sanitation': return <Bath className="h-5 w-5" />;
      case 'water': return <Droplets className="h-5 w-5" />;
      case 'waste': return <Trash2 className="h-5 w-5" />;
      case 'adaptation': return <Sprout className="h-5 w-5" />;
      default: return <Leaf className="h-5 w-5" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'sanitation': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'water': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'waste': return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
      case 'adaptation': return 'bg-green-500/10 text-green-600 border-green-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Low': return 'bg-green-500/10 text-green-600';
      case 'Medium': return 'bg-yellow-500/10 text-yellow-600';
      case 'High': return 'bg-red-500/10 text-red-600';
      default: return 'bg-gray-500/10 text-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid={`page-technology-${tech.slug}`}>
      <PageHeader showTechLink />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <Link href="/technology" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6" data-testid="link-back">
          <ArrowLeft className="h-4 w-4" />
          Back to Technologies
        </Link>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <Badge variant="outline" className={getCategoryColor(tech.category)}>
                    {getCategoryIcon(tech.category)}
                    <span className="ml-1 capitalize">{tech.category}</span>
                  </Badge>
                  <CardTitle className="text-2xl mt-3" data-testid="text-technology-title">{tech.title}</CardTitle>
                </div>
                <div className="flex gap-2 flex-wrap">
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

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CloudRain className="h-5 w-5 text-blue-500" />
                  Climate Hazards Addressed
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {tech.relatedHazards.map((hazard, i) => (
                    <Badge key={i} variant="secondary" className="bg-orange-500/10 text-orange-600 border border-orange-500/20" data-testid={`badge-hazard-${i}`}>
                      <span className="mr-1">{HAZARD_ICONS[hazard] || '⚠️'}</span>
                      {hazard}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground" data-testid="text-climate-resilience">{tech.climateResilience}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Leaf className="h-5 w-5 text-green-500" />
                  Suitable Landscape Typology
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {tech.typology.map((t, i) => (
                    <Badge key={i} variant="secondary" className="bg-green-500/10 text-green-700 border border-green-500/20" data-testid={`badge-typology-${i}`}>
                      <span className="mr-1">{TYPOLOGY_ICONS[t] || '🌍'}</span>
                      {t}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-600">
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
                <CardTitle className="flex items-center gap-2 text-amber-600">
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
  const allTech = getAllTechnologies();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHazards, setSelectedHazards] = useState<string[]>([]);
  const [selectedTypologies, setSelectedTypologies] = useState<string[]>([]);

  const toggleHazard = (h: string) => {
    setSelectedHazards(prev => prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h]);
  };

  const toggleTypology = (t: string) => {
    setSelectedTypologies(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const clearFilters = () => {
    setSelectedHazards([]);
    setSelectedTypologies([]);
    setSearchQuery('');
  };

  const filtered = allTech.filter(tech => {
    const matchesSearch = !searchQuery ||
      tech.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tech.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesHazard = selectedHazards.length === 0 ||
      selectedHazards.some(h => tech.relatedHazards.includes(h));

    const matchesTypology = selectedTypologies.length === 0 ||
      selectedTypologies.some(t => tech.typology.includes(t));

    return matchesSearch && matchesHazard && matchesTypology;
  });

  const activeFilterCount = selectedHazards.length + selectedTypologies.length + (searchQuery ? 1 : 0);

  const categoryOrder = ['sanitation', 'water', 'waste', 'adaptation'] as const;
  const categoryLabels = {
    sanitation: { label: 'Sanitation Technologies', icon: <Bath className="h-5 w-5 text-emerald-500" /> },
    water: { label: 'Water Technologies', icon: <Droplets className="h-5 w-5 text-blue-500" /> },
    waste: { label: 'Waste Management', icon: <Trash2 className="h-5 w-5 text-orange-500" /> },
    adaptation: { label: 'Climate Adaptation', icon: <Sprout className="h-5 w-5 text-green-500" /> },
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-technology-index">
      <PageHeader />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4" data-testid="link-back-home">
            <ArrowLeft className="h-4 w-4" />
            Back to Map Dashboard
          </Link>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Climate-Resilient WASH Technologies</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Explore sanitation, water, and adaptation technologies suited to different climate hazards and landscape typologies across India's 735 districts.
          </p>
        </div>

        {/* Filter Panel */}
        <div className="bg-card border border-border rounded-xl p-5 mb-8 space-y-5 shadow-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Filter className="h-4 w-4 text-[#00AEEF]" />
              Filters
            </div>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs gap-1 text-muted-foreground" data-testid="button-clear-filters">
                <X className="h-3 w-3" /> Clear all ({activeFilterCount})
              </Button>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search technologies..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-tech"
            />
          </div>

          {/* Hazard Filter */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
              By Climate Hazard
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_HAZARDS.map(h => (
                <button
                  key={h}
                  onClick={() => toggleHazard(h)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    selectedHazards.includes(h)
                      ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                      : 'bg-background text-foreground border-border hover:border-orange-400 hover:text-orange-600'
                  }`}
                  data-testid={`filter-hazard-${h.toLowerCase().replace(/ /g, '-')}`}
                >
                  <span>{HAZARD_ICONS[h]}</span> {h}
                </button>
              ))}
            </div>
          </div>

          {/* Typology Filter */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
              By Landscape Typology
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_TYPOLOGIES.map(t => (
                <button
                  key={t}
                  onClick={() => toggleTypology(t)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    selectedTypologies.includes(t)
                      ? 'bg-[#00AEEF] text-white border-[#00AEEF] shadow-sm'
                      : 'bg-background text-foreground border-border hover:border-[#00AEEF] hover:text-[#00AEEF]'
                  }`}
                  data-testid={`filter-typology-${t.toLowerCase().replace(/[ /]/g, '-')}`}
                >
                  <span>{TYPOLOGY_ICONS[t]}</span> {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {allTech.length} technologies
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No technologies match your filters</h3>
            <p className="text-muted-foreground mb-4">Try removing some filters or adjusting your search.</p>
            <Button variant="outline" onClick={clearFilters} data-testid="button-clear-no-results">Clear Filters</Button>
          </div>
        ) : (
          <div className="space-y-10">
            {categoryOrder.map(cat => {
              const catTechs = filtered.filter(t => t.category === cat);
              if (catTechs.length === 0) return null;
              const { label, icon } = categoryLabels[cat];
              return (
                <section key={cat}>
                  <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                    {icon} {label}
                    <span className="text-sm font-normal text-muted-foreground ml-1">({catTechs.length})</span>
                  </h2>
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {catTechs.map(tech => (
                      <TechnologyCard key={tech.slug} tech={tech} selectedHazards={selectedHazards} selectedTypologies={selectedTypologies} />
                    ))}
                  </div>
                  <Separator className="mt-10" />
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function TechnologyCard({ tech, selectedHazards, selectedTypologies }: {
  tech: TechnologyInfo;
  selectedHazards: string[];
  selectedTypologies: string[];
}) {
  const getLevelDot = (level: string) => {
    switch (level) {
      case 'Low': return 'bg-green-500';
      case 'Medium': return 'bg-yellow-500';
      case 'High': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  return (
    <Link href={`/technology/${tech.slug}`} data-testid={`link-technology-${tech.slug}`}>
      <Card className="h-full hover:shadow-lg transition-all cursor-pointer hover:border-[#00AEEF]/50 group">
        <CardHeader className="pb-3">
          <CardTitle className="text-base group-hover:text-[#00AEEF] transition-colors">{tech.title}</CardTitle>
          <CardDescription className="line-clamp-2 text-xs">{tech.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Hazard badges - highlight matching ones */}
          <div className="flex flex-wrap gap-1">
            {tech.relatedHazards.map((h, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  selectedHazards.includes(h)
                    ? 'bg-orange-500 text-white'
                    : 'bg-orange-500/10 text-orange-600'
                }`}
              >
                {HAZARD_ICONS[h]} {h}
              </span>
            ))}
          </div>
          {/* Typology badges */}
          <div className="flex flex-wrap gap-1">
            {tech.typology.map((t, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  selectedTypologies.includes(t)
                    ? 'bg-[#00AEEF] text-white'
                    : 'bg-[#00AEEF]/10 text-[#00AEEF]'
                }`}
              >
                {TYPOLOGY_ICONS[t]} {t}
              </span>
            ))}
          </div>
          {/* Cost & Maintenance */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t border-border">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${getLevelDot(tech.maintenanceLevel)}`}></span>
              {tech.maintenanceLevel} Maint.
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${getLevelDot(tech.costLevel)}`}></span>
              {tech.costLevel} Cost
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
