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
};

const FALLBACK_CENTER: [number, number] = [39.9208, 32.8541]; // Ankara
const FALLBACK_ZOOM = 11;

function buildNumberedPinSvg(
  color: string,
  index: number,
  opts: { dim?: boolean; highlighted?: boolean; badge?: number } = {}
) {
  const { dim = false, highlighted = false, badge = 0 } = opts;
  const opacity = dim ? 0.35 : 1;
  const label = index > 99 ? "99+" : String(index);
  const fontSize = label.length >= 3 ? 9 : label.length === 2 ? 11 : 12;
  const strokeWidth = highlighted ? 1.6 : 1.1;
  const badgeLabel = badge > 0 ? (badge > 99 ? "99+" : `×${badge}`) : "";
  const badgeFont = badgeLabel.length >= 3 ? 7.5 : 8.5;
  const badgeSvg = badge > 0
    ? `
      <g>
        <circle cx="28" cy="8" r="6.5" fill="#0b1d3a" stroke="#ffffff" stroke-width="1.2"/>
        <text x="28" y="8" text-anchor="middle" dominant-baseline="central"
          font-family="system-ui, -apple-system, Segoe UI, sans-serif"
          font-size="${badgeFont}" font-weight="800" fill="#ffffff">${badgeLabel}</text>
      </g>
    `
    : "";
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48" style="opacity:${opacity}; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.25));">
      <path d="M18 3.5c-7.7 0-14 5.87-14 13.1 0 9.54 11.85 26.99 13.28 29.08.35.52 1.09.52 1.44 0C20.15 43.59 32 26.14 32 16.6 32 9.37 25.7 3.5 18 3.5z"
        fill="${color}" stroke="#0b0b0b" stroke-opacity="0.45" stroke-width="${strokeWidth}"/>
      <circle cx="18" cy="16" r="8.2" fill="#ffffff" stroke="${color}" stroke-width="1.2"/>
      <text x="18" y="16" text-anchor="middle" dominant-baseline="central"
        font-family="system-ui, -apple-system, Segoe UI, sans-serif"
        font-size="${fontSize}" font-weight="800" fill="${color}">${label}</text>
      ${badgeSvg}
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
      {
        label: string;
        color: string;
        events: EventItem[];
        clusters: {
          lat: number;
          lng: number;
          stopNumber: number;
          events: EventItem[];
        }[];
      }
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
          clusters: [],
        });
      }
    }
    const round = (n: number) => Math.round(n * 1e5) / 1e5;
    for (const g of map.values()) {
      g.events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      g.clusters = [];
      for (const ev of g.events) {
        const c = ev.coordinates!;
        const last = g.clusters[g.clusters.length - 1];
        if (
          last &&
          round(last.lat) === round(c.lat) &&
          round(last.lng) === round(c.lng)
        ) {
          last.events.push(ev);
        } else {
          g.clusters.push({
            lat: c.lat,
            lng: c.lng,
            stopNumber: g.clusters.length + 1,
            events: [ev],
          });
        }
      }
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
        if (group.clusters.length < 2) continue;

        const isHighlighted = !highlightPersonKey || key === highlightPersonKey;

        const latlngs = group.clusters.map(
          (cl) => [cl.lat, cl.lng] as [number, number]
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

        const totalStops = group.clusters.length;
        const safeLabel = escapeHtml(group.label);

        for (const cluster of group.clusters) {
          const orderNumber = cluster.stopNumber;

          const icon = L.divIcon({
            className: "custom-numbered-pin",
            html: buildNumberedPinSvg(group.color, orderNumber, {
              dim: !isHighlighted,
              highlighted:
                !!highlightPersonKey && key === highlightPersonKey,
              badge: cluster.events.length > 1 ? cluster.events.length : 0,
            }),
            iconSize: [36, 48],
            iconAnchor: [18, 44],
            popupAnchor: [0, -40],
          });

          const marker = L.marker([cluster.lat, cluster.lng], {
            icon,
            title: `${group.label} · stop ${orderNumber}`,
            riseOnHover: true,
            zIndexOffset: isHighlighted ? 1000 : 0,
          }).addTo(map);

          marker.bindTooltip(
            cluster.events.length > 1
              ? `${safeLabel} · stop ${orderNumber}/${totalStops} (${cluster.events.length} events)`
              : `${safeLabel} · stop ${orderNumber}/${totalStops}`,
            {
              direction: "top",
              offset: [0, -40],
              className: "red-pin-tooltip",
              permanent: false,
            }
          );

          const firstEvent = cluster.events[0];
          const firstLocation = firstEvent.location
            ? escapeHtml(firstEvent.location)
            : "";

          let popupBody = "";
          if (cluster.events.length === 1) {
            const ev = firstEvent;
            const when = new Date(ev.createdAt).toLocaleString();
            const safeSummary = escapeHtml(ev.summary);
            const safeSource = escapeHtml(
              SOURCE_LABEL_MAP[ev.source] ?? ev.source
            );
            popupBody = `
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
                ${when}${firstLocation ? " &middot; " + firstLocation : ""}
              </div>
            `;
          } else {
            const items = cluster.events
              .map((ev) => {
                const when = new Date(ev.createdAt).toLocaleString();
                const safeSummary = escapeHtml(ev.summary);
                const safeSource = escapeHtml(
                  SOURCE_LABEL_MAP[ev.source] ?? ev.source
                );
                return `
                  <li style="display:flex; gap:8px; padding:6px 0; border-top:1px solid rgba(11,29,58,0.08);">
                    <div style="min-width:0; flex:1;">
                      <div style="color:#0b1d3a; font-size:12px; font-weight:600;">
                        ${safeSummary}
                        <span style="margin-left:6px; font-size:9px; text-transform:uppercase; letter-spacing:.04em; color:rgba(11,29,58,0.55); font-weight:700;">${safeSource}</span>
                      </div>
                      <div style="color: rgba(11,29,58,0.6); font-size: 11px;">${when}</div>
                    </div>
                  </li>
                `;
              })
              .join("");
            popupBody = `
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="display:inline-grid; place-items:center; width:22px; height:22px; border-radius:999px; background:${group.color}; color:#fff; font-size:11px; font-weight:700;">${orderNumber}</span>
                <span style="font-weight: 700; color: #0b1d3a; font-size: 14px;">${safeLabel}</span>
                <span style="margin-left:auto; font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:rgba(11,29,58,0.6);">${cluster.events.length} events</span>
              </div>
              <div style="margin-top: 6px; color: rgba(11,29,58,0.6); font-size: 11px; font-weight:600;">
                Stop ${orderNumber} of ${totalStops}${firstLocation ? " &middot; " + firstLocation : ""}
              </div>
              <ul style="list-style:none; padding:4px 0 0; margin:6px 0 0;">${items}</ul>
            `;
          }

          marker.bindPopup(
            `<div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; min-width: 240px; max-width: 280px;">${popupBody}</div>`
          );

          if (onSelectEvent) {
            marker.on("click", () => onSelectEvent(firstEvent.id));
          }

          if (isHighlighted) bounds.extend([cluster.lat, cluster.lng]);
          markersRef.current.push(marker);
        }
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

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--card-border)] bg-white shadow-[var(--shadow-sm)]"
        style={{ height }}
        role="region"
        aria-label="Sightings map"
      />
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
