"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  geocodeCity,
  haversineKm,
  lookupCoords,
  type LatLng,
} from "@/lib/cityCoords";

// Leaflet needs the DOM — load the map only on the client, after coords resolve.
const JourneyMapInner = dynamic(() => import("@/components/journey-map-inner"), {
  ssr: false,
});

type Resolved = { from: LatLng | null; to: LatLng | null };

// Posted by Safar inline once a winner is declared: a celebratory route from the
// group's departure city to the winning destination.
export function JourneyMapMessage({
  departure,
  destinationSlug,
  destinationName,
  planLabel,
}: {
  departure: string | null;
  destinationSlug: string;
  destinationName: string;
  planLabel: string;
}) {
  // Resolve synchronously from the static table when possible; only fall back to
  // a network geocode (and a re-render) when something is missing.
  const [resolved, setResolved] = useState<Resolved | null>(() => {
    const from = departure ? lookupCoords(departure) : null;
    const to = lookupCoords(destinationSlug) ?? lookupCoords(destinationName);
    if (to && (!departure || from)) return { from, to };
    return null;
  });

  useEffect(() => {
    if (resolved) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    (async () => {
      let from = departure ? lookupCoords(departure) : null;
      let to = lookupCoords(destinationSlug) ?? lookupCoords(destinationName);
      if (departure && !from) from = await geocodeCity(departure, controller.signal);
      if (!to) to = await geocodeCity(destinationName, controller.signal);
      if (!cancelled) setResolved({ from, to });
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [resolved, departure, destinationSlug, destinationName]);

  const from = resolved?.from ?? null;
  const to = resolved?.to ?? null;
  const distance = from && to ? haversineKm(from, to) : null;

  return (
    <article className="msg msg-bot journey-msg">
      <span className="msg-avatar bot">S</span>
      <div className="msg-main">
        <span className="msg-author">Safar</span>
        <div className="bubble journey-map">
          {to ? (
            <JourneyMapInner from={from} to={to} destinationName={destinationName} />
          ) : (
            <div className="journey-leaflet journey-fallback">
              Your journey to {destinationName}
            </div>
          )}
          <div className="journey-footer">
            <span className="journey-route">
              {departure ? `${departure} → ${destinationName}` : destinationName}
            </span>
            <span className="journey-sub">
              {planLabel}
              {distance != null ? ` · ~${distance.toLocaleString("en-IN")} km` : ""}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
