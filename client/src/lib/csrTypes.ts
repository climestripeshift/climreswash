// Shared between CSRRajasthanPage.tsx and CSRCompaniesTab.tsx -- kept in its own module
// (rather than exported from CSRRajasthanPage.tsx) so the two page components can import
// each other's shared shapes without a circular import between them.

export const THEMES = [
  { key: "formal_education", label: "Formal Education", icon: "📖" },
  { key: "wash", label: "WASH", icon: "🚰" },
  { key: "school_hardware", label: "School Hardware", icon: "🏗️" },
  { key: "other_school_initiative", label: "Other (ICT/Sports)", icon: "🏀" },
  { key: "anganwadi", label: "Anganwadi", icon: "👶" },
] as const;
export type ThemeKey = typeof THEMES[number]["key"];

export interface Company {
  name: string;
  contact_person: string | null;
  contact_info: string | null;
  primary_district_raw: string | null;
  districts: string[];
  is_statewide: boolean;
  themes: Record<ThemeKey, boolean>;
  budget_raw: string | null;
  annual_report_link: string | null;
}
