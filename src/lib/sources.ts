import { SourceKind } from "@/lib/types";

export type SourceConfig = {
  key: SourceKind;
  label: string;
  formIdEnv: string;
  defaultFormId: string;
};

export const SOURCES: SourceConfig[] = [
  {
    key: "checkins",
    label: "Checkins",
    formIdEnv: "JOTFORM_FORM_CHECKINS",
    defaultFormId: "261065067494966",
  },
  {
    key: "messages",
    label: "Messages",
    formIdEnv: "JOTFORM_FORM_MESSAGES",
    defaultFormId: "261065765723966",
  },
  {
    key: "sightings",
    label: "Sightings",
    formIdEnv: "JOTFORM_FORM_SIGHTINGS",
    defaultFormId: "261065244786967",
  },
  {
    key: "personal_notes",
    label: "Personal Notes",
    formIdEnv: "JOTFORM_FORM_PERSONAL_NOTES",
    defaultFormId: "261065509008958",
  },
  {
    key: "anon_tips",
    label: "Anonymous Tips",
    formIdEnv: "JOTFORM_FORM_ANON_TIPS",
    defaultFormId: "261065875889981",
  },
];

export function getFormIdForSource(key: SourceKind): string | null {
  const cfg = SOURCES.find((s) => s.key === key);
  if (!cfg) return null;
  const fromEnv = process.env[cfg.formIdEnv];
  const fromEnvTrim =
    typeof fromEnv === "string" && fromEnv.trim() ? fromEnv.trim() : null;
  return fromEnvTrim ?? cfg.defaultFormId ?? null;
}
