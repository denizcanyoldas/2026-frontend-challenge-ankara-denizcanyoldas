"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { groupPeople, eventsForPerson } from "@/lib/linking/group";
import { EventItem, PersonGroup, SourceKind } from "@/lib/types";
import { SOURCES } from "@/lib/sources";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);

  const [query, setQuery] = useState("");
  const [selectedPersonKey, setSelectedPersonKey] = useState<string | null>(
    null
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceKind | "all">("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    fetch("/api/jotform/all")
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<{ events: EventItem[] }>;
      })
      .then((data) => {
        if (!alive) return;
        setEvents(Array.isArray(data.events) ? data.events : []);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load data");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
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

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--card-border)] bg-[var(--app-bg)]/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-indigo-600 text-white shadow-[var(--shadow-sm)]">
              JP
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">
                Missing Podo: The Ankara Case
              </div>
              <div className="text-xs text-[var(--muted)]">
                Investigation dashboard (core)
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge>Jotform data</Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6">
        <section className="rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--shadow)]">
          <div className="flex flex-col gap-2 px-6 py-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Investigation UI
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
                We’ll connect to your Jotform data sources next. This shell is
                intentionally styled to be close to Jotform’s cards, borders,
                and spacing.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="primary">
                Investigation
              </Button>
              <Button variant="secondary" disabled>
                Data
              </Button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <Card
              title="People"
              right={<Badge tone="indigo">{people.length}</Badge>}
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
                <div className="p-2 text-sm text-[var(--muted)]">Loading…</div>
              ) : error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">
                  {error}
                </div>
              ) : people.length === 0 ? (
                <div className="p-2 text-sm text-[var(--muted)]">
                  No people found.
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
                              "w-full rounded-xl border px-3 py-2 text-left shadow-[var(--shadow-sm)]",
                              active
                                ? "border-indigo-200 bg-indigo-50 dark:border-indigo-400/30 dark:bg-indigo-500/10"
                                : "border-[var(--card-border)] bg-[var(--card)] hover:bg-black/[.02] dark:hover:bg-white/[.04]",
                            ].join(" ")}
                            onClick={() => {
                              setSelectedPersonKey(p.key);
                              setSelectedEventId(null);
                            }}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">
                                  {p.label}
                                </div>
                                <div className="truncate text-xs text-[var(--muted)]">
                                  {p.count} record{p.count === 1 ? "" : "s"}
                                </div>
                              </div>
                              <Badge tone="neutral">{p.count}</Badge>
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
                    <div className="hidden items-center gap-1 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1 shadow-[var(--shadow-sm)] sm:flex">
                      <button
                        className={[
                          "h-8 rounded-lg px-3 text-xs font-semibold",
                          viewMode === "list"
                            ? "bg-indigo-600 text-white"
                            : "text-[var(--muted)] hover:bg-black/[.03] dark:hover:bg-white/[.06]",
                        ].join(" ")}
                        onClick={() => setViewMode("list")}
                      >
                        List
                      </button>
                      <button
                        className={[
                          "h-8 rounded-lg px-3 text-xs font-semibold",
                          viewMode === "timeline"
                            ? "bg-indigo-600 text-white"
                            : "text-[var(--muted)] hover:bg-black/[.03] dark:hover:bg-white/[.06]",
                        ].join(" ")}
                        onClick={() => setViewMode("timeline")}
                      >
                        Timeline
                      </button>
                    </div>
                    <Badge tone="green">{selectedEvents.length}</Badge>
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
                  className="h-10 w-full rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm shadow-[var(--shadow-sm)]"
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
                <div className="p-2 text-sm text-[var(--muted)]">
                  Choose someone from the People list to see linked records across
                  sources.
                </div>
              ) : selectedEvents.length === 0 ? (
                <div className="p-2 text-sm text-[var(--muted)]">
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
                              "w-full rounded-xl border px-3 py-3 text-left shadow-[var(--shadow-sm)]",
                              active
                                ? "border-indigo-200 bg-indigo-50 dark:border-indigo-400/30 dark:bg-indigo-500/10"
                                : "border-[var(--card-border)] bg-[var(--card)] hover:bg-black/[.02] dark:hover:bg-white/[.04]",
                            ].join(" ")}
                            onClick={() => setSelectedEventId(ev.id)}
                          >
                            <div className="absolute left-0 top-3 grid size-7 place-items-center rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--shadow-sm)]">
                              <span className="size-2 rounded-full bg-indigo-600" />
                            </div>

                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">
                                  {ev.summary}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                                  <Badge tone="indigo">{ev.source}</Badge>
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
                                "w-full rounded-xl border px-3 py-3 text-left shadow-[var(--shadow-sm)]",
                                active
                                  ? "border-indigo-200 bg-indigo-50 dark:border-indigo-400/30 dark:bg-indigo-500/10"
                                  : "border-[var(--card-border)] bg-[var(--card)] hover:bg-black/[.02] dark:hover:bg-white/[.04]",
                              ].join(" ")}
                              onClick={() => setSelectedEventId(ev.id)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold">
                                    {ev.summary}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                                    <Badge tone="indigo">{ev.source}</Badge>
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
                selectedEvent ? <Badge tone="amber">{selectedEvent.source}</Badge> : undefined
              }
            >
              {!selectedEvent ? (
                <div className="p-2 text-sm text-[var(--muted)]">
                  Select an event to see details and raw JSON.
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-semibold">{selectedEvent.summary}</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {new Date(selectedEvent.createdAt).toLocaleString()}
                      {selectedEvent.location ? ` • ${selectedEvent.location}` : ""}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--card-border)] bg-black/[.02] p-2 text-xs text-[var(--muted)] dark:bg-white/[.04]">
                    <div className="mb-1 font-medium text-[var(--app-fg)]">
                      Raw JSON
                    </div>
                    <pre className="max-h-[44vh] overflow-auto whitespace-pre-wrap break-words">
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
