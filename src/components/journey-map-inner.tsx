"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/cityCoords";

const TEAL = "#1D9E75";

function pulsePin(map: L.Map, at: LatLng, label: string) {
  const icon = L.divIcon({
    className: "journey-pin",
    html: '<span class="journey-pin-ring"></span><span class="journey-pin-dot"></span>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
  L.marker(at, { icon, keyboard: false, title: label }).addTo(map);
}

// Draws the route from departure to destination: a dotted teal line that grows
// over ~1.8s with a travelling dot, then the destination pin pulses in. The
// animation fires once per mount (hasAnimated ref) and never on re-render.
export default function JourneyMapInner({
  from,
  to,
  destinationName,
  fill = false,
}: {
  from: LatLng | null;
  to: LatLng;
  destinationName: string;
  fill?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Create the map on mount; tear it down on unmount. Deps are stable (coords
  // resolve once in the parent), so this runs once per real mount and the route
  // animates a single time — but a Strict-Mode/remount cleanup correctly rebuilds
  // it rather than leaving a dead container.
  useEffect(() => {
    if (!ref.current) return;

    const map = L.map(ref.current, {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      attributionControl: true,
    });
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        subdomains: "abcd",
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap &copy; CARTO",
      },
    ).addTo(map);
    map.invalidateSize();

    // No departure resolved — just centre on the destination and pulse the pin.
    if (!from) {
      map.setView(to, 6);
      pulsePin(map, to, destinationName);
      return () => map.remove();
    }

    map.fitBounds(L.latLngBounds([from, to]), { padding: [36, 36], maxZoom: 9 });
    L.circleMarker(from, {
      radius: 5,
      color: TEAL,
      fillColor: TEAL,
      fillOpacity: 1,
      weight: 0,
    }).addTo(map);

    const line = L.polyline([from], {
      color: TEAL,
      weight: 3,
      dashArray: "8 6",
      opacity: 0.95,
    }).addTo(map);
    const dot = L.circleMarker(from, {
      radius: 6,
      color: "#ffffff",
      fillColor: TEAL,
      fillOpacity: 1,
      weight: 2,
    }).addTo(map);

    const ease = (t: number) =>
      t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const interp = (t: number): LatLng => [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
    ];

    const duration = 1800;
    let start = 0;
    let raf = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      const point = interp(ease(t));
      line.setLatLngs([from, point]);
      dot.setLatLng(point);
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        map.removeLayer(dot);
        pulsePin(map, to, destinationName);
      }
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      map.remove();
    };
  }, [from, to, destinationName]);

  return (
    <div
      className={`journey-leaflet${fill ? " journey-leaflet--fill" : ""}`}
      ref={ref}
      aria-hidden="true"
    />
  );
}
