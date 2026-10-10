"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface InteractiveMapProps {
  selectedLat: number;
  selectedLon: number;
  clickedLat: number | null;
  clickedLon: number | null;
  onMapClick: (lat: number, lon: number) => void;
}

// Pin drawn inline: no dependency on third-party image hosts, works offline / behind proxies.
function pinIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    tooltipAnchor: [14, -28],
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 24 34">
      <path d="M12 1C5.9 1 1 5.9 1 12c0 8.4 11 21 11 21s11-12.6 11-21C23 5.9 18.1 1 12 1z"
            fill="${color}" stroke="#ffffff" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
    </svg>`,
  });
}

const CONFIRMED_ICON = pinIcon("#e03131");
const CLICKED_ICON = pinIcon("#1c7ed6");

export default function InteractiveMap({
  selectedLat,
  selectedLon,
  clickedLat,
  clickedLon,
  onMapClick,
}: InteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const confirmedMarkerRef = useRef<L.Marker | null>(null);
  const clickedMarkerRef = useRef<L.Marker | null>(null);

  // Always call the latest handler without re-creating the map when its identity changes.
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  // Create the map once; destroy it on unmount (tab switch / hot reload / StrictMode).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el).setView([selectedLat || 10.8, selectedLon || 106.7], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      onMapClickRef.current(Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5)));
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      confirmedMarkerRef.current = null;
      clickedMarkerRef.current = null;
    };
    // Initial view only: later location changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Confirmed location marker, and keep it in view when the selection changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    confirmedMarkerRef.current?.remove();
    confirmedMarkerRef.current = L.marker([selectedLat, selectedLon], { icon: CONFIRMED_ICON })
      .addTo(map)
      .bindTooltip("✅ Confirmed Location");
    if (!map.getBounds().contains([selectedLat, selectedLon])) {
      map.panTo([selectedLat, selectedLon]);
    }
  }, [selectedLat, selectedLon]);

  // Pending (clicked, not yet confirmed) marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    clickedMarkerRef.current?.remove();
    clickedMarkerRef.current = null;
    if (clickedLat !== null && clickedLon !== null) {
      clickedMarkerRef.current = L.marker([clickedLat, clickedLon], { icon: CLICKED_ICON })
        .addTo(map)
        .bindTooltip(`📍 Clicked: ${clickedLat}, ${clickedLon}`)
        .openTooltip();
    }
  }, [clickedLat, clickedLon]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-white/10 shadow-lg">
      <div ref={containerRef} className="w-full h-[400px] z-0" />
    </div>
  );
}
