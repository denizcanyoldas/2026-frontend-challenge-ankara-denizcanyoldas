"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
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

export default function MapView({
  events,
  highlightPersonKey,
  height = 360,
  onSelectEvent,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);

  const withCoords = useMemo(
    () => events.filter((e) => e.coordinates),
    [events]
  );

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

      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);

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
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      if (!map || cancelled) return;

      for (const m of markersRef.current) {
        m.remove();
      }
      markersRef.current = [];

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

        marker.bindTooltip(safeLabel, {
          direction: "top",
          offset: [0, -34],
          className: "red-pin-tooltip",
          permanent: false,
        });

        marker.bindPopup(
          `
          <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; min-width: 200px;">
            <div style="font-weight: 700; color: #0b1d3a; font-size: 14px;">${safeLabel}</div>
            <div style="margin-top: 4px; color: #0b1d3a; font-size: 12px;">${safeSummary}</div>
            <div style="margin-top: 6px; color: rgba(11,29,58,0.6); font-size: 11px;">
              ${when}${safeLocation ? " &middot; " + safeLocation : ""}
            </div>
          </div>
          `
        );

        if (onSelectEvent) {
          marker.on("click", () => onSelectEvent(ev.id));
        }

        if (isHighlighted) {
          bounds.extend([c.lat, c.lng]);
        }
        markersRef.current.push(marker);
      }

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [withCoords, highlightPersonKey, onSelectEvent]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--card-border)] bg-white shadow-[var(--shadow-sm)]"
      style={{ height }}
      role="region"
      aria-label="Sightings map"
    />
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
