"use client";

import { Fragment, type ReactNode } from "react";
import type { Trek } from "@/lib/trek/schema";
import {
  terrainFootwear,
  travelEfficiency,
  waterPlan,
  worthItScore,
} from "@/lib/trek/enrich";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const season = (months: number[]) => (months.length ? months.map((m) => SHORT_MONTHS[m - 1]).join(", ") : "—");

function Stars({ n10 }: { n10: number }) {
  const n = Math.round(n10 / 2);
  return (
    <span className="tc-stars" aria-label={`${n} of 5`}>
      {"★".repeat(n)}
      {"☆".repeat(5 - n)}
    </span>
  );
}

interface Row {
  label: string;
  cell: (t: Trek) => ReactNode;
  score?: (t: Trek) => number;
  best?: "min" | "max";
}

const ROWS: Row[] = [
  { label: "Distance", cell: (t) => (t.distanceKm != null ? `${t.distanceKm} km` : "—"), score: (t) => t.distanceKm ?? Infinity, best: "min" },
  { label: "Elev. gain", cell: (t) => (t.elevationGainM != null ? `${t.elevationGainM} m` : "—") },
  { label: "Max altitude", cell: (t) => (t.maxAltitudeM != null ? `${t.maxAltitudeM} m` : "—") },
  { label: "Difficulty", cell: (t) => <span className="cap">{t.difficulty}</span> },
  { label: "Route", cell: (t) => t.routeType ?? "—" },
  { label: "Best season", cell: (t) => season(t.bestMonths) },
  { label: "Permit", cell: (t) => (t.permitRequired ? "Required" : "Not needed"), score: (t) => (t.permitRequired ? 0 : 1), best: "max" },
  { label: "Solitude", cell: (t) => <Stars n10={10 - t.dna.crowds} />, score: (t) => 10 - t.dna.crowds, best: "max" },
  { label: "Views", cell: (t) => <Stars n10={t.dna.views} />, score: (t) => t.dna.views, best: "max" },
  { label: "Forest", cell: (t) => <Stars n10={t.dna.forest} />, score: (t) => t.dna.forest, best: "max" },
  { label: "Waterfalls", cell: (t) => <Stars n10={t.dna.waterfalls} />, score: (t) => t.dna.waterfalls, best: "max" },
  { label: "Sunrise / photo", cell: (t) => <Stars n10={t.dna.photography} />, score: (t) => t.dna.photography, best: "max" },
  { label: "Camping", cell: (t) => <Stars n10={t.dna.camping} />, score: (t) => t.dna.camping, best: "max" },
  {
    label: "Scenic payoff",
    cell: (t) => `${t.scenicDensity?.composite ?? t.dna.views}/10`,
    score: (t) => t.scenicDensity?.composite ?? t.dna.views,
    best: "max",
  },
  {
    label: "Worth-it",
    cell: (t) => `${worthItScore(t, travelEfficiency(t, null)).score}/100`,
    score: (t) => worthItScore(t, travelEfficiency(t, null)).score,
    best: "max",
  },
  {
    label: "Water carry",
    cell: (t) => `~${waterPlan(t).carryLitres} L`,
    score: (t) => waterPlan(t).carryLitres,
    best: "min",
  },
  { label: "Trailhead", cell: (t) => t.trailhead || "Verify" },
  { label: "Footwear", cell: (t) => terrainFootwear(t)[0] },
];

export function TrekCompare({ treks, onClose }: { treks: Trek[]; onClose: () => void }) {
  const cols = treks.length;
  // Highlight the leader for a row only when it's a unique winner (no tie).
  const bestIndex = (row: Row): number | null => {
    if (!row.score || !row.best) return null;
    const vals = treks.map(row.score);
    const target = row.best === "min" ? Math.min(...vals) : Math.max(...vals);
    if (vals.filter((v) => v === target).length !== 1) return null;
    return vals.indexOf(target);
  };

  return (
    <div className="trek-compare">
      <div className="tc-head">
        <h3>Comparing {cols} treks</h3>
        <button type="button" onClick={onClose}>Close ✕</button>
      </div>
      <div
        className="tc-grid"
        style={{ gridTemplateColumns: `minmax(104px, 1fr) repeat(${cols}, minmax(110px, 1fr))` }}
      >
        <div className="tc-corner" />
        {treks.map((t) => (
          <a key={t.slug} className="tc-name" href={`/trek/${t.slug}`}>
            {t.name}
          </a>
        ))}
        {ROWS.map((row) => {
          const bi = bestIndex(row);
          return (
            <Fragment key={row.label}>
              <div className="tc-label">{row.label}</div>
              {treks.map((t, i) => (
                <div key={t.slug} className={`tc-cell${bi === i ? " tc-best" : ""}`}>
                  {row.cell(t)}
                </div>
              ))}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
