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
  highlightPersonKeys?: string[] | null;
  visiblePersonKeys?: string[] | null;
  personColors?: Map<string, string>;
  /**
   * Height of the map container. Accepts a pixel number or any valid CSS
   * length (e.g. "clamp(280px, 60vh, 420px)") for responsive sizing.
   */
  height?: number | string;
  onSelectEvent?: (id: string) => void;
  /**
   * Request to pan/zoom to a specific event and open its popup. The `seq`
   * field lets callers re-trigger focus on the same event by bumping a
   * counter (otherwise React would see an unchanged prop).
   */
  focusRequest?: { id: string; seq: number } | null;
  /**
   * When set, only the cluster that contains this event renders at full
   * brightness; every other pin on the map is dimmed regardless of the
   * per-person highlight state.
   */
  spotlightEventId?: string | null;
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
  highlightPersonKeys,
  visiblePersonKeys,
  personColors,
  height = 380,
  onSelectEvent,
  focusRequest,
  spotlightEventId,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);
  const polylinesRef = useRef<LeafletPolyline[]>([]);
  // Lookup from an event id to the marker that represents its cluster, so
  // we can pan/zoom to it when a caller requests a pinpoint.
  const markerByEventIdRef = useRef<
    Map<string, { marker: LeafletMarker; lat: number; lng: number }>
  >(new Map());

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

  const highlightSet = useMemo(() => {
    if (!highlightPersonKeys || highlightPersonKeys.length === 0) return null;
    return new Set(highlightPersonKeys);
  }, [highlightPersonKeys]);

  const personGroups = useMemo(() => {
    type Cluster = {
      lat: number;
      lng: number;
      stopNumber: number;
      events: EventItem[];
    };
    const map = new Map<
      string,
      {
        label: string;
        color: string;
        events: EventItem[];
        clusters: Cluster[];
        trailPath: [number, number][];
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
          trailPath: [],
        });
      }
    }
    const round = (n: number) => Math.round(n * 1e5) / 1e5;
    for (const g of map.values()) {
      g.events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      // All same-location events for this person merge into ONE cluster,
      // numbered by the order of the FIRST visit to that location.
      const byLoc = new Map<string, Cluster>();
      const ordered: Cluster[] = [];
      const path: [number, number][] = [];
      for (const ev of g.events) {
        const c = ev.coordinates!;
        const locKey = `${round(c.lat)},${round(c.lng)}`;
        let cluster = byLoc.get(locKey);
        if (!cluster) {
          cluster = {
            lat: c.lat,
            lng: c.lng,
            stopNumber: ordered.length + 1,
            events: [],
          };
          byLoc.set(locKey, cluster);
          ordered.push(cluster);
        }
        cluster.events.push(ev);
        path.push([cluster.lat, cluster.lng]);
      }
      g.clusters = ordered;
      g.trailPath = path;
    }
    return map;
  }, [withCoords, colorMap]);

  // Init + teardown are colocated so the cleanup function always sees the
  // map that its own effect instance created. This avoids a tiny window
  // under React StrictMode where the container could be re-bound before
  // the first async init had a chance to set mapRef.
  useEffect(() => {
    let cancelled = false;
    let createdMap: LeafletMap | null = null;

    (async () => {
      if (!containerRef.current || mapRef.current) return;
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

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

      // If we were cancelled between the await and now, tear down the
      // map we just created instead of publishing it.
      if (cancelled) {
        map.remove();
        return;
      }

      createdMap = map;
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      const m = mapRef.current ?? createdMap;
      if (m) {
        m.remove();
        mapRef.current = null;
        markersRef.current = [];
        polylinesRef.current = [];
        markerByEventIdRef.current.clear();
      }
    };
  }, []);

  // Keep the Leaflet map in sync with its wrapper's actual pixel size.
  // Responsive heights (clamp(), vh) and layout reflows can leave tiles
  // misaligned until the next explicit event; invalidateSize fixes that.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const map = mapRef.current;
      if (map) map.invalidateSize();
    });
    ro.observe(el);
    return () => ro.disconnect();
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
      markerByEventIdRef.current.clear();

      if (withCoords.length === 0) {
        map.setView(FALLBACK_CENTER, FALLBACK_ZOOM);
        return;
      }

      const bounds = L.latLngBounds([]);

      // Determine which person owns the spotlighted event (if any), so we
      // can dim every other person's trail and keep only the owner's
      // trail bright while spotlight is active.
      const spotlightPersonKey =
        spotlightEventId != null
          ? (() => {
              for (const [k, g] of personGroups) {
                for (const c of g.clusters) {
                  if (c.events.some((e) => e.id === spotlightEventId)) return k;
                }
              }
              return null;
            })()
          : null;
      const spotlightActiveOuter = !!spotlightEventId;

      // Draw trails first so markers render above them.
      for (const [key, group] of personGroups) {
        if (visibleSet && !visibleSet.has(key)) continue;
        if (group.trailPath.length < 2) continue;

        const isHighlighted = spotlightActiveOuter
          ? key === spotlightPersonKey
          : !highlightSet || highlightSet.has(key);
        const showHalo = spotlightActiveOuter
          ? key === spotlightPersonKey
          : !!highlightSet && highlightSet.has(key);

        const latlngs = group.trailPath;

        // Outer halo for the highlighted person so the active trail pops.
        if (showHalo) {
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

      // Pre-pass: find clusters from different people that share a location,
      // so we can fan their pins out in a small ring and keep every pin visible.
      const roundKey = (lat: number, lng: number) =>
        `${Math.round(lat * 1e5) / 1e5},${Math.round(lng * 1e5) / 1e5}`;
      const collisions = new Map<string, string[]>();
      for (const [key, group] of personGroups) {
        if (visibleSet && !visibleSet.has(key)) continue;
        for (const cluster of group.clusters) {
          const k = roundKey(cluster.lat, cluster.lng);
          const arr = collisions.get(k);
          if (arr) {
            if (!arr.includes(key)) arr.push(key);
          } else {
            collisions.set(k, [key]);
          }
        }
      }

      for (const [key, group] of personGroups) {
        if (visibleSet && !visibleSet.has(key)) continue;

        const isPersonHighlighted = !highlightSet || highlightSet.has(key);

        const totalStops = group.clusters.length;
        const safeLabel = escapeHtml(group.label);

        for (const cluster of group.clusters) {
          const orderNumber = cluster.stopNumber;

          // Per-cluster visual state. When a spotlight is active, only the
          // cluster that contains the spotlighted event is bright; every
          // other cluster (even other stops of the same person) dims.
          const isSpotlightCluster = Boolean(
            spotlightEventId &&
              cluster.events.some((e) => e.id === spotlightEventId)
          );
          const spotlightActive = !!spotlightEventId;
          const isHighlighted = spotlightActive
            ? isSpotlightCluster
            : isPersonHighlighted;

          // Compute pixel offset so people colliding at this exact location
          // don't hide each other. Each collider gets a slot on a small ring.
          const locKey = roundKey(cluster.lat, cluster.lng);
          const colliders = collisions.get(locKey) ?? [key];
          let dx = 0;
          let dy = 0;
          if (colliders.length > 1) {
            const slot = colliders.indexOf(key);
            const total = colliders.length;
            const angle = (2 * Math.PI * slot) / total - Math.PI / 2;
            const radius = total <= 4 ? 16 : 20;
            dx = Math.round(Math.cos(angle) * radius);
            dy = Math.round(Math.sin(angle) * radius);
          }

          const icon = L.divIcon({
            className: "custom-numbered-pin",
            html: buildNumberedPinSvg(group.color, orderNumber, {
              dim: !isHighlighted,
              highlighted: spotlightActive
                ? isSpotlightCluster
                : !!highlightSet && highlightSet.has(key),
              badge: cluster.events.length > 1 ? cluster.events.length : 0,
            }),
            iconSize: [36, 48],
            iconAnchor: [18 - dx, 44 - dy],
            popupAnchor: [dx, -40 + dy],
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
          for (const ev of cluster.events) {
            markerByEventIdRef.current.set(ev.id, {
              marker,
              lat: cluster.lat,
              lng: cluster.lng,
            });
          }
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
    highlightSet,
    onSelectEvent,
    visibleSet,
    spotlightEventId,
  ]);

  // Pinpoint a specific event when asked. The `seq` field in the request
  // ensures the same event can be re-focused multiple times in a row.
  // The render effect is async (dynamic import of leaflet), so the marker
  // lookup may briefly be empty — retry across a few animation frames
  // before giving up.
  useEffect(() => {
    if (!focusRequest) return;
    let cancelled = false;
    let rafId: number | null = null;
    let moveendHandler: (() => void) | null = null;
    let moveendMap: LeafletMap | null = null;
    let attempts = 0;

    const attempt = () => {
      if (cancelled) return;
      const map = mapRef.current;
      if (!map) return;
      const hit = markerByEventIdRef.current.get(focusRequest.id);
      if (!hit) {
        if (attempts++ < 20) {
          rafId = requestAnimationFrame(attempt);
        }
        return;
      }
      const targetZoom = Math.max(map.getZoom(), 15);
      map.flyTo([hit.lat, hit.lng], targetZoom, {
        duration: 0.6,
        easeLinearity: 0.25,
      });
      // Wait for the animation to finish before opening the popup,
      // otherwise Leaflet can position it off-screen mid-pan.
      const onEnd = () => {
        hit.marker.openPopup();
        map.off("moveend", onEnd);
        moveendHandler = null;
        moveendMap = null;
      };
      moveendHandler = onEnd;
      moveendMap = map;
      map.on("moveend", onEnd);
    };

    attempt();

    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      if (moveendHandler && moveendMap) {
        moveendMap.off("moveend", moveendHandler);
      }
    };
  }, [focusRequest]);

  return (
    <div className="relative isolate z-0">
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
