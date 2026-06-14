"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { geocodeCity, lookupCoords, type LatLng } from "@/lib/cityCoords";

// Leaflet needs the DOM — load the map only on the client, after coords resolve.
const JourneyMapInner = dynamic(() => import("@/components/journey-map-inner"), {
  ssr: false,
});

type Resolved = { from: LatLng | null; to: LatLng | null };

// Resolve departure + destination coordinates: synchronously from the static
// table when possible, else a one-shot Nominatim geocode (with a timeout).
function useResolvedCoords(
  departure: string | null,
  destinationSlug: string,
  destinationName: string,
): Resolved | null {
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

  return resolved;
}

// Full-bleed animated route that becomes the trip-room header once a winner is
// chosen — the dashed line draws from the departure city to the destination
// behind the title/veil. Renders nothing until coords resolve, so the
// illustrated vibe scene shows through as the fallback.
export function JourneyMapHeader({
  departure,
  destinationSlug,
  destinationName,
}: {
  departure: string | null;
  destinationSlug: string;
  destinationName: string;
}) {
  const resolved = useResolvedCoords(departure, destinationSlug, destinationName);
  const to = resolved?.to ?? null;
  if (!to) return null;
  return (
    <div className="journey-island">
      <JourneyMapInner
        from={resolved?.from ?? null}
        to={to}
        destinationName={destinationName}
        fill
      />
    </div>
  );
}
