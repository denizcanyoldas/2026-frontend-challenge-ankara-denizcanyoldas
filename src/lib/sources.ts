import { SourceKind } from "@/lib/types";

export type SourceConfig = {
  key: SourceKind;
  label: string;
  formIdEnv: string;
};

export const SOURCES: SourceConfig[] = [
  { key: "checkins", label: "Checkins", formIdEnv: "JOTFORM_FORM_CHECKINS" },
  { key: "messages", label: "Messages", formIdEnv: "JOTFORM_FORM_MESSAGES" },
  { key: "sightings", label: "Sightings", formIdEnv: "JOTFORM_FORM_SIGHTINGS" },
  {
    key: "personal_notes",
    label: "Personal Notes",
    formIdEnv: "JOTFORM_FORM_PERSONAL_NOTES",
  },
  {
    key: "anon_tips",
    label: "Anonymous Tips",
    formIdEnv: "JOTFORM_FORM_ANON_TIPS",
  },
];

export function getFormIdForSource(key: SourceKind): string | null {
  const cfg = SOURCES.find((s) => s.key === key);
  if (!cfg) return null;
  const v = process.env[cfg.formIdEnv];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

