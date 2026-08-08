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
import { getAllTechnologies } from "@/lib/technologyContent";

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

async function uploadTechDiagram(id: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`/api/technologies/${id}/diagram`, { method: 'POST', body });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Upload failed');
  return res.json();
}

async function deleteTechDiagram(id: string) {
  const res = await fetch(`/api/technologies/${id}/diagram`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to remove drawing');
  return res.json();
}

function DiagramUploader({ techId, diagramUrl }: { techId: string; diagramUrl: string | null | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<string | null>(diagramUrl ?? null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadTechDiagram(techId, file),
    onSuccess: (updated) => {
      setPreview(updated.diagramUrl);
      queryClient.invalidateQueries({ queryKey: ['technologies'] });
      queryClient.invalidateQueries({ queryKey: ['tech-diagrams'] });
      toast({ title: 'Drawing uploaded', description: 'Now visible on the public technology page.' });
    },
    onError: (e: any) => toast({ title: 'Upload failed', description: e.message, variant: 'destructive' }),
  });

  const removeMutation = useMutation({
    mutationFn: () => deleteTechDiagram(techId),
    onSuccess: () => {
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ['technologies'] });
      queryClient.invalidateQueries({ queryKey: ['tech-diagrams'] });
      toast({ title: 'Drawing removed' });
    },
  });

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold">Technical Drawing</Label>
      {preview ? (
        <div className="flex items-start gap-3">
          <img src={preview} alt="Technology diagram" className="h-28 w-40 object-cover rounded border border-border bg-muted" />
          <div className="flex flex-col gap-1.5">
            <label className="cursor-pointer">
              <Button variant="outline" size="sm" asChild disabled={uploadMutation.isPending}>
                <span><Upload className="h-3.5 w-3.5 mr-1.5" />{uploadMutation.isPending ? 'Uploading...' : 'Replace'}</span>
              </Button>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
                onChange={e => e.target.files?.[0] && uploadMutation.mutate(e.target.files[0])} />
            </label>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Remove
            </Button>
          </div>
        </div>
      ) : (
        <label className="cursor-pointer inline-block">
          <div className={`flex items-center gap-2 px-3 py-2 rounded border border-dashed text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors ${uploadMutation.isPending ? 'opacity-60' : ''}`}>
            <Upload className="h-3.5 w-3.5" />
            {uploadMutation.isPending ? 'Uploading...' : 'Upload a cross-section / schematic (PNG, JPEG, WebP, or SVG, up to 8MB)'}
          </div>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
            onChange={e => e.target.files?.[0] && uploadMutation.mutate(e.target.files[0])} disabled={uploadMutation.isPending} />
        </label>
      )}
    </div>
  );
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

      {isNew ? (
        <p className="text-xs text-muted-foreground bg-secondary/50 rounded px-3 py-2">
          Save the technology first, then a "Technical Drawing" upload option will appear here.
        </p>
      ) : (
        <DiagramUploader techId={tech.id} diagramUrl={tech.diagramUrl} />
      )}

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

function downloadTemplate() {
  const headers = [
    "id","name","population","vulnerabilityScore","adaptationScore",
    "childrenAtRisk","elderlyAtRisk","climateRisks","adaptationStrategies","impactIfNoAction",
    "soilType","rockType","toiletTechnology","waterSupplyStrategy",
    "dropoutRate","waterAccessPercent","toiletCoveragePercent","handwashingFacilityPercent",
    "schoolToiletPercent","schoolWaterPercent","malnutritionStunting","malnutritionWasting",
    "malnutritionUnderweight","infantMortalityRate","maternalMortalityRatio"
  ];
  const example = [
    "NG-0001","Abuja FCT","3564126","45","60","128310","56822",
    "Flood,Drought,Heatwave","Rainwater Harvesting,Early Warning Systems",
    "Without intervention, Abuja FCT faces increased flood risk by 2030.",
    "Alluvial","Granite","Twin Pit","Piped Water",
    "8.5","72","65","58","70","68","28","9","22","38","150"
  ];
  const csv = [headers.join(","), example.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "country_districts_template.csv"; a.click();
  URL.revokeObjectURL(url);
}

function CountryImportTab() {
  const { toast } = useToast();
  const [countryId, setCountryId] = useState("");
  const [countryName, setCountryName] = useState("");
  const [population, setPopulation] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; failed: number; errors: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const parseFile = async (file: File) => {
    const XLSX = (await import("xlsx")) as any;
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const parsed: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });
    if (parsed.length === 0) { toast({ title: "Empty file", description: "No rows found in the file.", variant: "destructive" }); return; }
    setRows(parsed);
    if (!countryId && parsed[0]?.countryId) setCountryId(String(parsed[0].countryId));
    if (!countryName && parsed[0]?.countryName) setCountryName(String(parsed[0].countryName));
    toast({ title: `Parsed ${parsed.length} rows`, description: "Review below, then click Import." });
  };

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) { toast({ title: "Invalid file", description: "Please upload an Excel (.xlsx/.xls) or CSV file.", variant: "destructive" }); return; }
    parseFile(file);
  };

  const handleImport = async () => {
    if (!countryId.trim() || !countryName.trim() || !population.trim()) { toast({ title: "Fill in country details", variant: "destructive" }); return; }
    if (rows.length === 0) { toast({ title: "No data to import", variant: "destructive" }); return; }
    setImporting(true);
    setResult(null);
    try {
      const districts = rows.map((r, i) => ({
        id: r.id || `${countryId}-${String(i+1).padStart(4,"0")}`,
        name: r.name || r.NAME || "",
        population: Number(r.population) || 0,
        vulnerabilityScore: Number(r.vulnerabilityScore) || 0,
        adaptationScore: Number(r.adaptationScore) || 0,
        childrenAtRisk: Number(r.childrenAtRisk) || 0,
        elderlyAtRisk: Number(r.elderlyAtRisk) || 0,
        climateRisks: r.climateRisks ? String(r.climateRisks).split(",").map((s: string) => s.trim()).filter(Boolean) : [],
        adaptationStrategies: r.adaptationStrategies ? String(r.adaptationStrategies).split(",").map((s: string) => s.trim()).filter(Boolean) : [],
        impactIfNoAction: r.impactIfNoAction || "",
        soilType: r.soilType || "Alluvial",
        rockType: r.rockType || "Sandstone",
        toiletTechnology: r.toiletTechnology || "Twin Pit",
        waterSupplyStrategy: r.waterSupplyStrategy || "Bore Well",
        dropoutRate: Number(r.dropoutRate) || 0,
        waterAccessPercent: Number(r.waterAccessPercent) || 0,
        toiletCoveragePercent: Number(r.toiletCoveragePercent) || 0,
        handwashingFacilityPercent: Number(r.handwashingFacilityPercent) || 0,
        schoolToiletPercent: r.schoolToiletPercent != null ? Number(r.schoolToiletPercent) : null,
        schoolWaterPercent: r.schoolWaterPercent != null ? Number(r.schoolWaterPercent) : null,
        anganwadiToiletPercent: r.anganwadiToiletPercent != null ? Number(r.anganwadiToiletPercent) : null,
        anganwadiWaterPercent: r.anganwadiWaterPercent != null ? Number(r.anganwadiWaterPercent) : null,
        malnutritionStunting: Number(r.malnutritionStunting) || 0,
        malnutritionWasting: Number(r.malnutritionWasting) || 0,
        malnutritionUnderweight: Number(r.malnutritionUnderweight) || 0,
        infantMortalityRate: Number(r.infantMortalityRate) || 0,
        maternalMortalityRatio: Number(r.maternalMortalityRatio) || 0,
        geometry: r.geometry ? (typeof r.geometry === "string" ? JSON.parse(r.geometry) : r.geometry) : null,
        seasonalData: r.seasonalData ? (typeof r.seasonalData === "string" ? JSON.parse(r.seasonalData) : r.seasonalData) : [],
      }));
      const resp = await fetch("/api/admin/import-countries", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: { id: countryId.trim().toUpperCase(), name: countryName.trim(), population: Number(population) || 0, totalDistricts: districts.length }, districts }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Import failed");
      setResult(data);
      toast({ title: `✅ Import complete`, description: `${data.inserted} districts added for ${countryName}.` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Add a New Country</CardTitle>
          <CardDescription>Upload an Excel or CSV file with district data to add a new country to the map.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Download Template */}
          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-sm font-medium">Step 1 — Download the template</p>
            <p className="text-xs text-muted-foreground">Fill in one row per district. Required columns: id, name, population, vulnerabilityScore (0-100), adaptationScore (0-100), climateRisks (comma-separated), waterAccessPercent, toiletCoveragePercent, infantMortalityRate, maternalMortalityRatio.</p>
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
              <Upload className="h-3.5 w-3.5" /> Download CSV Template
            </Button>
          </div>

          {/* Step 2: Country Info */}
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">Step 2 — Enter country details</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Country Code (2-3 letters)</Label>
                <Input placeholder="e.g. NG" value={countryId} onChange={e => setCountryId(e.target.value.toUpperCase())} maxLength={3} className="h-8 text-sm" data-testid="input-country-code" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Country Name</Label>
                <Input placeholder="e.g. Nigeria" value={countryName} onChange={e => setCountryName(e.target.value)} className="h-8 text-sm" data-testid="input-country-name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Total Population</Label>
                <Input placeholder="e.g. 220000000" value={population} onChange={e => setPopulation(e.target.value)} type="number" className="h-8 text-sm" data-testid="input-country-population" />
              </div>
            </div>
          </div>

          {/* Step 3: Upload File */}
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">Step 3 — Upload your file</p>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".xlsx,.xls,.csv"; inp.onchange = () => { if (inp.files?.[0]) handleFile(inp.files[0]); }; inp.click(); }}
              data-testid="upload-district-file"
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{rows.length > 0 ? `✅ ${rows.length} rows loaded — click to replace` : "Drag & drop or click to upload Excel / CSV"}</p>
            </div>
          </div>

          {/* Preview */}
          {rows.length > 0 && (
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-sm font-medium">Preview — first 5 rows</p>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="border-b">
                      {Object.keys(rows[0]).slice(0, 8).map(k => <th key={k} className="text-left px-2 py-1 text-muted-foreground">{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        {Object.keys(rows[0]).slice(0, 8).map(k => <td key={k} className="px-2 py-1 truncate max-w-[120px]">{String(r[k] ?? "")}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import Button */}
          <Button onClick={handleImport} disabled={importing || rows.length === 0} className="w-full gap-2" data-testid="button-import-country">
            {importing ? <><RefreshCw className="h-4 w-4 animate-spin" /> Importing {rows.length} districts...</> : <><Database className="h-4 w-4" /> Import {rows.length > 0 ? `${rows.length} Districts for ${countryName || "Country"}` : "Country"}</>}
          </Button>

          {/* Result */}
          {result && (
            <div className={`rounded-lg border p-4 space-y-2 ${result.failed === 0 ? "border-green-500/30 bg-green-500/5" : "border-orange-500/30 bg-orange-500/5"}`}>
              <p className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Import complete: {result.inserted} districts added, {result.failed} failed
              </p>
              {result.errors.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {result.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              <p className="text-xs text-muted-foreground">The country is now live on the map. Reload the dashboard to see it in the country selector.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing countries */}
      <ExistingCountriesList />
    </div>
  );
}

function ExistingCountriesList() {
  const { data: countriesList = [] } = useQuery({ queryKey: ["countries"], queryFn: () => fetch("/api/countries").then(r => r.json()) });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Currently Active Countries ({countriesList.length})</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {countriesList.map((c: any) => (
            <div key={c.id} className="rounded-lg border p-3 space-y-1">
              <p className="text-xs font-mono font-bold text-primary">{c.id}</p>
              <p className="text-sm font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">{(c.totalDistricts||0).toLocaleString()} districts</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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

  // The technology library (technologyContent.ts, 42 entries -- what the public
  // /technology page actually reads) is a different, larger set than what's in this DB
  // table (only what's been created here). "Import" lets an admin pick any library
  // entry that doesn't have a DB row yet and pre-fill the editor from it, rather than
  // re-typing everything by hand just to attach a drawing or population-load override.
  const dbSlugs = new Set((techs as any[]).map(t => t.slug));
  const importable = getAllTechnologies().filter(t => !dbSlugs.has(t.slug));

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
        <div className="flex items-center gap-2">
          {importable.length > 0 && (
            <Select onValueChange={slug => setEditingTech(importable.find(t => t.slug === slug))}>
              <SelectTrigger className="h-8 text-xs w-56">
                <SelectValue placeholder={`Import from Library (${importable.length})`} />
              </SelectTrigger>
              <SelectContent>
                {importable.map(t => (
                  <SelectItem key={t.slug} value={t.slug} className="text-xs">{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={() => setAddingNew(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Technology
          </Button>
        </div>
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
                  <CardTitle className="text-sm leading-tight flex items-center gap-1.5">
                    {t.title}
                    {t.diagramUrl && <span title="Has a technical drawing">📐</span>}
                  </CardTitle>
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
          <TabsTrigger value="countries" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">
            Add Countries
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

        {/* Countries Import Tab */}
        <TabsContent value="countries" className="pt-6">
          <CountryImportTab />
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
