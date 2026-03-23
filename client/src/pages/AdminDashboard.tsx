import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Save, RefreshCw, Database, CloudRain, Droplets, ArrowLeft, Search, CheckCircle, Edit3 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchDistricts, deleteDistrict, fetchIntegrations, updateIntegration } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DistrictData } from "@/lib/types";

const ALL_HAZARDS = ['Drought', 'Flood', 'Heatwave', 'Cyclone', 'Cold Wave', 'Dust Storm', 'Groundwater Depletion'] as const;

const HAZARD_ICONS: Record<string, string> = {
  'Drought': '☀️',
  'Flood': '🌊',
  'Heatwave': '🌡️',
  'Cyclone': '🌀',
  'Cold Wave': '❄️',
  'Dust Storm': '🌪️',
  'Groundwater Depletion': '💧',
};

const HAZARD_COLORS: Record<string, string> = {
  'Drought': 'bg-orange-500',
  'Flood': 'bg-blue-500',
  'Heatwave': 'bg-red-500',
  'Cyclone': 'bg-purple-500',
  'Cold Wave': 'bg-cyan-500',
  'Dust Storm': 'bg-yellow-500',
  'Groundwater Depletion': 'bg-teal-500',
};

async function patchDistrict(id: string, data: Partial<DistrictData>) {
  const res = await fetch(`/api/districts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save');
  return res.json();
}

function DistrictEditor({ district, onClose }: { district: DistrictData; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [intensities, setIntensities] = useState<Record<string, number>>(
    () => {
      const base = district.hazardIntensities || {};
      const result: Record<string, number> = {};
      ALL_HAZARDS.forEach(h => {
        result[h] = typeof base[h] === 'number' ? Math.round(base[h] * 100) : 0;
      });
      return result;
    }
  );

  const [risks, setRisks] = useState<string[]>(district.climateRisks || []);
  const [vulnScore, setVulnScore] = useState(
    Math.round(district.vulnerabilityScore * 100)
  );

  const saveMutation = useMutation({
    mutationFn: () => {
      const normalizedIntensities: Record<string, number> = {};
      Object.entries(intensities).forEach(([k, v]) => {
        normalizedIntensities[k] = v / 100;
      });
      return patchDistrict(district.id, {
        hazardIntensities: normalizedIntensities,
        climateRisks: risks,
        vulnerabilityScore: vulnScore / 100,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['districts'] });
      toast({ title: "Saved", description: `${district.name} data updated successfully.` });
      onClose();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" });
    }
  });

  const toggleRisk = (h: string) => {
    setRisks(prev => prev.includes(h) ? prev.filter(r => r !== h) : [...prev, h]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{district.name}</h3>
          <p className="text-xs text-muted-foreground">{district.stateId} · ID: {district.id}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Overall Vulnerability Score */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Overall Vulnerability Score</Label>
          <span className="text-xl font-bold font-mono text-foreground">{vulnScore}<span className="text-sm font-normal text-muted-foreground">/100</span></span>
        </div>
        <Slider
          value={[vulnScore]}
          onValueChange={([v]) => setVulnScore(v)}
          min={0} max={100} step={1}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Low Risk</span><span>Very High Risk</span>
        </div>
      </div>

      <Separator />

      {/* Climate Risk Presence */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Active Climate Risks</Label>
        <p className="text-xs text-muted-foreground">Check hazards that affect this district</p>
        <div className="grid grid-cols-2 gap-2">
          {ALL_HAZARDS.map(h => (
            <label key={h} className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${risks.includes(h) ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-secondary/50'}`}>
              <Checkbox
                checked={risks.includes(h)}
                onCheckedChange={() => toggleRisk(h)}
              />
              <span className="text-sm">{HAZARD_ICONS[h]} {h}</span>
            </label>
          ))}
        </div>
      </div>

      <Separator />

      {/* Per-Hazard Intensities */}
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-semibold">Hazard Intensity Values</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Set 0–100 intensity for each hazard type. These power the district map color depth.</p>
        </div>
        <div className="space-y-5">
          {ALL_HAZARDS.map(h => (
            <div key={h} className={`space-y-2 p-3 rounded-lg border ${risks.includes(h) ? 'border-border' : 'border-dashed border-border/50 opacity-60'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${HAZARD_COLORS[h]}`} />
                  <span className="text-sm font-medium">{HAZARD_ICONS[h]} {h}</span>
                  {!risks.includes(h) && <span className="text-[10px] text-muted-foreground">(not active)</span>}
                </div>
                <span className="text-sm font-bold font-mono w-10 text-right">{intensities[h]}</span>
              </div>
              <Slider
                value={[intensities[h]]}
                onValueChange={([v]) => setIntensities(prev => ({ ...prev, [h]: v }))}
                min={0} max={100} step={1}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>None</span><span>Low</span><span>Moderate</span><span>High</span><span>Extreme</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingDistrict, setEditingDistrict] = useState<DistrictData | null>(null);

  const { data: districts = [], isLoading: districtsLoading } = useQuery({
    queryKey: ['districts'],
    queryFn: fetchDistricts
  });

  const { data: integrations = [] } = useQuery({
    queryKey: ['integrations'],
    queryFn: fetchIntegrations
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDistrict,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['districts'] });
      toast({ title: "District Removed", description: "District data has been removed.", variant: "destructive" });
    }
  });

  const updateIntegrationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateIntegration(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['integrations'] }); }
  });

  const handleConnect = (integrationId: string, service: string, connected: boolean) => {
    updateIntegrationMutation.mutate({ id: integrationId, data: { isConnected: connected ? 1 : 0, lastSync: connected ? new Date() : null } });
    if (connected) toast({ title: "Service Connected", description: `Successfully connected ${service} API.` });
  };

  const imdIntegration = integrations.find((i: any) => i.type === 'imd');
  const groundwaterIntegration = integrations.find((i: any) => i.type === 'groundwater');

  const filteredDistricts = useMemo(() => {
    if (!search) return districts as DistrictData[];
    const q = search.toLowerCase();
    return (districts as DistrictData[]).filter(d =>
      d.name.toLowerCase().includes(q) || (d.stateId || '').toLowerCase().includes(q)
    );
  }, [districts, search]);

  return (
    <div className="min-h-screen bg-background p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
            </Link>
            <h1 className="text-3xl font-mono font-bold tracking-tight">Admin Console</h1>
          </div>
          <p className="text-muted-foreground ml-14">Manage data sources, hazard intensities, and API integrations.</p>
        </div>
        <ThemeToggle />
      </div>

      <Tabs defaultValue="data" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent space-x-6">
          <TabsTrigger value="data" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">
            District Data Editor
          </TabsTrigger>
          <TabsTrigger value="integrations" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">
            API Integrations
          </TabsTrigger>
          <TabsTrigger value="settings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">
            System Settings
          </TabsTrigger>
        </TabsList>

        {/* District Data Editor Tab */}
        <TabsContent value="data" className="pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Left: District List */}
            <Card className="h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">District Registry</CardTitle>
                <CardDescription>{(districts as any[]).length} districts · click to edit</CardDescription>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search districts..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {districtsLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="max-h-[600px] overflow-y-auto divide-y divide-border">
                    {filteredDistricts.slice(0, 200).map(d => {
                      const hasIntensities = d.hazardIntensities && Object.values(d.hazardIntensities).some(v => v > 0);
                      const isEditing = editingDistrict?.id === d.id;
                      return (
                        <div
                          key={d.id}
                          className={`flex items-center justify-between px-4 py-2.5 hover:bg-secondary/40 cursor-pointer transition-colors ${isEditing ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
                          onClick={() => setEditingDistrict(isEditing ? null : d)}
                          data-testid={`district-row-${d.id}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{d.name}</div>
                              <div className="text-[11px] text-muted-foreground">{d.stateId} · Vuln: {Math.round(d.vulnerabilityScore * 100)}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {hasIntensities && (
                              <span title="Has intensity data" className="text-[10px] text-emerald-500 font-semibold">✓ Data</span>
                            )}
                            <div className="flex gap-0.5">
                              {(d.climateRisks || []).slice(0, 3).map(r => (
                                <div key={r} className={`w-1.5 h-4 rounded-sm ${HAZARD_COLORS[r] || 'bg-gray-400'}`} title={r} />
                              ))}
                            </div>
                            <Edit3 className={`h-3.5 w-3.5 ${isEditing ? 'text-primary' : 'text-muted-foreground'}`} />
                          </div>
                        </div>
                      );
                    })}
                    {filteredDistricts.length > 200 && (
                      <div className="px-4 py-2 text-xs text-muted-foreground text-center">
                        Showing 200 of {filteredDistricts.length} — refine your search
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right: Editor Panel */}
            <div>
              {editingDistrict ? (
                <Card>
                  <CardContent className="pt-6">
                    <DistrictEditor
                      key={editingDistrict.id}
                      district={editingDistrict}
                      onClose={() => setEditingDistrict(null)}
                    />
                  </CardContent>
                </Card>
              ) : (
                <Card className="h-full border-dashed">
                  <CardContent className="flex flex-col items-center justify-center h-full py-20 text-center">
                    <Edit3 className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <h3 className="text-base font-semibold text-muted-foreground">Select a District</h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                      Click any district in the list to edit its hazard intensities, climate risks, and vulnerability score.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* API Integrations Tab */}
        <TabsContent value="integrations" className="pt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className={imdIntegration?.isConnected ? "border-primary" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CloudRain className="h-8 w-8 text-blue-400 mb-2" />
                  <Switch checked={!!imdIntegration?.isConnected} onCheckedChange={(c) => handleConnect("imd-weather", "IMD Weather", c)} />
                </div>
                <CardTitle>IMD Weather API</CardTitle>
                <CardDescription>Real-time weather forecast and historical climate data.</CardDescription>
              </CardHeader>
              <CardContent>
                {imdIntegration?.isConnected ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge className="bg-emerald-500 hover:bg-emerald-600">Connected</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Last Sync</span>
                      <span className="font-mono">Just now</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-secondary/30 p-3 rounded text-sm text-muted-foreground">
                    Connect to fetch live rainfall, temperature, and humidity data from IMD.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className={groundwaterIntegration?.isConnected ? "border-primary" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <Droplets className="h-8 w-8 text-cyan-400 mb-2" />
                  <Switch checked={!!groundwaterIntegration?.isConnected} onCheckedChange={(c) => handleConnect("cgwb-groundwater", "CGWB Groundwater", c)} />
                </div>
                <CardTitle>CGWB Groundwater</CardTitle>
                <CardDescription>Central Ground Water Board aquifer monitoring data.</CardDescription>
              </CardHeader>
              <CardContent>
                {groundwaterIntegration?.isConnected ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge className="bg-emerald-500 hover:bg-emerald-600">Connected</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Last Sync</span>
                      <span className="font-mono">2 hours ago</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-secondary/30 p-3 rounded text-sm text-muted-foreground">
                    Access piezometer readings and water quality reports from CGWB.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <Database className="h-8 w-8 text-purple-400 mb-2" />
                  <Button variant="outline" size="sm">Configure</Button>
                </div>
                <CardTitle>Custom Endpoint</CardTitle>
                <CardDescription>Connect your own REST or GraphQL endpoint.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline">Not Configured</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Add a custom data source for localized sensor networks or NGO surveys.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="pt-6">
          <Card>
            <CardHeader>
              <CardTitle>System Configuration</CardTitle>
              <CardDescription>Global settings for the dashboard.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-refresh Data</Label>
                  <p className="text-sm text-muted-foreground">Automatically fetch new data every 15 minutes</p>
                </div>
                <Switch />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Public Access</Label>
                  <p className="text-sm text-muted-foreground">Allow public viewing of the dashboard without login</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Maintenance Mode</Label>
                  <p className="text-sm text-muted-foreground">Show maintenance page to visitors</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
