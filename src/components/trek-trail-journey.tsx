"use client";

import { useState } from "react";
import type { ElevationPoint } from "@/lib/trek/enrich";
import { InteractiveElevation } from "@/components/interactive-elevation";

export interface JourneyStep {
  km: number;
  label: string;
  description: string;
  type: string;
  synthesized: boolean;
  imageUrl: string;
  representative: boolean;
  markers: string[];
}

function icon(type: string): string {
  if (type === "trailhead") return "◉";
  if (type === "forest") return "♧";
  if (type === "waterfall" || type === "water" || type === "stream") return "≈";
  if (type === "summit" || type === "pass") return "△";
  if (type === "village") return "⌂";
  return "•";
}

function nearestStep(steps: JourneyStep[], km: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const d = Math.abs(steps[i].km - km);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// The visual trail journey: the elevation profile and the photo-timeline share a
// single `activeKm` — hovering a step moves the elevation cursor, and scrubbing
// the chart highlights the matching step. Images are resolved server-side and
// passed in (no client fetch).
export function TrekTrailJourney({
  steps,
  points,
}: {
  steps: JourneyStep[];
  points: ElevationPoint[];
}) {
  const [activeKm, setActiveKm] = useState<number>(steps[0]?.km ?? 0);
  const activeIdx = nearestStep(steps, activeKm);

  return (
    <div className="trek-journey">
      {points.length > 1 && (
        <InteractiveElevation points={points} activeKm={activeKm} onActiveKm={setActiveKm} />
      )}

      <ol className="trek-timeline">
        {steps.map((s, i) => (
          <li
            key={i}
            className={`tl-${s.type}${i === activeIdx ? " tl-active" : ""}`}
            style={{ animationDelay: `${i * 70}ms` }}
            onPointerEnter={() => setActiveKm(s.km)}
            onFocus={() => setActiveKm(s.km)}
            tabIndex={0}
          >
            <span
              className="tl-photo"
              style={{ backgroundImage: `url("${s.imageUrl.replaceAll('"', "%22")}")` }}
              role="img"
              aria-label={`${s.label} — ${s.representative ? "representative terrain" : "trail landmark"}`}
            >
              {s.representative && <span className="tl-photo-tag">representative</span>}
            </span>
            <span className="tl-icon" aria-hidden="true">{icon(s.type)}</span>
            <span className="tl-km">{s.km} km</span>
            <span className="tl-label">
              {s.label}
              {s.markers.length > 0 && <span className="tl-markers">{s.markers.join(" ")}</span>}
            </span>
            <span className="tl-description">{s.description}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
