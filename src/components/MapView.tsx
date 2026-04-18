"use client";

import { useEffect, useMemo, useRef } from "react";
import type {
  Map as LeafletMap,
  Marker as LeafletMarker,
  Polyline as LeafletPolyline,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import { EventItem } from "@/lib/types";
import { buildPersonColorMap, colorForPerson } from "@/lib/colors";

type Props = {
  events: EventItem[];
  highlightPersonKey?: string | null;
  visiblePersonKeys?: string[] | null;
  personColors?: Map<string, string>;
  height?: number;
  onSelectEvent?: (id: string) => void;
  onToggleTrail?: (key: string) => void;
};

const FALLBACK_CENTER: [number, number] = [39.9208, 32.8541]; // Ankara
const FALLBACK_ZOOM = 11;

function buildNumberedPinSvg(
  color: string,
  index: number,
  opts: { dim?: boolean; highlighted?: boolean } = {}
) {
  const { dim = false, highlighted = false } = opts;
  const opacity = dim ? 0.35 : 1;
  const label = index > 99 ? "99+" : String(index);
  const fontSize = label.length >= 3 ? 9 : label.length === 2 ? 11 : 12;
  const strokeWidth = highlighted ? 1.6 : 1.1;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44" style="opacity:${opacity}; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.25));">
      <path d="M16 1.5c-7.7 0-14 5.87-14 13.1 0 9.54 11.85 26.99 13.28 29.08.35.52 1.09.52 1.44 0C18.15 41.59 30 24.14 30 14.6 30 7.37 23.7 1.5 16 1.5z"
        fill="${color}" stroke="#0b0b0b" stroke-opacity="0.45" stroke-width="${strokeWidth}"/>
      <circle cx="16" cy="14" r="8.2" fill="#ffffff" stroke="${color}" stroke-width="1.2"/>
      <text x="16" y="14" text-anchor="middle" dominant-baseline="central"
        font-family="system-ui, -apple-system, Segoe UI, sans-serif"
        font-size="${fontSize}" font-weight="800" fill="${color}">${label}</text>
    </svg>
  `;
}

const SOURCE_LABEL_MAP: Record<string, string> = {
  checkins: "Checkin",
  messages: "Message",
  sightings: "Sighting",
  personal_notes: "Note",
  anon_tips: "Tip",
};

export default function MapView({
  events,
  highlightPersonKey,
  visiblePersonKeys,
  personColors,
  height = 380,
  onSelectEvent,
  onToggleTrail,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);
  const polylinesRef = useRef<LeafletPolyline[]>([]);

  const withCoords = useMemo(
    () => events.filter((e) => e.coordinates),
    [events]
  );

  const colorMap = useMemo(() => {
    if (personColors && personColors.size > 0) return personColors;
    return buildPersonColorMap(withCoords.map((e) => e.personKey));
  }, [personColors, withCoords]);

  const visibleSet = useMemo(() => {
    if (!visiblePersonKeys) return null;
    return new Set(visiblePersonKeys);
  }, [visiblePersonKeys]);

  const personGroups = useMemo(() => {
    const map = new Map<
      string,
      { label: string; color: string; events: EventItem[] }
    >();
    for (const ev of withCoords) {
      const prior = map.get(ev.personKey);
      if (prior) {
        prior.events.push(ev);
      } else {
        map.set(ev.personKey, {
          label: ev.personLabel || "Unknown",
          color: colorForPerson(ev.personKey || "unknown", colorMap),
          events: [ev],
        });
      }
    }
    for (const g of map.values()) {
      g.events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return map;
  }, [withCoords, colorMap]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!containerRef.current || mapRef.current) return;
      const L = (await import("leaflet")).default;
      if (cancelled) return;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView(FALLBACK_CENTER, FALLBACK_ZOOM);

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 20,
        }
      ).addTo(map);

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = [];
        polylinesRef.current = [];
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      if (!map || cancelled) return;

      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
      for (const p of polylinesRef.current) p.remove();
      polylinesRef.current = [];

      if (withCoords.length === 0) {
        map.setView(FALLBACK_CENTER, FALLBACK_ZOOM);
        return;
      }

      const bounds = L.latLngBounds([]);

      // Draw trails first so markers render above them.
      for (const [key, group] of personGroups) {
        if (visibleSet && !visibleSet.has(key)) continue;
        if (group.events.length < 2) continue;

        const isHighlighted = !highlightPersonKey || key === highlightPersonKey;

        const latlngs = group.events.map(
          (ev) =>
            [ev.coordinates!.lat, ev.coordinates!.lng] as [number, number]
        );

        // Outer halo for the highlighted person so the active trail pops.
        if (highlightPersonKey && key === highlightPersonKey) {
          const halo = L.polyline(latlngs, {
            color: group.color,
            weight: 8,
            opacity: 0.18,
            lineCap: "round",
            lineJoin: "round",
            interactive: false,
          }).addTo(map);
          polylinesRef.current.push(halo);
        }

        const trail = L.polyline(latlngs, {
          color: group.color,
          weight: isHighlighted ? 3.6 : 2.2,
          opacity: isHighlighted ? 0.95 : 0.32,
          dashArray: "6, 8",
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(map);
        polylinesRef.current.push(trail);
      }

      for (const [key, group] of personGroups) {
        if (visibleSet && !visibleSet.has(key)) continue;

        const isHighlighted =
          !highlightPersonKey || key === highlightPersonKey;

        group.events.forEach((ev, idx) => {
          const c = ev.coordinates!;
          const orderNumber = idx + 1;

          const icon = L.divIcon({
            className: "custom-numbered-pin",
            html: buildNumberedPinSvg(group.color, orderNumber, {
              dim: !isHighlighted,
              highlighted:
                !!highlightPersonKey && key === highlightPersonKey,
            }),
            iconSize: [32, 44],
            iconAnchor: [16, 42],
            popupAnchor: [0, -38],
          });

          const marker = L.marker([c.lat, c.lng], {
            icon,
            title: `${group.label} · stop ${orderNumber}`,
            riseOnHover: true,
            zIndexOffset: isHighlighted ? 1000 : 0,
          }).addTo(map);

          const when = new Date(ev.createdAt).toLocaleString();
          const safeLabel = escapeHtml(group.label);
          const safeSummary = escapeHtml(ev.summary);
          const safeLocation = ev.location ? escapeHtml(ev.location) : "";
          const safeSource = escapeHtml(
            SOURCE_LABEL_MAP[ev.source] ?? ev.source
          );
          const totalStops = group.events.length;

          marker.bindTooltip(
            `${safeLabel} · stop ${orderNumber}/${totalStops}`,
            {
              direction: "top",
              offset: [0, -36],
              className: "red-pin-tooltip",
              permanent: false,
            }
          );

          marker.bindPopup(
            `
            <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; min-width: 240px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="display:inline-grid; place-items:center; width:20px; height:20px; border-radius:999px; background:${group.color}; color:#fff; font-size:11px; font-weight:700;">${orderNumber}</span>
                <span style="font-weight: 700; color: #0b1d3a; font-size: 14px;">${safeLabel}</span>
                <span style="margin-left:auto; font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:rgba(11,29,58,0.6);">${safeSource}</span>
              </div>
              <div style="margin-top: 6px; color: rgba(11,29,58,0.6); font-size: 11px; font-weight:600;">
                Stop ${orderNumber} of ${totalStops}
              </div>
              <div style="margin-top: 6px; color: #0b1d3a; font-size: 12px;">${safeSummary}</div>
              <div style="margin-top: 6px; color: rgba(11,29,58,0.6); font-size: 11px;">
                ${when}${safeLocation ? " &middot; " + safeLocation : ""}
              </div>
            </div>
            `
          );

          if (onSelectEvent) {
            marker.on("click", () => onSelectEvent(ev.id));
          }

          if (isHighlighted) bounds.extend([c.lat, c.lng]);
          markersRef.current.push(marker);
        });
      }

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    withCoords,
    personGroups,
    highlightPersonKey,
    onSelectEvent,
    visibleSet,
  ]);

  const legend = useMemo(() => {
    return Array.from(personGroups.entries())
      .map(([key, g]) => ({
        key,
        label: g.label,
        color: g.color,
        count: g.events.length,
      }))
      .sort((a, b) => b.count - a.count);
  }, [personGroups]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--card-border)] bg-white shadow-[var(--shadow-sm)]"
        style={{ height }}
        role="region"
        aria-label="Sightings map"
      />
      {legend.length > 0 ? (
        <div
          className="absolute bottom-3 left-3 z-[500] flex max-h-[75%] w-[280px] flex-col overflow-hidden rounded-xl border border-[var(--card-border)] bg-white/95 shadow-[var(--shadow-sm)] backdrop-blur"
          aria-label="Trail selector"
        >
          <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Trails ({legend.length})
            </span>
            {onToggleTrail ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-[var(--navy-700)] hover:bg-[rgba(19,48,107,0.08)]"
                  onClick={() => {
                    for (const item of legend) {
                      if (visibleSet && !visibleSet.has(item.key)) {
                        onToggleTrail(item.key);
                      }
                    }
                  }}
                >
                  All
                </button>
                <span className="text-[10px] text-[var(--muted)]">·</span>
                <button
                  type="button"
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-[var(--navy-700)] hover:bg-[rgba(19,48,107,0.08)]"
                  onClick={() => {
                    for (const item of legend) {
                      if (!visibleSet || visibleSet.has(item.key)) {
                        onToggleTrail(item.key);
                      }
                    }
                  }}
                >
                  None
                </button>
              </div>
            ) : null}
          </div>
          <ul className="flex-1 space-y-0.5 overflow-auto px-1.5 pb-2">
            {legend.map((item) => {
              const visible = !visibleSet || visibleSet.has(item.key);
              const focused =
                !!highlightPersonKey && item.key === highlightPersonKey;
              const dim = !visible;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onToggleTrail?.(item.key)}
                    className={[
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                      focused
                        ? "bg-[rgba(255,122,26,0.1)]"
                        : "hover:bg-[rgba(19,48,107,0.06)]",
                    ].join(" ")}
                    style={{ opacity: dim ? 0.45 : 1 }}
                    title={
                      visible ? "Hide this trail" : "Show this trail"
                    }
                    aria-pressed={visible}
                  >
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 shrink-0 rounded-full border"
                      style={{
                        backgroundColor: visible ? item.color : "transparent",
                        borderColor: item.color,
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--navy-900)]">
                      {item.label}
                    </span>
                    <span className="shrink-0 rounded-md bg-[rgba(19,48,107,0.06)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--navy-700)]">
                      {item.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
