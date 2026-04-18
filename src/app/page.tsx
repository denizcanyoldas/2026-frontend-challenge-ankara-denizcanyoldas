"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Fuse from "fuse.js";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { EventDetails } from "@/components/EventDetails";
import { SuspectBoard } from "@/components/SuspectBoard";
import { groupPeople } from "@/lib/linking/group";
import {
  applyPersonCanonicalization,
  buildPersonCanonicalization,
} from "@/lib/linking/dedupe";
import { computeSuspectScores } from "@/lib/analysis/suspects";
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

// Each source gets a subtle accent rail on top of its stat card so the
// five-up grid reads as a little spectrum instead of a flat row.
const SOURCE_ACCENT: Record<SourceKind, string> = {
  checkins: "linear-gradient(90deg, #1e4fbf, #28c1ff)",
  messages: "linear-gradient(90deg, #13306b, #3b74e6)",
  sightings: "linear-gradient(90deg, #ff7a1a, #ffc93a)",
  personal_notes: "linear-gradient(90deg, #0b1d3a, #13306b)",
  anon_tips: "linear-gradient(90deg, #ff4d9d, #ff7a1a)",
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus[]>([]);

  const [query, setQuery] = useState("");
  const [selectedPersonKeys, setSelectedPersonKeys] = useState<Set<string>>(
    new Set()
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceKind | "all">("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [detailView, setDetailView] = useState<"readable" | "raw">("readable");
  const [pinpointRequest, setPinpointRequest] = useState<
    { id: string; seq: number } | null
  >(null);
  const mapSectionRef = useRef<HTMLElement | null>(null);

  function pinpointEvent(id: string) {
    setSelectedEventId(id);
    const target = canonicalEvents.find((e) => e.id === id);
    if (!target?.coordinates) return;
    // Focus the map on this specific event: select only its owner and
    // spotlight just this pin (other stops of the same person dim too).
    setSelectedPersonKeys(new Set([target.personKey]));
    setPinpointRequest((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }));
    mapSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
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

  // Merge look-alike people (e.g. "Kagan", "Kağan", "Kağan A.") into a
  // single canonical identity before anything else consumes the events.
  const canonicalization = useMemo(
    () => buildPersonCanonicalization(events),
    [events]
  );
  const canonicalEvents = useMemo(
    () => applyPersonCanonicalization(events, canonicalization),
    [events, canonicalization]
  );

  const allPeople: PersonGroup[] = useMemo(
    () => groupPeople(canonicalEvents),
    [canonicalEvents]
  );

  // Prune selected keys that no longer exist after a dedupe recomputation
  // (can happen if new events arrive that shift the canonical label).
  useEffect(() => {
    setSelectedPersonKeys((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(allPeople.map((p) => p.key));
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (valid.has(k)) next.add(k);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [allPeople]);

  const peopleFuse = useMemo(
    () =>
      new Fuse(allPeople, {
        keys: ["label"],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }),
    [allPeople]
  );

  const people: PersonGroup[] = useMemo(() => {
    const q = query.trim();
    if (!q) return allPeople;
    // Try fuzzy search first; fall back to substring if Fuse finds nothing
    // (handles very short queries below the min match length).
    const hits = peopleFuse.search(q).map((r) => r.item);
    if (hits.length > 0) return hits;
    const ql = q.toLowerCase();
    return allPeople.filter((g) => g.label.toLowerCase().includes(ql));
  }, [allPeople, peopleFuse, query]);

  const selectedEvents = useMemo(() => {
    if (selectedPersonKeys.size === 0) return [];
    let list = canonicalEvents.filter((e) =>
      selectedPersonKeys.has(e.personKey)
    );
    list = list
      .slice()
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    if (sourceFilter !== "all") {
      list = list.filter((e) => e.source === sourceFilter);
    }
    const lf = locationFilter.trim();
    if (lf) {
      const locFuse = new Fuse(list, {
        keys: ["location"],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2,
      });
      const hits = locFuse.search(lf).map((r) => r.item);
      if (hits.length > 0) {
        const hitSet = new Set(hits);
        list = list.filter((e) => hitSet.has(e));
      } else {
        const lfl = lf.toLowerCase();
        list = list.filter((e) =>
          (e.location ?? "").toLowerCase().includes(lfl)
        );
      }
    }
    return list;
  }, [canonicalEvents, selectedPersonKeys, sourceFilter, locationFilter]);

  const selectedPersonKeysArray = useMemo(
    () => Array.from(selectedPersonKeys),
    [selectedPersonKeys]
  );

  const hasAnyPersonSelected = selectedPersonKeys.size > 0;
  const allPeopleSelected =
    people.length > 0 && selectedPersonKeys.size >= people.length;

  function togglePerson(key: string) {
    setSelectedPersonKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSelectedEventId(null);
  }

  function selectOnlyPerson(key: string) {
    setSelectedPersonKeys(new Set([key]));
    setSelectedEventId(null);
  }

  function toggleSelectAllPeople() {
    if (allPeopleSelected) {
      setSelectedPersonKeys(new Set());
    } else {
      setSelectedPersonKeys(new Set(people.map((p) => p.key)));
    }
    setSelectedEventId(null);
  }

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return selectedEvents.find((e) => e.id === selectedEventId) ?? null;
  }, [selectedEvents, selectedEventId]);

  const sourceErrors = sourceStatus.filter((s) => s.error);
  const totalSourceCount = sourceStatus.reduce((acc, s) => acc + s.count, 0);

  const eventsWithCoords = useMemo(
    () => canonicalEvents.filter((e) => e.coordinates),
    [canonicalEvents]
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

  const suspectAnalysis = useMemo(
    () => computeSuspectScores(canonicalEvents),
    [canonicalEvents]
  );

  function focusSuspectOnMap(key: string) {
    setSelectedPersonKeys(new Set([key]));
    setSelectedEventId(null);
    setPinpointRequest(null);
    mapSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

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
      <header className="sticky top-0 z-[1100] border-b border-[var(--card-border)] bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="hero-gradient-animated grid size-8 shrink-0 place-items-center rounded-xl text-xs font-bold text-white shadow-[var(--shadow-sm)] ring-1 ring-white/25 sm:size-9 sm:text-sm">
              MP
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-xs font-semibold tracking-tight text-[var(--navy-900)] sm:text-sm">
                Missing Podo:{" "}
                <span className="text-gradient">The Ankara Case</span>
              </div>
              <div className="hidden text-xs text-[var(--muted)] sm:block">
                Investigation dashboard
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="navy">
              <span className="hidden sm:inline">{events.length} events</span>
              <span className="sm:hidden">{events.length}</span>
            </Badge>
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

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 px-3 py-4 sm:gap-4 sm:px-4 sm:py-6">
        <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--card-border)] shadow-[var(--shadow)]">
          <div className="hero-gradient-animated relative overflow-hidden px-4 py-5 text-white sm:px-6 sm:py-8">
            {/* Decorative floating orbs — purely visual, kept behind the
                content and pointer-events: none via the utility class. */}
            <span
              aria-hidden
              className="floating-orb floating-orb--sun"
              style={{
                width: 260,
                height: 260,
                top: -80,
                right: -60,
                animationDuration: "14s",
              }}
            />
            <span
              aria-hidden
              className="floating-orb floating-orb--sky"
              style={{
                width: 200,
                height: 200,
                bottom: -70,
                left: "18%",
                animationDuration: "17s",
                animationDelay: "-3s",
              }}
            />
            <span
              aria-hidden
              className="floating-orb floating-orb--rose"
              style={{
                width: 160,
                height: 160,
                top: "40%",
                left: -50,
                animationDuration: "16s",
                animationDelay: "-6s",
                opacity: 0.35,
              }}
            />

            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[var(--orange-500)]/95 px-3 py-1 text-xs font-semibold shadow-[0_4px_16px_rgba(255,122,26,0.35)]">
                    <span className="live-dot" aria-hidden />
                    Jotform Frontend Challenge
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/95 backdrop-blur">
                    Case #Podo-01
                  </span>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Investigation UI
                </h1>
                <p className="mt-2 max-w-xl text-sm text-white/80">
                  Follow the chain of Podo&apos;s last sightings across five
                  Jotform data sources. Linked records, filters, details, and a
                  timeline — all in one place.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-[var(--card-border)] sm:grid-cols-5">
            {SOURCES.map((s) => {
              const status = sourceStatus.find((x) => x.source === s.key);
              const count = status?.count ?? 0;
              const err = status?.error;
              const accent = SOURCE_ACCENT[s.key];
              return (
                <div
                  key={s.key}
                  className="source-accent card-lift flex flex-col gap-1 bg-white p-4"
                  style={
                    { "--accent": accent } as React.CSSProperties
                  }
                >
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

        <section ref={mapSectionRef} className="scroll-mt-24">
          <Card
            title="Trail map"
            right={
              hasAnyPersonSelected ? (
                <Badge tone="orange">
                  {selectedPersonKeys.size === 1
                    ? `Focused: ${
                        people.find((p) => selectedPersonKeys.has(p.key))
                          ?.label ?? "—"
                      }`
                    : `Focused: ${selectedPersonKeys.size} people`}
                </Badge>
              ) : undefined
            }
          >
            {eventsWithCoords.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--card-border)] bg-white p-4 text-sm text-[var(--muted)]">
                No coordinates available yet across data sources.
              </div>
            ) : (
              <MapView
                events={eventsWithCoords}
                highlightPersonKeys={selectedPersonKeysArray}
                visiblePersonKeys={visibleTrailKeys}
                personColors={personColorMap}
                height="clamp(280px, 55vh, 460px)"
                focusRequest={pinpointRequest}
                spotlightEventId={
                  pinpointRequest && pinpointRequest.id === selectedEventId
                    ? pinpointRequest.id
                    : null
                }
                onSelectEvent={(id) => {
                  const ev = canonicalEvents.find((e) => e.id === id);
                  if (!ev) return;
                  setSelectedPersonKeys((prev) => {
                    if (prev.has(ev.personKey)) return prev;
                    const next = new Set(prev);
                    next.add(ev.personKey);
                    return next;
                  });
                  setSelectedEventId(ev.id);
                }}
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
                    const focused = selectedPersonKeys.has(p.key);
                    const color = personColorMap.get(p.key) ?? "#999";
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => toggleTrail(p.key)}
                        onDoubleClick={() => selectOnlyPerson(p.key)}
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
              right={
                <div className="flex items-center gap-2">
                  {hasAnyPersonSelected ? (
                    <Badge tone="orange">
                      {selectedPersonKeys.size} selected
                    </Badge>
                  ) : null}
                  <Badge tone="navy">{people.length}</Badge>
                </div>
              }
            >
              <div className="mb-3 space-y-2">
                <Input
                  aria-label="Search people"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people…"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={toggleSelectAllPeople}
                    disabled={people.length === 0}
                    className="rounded-lg border border-[var(--card-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--navy-700)] hover:bg-[rgba(19,48,107,0.05)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {allPeopleSelected ? "Deselect all" : "Select all"}
                  </button>
                  {hasAnyPersonSelected ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPersonKeys(new Set());
                        setSelectedEventId(null);
                      }}
                      className="rounded-lg border border-[var(--card-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--navy-700)] hover:bg-[rgba(19,48,107,0.05)]"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
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
                <div className="max-h-[50vh] overflow-auto pr-1 lg:max-h-[62vh]">
                  <ul className="space-y-1">
                    {people.map((p) => {
                      const active = selectedPersonKeys.has(p.key);
                      return (
                        <li key={p.key}>
                          <button
                            aria-pressed={active}
                            className={[
                              "w-full rounded-xl border px-3 py-2 text-left shadow-[var(--shadow-sm)] transition-colors",
                              active
                                ? "border-[rgba(255,122,26,0.4)] bg-[rgba(255,122,26,0.06)]"
                                : "border-[var(--card-border)] bg-white hover:bg-[rgba(19,48,107,0.03)]",
                            ].join(" ")}
                            onClick={() => togglePerson(p.key)}
                            onDoubleClick={() => selectOnlyPerson(p.key)}
                            title={
                              active
                                ? "Click to deselect · double-click to keep only this person"
                                : "Click to add to selection · double-click to select only this person"
                            }
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
                hasAnyPersonSelected ? (
                  <div className="flex flex-wrap items-center gap-2">
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
                  disabled={!hasAnyPersonSelected}
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
                  disabled={!hasAnyPersonSelected}
                />
              </div>

              {!hasAnyPersonSelected ? (
                <div className="rounded-xl border border-dashed border-[var(--card-border)] bg-white p-4 text-sm text-[var(--muted)]">
                  Choose someone from the People list to see linked records
                  across sources.
                </div>
              ) : selectedEvents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--card-border)] bg-white p-4 text-sm text-[var(--muted)]">
                  No events match the current filters.
                </div>
              ) : viewMode === "timeline" ? (
                <div className="max-h-[55vh] overflow-auto pr-1 lg:max-h-[62vh]">
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
                            onDoubleClick={() => pinpointEvent(ev.id)}
                            title="Double-click to pinpoint on the map"
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
                                  {selectedPersonKeys.size > 1 ? (
                                    <Badge tone="orange">
                                      {ev.personLabel || "Unknown"}
                                    </Badge>
                                  ) : null}
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
                <div className="max-h-[55vh] overflow-auto pr-1 lg:max-h-[62vh]">
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
                              onDoubleClick={() => pinpointEvent(ev.id)}
                              title="Double-click to pinpoint on the map"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-[var(--navy-900)]">
                                    {ev.summary}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                                    {selectedPersonKeys.size > 1 ? (
                                      <Badge tone="orange">
                                        {ev.personLabel || "Unknown"}
                                      </Badge>
                                    ) : null}
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
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 rounded-xl border border-[var(--card-border)] bg-white p-1 shadow-[var(--shadow-sm)]">
                      <button
                        type="button"
                        className={[
                          "h-7 rounded-lg px-2.5 text-[11px] font-semibold transition-colors",
                          detailView === "readable"
                            ? "bg-[var(--navy-700)] text-white"
                            : "text-[var(--muted)] hover:bg-[rgba(19,48,107,0.06)]",
                        ].join(" ")}
                        onClick={() => setDetailView("readable")}
                        aria-pressed={detailView === "readable"}
                      >
                        Readable
                      </button>
                      <button
                        type="button"
                        className={[
                          "h-7 rounded-lg px-2.5 text-[11px] font-semibold transition-colors",
                          detailView === "raw"
                            ? "bg-[var(--orange-500)] text-white"
                            : "text-[var(--muted)] hover:bg-[rgba(19,48,107,0.06)]",
                        ].join(" ")}
                        onClick={() => setDetailView("raw")}
                        aria-pressed={detailView === "raw"}
                      >
                        Raw JSON
                      </button>
                    </div>
                    <Badge tone="orange">
                      {SOURCE_LABEL[selectedEvent.source]}
                    </Badge>
                  </div>
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

                  {detailView === "readable" ? (
                    <div className="max-h-[55vh] overflow-auto pr-1 lg:max-h-[62vh]">
                      <EventDetails event={selectedEvent} />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--card-border)] bg-[rgba(19,48,107,0.03)] p-2 text-xs text-[var(--muted)]">
                      <div className="mb-1 font-medium text-[var(--navy-900)]">
                        Raw JSON
                      </div>
                      <pre className="max-h-[44vh] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-[var(--navy-900)]">
                        {JSON.stringify(selectedEvent.raw, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        </section>

        <section
          id="suspects"
          aria-labelledby="suspects-title"
          className="flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-[3px] w-8 rounded-full"
                  style={{ backgroundImage: "var(--chip-gradient)" }}
                />
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Suspicion engine
                </span>
              </div>
              <h2
                id="suspects-title"
                className="text-lg font-semibold text-[var(--navy-900)] sm:text-xl"
              >
                Who took <span className="text-gradient">Podo</span>?
              </h2>
              <p className="text-xs text-[var(--muted)] sm:text-sm">
                An algorithmic suspicion ranking built from co-location,
                co-mentions, anonymous tips, and last-seen proximity.
              </p>
            </div>
            <Badge tone="rose">
              {suspectAnalysis.suspects.length} ranked
            </Badge>
          </div>

          <SuspectBoard
            analysis={suspectAnalysis}
            personColors={personColorMap}
            onSelectSuspect={focusSuspectOnMap}
            onInspectEvent={pinpointEvent}
          />
        </section>
      </main>

    </div>
  );
}
