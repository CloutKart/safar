import Link from "next/link";
import { destinations } from "@/data/destinations";
import { haversineKm, lookupCoords, type LatLng } from "@/lib/cityCoords";
import { TREK_DNA_DIMS, type Trek, type TrekDnaDim } from "@/lib/trek/schema";
import { SunPlan } from "@/components/sun-plan";

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

      {/* Crowd pattern */}
      {trek.crowdPattern && (
        <section className="trek-section">
          <h2>When it&apos;s busy</h2>
          <p className="trek-crowd">
            {trek.crowdPattern.busiest.length > 0 && (
              <>Busiest: {trek.crowdPattern.busiest.join(", ")}. </>
            )}
            {trek.crowdPattern.quietWindow && <>Quietest: {trek.crowdPattern.quietWindow}.</>}
          </p>
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

      {/* Emergency — honest, no fabricated contacts */}
      {trek.emergency && (
        <section className="trek-section trek-emergency">
          <h2>Before you go</h2>
          <p>
            Nearest town: <strong>{trek.emergency.nearestTown || "—"}</strong>.{" "}
            {trek.emergency.evacNote}
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
