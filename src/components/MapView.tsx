"use client";

import { useEffect, useMemo, useRef } from "react";
import type {
  Map as LeafletMap,
  Marker as LeafletMarker,
  Polyline as LeafletPolyline,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import { EventItem } from "@/lib/types";

type Props = {
  events: EventItem[];
  highlightPersonKey?: string | null;
  height?: number;
  onSelectEvent?: (id: string) => void;
};

const FALLBACK_CENTER: [number, number] = [39.9208, 32.8541]; // Ankara
const FALLBACK_ZOOM = 11;

// Distinct, accessible colors; red stays the primary accent for highlighted pins.
const PALETTE = [
  "#d11a1a", // red
  "#1e4fbf", // blue
  "#ff7a1a", // orange
  "#0b8f6a", // teal
  "#7b3ff2", // purple
  "#c57a00", // amber
  "#c71585", // pink
  "#0b1d3a", // navy
];

function colorForPerson(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return PALETTE[(h >>> 0) % PALETTE.length];
}

function buildRedPinSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42">
      <defs>
        <linearGradient id="pinGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ff5a36"/>
          <stop offset="100%" stop-color="#d11a1a"/>
        </linearGradient>
      </defs>
      <path d="M15 1c-7.18 0-13 5.46-13 12.2 0 8.87 11.03 25.1 12.36 27.04a.77.77 0 0 0 1.28 0C16.97 38.3 28 22.07 28 13.2 28 6.46 22.18 1 15 1z"
        fill="url(#pinGrad)" stroke="#6b0f0f" stroke-width="1.2"/>
      <circle cx="15" cy="13" r="5" fill="#ffffff"/>
      <circle cx="15" cy="13" r="2.5" fill="#d11a1a"/>
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
  height = 380,
  onSelectEvent,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);
  const polylinesRef = useRef<LeafletPolyline[]>([]);

  const withCoords = useMemo(
    () => events.filter((e) => e.coordinates),
    [events]
  );

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
          color: colorForPerson(ev.personKey || "unknown"),
          events: [ev],
        });
      }
    }
    for (const g of map.values()) {
      g.events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return map;
  }, [withCoords]);

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

      const redIcon = L.divIcon({
        className: "custom-red-pin",
        html: buildRedPinSvg(),
        iconSize: [30, 42],
        iconAnchor: [15, 40],
        popupAnchor: [0, -36],
      });

      const dimIcon = L.divIcon({
        className: "custom-red-pin dim",
        html: `<div style="opacity:0.35">${buildRedPinSvg()}</div>`,
        iconSize: [30, 42],
        iconAnchor: [15, 40],
        popupAnchor: [0, -36],
      });

      const bounds = L.latLngBounds([]);

      // Draw trails first so markers render above them.
      for (const [key, group] of personGroups) {
        if (group.events.length < 2) continue;

        const isHighlighted = !highlightPersonKey || key === highlightPersonKey;

        const latlngs = group.events.map(
          (ev) =>
            [ev.coordinates!.lat, ev.coordinates!.lng] as [number, number]
        );

        const trail = L.polyline(latlngs, {
          color: group.color,
          weight: isHighlighted ? 3.2 : 2,
          opacity: isHighlighted ? 0.9 : 0.18,
          dashArray: "6, 8",
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(map);

        polylinesRef.current.push(trail);
      }

      for (const ev of withCoords) {
        const c = ev.coordinates!;
        const isHighlighted =
          !highlightPersonKey || ev.personKey === highlightPersonKey;

        const marker = L.marker([c.lat, c.lng], {
          icon: isHighlighted ? redIcon : dimIcon,
          title: ev.personLabel,
          riseOnHover: true,
        }).addTo(map);

        const when = new Date(ev.createdAt).toLocaleString();
        const safeLabel = escapeHtml(ev.personLabel);
        const safeSummary = escapeHtml(ev.summary);
        const safeLocation = ev.location ? escapeHtml(ev.location) : "";
        const safeSource = escapeHtml(SOURCE_LABEL_MAP[ev.source] ?? ev.source);
        const trailColor = colorForPerson(ev.personKey || "unknown");

        marker.bindTooltip(safeLabel, {
          direction: "top",
          offset: [0, -34],
          className: "red-pin-tooltip",
          permanent: false,
        });

        marker.bindPopup(
          `
          <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; min-width: 220px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="display:inline-block; width:10px; height:10px; border-radius:999px; background:${trailColor};"></span>
              <span style="font-weight: 700; color: #0b1d3a; font-size: 14px;">${safeLabel}</span>
              <span style="margin-left:auto; font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:rgba(11,29,58,0.6);">${safeSource}</span>
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
      }

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [withCoords, personGroups, highlightPersonKey, onSelectEvent]);

  // Build a small legend (top N people by event count in view)
  const legend = useMemo(() => {
    const arr = Array.from(personGroups.entries())
      .map(([key, g]) => ({
        key,
        label: g.label,
        color: g.color,
        count: g.events.length,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return arr;
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
          className="pointer-events-none absolute bottom-3 left-3 z-[500] max-w-[60%] rounded-xl border border-[var(--card-border)] bg-white/95 p-2 text-[11px] shadow-[var(--shadow-sm)] backdrop-blur"
          aria-label="Map legend"
        >
          <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Trails
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 px-1">
            {legend.map((item) => {
              const dim =
                highlightPersonKey && item.key !== highlightPersonKey;
              return (
                <li
                  key={item.key}
                  className="flex items-center gap-1.5"
                  style={{ opacity: dim ? 0.4 : 1 }}
                >
                  <span
                    aria-hidden
                    className="inline-block h-[2px] w-5 rounded-full"
                    style={{
                      backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 8px)`,
                      backgroundColor: "transparent",
                      borderBottom: `2px dashed ${item.color}`,
                    }}
                  />
                  <span className="font-medium text-[var(--navy-900)]">
                    {item.label}
                  </span>
                  <span className="text-[var(--muted)]">({item.count})</span>
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
