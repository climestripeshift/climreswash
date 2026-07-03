import { ChevronRight, MapPin, Globe, Building2, Landmark, Home, ArrowLeft, FlaskConical, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GeographicLevel, CountryData, StateData, DistrictData, BlockData } from "@/lib/types";
import { Link } from "wouter";
import { SHOW_FUTURE_2050 } from "@/lib/featureFlags";

interface GeographicBreadcrumb {
  level: GeographicLevel;
  id: string;
  name: string;
}

interface GeographicNavigationProps {
  currentLevel: GeographicLevel;
  breadcrumbs: GeographicBreadcrumb[];
  onNavigate: (level: GeographicLevel, id?: string) => void;
  stats?: {
    activeAlerts?: number;
    criticalAreas?: number;
    totalPopulation?: number;
  };
}

const levelIcons: Record<GeographicLevel, React.ReactNode> = {
  country: <Globe className="h-4 w-4" />,
  state: <Landmark className="h-4 w-4" />,
  district: <Building2 className="h-4 w-4" />,
  block: <Home className="h-4 w-4" />
};

const levelLabels: Record<GeographicLevel, string> = {
  country: "Country",
  state: "State",
  district: "District",
  block: "Block"
};

export function GeographicNavigation({
  currentLevel,
  breadcrumbs,
  onNavigate,
  stats
}: GeographicNavigationProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-2 sm:px-4 py-2 bg-card/50 backdrop-blur-sm border-b border-border/50 gap-2 sm:gap-0">
      <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto scrollbar-hide">
        <Link href="/">
          <Button variant="ghost" size="sm" className="h-6 sm:h-7 px-1.5 sm:px-2 gap-1 mr-1" data-testid="link-home">
            <ArrowLeft className="h-3 sm:h-4 w-3 sm:w-4" />
            <span className="text-[10px] sm:text-xs hidden sm:inline">Home</span>
          </Button>
        </Link>
        <div className="w-px h-4 bg-border/50 mx-1 hidden sm:block" />
        <MapPin className="h-4 w-4 text-muted-foreground mr-1 sm:mr-2 shrink-0" />
        
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.level} className="flex items-center shrink-0">
            {index > 0 && (
              <ChevronRight className="h-3 sm:h-4 w-3 sm:w-4 text-muted-foreground mx-0.5 sm:mx-1" />
            )}
            <Button
              variant={index === breadcrumbs.length - 1 ? "secondary" : "ghost"}
              size="sm"
              className="h-6 sm:h-7 px-1.5 sm:px-2 gap-1 sm:gap-1.5"
              onClick={() => onNavigate(crumb.level, crumb.id)}
              data-testid={`nav-${crumb.level}-${crumb.id}`}
            >
              {levelIcons[crumb.level]}
              <span className="text-[10px] sm:text-xs font-medium">{crumb.name}</span>
            </Button>
          </div>
        ))}
      </div>

      <div className="hidden sm:flex items-center gap-2 sm:gap-3 shrink-0">
        {stats?.activeAlerts !== undefined && stats.activeAlerts > 0 && (
          <Badge variant="destructive" className="gap-1 text-xs" data-testid="stat-alerts">
            <span className="animate-pulse">●</span>
            <span className="hidden md:inline">{stats.activeAlerts} Active</span>
            <span className="md:hidden">{stats.activeAlerts}</span>
          </Badge>
        )}
        {stats?.criticalAreas !== undefined && stats.criticalAreas > 0 && (
          <Badge variant="outline" className="text-orange-500 border-orange-500 text-xs hidden md:flex" data-testid="stat-critical">
            {stats.criticalAreas} Critical
          </Badge>
        )}
        <div className="text-[10px] sm:text-xs text-muted-foreground hidden lg:block" data-testid="stat-level">
          <span className="font-medium text-foreground">{levelLabels[currentLevel]}</span>
        </div>
        <div className="w-px h-4 bg-border/50 mx-1" />
        <Link href="/technology">
          <Button variant="outline" size="sm" className="h-7 px-2 gap-1.5 text-xs" data-testid="link-technology-nav">
            <FlaskConical className="h-3.5 w-3.5 text-[#00AEEF]" />
            <span>Technologies</span>
          </Button>
        </Link>
        {SHOW_FUTURE_2050 && (
          <Link href="/stress-test">
            <Button variant="outline" size="sm" className="h-7 px-2 gap-1.5 text-xs" data-testid="link-stress-test-nav">
              <TrendingUp className="h-3.5 w-3.5 text-orange-400" />
              <span>2050 Projections</span>
            </Button>
          </Link>
        )}
        <Link href="/live-data">
          <Button size="sm" className="h-7 px-2 gap-1.5 text-xs text-white" style={{ background: "#00AEEF" }} data-testid="link-live-data-nav">
            <span>⚡ Live Data</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}

interface GeographicSelectorProps {
  level: GeographicLevel;
  items: Array<{ id: string; name: string; vulnerabilityScore?: number; activeAlerts?: number }>;
  onSelect: (id: string) => void;
  selectedId?: string;
}

export function GeographicSelector({
  level,
  items,
  onSelect,
  selectedId
}: GeographicSelectorProps) {
  if (items.length === 0) return null;

  return (
    <div className="p-3 bg-card/80 backdrop-blur-sm rounded-lg border border-border/50 shadow-lg">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50">
        {levelIcons[level]}
        <span className="text-sm font-medium">Select {levelLabels[level]}</span>
        <Badge variant="secondary" className="ml-auto text-xs">
          {items.length} available
        </Badge>
      </div>
      <div className="max-h-64 overflow-y-auto space-y-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`w-full flex items-center justify-between p-2 rounded-md text-sm transition-colors ${
              selectedId === item.id
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent"
            }`}
            data-testid={`select-${level}-${item.id}`}
          >
            <span className="font-medium truncate">{item.name}</span>
            <div className="flex items-center gap-2">
              {item.activeAlerts !== undefined && item.activeAlerts > 0 && (
                <Badge variant="destructive" className="text-xs px-1.5 py-0">
                  {item.activeAlerts}
                </Badge>
              )}
              {item.vulnerabilityScore !== undefined && (
                <Badge
                  variant="outline"
                  className={`text-xs px-1.5 py-0 ${
                    item.vulnerabilityScore >= 70
                      ? "text-red-500 border-red-500"
                      : item.vulnerabilityScore >= 50
                      ? "text-yellow-500 border-yellow-500"
                      : "text-green-500 border-green-500"
                  }`}
                >
                  {item.vulnerabilityScore}%
                </Badge>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
