import Link from "next/link";
import { destinations } from "@/data/destinations";
import { haversineKm, lookupCoords, type LatLng } from "@/lib/cityCoords";
import { TREK_DNA_DIMS, type Trek, type TrekDnaDim } from "@/lib/trek/schema";
import {
  CROWD_COLS,
  CROWD_ROWS,
  crowdHeatmap,
  elevationProfile,
  trafficEstimate,
  trekPacking,
  turnaroundPoints,
  type ElevationPoint,
} from "@/lib/trek/enrich";
import { SunPlan } from "@/components/sun-plan";
import { TrekConditions } from "@/components/trek-conditions";
import { TrekExports } from "@/components/trek-exports";
import { TrekReports } from "@/components/trek-reports";

// Major departure hubs we measure proximity from (the Part-4 proximity surface).
const HUBS = ["Delhi", "Mumbai", "Bangalore", "Kolkata", "Chennai", "Hyderabad", "Pune", "Ahmedabad"];

const DNA_LABEL: Record<TrekDnaDim, string> = {
  adventure: "Adventure",
  views: "Views",
  crowds: "Crowds",
  forest: "Forest",
  waterfalls: "Waterfalls",
  snow: "Snow",
  photography: "Photography",
  camping: "Camping",
  difficulty: "Difficulty",
  family: "Family-friendly",
  hidden: "Hidden-ness",
  food: "Food access",
};

function Dots({ value }: { value: number }) {
  return (
    <span className="dots" aria-label={`${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? "dot on" : "dot"} />
      ))}
    </span>
  );
}

// Inline SVG elevation profile (distance x-axis, elevation y-axis), summit marked.
function ElevationChart({ points }: { points: ElevationPoint[] }) {
  if (points.length < 2) return null;
  const W = 640;
  const H = 150;
  const PAD = 4;
  const kms = points.map((p) => p.km);
  const ms = points.map((p) => p.m);
  const maxKm = Math.max(...kms);
  const minM = Math.min(...ms);
  const maxM = Math.max(...ms);
  const span = Math.max(maxM - minM, 1);
  const x = (km: number) => PAD + (km / maxKm) * (W - 2 * PAD);
  const y = (m: number) => PAD + (1 - (m - minM) / span) * (H - 2 * PAD);
  const line = points.map((p) => `${x(p.km)},${y(p.m)}`).join(" ");
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;
  const peak = points.reduce((a, b) => (b.m > a.m ? b : a));
  return (
    <div className="elev-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Estimated elevation profile">
        <polygon points={area} className="elev-area" />
        <polyline points={line} className="elev-line" fill="none" />
        <circle cx={x(peak.km)} cy={y(peak.m)} r={4} className="elev-peak" />
      </svg>
      <div className="elev-axis">
        <span>{minM} m</span>
        <span>↑ {peak.m} m @ {peak.km} km</span>
        <span>{maxKm} km</span>
      </div>
    </div>
  );
}

function nearestHubs(coords: LatLng | null) {
  if (!coords) return [];
  return HUBS.map((city) => {
    const c = lookupCoords(city);
    return c ? { city, km: haversineKm(c, coords) } : null;
  })
    .filter((x): x is { city: string; km: number } => x != null)
    .sort((a, b) => a.km - b.km)
    .slice(0, 3);
}

export function TrekDetail({ trek }: { trek: Trek }) {
  const coords = trek.trailheadCoords;
  const hubs = nearestHubs(coords);
  const destination = destinations.find((d) => d.slug === trek.destinationSlug);
  const hoursToViewpoint = Math.min(Math.max((trek.durationHours ?? 4) / 2, 1), 4);
  const packing = trekPacking(trek);
  const turnarounds = turnaroundPoints(trek);
  const heatmap = crowdHeatmap(trek);
  const traffic = trafficEstimate(trek);
  const elevation = elevationProfile(trek);

  return (
    <article className="trek-detail">
      <header className="trek-detail-head">
        <p className="eyebrow">{trek.region || trek.state}</p>
        <h1>{trek.name}</h1>
        <p className="trek-detail-blurb">{trek.blurb}</p>
        <div className="trek-stats">
          <span className={`trek-grade grade-${trek.difficulty}`}>{trek.difficulty}</span>
          {trek.distanceKm != null && <span>{trek.distanceKm} km</span>}
          {trek.elevationGainM != null && <span>{trek.elevationGainM} m gain</span>}
          {trek.maxAltitudeM != null && <span>{trek.maxAltitudeM} m max</span>}
          {trek.durationHours != null && <span>~{trek.durationHours} h</span>}
          {trek.routeType && <span>{trek.routeType}</span>}
          {trek.permitRequired && <span className="flag">permit</span>}
          {trek.guideRecommended && <span className="flag">guide advised</span>}
        </div>
      </header>

      {trek.description && <p className="trek-story">{trek.description}</p>}

      {/* Live conditions + deterministic risk score */}
      {coords && (
        <section className="trek-section">
          <TrekConditions trek={trek} coords={coords} />
        </section>
      )}

      {/* Crowdsourced trail reports (72h) */}
      <section className="trek-section">
        <TrekReports slug={trek.slug} />
      </section>

      {/* Difficulty — the four axes + the where-it-gets-hard graph */}
      {(trek.difficultyViz || trek.difficultyProfile.length > 0) && (
        <section className="trek-section">
          <h2>How hard is it?</h2>
          {trek.difficultyViz && (
            <div className="diff-axes">
              <div><span>Energy</span><Dots value={trek.difficultyViz.energy} /></div>
              <div><span>Steepness</span><Dots value={trek.difficultyViz.steepness} /></div>
              <div><span>Exposure</span><Dots value={trek.difficultyViz.exposure} /></div>
              <div><span>Technical</span><Dots value={trek.difficultyViz.technical} /></div>
            </div>
          )}
          {trek.difficultyProfile.length > 0 && (
            <div className="diff-graph">
              {trek.difficultyProfile.map((seg, i) => {
                const span = Math.max(0.5, seg.kmTo - seg.kmFrom);
                return (
                  <div
                    key={i}
                    className={`diff-seg grade-${seg.grade}`}
                    style={{ flexGrow: span }}
                    title={`${seg.kmFrom}–${seg.kmTo} km: ${seg.grade}${seg.note ? ` — ${seg.note}` : ""}`}
                  >
                    <span>{seg.grade}</span>
                    <small>{seg.kmFrom}–{seg.kmTo} km</small>
                  </div>
                );
              })}
            </div>
          )}
          {trek.completionConfidence && (
            <p className="trek-confidence">
              Likely to finish comfortably — beginners {trek.completionConfidence.beginnerPct}% ·
              intermediate {trek.completionConfidence.intermediatePct}% ·
              experienced {trek.completionConfidence.experiencedPct}%
            </p>
          )}
        </section>
      )}

      {/* Estimated elevation profile */}
      {elevation.length > 1 && (
        <section className="trek-section">
          <h2>Elevation profile</h2>
          <p className="trek-sub">Estimated from distance, gain &amp; summit position — not survey data.</p>
          <ElevationChart points={elevation} />
        </section>
      )}

      {/* Km-by-km timeline */}
      {trek.timeline.length > 0 && (
        <section className="trek-section">
          <h2>The trail, km by km</h2>
          <ol className="trek-timeline">
            {trek.timeline.map((w, i) => (
              <li key={i} className={`tl-${w.type}`}>
                <span className="tl-km">{w.km} km</span>
                <span className="tl-label">{w.label}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Exit & turnaround points */}
      {turnarounds.length > 0 && (
        <section className="trek-section">
          <h2>Bail-out points</h2>
          <p className="trek-sub">Safe places to turn back if weather, fatigue or injury says so.</p>
          <ul className="turnaround-list">
            {turnarounds.map((t, i) => (
              <li key={i} className={t.key ? "ta-key" : ""}>
                <span className="ta-km">{t.km} km</span>
                <span className="ta-label">{t.label}</span>
                <span className="ta-note">{t.note}{t.key ? " · last easy turnaround before the crux" : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Hidden moments — the Safar soul */}
      {trek.hiddenMoments.length > 0 && (
        <section className="trek-section trek-hidden">
          <h2>🤫 Hidden moments</h2>
          <ul>
            {trek.hiddenMoments.map((m, i) => (
              <li key={i}>
                {m.km != null && <span className="hm-km">{m.km} km</span>}
                {m.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sun & golden hour (date-aware, client) */}
      {coords && (
        <section className="trek-section">
          <SunPlan coords={coords} hoursToViewpoint={hoursToViewpoint} />
        </section>
      )}

      {/* Scenic density + surface */}
      <section className="trek-section trek-two-col">
        {trek.scenicDensity && (
          <div>
            <h2>Scenic density</h2>
            {(["forest", "ridge", "waterfalls", "wildlife", "summitPayoff"] as const).map((k) => (
              <div className="bar-row" key={k}>
                <span>{k === "summitPayoff" ? "Summit payoff" : k[0].toUpperCase() + k.slice(1)}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${trek.scenicDensity![k] * 10}%` }} />
                </span>
              </div>
            ))}
          </div>
        )}
        {trek.surface.length > 0 && (
          <div>
            <h2>Underfoot</h2>
            <div className="surface-bar">
              {trek.surface.map((s) => (
                <span
                  key={s.kind}
                  className={`surface-seg surface-${s.kind}`}
                  style={{ flexGrow: s.pct }}
                  title={`${s.pct}% ${s.kind}`}
                >
                  {s.pct >= 15 ? `${s.kind} ${s.pct}%` : ""}
                </span>
              ))}
            </div>
            {trek.waterReliability && (
              <p className="trek-water">
                💧 Water: {trek.waterReliability.status.replace(/-/g, " ")}
                {trek.waterReliability.afterKm != null && trek.waterReliability.status === "none-after-km"
                  ? ` (none after ${trek.waterReliability.afterKm} km)`
                  : ""}
                {trek.waterReliability.carryLitres != null
                  ? ` · carry ~${trek.waterReliability.carryLitres} L`
                  : ""}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Crowd heatmap + traffic */}
      <section className="trek-section">
        <h2>When it&apos;s busy</h2>
        <div className="crowd-heatmap" role="img" aria-label="Crowd levels by day and time">
          <span className="ch-corner" />
          {CROWD_COLS.map((c) => (
            <span key={c} className="ch-col">{c}</span>
          ))}
          {CROWD_ROWS.map((row) => (
            <div className="ch-row" key={row} style={{ display: "contents" }}>
              <span className="ch-rowlabel">{row}</span>
              {CROWD_COLS.map((col) => {
                const cell = heatmap.find((x) => x.row === row && x.col === col)!;
                return <span key={col} className={`ch-cell ch-${cell.level}`}>{cell.level}</span>;
              })}
            </div>
          ))}
        </div>
        <div className="crowd-legend">
          <span><i className="ch-low" /> quiet</span>
          <span><i className="ch-medium" /> moderate</span>
          <span><i className="ch-high" /> busy</span>
        </div>
        <p className="trek-traffic">
          Roughly {traffic.weekday} on a weekday, {traffic.weekend}. Peak: {traffic.peak}.
          Quietest: {traffic.quiet}.
        </p>
      </section>

      {/* Dynamic, condition-aware packing */}
      {packing.length > 0 && (
        <section className="trek-section">
          <h2>What to pack</h2>
          <p className="trek-sub">Tuned to this trail&apos;s terrain, altitude and season.</p>
          <div className="pack-groups">
            {packing.map((g) => (
              <div className="pack-group" key={g.title}>
                <h3>{g.title}</h3>
                <ul>
                  {g.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Full Trek DNA */}
      <section className="trek-section">
        <h2>Trek DNA</h2>
        <div className="dna-grid">
          {TREK_DNA_DIMS.map((dim) => (
            <div className="bar-row" key={dim}>
              <span>{DNA_LABEL[dim]}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${trek.dna[dim] * 10}%` }} />
              </span>
            </div>
          ))}
        </div>
        {trek.suitability.length > 0 && (
          <div className="trek-tags">
            {trek.suitability.map((tag) => (
              <span key={tag}>{tag.replace(/-/g, " ")}</span>
            ))}
          </div>
        )}
      </section>

      {/* Proximity + trip integration teaser */}
      {(hubs.length > 0 || destination) && (
        <section className="trek-section trek-integrate">
          <h2>Getting there &amp; making a trip of it</h2>
          {hubs.length > 0 && (
            <p className="trek-prox">
              {hubs.map((h) => (
                <span key={h.city}>
                  {h.city} <strong>~{h.km} km</strong>
                </span>
              ))}
            </p>
          )}
          {destination && (
            <p className="trek-stay">
              Base yourself around <strong>{destination.name}</strong>
              {destination.highlights?.length
                ? ` — ${destination.highlights.slice(0, 2).join(", ")}.`
                : "."}{" "}
              <Link href="/">Plan a full Safar trip around this trek →</Link>
            </p>
          )}
        </section>
      )}

      {/* Take it with you: calendar / GPX / maps / share */}
      <section className="trek-section">
        <h2>Take it with you</h2>
        <TrekExports trek={trek} />
      </section>

      {/* Emergency — honest, no fabricated contacts */}
      {trek.emergency && (
        <section className="trek-section trek-emergency">
          <h2>Before you go</h2>
          <p>
            Nearest town: <strong>{trek.emergency.nearestTown || "—"}</strong>.{" "}
            {trek.emergency.evacNote}
          </p>
          <p className="trek-condition">
            🩹 Latest trail conditions are in the community reports above (they expire
            after 72h). Always confirm critical conditions locally.
          </p>
          <p className="trek-verify">
            ⚠️ These are curated, community-informed estimates — verify current
            conditions, permits and emergency contacts locally before setting out.
          </p>
        </section>
      )}
    </article>
  );
}
