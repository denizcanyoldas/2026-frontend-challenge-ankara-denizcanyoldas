"use client";

import { ReactNode, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import {
  SuspectAnalysis,
  SuspectScore,
  SuspectSignalKind,
} from "@/lib/analysis/suspects";
import { colorForPerson } from "@/lib/colors";

type Props = {
  analysis: SuspectAnalysis;
  personColors?: Map<string, string>;
  onSelectSuspect?: (personKey: string) => void;
  onInspectEvent?: (eventId: string) => void;
};

const SIGNAL_META: Record<
  SuspectSignalKind,
  { label: string; icon: ReactNode; tone: "navy" | "orange" | "rose" | "green" }
> = {
  co_location: {
    label: "Co-location",
    icon: <IconPin />,
    tone: "orange",
  },
  co_mention: {
    label: "Co-mention with Podo",
    icon: <IconUsers />,
    tone: "navy",
  },
  anon_tip: {
    label: "Anonymous tips",
    icon: <IconWhisper />,
    tone: "rose",
  },
  last_seen: {
    label: "Last-seen proximity",
    icon: <IconEye />,
    tone: "orange",
  },
};

function IconPin() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 21s-7-7.58-7-12a7 7 0 1 1 14 0c0 4.42-7 12-7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M21 19c0-2.3-1.8-4-4-4" />
    </svg>
  );
}

function IconWhisper() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 18v-8a6 6 0 0 1 12 0c0 6-4 8-4 8" />
      <path d="M14 22s3-1 3-5" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function suspicionLabel(pct: number): string {
  if (pct >= 85) return "Prime suspect";
  if (pct >= 60) return "Strong suspicion";
  if (pct >= 35) return "Person of interest";
  if (pct >= 15) return "Low suspicion";
  return "Weak signal";
}

function percentOf(score: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((score / max) * 100);
}

function SignalChip({
  kind,
  points,
  label,
  detail,
}: {
  kind: SuspectSignalKind;
  points: number;
  label: string;
  detail: string;
}) {
  const meta = SIGNAL_META[kind];
  const toneClass =
    meta.tone === "orange"
      ? "border-[rgba(255,122,26,0.3)] bg-[rgba(255,122,26,0.08)] text-[#b2530f]"
      : meta.tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : meta.tone === "green"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-[rgba(19,48,107,0.18)] bg-[rgba(19,48,107,0.05)] text-[var(--navy-700)]";

  return (
    <span
      title={detail}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        toneClass,
      ].join(" ")}
    >
      <span className="opacity-80">{meta.icon}</span>
      <span>{label}</span>
      <span className="rounded-md bg-white/70 px-1 py-[1px] text-[10px] font-bold text-[var(--navy-900)]">
        +{points}
      </span>
    </span>
  );
}

function SuspectCard({
  rank,
  suspect,
  color,
  expandedDefault = false,
  onSelectSuspect,
  onInspectEvent,
}: {
  rank: number;
  suspect: SuspectScore;
  color: string;
  expandedDefault?: boolean;
  onSelectSuspect?: (personKey: string) => void;
  onInspectEvent?: (eventId: string) => void;
}) {
  const [expanded, setExpanded] = useState(expandedDefault);
  const pct = percentOf(suspect.totalScore, suspect.maxScore);
  const label = suspicionLabel(pct);
  const showPodium = rank <= 3;

  const medalColor =
    rank === 1 ? "#f59e0b" : rank === 2 ? "#94a3b8" : "#cd7f32";

  return (
    <div
      className={[
        "card-lift rounded-2xl border bg-white shadow-[var(--shadow-sm)]",
        rank === 1
          ? "border-[rgba(255,122,26,0.45)] ring-1 ring-[rgba(255,122,26,0.25)]"
          : "border-[var(--card-border)]",
      ].join(" ")}
    >
      <div className="flex items-center gap-3 p-3 sm:p-4">
        <div
          className="grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-white shadow-[var(--shadow-sm)]"
          style={{ backgroundColor: color }}
          aria-hidden
          title={suspect.personLabel}
        >
          {initials(suspect.personLabel)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {showPodium ? (
              <span
                className="inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: medalColor }}
                aria-label={`Rank ${rank}`}
                title={`Rank ${rank}`}
              >
                {rank}
              </span>
            ) : (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-[rgba(19,48,107,0.06)] text-[10px] font-bold text-[var(--navy-700)]">
                {rank}
              </span>
            )}
            <div className="truncate text-sm font-semibold text-[var(--navy-900)]">
              {suspect.personLabel}
            </div>
            <Badge tone={rank === 1 ? "orange" : "navy"}>{label}</Badge>
          </div>

          <div className="mt-1 flex items-center gap-2">
            <div
              className="h-2 flex-1 overflow-hidden rounded-full bg-[rgba(19,48,107,0.06)]"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${suspect.personLabel} suspicion ${pct}%`}
            >
              <div
                className={[
                  "h-full rounded-full transition-[width] duration-700",
                  rank === 1 ? "shimmer-track" : "",
                ].join(" ")}
                style={{
                  width: `${Math.max(pct, 4)}%`,
                  backgroundImage:
                    rank === 1
                      ? "linear-gradient(90deg, #ff7a1a, #ffc93a, #ff4d4f)"
                      : `linear-gradient(90deg, ${color}, ${color})`,
                }}
              />
            </div>
            <div className="shrink-0 text-right">
              <div className="text-base font-semibold leading-none text-[var(--navy-900)]">
                {suspect.totalScore}
                <span className="ml-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  pts
                </span>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-lg border border-[var(--card-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--navy-700)] hover:bg-[rgba(19,48,107,0.05)]"
          aria-expanded={expanded}
        >
          {expanded ? "Hide" : "Breakdown"}
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-[var(--card-border)] bg-[rgba(19,48,107,0.02)] p-3 sm:p-4">
          <div className="flex flex-wrap gap-1.5">
            {suspect.signals.map((s, idx) => (
              <SignalChip
                key={`${s.kind}-${idx}`}
                kind={s.kind}
                points={s.points}
                label={s.label}
                detail={s.detail}
              />
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {onSelectSuspect ? (
              <button
                type="button"
                onClick={() => onSelectSuspect(suspect.personKey)}
                className="rounded-lg border border-[var(--card-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--navy-700)] hover:bg-[rgba(19,48,107,0.05)]"
              >
                Focus on map
              </button>
            ) : null}
            {onInspectEvent &&
              suspect.signals[0]?.relatedEventIds[0] &&
              (() => {
                const evId = suspect.signals[0].relatedEventIds[0];
                return (
                  <button
                    type="button"
                    onClick={() => onInspectEvent(evId)}
                    className="rounded-lg border border-[var(--card-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--navy-700)] hover:bg-[rgba(19,48,107,0.05)]"
                  >
                    Open key record
                  </button>
                );
              })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SuspectBoard({
  analysis,
  personColors,
  onSelectSuspect,
  onInspectEvent,
}: Props) {
  const { suspects, victimLabel, totalPoints } = analysis;

  if (suspects.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-dashed border-[var(--card-border)] bg-white p-6 text-center text-sm text-[var(--muted)]">
        Not enough evidence yet to score suspects for {victimLabel}.
      </div>
    );
  }

  const prime = suspects[0];
  const primeColor = colorForPerson(prime.personKey, personColors);
  const primePct = percentOf(prime.totalScore, prime.maxScore);
  const primeLabel = suspicionLabel(primePct);

  return (
    <div className="space-y-4">
      {/* Prime suspect hero */}
      <div className="animate-glow relative overflow-hidden rounded-[var(--radius)] border border-[rgba(255,122,26,0.4)] bg-gradient-to-br from-[#fff7f0] via-white to-[#f7f9ff]">
        {/* Soft gradient blobs to make the card feel alive. */}
        <span
          aria-hidden
          className="floating-orb floating-orb--sun pointer-events-none absolute -right-24 -top-24"
          style={{ width: 260, height: 260, animationDuration: "13s" }}
        />
        <span
          aria-hidden
          className="floating-orb floating-orb--rose pointer-events-none absolute -bottom-20 left-1/3"
          style={{
            width: 180,
            height: 180,
            animationDuration: "15s",
            animationDelay: "-4s",
            opacity: 0.35,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full opacity-30 blur-3xl"
          style={{ background: primeColor }}
        />

        <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
          <div className="relative shrink-0">
            <div
              className="animate-float grid size-16 place-items-center rounded-2xl text-xl font-bold text-white shadow-[var(--shadow)] ring-2 ring-white/70"
              style={{ backgroundColor: primeColor }}
              aria-hidden
            >
              {initials(prime.personLabel)}
            </div>
            {/* Sparkle flare — pure CSS star drawn with radial gradient. */}
            <span
              aria-hidden
              className="animate-sparkle pointer-events-none absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full text-xs text-white"
              style={{
                background:
                  "radial-gradient(circle at 30% 30%, #fff, #ffc93a 50%, #ff7a1a 100%)",
                boxShadow: "0 0 12px rgba(255,201,58,0.75)",
              }}
            >
              <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
                <path
                  d="M12 2l2.39 5.26L20 8l-4.5 3.85L17 18l-5-3-5 3 1.5-6.15L4 8l5.61-.74L12 2z"
                  fill="#fff"
                />
              </svg>
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="orange">Prime suspect</Badge>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#b2530f] shadow-[var(--shadow-sm)]">
                <span className="live-dot" aria-hidden />
                {primeLabel}
              </span>
            </div>
            <div className="mt-1 truncate text-2xl font-semibold text-[var(--navy-900)] sm:text-3xl">
              {prime.personLabel}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {prime.signals.map((s, idx) => (
                <SignalChip
                  key={`${s.kind}-${idx}`}
                  kind={s.kind}
                  points={s.points}
                  label={s.label}
                  detail={s.detail}
                />
              ))}
            </div>
          </div>
          <div className="flex items-end gap-3 sm:flex-col sm:items-end">
            <div className="text-right">
              <div
                className="bg-clip-text text-4xl font-bold leading-none text-transparent sm:text-5xl"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #ff4d4f 0%, #ff7a1a 55%, #ffc93a 100%)",
                }}
              >
                {prime.totalScore}
              </div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">
                suspicion pts
              </div>
            </div>
            {onSelectSuspect ? (
              <button
                type="button"
                onClick={() => onSelectSuspect(prime.personKey)}
                className="card-lift rounded-xl border border-[rgba(255,122,26,0.35)] bg-white px-3 py-1.5 text-xs font-semibold text-[#b2530f] shadow-[var(--shadow-sm)] hover:bg-[rgba(255,122,26,0.05)]"
              >
                Focus on map →
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Full ranked list */}
      <div className="stagger-pop space-y-2">
        {suspects.map((s, idx) => (
          <SuspectCard
            key={s.personKey}
            rank={idx + 1}
            suspect={s}
            color={colorForPerson(s.personKey, personColors)}
            expandedDefault={idx === 0}
            onSelectSuspect={onSelectSuspect}
            onInspectEvent={onInspectEvent}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--card-border)] bg-white/60 px-3 py-2 text-[11px] text-[var(--muted)]">
        <div>
          <span className="font-semibold text-[var(--navy-700)]">
            Heuristic scoring.
          </span>{" "}
          Co-location (±6 h / 400 m) = 2 pts/event · Co-mention with{" "}
          {victimLabel} = 3 pts · Named in anonymous tip = 3 pts · Closest to
          last known Podo location = 5 pts.
        </div>
        <div className="shrink-0">
          {suspects.length} suspect{suspects.length === 1 ? "" : "s"} ·{" "}
          {totalPoints} total pts distributed
        </div>
      </div>
    </div>
  );
}
