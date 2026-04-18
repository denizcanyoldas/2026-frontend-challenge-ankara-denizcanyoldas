"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { groupPeople, eventsForPerson } from "@/lib/linking/group";
import { EventItem, PersonGroup, SourceKind } from "@/lib/types";
import { SOURCES } from "@/lib/sources";
import { buildPersonColorMap } from "@/lib/colors";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="h-[360px] animate-pulse rounded-[var(--radius-sm)] border border-[var(--card-border)] bg-[rgba(19,48,107,0.04)]" />
  ),
});

type SourceStatus = {
  source: SourceKind;
  formId: string | null;
  count: number;
  error?: string;
};

type AllResponse = {
  sources: SourceStatus[];
  count: number;
  events: EventItem[];
};

const SOURCE_LABEL: Record<SourceKind, string> = {
  checkins: "Checkins",
  messages: "Messages",
  sightings: "Sightings",
  personal_notes: "Personal Notes",
  anon_tips: "Anonymous Tips",
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus[]>([]);

  const [query, setQuery] = useState("");
  const [selectedPersonKey, setSelectedPersonKey] = useState<string | null>(
    null
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceKind | "all">("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [hiddenTrailKeys, setHiddenTrailKeys] = useState<Set<string>>(
    new Set()
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/jotform/all", { cache: "no-store" });
      const text = await r.text();
      let data: AllResponse | { error: string } | null = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!r.ok) {
        const msg =
          data && "error" in data && data.error
            ? data.error
            : `Request failed (${r.status})`;
        throw new Error(msg);
      }

      const payload = data as AllResponse | null;
      setEvents(payload?.events ?? []);
      setSourceStatus(payload?.sources ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const people: PersonGroup[] = useMemo(() => {
    const groups = groupPeople(events);
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.label.toLowerCase().includes(q));
  }, [events, query]);

  const selectedEvents = useMemo(() => {
    if (!selectedPersonKey) return [];
    let list = eventsForPerson(events, selectedPersonKey);
    if (sourceFilter !== "all") {
      list = list.filter((e) => e.source === sourceFilter);
    }
    const lf = locationFilter.trim().toLowerCase();
    if (lf) {
      list = list.filter((e) => (e.location ?? "").toLowerCase().includes(lf));
    }
    return list;
  }, [events, selectedPersonKey, sourceFilter, locationFilter]);

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return selectedEvents.find((e) => e.id === selectedEventId) ?? null;
  }, [selectedEvents, selectedEventId]);

  const sourceErrors = sourceStatus.filter((s) => s.error);
  const totalSourceCount = sourceStatus.reduce((acc, s) => acc + s.count, 0);

  const eventsWithCoords = useMemo(
    () => events.filter((e) => e.coordinates),
    [events]
  );

  const peopleWithTrails = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number }>();
    for (const ev of eventsWithCoords) {
      const key = ev.personKey || "unknown";
      const prior = map.get(key);
      if (prior) {
        prior.count += 1;
      } else {
        map.set(key, {
          key,
          label: ev.personLabel || "Unknown",
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    });
  }, [eventsWithCoords]);

  const personColorMap = useMemo(
    () => buildPersonColorMap(peopleWithTrails.map((p) => p.key)),
    [peopleWithTrails]
  );

  const visibleTrailKeys = useMemo(
    () => peopleWithTrails.filter((p) => !hiddenTrailKeys.has(p.key)).map((p) => p.key),
    [peopleWithTrails, hiddenTrailKeys]
  );

  function toggleTrail(key: string) {
    setHiddenTrailKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--card-border)] bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="hero-gradient grid size-9 place-items-center rounded-xl text-sm font-bold text-white shadow-[var(--shadow-sm)]">
              MP
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight text-[var(--navy-900)]">
                Missing Podo:{" "}
                <span className="text-gradient">The Ankara Case</span>
              </div>
              <div className="text-xs text-[var(--muted)]">
                Investigation dashboard
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="navy">{events.length} events</Badge>
            <Button
              variant="ghost"
              onClick={load}
              disabled={loading}
              aria-label="Refresh data"
            >
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6">
        <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--card-border)] shadow-[var(--shadow)]">
          <div className="hero-gradient relative px-6 py-8 text-white">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/25 backdrop-blur">
                    Jotform Frontend Challenge
                  </span>
                  <span className="rounded-full bg-[var(--orange-500)]/95 px-3 py-1 text-xs font-semibold">
                    3 HOURS
                  </span>
                </div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  Investigation UI
                </h1>
                <p className="mt-2 max-w-xl text-sm text-white/80">
                  Follow the chain of Podo&apos;s last sightings across five
                  Jotform data sources. Linked records, filters, details, and a
                  timeline — all in one place.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="orange">Investigation</Button>
                <button className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur hover:bg-white/15">
                  Map &amp; Data
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-[var(--card-border)] sm:grid-cols-5">
            {SOURCES.map((s) => {
              const status = sourceStatus.find((x) => x.source === s.key);
              const count = status?.count ?? 0;
              const err = status?.error;
              return (
                <div key={s.key} className="flex flex-col gap-1 bg-white p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    {s.label}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-[var(--navy-900)]">
                      {count}
                    </span>
                    {err ? (
                      <Badge tone="rose">error</Badge>
                    ) : count > 0 ? (
                      <Badge tone="orange">records</Badge>
                    ) : (
                      <Badge tone="neutral">empty</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {error ? (
          <div className="rounded-[var(--radius)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <div className="font-semibold">Failed to load data</div>
            <div className="mt-0.5 break-words">{error}</div>
          </div>
        ) : null}

        {sourceErrors.length > 0 ? (
          <div className="rounded-[var(--radius)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="font-semibold">
              Partial data: {sourceErrors.length} source
              {sourceErrors.length === 1 ? "" : "s"} failed
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {sourceErrors.map((s) => (
                <li key={s.source}>
                  <span className="font-medium">
                    {SOURCE_LABEL[s.source]}
                  </span>
                  : {s.error}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <section>
          <Card
            title="Trail map"
            right={
              <div className="flex items-center gap-2">
                {selectedPersonKey ? (
                  <Badge tone="orange">
                    Focused:{" "}
                    {people.find((p) => p.key === selectedPersonKey)?.label ??
                      "—"}
                  </Badge>
                ) : null}
                <Badge tone="navy">{eventsWithCoords.length} pins</Badge>
              </div>
            }
          >
            {eventsWithCoords.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--card-border)] bg-white p-4 text-sm text-[var(--muted)]">
                No coordinates available yet across data sources.
              </div>
            ) : (
              <MapView
                events={eventsWithCoords}
                highlightPersonKey={selectedPersonKey}
                visiblePersonKeys={visibleTrailKeys}
                personColors={personColorMap}
                height={420}
                onSelectEvent={(id) => {
                  const ev = events.find((e) => e.id === id);
                  if (!ev) return;
                  setSelectedPersonKey(ev.personKey);
                  setSelectedEventId(ev.id);
                }}
                onToggleTrail={toggleTrail}
              />
            )}

            {peopleWithTrails.length > 0 ? (
              <div className="mt-3 rounded-xl border border-[var(--card-border)] bg-white p-3 shadow-[var(--shadow-sm)]">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Trails on map
                    </span>
                    <Badge tone="navy">
                      {visibleTrailKeys.length}/{peopleWithTrails.length}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--card-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--navy-700)] hover:bg-[rgba(19,48,107,0.05)]"
                      onClick={() => setHiddenTrailKeys(new Set())}
                    >
                      Show all
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--card-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--navy-700)] hover:bg-[rgba(19,48,107,0.05)]"
                      onClick={() =>
                        setHiddenTrailKeys(
                          new Set(peopleWithTrails.map((p) => p.key))
                        )
                      }
                    >
                      Hide all
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {peopleWithTrails.map((p) => {
                    const visible = !hiddenTrailKeys.has(p.key);
                    const focused = p.key === selectedPersonKey;
                    const color = personColorMap.get(p.key) ?? "#999";
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => toggleTrail(p.key)}
                        onDoubleClick={() => {
                          setSelectedPersonKey(p.key);
                          setSelectedEventId(null);
                        }}
                        className={[
                          "group flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                          focused
                            ? "border-[rgba(255,122,26,0.5)] bg-[rgba(255,122,26,0.08)] text-[var(--navy-900)]"
                            : visible
                              ? "border-[var(--card-border)] bg-white text-[var(--navy-900)] hover:bg-[rgba(19,48,107,0.04)]"
                              : "border-[var(--card-border)] bg-[rgba(19,48,107,0.03)] text-[var(--muted)] hover:bg-white",
                        ].join(" ")}
                        style={{ opacity: visible ? 1 : 0.55 }}
                        aria-pressed={visible}
                        title={
                          visible
                            ? `Hide trail · ${p.label}`
                            : `Show trail · ${p.label}`
                        }
                      >
                        <span
                          aria-hidden
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
                          style={{
                            backgroundColor: visible ? color : "transparent",
                            borderColor: color,
                          }}
                        />
                        <span className="truncate max-w-[160px]">
                          {p.label}
                        </span>
                        <span className="rounded-md bg-[rgba(19,48,107,0.06)] px-1.5 text-[10px] font-semibold text-[var(--navy-700)]">
                          {p.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 text-[11px] text-[var(--muted)]">
                  Click to toggle a trail · double-click to focus that person
                </div>
              </div>
            ) : null}
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <Card
              title="People"
              right={<Badge tone="navy">{people.length}</Badge>}
            >
              <div className="mb-3">
                <Input
                  aria-label="Search people"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people…"
                />
              </div>

              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-12 animate-pulse rounded-xl border border-[var(--card-border)] bg-[rgba(19,48,107,0.04)]"
                    />
                  ))}
                </div>
              ) : people.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--card-border)] bg-white p-4 text-sm text-[var(--muted)]">
                  {totalSourceCount === 0
                    ? "No data returned from any source. Check API key and form IDs."
                    : "No people match your search."}
                </div>
              ) : (
                <div className="max-h-[62vh] overflow-auto pr-1">
                  <ul className="space-y-1">
                    {people.map((p) => {
                      const active = p.key === selectedPersonKey;
                      return (
                        <li key={p.key}>
                          <button
                            className={[
                              "w-full rounded-xl border px-3 py-2 text-left shadow-[var(--shadow-sm)] transition-colors",
                              active
                                ? "border-[rgba(255,122,26,0.4)] bg-[rgba(255,122,26,0.06)]"
                                : "border-[var(--card-border)] bg-white hover:bg-[rgba(19,48,107,0.03)]",
                            ].join(" ")}
                            onClick={() => {
                              setSelectedPersonKey(p.key);
                              setSelectedEventId(null);
                            }}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-[var(--navy-900)]">
                                  {p.label}
                                </div>
                                <div className="truncate text-xs text-[var(--muted)]">
                                  {p.count} record{p.count === 1 ? "" : "s"}
                                  {p.lastSeenAt
                                    ? ` • last ${new Date(
                                        p.lastSeenAt
                                      ).toLocaleDateString()}`
                                    : ""}
                                </div>
                              </div>
                              <Badge tone={active ? "orange" : "neutral"}>
                                {p.count}
                              </Badge>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-6">
            <Card
              title="Events"
              right={
                selectedPersonKey ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-xl border border-[var(--card-border)] bg-white p-1 shadow-[var(--shadow-sm)]">
                      <button
                        className={[
                          "h-8 rounded-lg px-3 text-xs font-semibold transition-colors",
                          viewMode === "list"
                            ? "bg-[var(--navy-700)] text-white"
                            : "text-[var(--muted)] hover:bg-[rgba(19,48,107,0.06)]",
                        ].join(" ")}
                        onClick={() => setViewMode("list")}
                      >
                        List
                      </button>
                      <button
                        className={[
                          "h-8 rounded-lg px-3 text-xs font-semibold transition-colors",
                          viewMode === "timeline"
                            ? "bg-[var(--orange-500)] text-white"
                            : "text-[var(--muted)] hover:bg-[rgba(19,48,107,0.06)]",
                        ].join(" ")}
                        onClick={() => setViewMode("timeline")}
                      >
                        Timeline
                      </button>
                    </div>
                    <Badge tone="orange">{selectedEvents.length}</Badge>
                  </div>
                ) : (
                  <Badge tone="neutral">Select a person</Badge>
                )
              }
            >
              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  aria-label="Filter by source"
                  value={sourceFilter}
                  onChange={(e) =>
                    setSourceFilter(e.target.value as SourceKind | "all")
                  }
                  className="h-10 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 text-sm shadow-[var(--shadow-sm)] disabled:opacity-60"
                  disabled={!selectedPersonKey}
                >
                  <option value="all">All sources</option>
                  {SOURCES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>

                <Input
                  aria-label="Filter by location"
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  placeholder="Filter by location…"
                  disabled={!selectedPersonKey}
                />
              </div>

              {!selectedPersonKey ? (
                <div className="rounded-xl border border-dashed border-[var(--card-border)] bg-white p-4 text-sm text-[var(--muted)]">
                  Choose someone from the People list to see linked records
                  across sources.
                </div>
              ) : selectedEvents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--card-border)] bg-white p-4 text-sm text-[var(--muted)]">
                  No events match the current filters.
                </div>
              ) : viewMode === "timeline" ? (
                <div className="max-h-[62vh] overflow-auto pr-1">
                  <ol className="space-y-3">
                    {selectedEvents.map((ev, idx) => {
                      const active = ev.id === selectedEventId;
                      const isLast = idx === selectedEvents.length - 1;
                      return (
                        <li key={ev.id} className="relative pl-9">
                          {!isLast ? (
                            <div className="absolute left-[14px] top-8 h-[calc(100%_-_20px)] w-px bg-[var(--card-border)]" />
                          ) : null}
                          <button
                            className={[
                              "w-full rounded-xl border px-3 py-3 text-left shadow-[var(--shadow-sm)] transition-colors",
                              active
                                ? "border-[rgba(255,122,26,0.4)] bg-[rgba(255,122,26,0.06)]"
                                : "border-[var(--card-border)] bg-white hover:bg-[rgba(19,48,107,0.03)]",
                            ].join(" ")}
                            onClick={() => setSelectedEventId(ev.id)}
                          >
                            <div className="absolute left-0 top-3 grid size-7 place-items-center rounded-xl border border-[var(--card-border)] bg-white shadow-[var(--shadow-sm)]">
                              <span className="size-2 rounded-full bg-[var(--orange-500)]" />
                            </div>

                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-[var(--navy-900)]">
                                  {ev.summary}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                                  <Badge tone="navy">
                                    {SOURCE_LABEL[ev.source]}
                                  </Badge>
                                  <span className="truncate">
                                    {new Date(ev.createdAt).toLocaleString()}
                                  </span>
                                  {ev.location ? (
                                    <span className="truncate">
                                      • {ev.location}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : (
                <div className="max-h-[62vh] overflow-auto pr-1">
                  <ul className="space-y-2">
                    {selectedEvents
                      .slice()
                      .reverse()
                      .map((ev) => {
                        const active = ev.id === selectedEventId;
                        return (
                          <li key={ev.id}>
                            <button
                              className={[
                                "w-full rounded-xl border px-3 py-3 text-left shadow-[var(--shadow-sm)] transition-colors",
                                active
                                  ? "border-[rgba(255,122,26,0.4)] bg-[rgba(255,122,26,0.06)]"
                                  : "border-[var(--card-border)] bg-white hover:bg-[rgba(19,48,107,0.03)]",
                              ].join(" ")}
                              onClick={() => setSelectedEventId(ev.id)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-[var(--navy-900)]">
                                    {ev.summary}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                                    <Badge tone="navy">
                                      {SOURCE_LABEL[ev.source]}
                                    </Badge>
                                    <span className="truncate">
                                      {new Date(ev.createdAt).toLocaleString()}
                                    </span>
                                    {ev.location ? (
                                      <span className="truncate">
                                        • {ev.location}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-3">
            <Card
              title="Detail"
              right={
                selectedEvent ? (
                  <Badge tone="orange">
                    {SOURCE_LABEL[selectedEvent.source]}
                  </Badge>
                ) : undefined
              }
            >
              {!selectedEvent ? (
                <div className="rounded-xl border border-dashed border-[var(--card-border)] bg-white p-4 text-sm text-[var(--muted)]">
                  Select an event to see details and raw JSON.
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-semibold text-[var(--navy-900)]">
                      {selectedEvent.summary}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {new Date(selectedEvent.createdAt).toLocaleString()}
                      {selectedEvent.location
                        ? ` • ${selectedEvent.location}`
                        : ""}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--card-border)] bg-[rgba(19,48,107,0.03)] p-2 text-xs text-[var(--muted)]">
                    <div className="mb-1 font-medium text-[var(--navy-900)]">
                      Raw JSON
                    </div>
                    <pre className="max-h-[44vh] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-[var(--navy-900)]">
                      {JSON.stringify(selectedEvent.raw, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </section>
      </main>

    </div>
  );
}
