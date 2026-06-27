"use client";

import { useMemo, useState } from "react";
import type { TrailDifficulty } from "@/lib/domain";
import type { Trek, TrekDnaDim, TrekFilters } from "@/lib/trek/schema";
import type { TrekSearchResult } from "@/lib/trek/recommend";
import { TrekCompare } from "@/components/trek-compare";

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

const DIFFICULTIES: TrailDifficulty[] = ["easy", "moderate", "hard", "expert"];
const SCENERY: Array<{ key: string; label: string; dim: TrekDnaDim }> = [
  { key: "waterfalls", label: "Waterfalls", dim: "waterfalls" },
  { key: "forest", label: "Forest", dim: "forest" },
  { key: "snow", label: "Snow", dim: "snow" },
  { key: "sunrise", label: "Sunrise / photo", dim: "photography" },
  { key: "views", label: "Big views", dim: "views" },
];
const MONTH_LABELS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface FilterState {
  maxDifficulty: "" | TrailDifficulty;
  distMin: string;
  distMax: string;
  elevMin: string;
  elevMax: string;
  transport: "" | "public" | "car" | "taxi";
  permit: "" | "ok" | "avoid";
  crowds: "" | "quiet" | "busy";
  camping: boolean;
  nearCity: string;
  month: number; // 0 = any
  scenery: string[];
}

const EMPTY_FILTERS: FilterState = {
  maxDifficulty: "",
  distMin: "",
  distMax: "",
  elevMin: "",
  elevMax: "",
  transport: "",
  permit: "",
  crowds: "",
  camping: false,
  nearCity: "",
  month: 0,
  scenery: [],
};

const num = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function buildFilters(s: FilterState): TrekFilters | undefined {
  const f: TrekFilters = {};
  if (s.maxDifficulty) f.maxDifficulty = s.maxDifficulty;
  const dmin = num(s.distMin);
  const dmax = num(s.distMax);
  if (dmin != null || dmax != null) f.distanceKm = { min: dmin, max: dmax };
  const emin = num(s.elevMin);
  const emax = num(s.elevMax);
  if (emin != null || emax != null) f.elevationGainM = { min: emin, max: emax };
  if (s.transport) f.transport = s.transport;
  if (s.permit) f.permit = s.permit;
  if (s.nearCity.trim()) f.nearCity = s.nearCity.trim();
  if (s.month) f.month = s.month;
  if (s.camping) f.camping = true;
  const dna: Partial<Record<TrekDnaDim, number>> = {};
  if (s.crowds === "quiet") dna.crowds = 1;
  else if (s.crowds === "busy") dna.crowds = 8;
  for (const key of s.scenery) {
    const sc = SCENERY.find((x) => x.key === key);
    if (sc) dna[sc.dim] = 9;
  }
  if (Object.keys(dna).length) f.dna = dna;
  return Object.keys(f).length ? f : undefined;
}

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
  selected,
  onToggle,
}: {
  trek: Trek;
  matchPct?: number;
  why?: string[];
  distanceKm?: number | null;
  selected: boolean;
  onToggle: (slug: string) => void;
}) {
  return (
    <div className="trek-card-wrap">
      <button
        type="button"
        className={`trek-pick${selected ? " on" : ""}`}
        aria-pressed={selected}
        title={selected ? "Remove from compare" : "Add to compare"}
        onClick={() => onToggle(trek.slug)}
      >
        {selected ? "✓" : "+"}
      </button>
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
    </div>
  );
}

export function TrekExplorer({ featured }: { featured: Trek[] }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [result, setResult] = useState<TrekSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  const shown = useMemo<Trek[]>(
    () => (result ? result.matches.map((m) => m.trek) : featured),
    [result, featured],
  );
  const bySlug = useMemo(() => new Map(shown.map((t) => [t.slug, t])), [shown]);
  const selectedTreks = selected.map((s) => bySlug.get(s)).filter((t): t is Trek => Boolean(t));

  const toggleSelect = (slug: string) =>
    setSelected((s) =>
      s.includes(slug) ? s.filter((x) => x !== slug) : s.length < 4 ? [...s, slug] : s,
    );

  async function runSearch(q: string, f?: TrekFilters) {
    const trimmed = q.trim();
    if (trimmed.length < 2 && !f) return;
    setLoading(true);
    setError(null);
    setSelected([]);
    try {
      const body: { query?: string; filters?: TrekFilters } = {};
      if (trimmed.length >= 2) body.query = trimmed;
      if (f) body.filters = f;
      const res = await fetch("/api/treks/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Search failed");
      setResult((await res.json()) as TrekSearchResult);
    } catch {
      setError("Couldn't run that search. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const setF = (patch: Partial<FilterState>) => setFilters((prev) => ({ ...prev, ...patch }));
  const toggleScenery = (key: string) =>
    setFilters((prev) => ({
      ...prev,
      scenery: prev.scenery.includes(key)
        ? prev.scenery.filter((k) => k !== key)
        : [...prev.scenery, key],
    }));

  return (
    <div className="trek-explorer">
      <form
        className="trek-search"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(query, buildFilters(filters));
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Describe your ideal trek — terrain, mood, who's coming, where from…"
          aria-label="Describe your ideal trek"
        />
        <button type="button" className="trek-filter-toggle" onClick={() => setShowFilters((v) => !v)}>
          ⚙ Filters
        </button>
        <button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Find treks"}
        </button>
      </form>

      {showFilters && (
        <div className="trek-filters">
          <label>
            Difficulty
            <select value={filters.maxDifficulty} onChange={(e) => setF({ maxDifficulty: e.target.value as FilterState["maxDifficulty"] })}>
              <option value="">Any</option>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>up to {d}</option>
              ))}
            </select>
          </label>
          <label>
            Distance (km)
            <span className="trek-range">
              <input type="number" min={0} placeholder="min" value={filters.distMin} onChange={(e) => setF({ distMin: e.target.value })} />
              <input type="number" min={0} placeholder="max" value={filters.distMax} onChange={(e) => setF({ distMax: e.target.value })} />
            </span>
          </label>
          <label>
            Elevation gain (m)
            <span className="trek-range">
              <input type="number" min={0} placeholder="min" value={filters.elevMin} onChange={(e) => setF({ elevMin: e.target.value })} />
              <input type="number" min={0} placeholder="max" value={filters.elevMax} onChange={(e) => setF({ elevMax: e.target.value })} />
            </span>
          </label>
          <label>
            Transport
            <select value={filters.transport} onChange={(e) => setF({ transport: e.target.value as FilterState["transport"] })}>
              <option value="">Any</option>
              <option value="public">Public transport</option>
              <option value="car">Own car</option>
              <option value="taxi">Taxi / cab</option>
            </select>
          </label>
          <label>
            Permit
            <select value={filters.permit} onChange={(e) => setF({ permit: e.target.value as FilterState["permit"] })}>
              <option value="">Any</option>
              <option value="avoid">No permit</option>
              <option value="ok">Permit ok</option>
            </select>
          </label>
          <label>
            Crowds
            <select value={filters.crowds} onChange={(e) => setF({ crowds: e.target.value as FilterState["crowds"] })}>
              <option value="">Any</option>
              <option value="quiet">Avoid crowds</option>
              <option value="busy">Lively is fine</option>
            </select>
          </label>
          <label>
            Near city
            <input type="text" placeholder="e.g. Bangalore" value={filters.nearCity} onChange={(e) => setF({ nearCity: e.target.value })} />
          </label>
          <label>
            Month
            <select value={filters.month} onChange={(e) => setF({ month: Number(e.target.value) })}>
              <option value={0}>Any</option>
              {MONTH_LABELS.slice(1).map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </label>
          <label className="trek-check">
            <input type="checkbox" checked={filters.camping} onChange={(e) => setF({ camping: e.target.checked })} />
            Camping
          </label>
          <div className="trek-scenery">
            <span>Scenery</span>
            {SCENERY.map((sc) => (
              <button
                key={sc.key}
                type="button"
                className={filters.scenery.includes(sc.key) ? "on" : ""}
                onClick={() => toggleScenery(sc.key)}
              >
                {sc.label}
              </button>
            ))}
          </div>
          <div className="trek-filter-actions">
            <button type="button" className="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>Reset</button>
            <button type="button" onClick={() => void runSearch(query, buildFilters(filters))} disabled={loading}>
              Apply filters
            </button>
          </div>
        </div>
      )}

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

      <div className="trek-results">
        <p className="trek-results-head">
          {result
            ? `${result.matches.length} treks${query ? ` for “${query}”` : " matching your filters"}${result.usedEmbeddings ? " · semantic" : ""}`
            : "Featured treks"}
        </p>
        <div className="trek-grid">
          {(result
            ? result.matches.map((m) => ({ trek: m.trek, matchPct: m.matchPct, why: m.why, distanceKm: m.distanceKm }))
            : featured.map((trek) => ({ trek, matchPct: undefined, why: undefined, distanceKm: undefined as number | null | undefined }))
          ).map((m) => (
            <TrekCard
              key={m.trek.slug}
              trek={m.trek}
              matchPct={m.matchPct}
              why={m.why}
              distanceKm={m.distanceKm}
              selected={selected.includes(m.trek.slug)}
              onToggle={toggleSelect}
            />
          ))}
        </div>

        {result && result.nearby.length > 0 && (
          <div className="trek-nearby">
            <h4>{result.intent.nearCity ? `Also near ${result.intent.nearCity}` : "You may also like"}</h4>
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

      {selectedTreks.length >= 2 && !comparing && (
        <div className="trek-compare-bar">
          <span>{selectedTreks.length} treks selected</span>
          <button type="button" onClick={() => setComparing(true)}>Compare</button>
          <button type="button" className="ghost" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      {comparing && selectedTreks.length >= 2 && (
        <TrekCompare treks={selectedTreks} onClose={() => setComparing(false)} />
      )}
    </div>
  );
}
