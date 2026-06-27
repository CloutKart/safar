"use client";

import { useState } from "react";
import type { TrekCandidate } from "@/lib/trek/discovery";

interface Result {
  near: string;
  located: boolean;
  candidates: TrekCandidate[];
}

export function TrekDiscover() {
  const [near, setNear] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    const q = near.trim();
    if (q.length < 2) return;
    setLoading(true);
    try {
      const res = await fetch("/api/treks/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ near: q }),
      });
      if (res.ok) setResult((await res.json()) as Result);
    } catch {
      // ignore; leave previous result
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="trek-discover">
      <div className="td-head">
        <h2>Discover offbeat trails</h2>
        <p>
          Surface lesser-known trails near a place from live OpenStreetMap + Reddit —
          unverified finds beyond our curated set.
        </p>
      </div>
      <form
        className="td-search"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <input
          type="text"
          value={near}
          onChange={(e) => setNear(e.target.value)}
          placeholder="Search near a town or city — e.g. Pune, Munnar"
          aria-label="Discover trails near"
        />
        <button type="submit" disabled={loading}>
          {loading ? "Scanning…" : "Discover"}
        </button>
      </form>

      {result &&
        (result.candidates.length > 0 ? (
          <div className="td-grid">
            {result.candidates.map((c, i) => (
              <div className="td-card" key={`${c.name}-${i}`}>
                <div className="td-card-head">
                  <h3>{c.name}</h3>
                  {c.hidden && <span className="td-offbeat">offbeat</span>}
                </div>
                <p className="td-stats">
                  {c.difficulty ?? "ungraded"}
                  {c.distanceKm ? ` · ${c.distanceKm} km` : ""}
                  {c.maxAltitudeM ? ` · ${c.maxAltitudeM} m` : ""}
                </p>
                {c.blurb && <p className="td-blurb">{c.blurb}</p>}
                <div className="td-foot">
                  <span className="td-src">via {c.source}</span>
                  {c.routeUrl && (
                    <a href={c.routeUrl} target="_blank" rel="noopener noreferrer">
                      Look it up →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="td-empty">
            No new candidates near {result.near}
            {result.located ? "" : " (couldn't locate that place)"} — live sources may be
            quiet right now.
          </p>
        ))}

      <p className="td-note">
        Candidates are unverified, machine-found suggestions — confirm access, safety and
        permits before trekking.
      </p>
    </div>
  );
}
