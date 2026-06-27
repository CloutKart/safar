"use client";

import { useState } from "react";
import type { Trek, TrekDnaDim } from "@/lib/trek/schema";
import type { TrekSearchResult } from "@/lib/trek/recommend";

// The DNA dimensions we surface as mini-bars on a card (compact, scannable).
const CARD_DIMS: Array<{ dim: TrekDnaDim; label: string; invert?: boolean }> = [
  { dim: "adventure", label: "Adventure" },
  { dim: "views", label: "Views" },
  { dim: "crowds", label: "Solitude", invert: true },
  { dim: "forest", label: "Forest" },
  { dim: "waterfalls", label: "Water" },
];

const EXAMPLES = [
  "easy sunrise trek with waterfalls, no crowds, near Bangalore in September",
  "challenging snow trek near Manali for experienced trekkers",
  "quiet forest walk, dog friendly, weekend from Delhi",
  "offbeat hidden trek with camping and big views",
];

function DnaBars({ dna }: { dna: Trek["dna"] }) {
  return (
    <div className="trek-dna">
      {CARD_DIMS.map(({ dim, label, invert }) => {
        const value = invert ? 10 - dna[dim] : dna[dim];
        return (
          <div className="trek-dna-row" key={dim}>
            <span className="trek-dna-label">{label}</span>
            <span className="trek-dna-track">
              <span className="trek-dna-fill" style={{ width: `${value * 10}%` }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TrekCard({
  trek,
  matchPct,
  why,
  distanceKm,
}: {
  trek: Trek;
  matchPct?: number;
  why?: string[];
  distanceKm?: number | null;
}) {
  return (
    <a className="trek-card" href={`/trek/${trek.slug}`}>
      <div className="trek-card-head">
        <div>
          <h3>{trek.name}</h3>
          <p className="trek-card-where">
            {trek.region || trek.state} · {trek.state}
          </p>
        </div>
        {matchPct != null && <span className="trek-match">{matchPct}%</span>}
      </div>

      <div className="trek-stats">
        <span className={`trek-grade grade-${trek.difficulty}`}>{trek.difficulty}</span>
        {trek.distanceKm != null && <span>{trek.distanceKm} km</span>}
        {trek.maxAltitudeM != null && <span>{trek.maxAltitudeM} m</span>}
        {distanceKm != null && <span>~{distanceKm} km away</span>}
      </div>

      <p className="trek-blurb">{trek.blurb}</p>

      {why && why.length > 0 && (
        <ul className="trek-why">
          {why.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}

      <DnaBars dna={trek.dna} />

      {trek.suitability.length > 0 && (
        <div className="trek-tags">
          {trek.suitability.slice(0, 4).map((tag) => (
            <span key={tag}>{tag.replace(/-/g, " ")}</span>
          ))}
        </div>
      )}
    </a>
  );
}

export function TrekExplorer({ featured }: { featured: Trek[] }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<TrekSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/treks/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      if (!res.ok) throw new Error("Search failed");
      setResult((await res.json()) as TrekSearchResult);
    } catch {
      setError("Couldn't run that search. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="trek-explorer">
      <form
        className="trek-search"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(query);
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Describe your ideal trek — terrain, mood, who's coming, where from…"
          aria-label="Describe your ideal trek"
        />
        <button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Find treks"}
        </button>
      </form>

      <div className="trek-examples">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setQuery(ex);
              void runSearch(ex);
            }}
          >
            {ex}
          </button>
        ))}
      </div>

      {error && <p className="trek-error">{error}</p>}

      {result ? (
        <div className="trek-results">
          <p className="trek-results-head">
            {result.matches.length} treks, ranked for “{query}”
            {result.usedEmbeddings ? " · semantic" : ""}
          </p>
          <div className="trek-grid">
            {result.matches.map((m) => (
              <TrekCard
                key={m.trek.slug}
                trek={m.trek}
                matchPct={m.matchPct}
                why={m.why}
                distanceKm={m.distanceKm}
              />
            ))}
          </div>

          {result.nearby.length > 0 && (
            <div className="trek-nearby">
              <h4>
                {result.intent.nearCity
                  ? `Also near ${result.intent.nearCity}`
                  : "You may also like"}
              </h4>
              <div className="trek-nearby-list">
                {result.nearby.map((n) => (
                  <a key={n.slug} href={`/trek/${n.slug}`}>
                    {n.name} <span>~{n.distanceKm} km</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="trek-results">
          <p className="trek-results-head">Featured treks</p>
          <div className="trek-grid">
            {featured.map((trek) => (
              <TrekCard key={trek.slug} trek={trek} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
