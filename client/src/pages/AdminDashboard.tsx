import { useState, useMemo, useEffect } from "react";
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
import { Plus, Trash2, Save, RefreshCw, Database, CloudRain, Droplets, ArrowLeft, Search, CheckCircle, Edit3, X, BookOpen, LogOut, Upload, AlertCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useLocation } from "wouter";
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

const ALL_TYPOLOGIES_LIST = ['Desert / Arid', 'Rain Intensive', 'Flood Prone', 'Rocky / Hilly', 'Plains / Alluvial', 'Coastal'];
const ALL_HAZARDS_LIST = ['Drought', 'Flood', 'Heatwave', 'Cyclone', 'Cold Wave', 'Dust Storm', 'Groundwater Depletion'];

const CATEGORY_COLORS: Record<string, string> = {
  sanitation: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  water: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  waste: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  adaptation: 'bg-green-500/10 text-green-600 border-green-500/20',
};

async function fetchTechnologies() {
  const res = await fetch('/api/technologies');
  return res.json();
}

async function saveTechnology(id: string | null, data: any) {
  const url = id ? `/api/technologies/${id}` : '/api/technologies';
  const method = id ? 'PATCH' : 'POST';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Save failed');
  return res.json();
}

async function deleteTech(id: string) {
  const res = await fetch(`/api/technologies/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error('Delete failed');
}

function ArrayInput({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const [raw, setRaw] = useState(value.join('\n'));
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Textarea
        value={raw}
        onChange={e => { setRaw(e.target.value); onChange(e.target.value.split('\n').map(s => s.trim()).filter(Boolean)); }}
        rows={3}
        className="text-xs font-mono resize-none"
        placeholder={`One per line`}
      />
    </div>
  );
}

function TechEditor({ tech, onClose }: { tech: any | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isNew = !tech?.id;

  const [form, setForm] = useState(() => ({
    id: tech?.id || tech?.slug || '',
    slug: tech?.slug || '',
    title: tech?.title || '',
    category: tech?.category || 'sanitation',
    description: tech?.description || '',
    climateResilience: tech?.climateResilience || '',
    suitableConditions: tech?.suitableConditions || [],
    advantages: tech?.advantages || [],
    limitations: tech?.limitations || [],
    maintenanceLevel: tech?.maintenanceLevel || 'Low',
    costLevel: tech?.costLevel || 'Low',
    relatedHazards: tech?.relatedHazards || [],
    typology: tech?.typology || [],
  }));

  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, id: form.slug, slug: form.slug };
      return saveTechnology(isNew ? null : tech.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['technologies'] });
      toast({ title: isNew ? 'Technology Created' : 'Technology Updated', description: `${form.title} saved successfully.` });
      onClose();
    },
    onError: () => toast({ title: 'Error', description: 'Failed to save technology.', variant: 'destructive' }),
  });

  const toggleArr = (key: 'relatedHazards' | 'typology', val: string) => {
    setForm(prev => ({
      ...prev,
      [key]: prev[key].includes(val) ? prev[key].filter((x: string) => x !== val) : [...prev[key], val],
    }));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{isNew ? 'Add New Technology' : `Edit: ${tech.title}`}</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
      <Separator />

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Title</Label>
          <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Technology name" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Slug / ID</Label>
          <Input value={form.slug} onChange={e => { set('slug', e.target.value); set('id', e.target.value); }} placeholder="e.g. twin-pit" className="h-8 text-sm font-mono" disabled={!isNew} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <Select value={form.category} onValueChange={v => set('category', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sanitation">Sanitation</SelectItem>
              <SelectItem value="water">Water</SelectItem>
              <SelectItem value="waste">Waste</SelectItem>
              <SelectItem value="adaptation">Adaptation</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Maintenance Level</Label>
          <Select value={form.maintenanceLevel} onValueChange={v => set('maintenanceLevel', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Low">Low</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="High">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cost Level</Label>
          <Select value={form.costLevel} onValueChange={v => set('costLevel', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Low">Low</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="High">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Description</Label>
        <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} className="text-sm resize-none" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Climate Resilience</Label>
        <Textarea value={form.climateResilience} onChange={e => set('climateResilience', e.target.value)} rows={2} className="text-sm resize-none" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <ArrayInput label="Suitable Conditions (one per line)" value={form.suitableConditions} onChange={v => set('suitableConditions', v)} />
        <ArrayInput label="Advantages (one per line)" value={form.advantages} onChange={v => set('advantages', v)} />
        <ArrayInput label="Limitations (one per line)" value={form.limitations} onChange={v => set('limitations', v)} />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold">Related Hazards</Label>
        <div className="flex flex-wrap gap-2">
          {ALL_HAZARDS_LIST.map(h => (
            <label key={h} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border cursor-pointer transition-all ${form.relatedHazards.includes(h) ? 'bg-orange-500/15 border-orange-500/40 text-orange-600' : 'border-border hover:bg-secondary/50'}`}>
              <Checkbox checked={form.relatedHazards.includes(h)} onCheckedChange={() => toggleArr('relatedHazards', h)} className="h-3 w-3" />
              {h}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold">Landscape Typologies</Label>
        <div className="flex flex-wrap gap-2">
          {ALL_TYPOLOGIES_LIST.map(t => (
            <label key={t} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border cursor-pointer transition-all ${form.typology.includes(t) ? 'bg-green-500/15 border-green-500/40 text-green-600' : 'border-border hover:bg-secondary/50'}`}>
              <Checkbox checked={form.typology.includes(t)} onCheckedChange={() => toggleArr('typology', t)} className="h-3 w-3" />
              {t}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

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
  const [vulnScore, setVulnScore] = useState(Math.round(district.vulnerabilityScore * 100));

  // Household WASH
  const [waterAccess, setWaterAccess] = useState(Math.round(district.waterAccessPercent ?? 0));
  const [toiletCoverage, setToiletCoverage] = useState(Math.round(district.toiletCoveragePercent ?? 0));
  const [handwashing, setHandwashing] = useState(Math.round(district.handwashingFacilityPercent ?? 0));
  // School WASH
  const [schoolToilet, setSchoolToilet] = useState(Math.round(district.schoolToiletPercent ?? 0));
  const [schoolWater, setSchoolWater] = useState(Math.round(district.schoolWaterPercent ?? 0));
  // Anganwadi WASH
  const [awcToilet, setAwcToilet] = useState(Math.round(district.anganwadiToiletPercent ?? 0));
  const [awcWater, setAwcWater] = useState(Math.round(district.anganwadiWaterPercent ?? 0));

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
        waterAccessPercent: waterAccess,
        toiletCoveragePercent: toiletCoverage,
        handwashingFacilityPercent: handwashing,
        schoolToiletPercent: schoolToilet,
        schoolWaterPercent: schoolWater,
        anganwadiToiletPercent: awcToilet,
        anganwadiWaterPercent: awcWater,
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

      <Separator />

      {/* WASH Indicators */}
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-semibold">WASH Coverage Indicators</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Set coverage percentages for household, school, and anganwadi WASH access.</p>
        </div>

        {/* Household */}
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Household</div>
        {[
          { label: "Safe Water Access", value: waterAccess, set: setWaterAccess, color: "#3b82f6" },
          { label: "Toilet Coverage (ODF)", value: toiletCoverage, set: setToiletCoverage, color: "#f97316" },
          { label: "Handwashing Facility", value: handwashing, set: setHandwashing, color: "#22c55e" },
        ].map(({ label, value, set, color }) => (
          <div key={label} className="space-y-2 p-3 rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-sm font-bold font-mono w-12 text-right" style={{ color }}>{value}%</span>
            </div>
            <Slider value={[value]} onValueChange={([v]) => set(v)} min={0} max={100} step={1} />
          </div>
        ))}

        {/* Schools */}
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Schools</div>
        {[
          { label: "School Toilet Coverage", value: schoolToilet, set: setSchoolToilet, color: "#7c3aed" },
          { label: "School Water Access", value: schoolWater, set: setSchoolWater, color: "#0ea5e9" },
        ].map(({ label, value, set, color }) => (
          <div key={label} className="space-y-2 p-3 rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-sm font-bold font-mono w-12 text-right" style={{ color }}>{value}%</span>
            </div>
            <Slider value={[value]} onValueChange={([v]) => set(v)} min={0} max={100} step={1} />
          </div>
        ))}

        {/* Anganwadis */}
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Anganwadis (ICDS Centres)</div>
        {[
          { label: "Anganwadi Toilet Coverage", value: awcToilet, set: setAwcToilet, color: "#ef4444" },
          { label: "Anganwadi Water Access", value: awcWater, set: setAwcWater, color: "#14b8a6" },
        ].map(({ label, value, set, color }) => (
          <div key={label} className="space-y-2 p-3 rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-sm font-bold font-mono w-12 text-right" style={{ color }}>{value}%</span>
            </div>
            <Slider value={[value]} onValueChange={([v]) => set(v)} min={0} max={100} step={1} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TechnologyManagerTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingTech, setEditingTech] = useState<any | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [searchTech, setSearchTech] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const { data: techs = [], isLoading } = useQuery({
    queryKey: ['technologies'],
    queryFn: fetchTechnologies,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTech(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['technologies'] });
      toast({ title: 'Technology Removed', variant: 'destructive' });
    },
  });

  const filtered = (techs as any[]).filter(t => {
    const q = searchTech.toLowerCase();
    const matchQ = !q || t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    const matchCat = categoryFilter === 'all' || t.category === categoryFilter;
    return matchQ && matchCat;
  });

  if (addingNew) {
    return (
      <Card><CardContent className="pt-6">
        <TechEditor tech={null} onClose={() => setAddingNew(false)} />
      </CardContent></Card>
    );
  }

  if (editingTech) {
    return (
      <Card><CardContent className="pt-6">
        <TechEditor tech={editingTech} onClose={() => setEditingTech(null)} />
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search technologies..."
              value={searchTech}
              onChange={e => setSearchTech(e.target.value)}
              className="pl-8 h-8 text-sm w-48"
            />
          </div>
          <div className="flex gap-1.5">
            {['all', 'sanitation', 'water', 'waste', 'adaptation'].map(c => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all capitalize ${categoryFilter === c ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary/50'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={() => setAddingNew(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Technology
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-3 flex items-center justify-center py-12">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.map((t: any) => (
          <Card key={t.id} className="hover:border-primary/50 transition-colors">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm leading-tight">{t.title}</CardTitle>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${CATEGORY_COLORS[t.category] || ''}`}>
                      {t.category}
                    </span>
                    <span className="text-[10px] text-muted-foreground">Cost: {t.costLevel}</span>
                    <span className="text-[10px] text-muted-foreground">Maint: {t.maintenanceLevel}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingTech(t)}>
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
              <div className="flex flex-wrap gap-1">
                {(t.relatedHazards || []).map((h: string) => (
                  <span key={h} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 border border-orange-500/20">{h}</span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {(t.typology || []).map((tp: string) => (
                  <span key={tp} className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 border border-green-500/20">{tp}</span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && filtered.length === 0 && (
          <div className="col-span-3 text-center py-12 text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No technologies found</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState('');
  const [editingDistrict, setEditingDistrict] = useState<DistrictData | null>(null);
  const [importingCVI, setImportingCVI] = useState(false);

  const { data: authUser, isLoading: authLoading, isError: authError } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => fetch('/api/auth/me', { credentials: 'include' }).then(r => r.ok ? r.json() : Promise.reject()),
    retry: false,
  });

  useEffect(() => {
    if (!authLoading && authError) {
      navigate('/admin/login');
    }
  }, [authLoading, authError, navigate]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    queryClient.clear();
    navigate('/admin/login');
  };

  const handleImportCVI = async () => {
    setImportingCVI(true);
    try {
      const res = await fetch('/api/admin/import-cvi', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      queryClient.invalidateQueries({ queryKey: ['districts'] });
      toast({
        title: `CVI Import Complete`,
        description: `Updated ${data.updated} of ${data.total} districts. ${data.notFound.length} not matched.`,
      });
    } catch (e: any) {
      toast({ title: 'Import Failed', description: e.message, variant: 'destructive' });
    } finally {
      setImportingCVI(false);
    }
  };

  const { data: districts = [], isLoading: districtsLoading } = useQuery({
    queryKey: ['districts'],
    queryFn: fetchDistricts,
    enabled: !!authUser,
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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (authError || !authUser) return null;

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
          <p className="text-muted-foreground ml-14">
            Signed in as <span className="font-medium text-foreground">{authUser.username}</span>
            {" · "}Manage data sources, hazard intensities, and API integrations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportCVI}
            disabled={importingCVI}
            title="Import CEEW CVI Excel data into districts"
          >
            {importingCVI ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            {importingCVI ? "Importing..." : "Import CVI Data"}
          </Button>
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
            <LogOut className="h-4 w-4 mr-1.5" />
            Logout
          </Button>
        </div>
      </div>

      <Tabs defaultValue="data" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent space-x-6">
          <TabsTrigger value="data" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">
            District Data Editor
          </TabsTrigger>
          <TabsTrigger value="technologies" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">
            Technology Library
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

        {/* Technology Library Tab */}
        <TabsContent value="technologies" className="pt-6">
          <TechnologyManagerTab />
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
