import { EventItem, PersonGroup, SourceKind } from "@/lib/types";

const ALL_SOURCES: SourceKind[] = [
  "checkins",
  "messages",
  "sightings",
  "personal_notes",
  "anon_tips",
];

function initSources(): Record<SourceKind, number> {
  return {
    checkins: 0,
    messages: 0,
    sightings: 0,
    personal_notes: 0,
    anon_tips: 0,
  };
}

export function groupPeople(events: EventItem[]): PersonGroup[] {
  const map = new Map<string, PersonGroup>();

  for (const ev of events) {
    const key = ev.personKey || "unknown";
    const existing = map.get(key);

    if (!existing) {
      const sources = initSources();
      sources[ev.source] = 1;
      map.set(key, {
        key,
        label: ev.personLabel || "Unknown",
        count: 1,
        lastSeenAt: ev.createdAt,
        sources,
      });
      continue;
    }

    existing.count += 1;
    existing.sources[ev.source] += 1;
    if (!existing.lastSeenAt || existing.lastSeenAt < ev.createdAt) {
      existing.lastSeenAt = ev.createdAt;
    }

    if (
      (existing.label === "Unknown" || existing.label.trim().length < 2) &&
      ev.personLabel &&
      ev.personLabel !== "Unknown"
    ) {
      existing.label = ev.personLabel;
    }
  }

  const groups = Array.from(map.values());
  groups.sort((a, b) => {
    const at = a.lastSeenAt ?? "";
    const bt = b.lastSeenAt ?? "";
    if (at !== bt) return bt.localeCompare(at);
    return b.count - a.count;
  });

  // Ensure stable `sources` keys exist even if unused.
  for (const g of groups) {
    for (const s of ALL_SOURCES) g.sources[s] ??= 0;
  }

  return groups;
}

export function eventsForPerson(events: EventItem[], personKey: string) {
  return events
    .filter((e) => e.personKey === personKey)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

