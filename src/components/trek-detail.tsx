import Link from "next/link";
import { destinations } from "@/data/destinations";
import { haversineKm, lookupCoords, type LatLng } from "@/lib/cityCoords";
import { TREK_DNA_DIMS, type Trek, type TrekDnaDim } from "@/lib/trek/schema";
import {
  CROWD_COLS,
  CROWD_ROWS,
  crowdHeatmap,
  elevationProfile,
  emotionalTrekLine,
  estimateTrekDays,
  expandedTimeline,
  landmarkDescription,
  paceEstimates,
  photographyGuide,
  terrainFootwear,
  trafficEstimate,
  trailheadLogistics,
  travelEfficiency,
  trekMatchSummary,
  turnaroundPoints,
  waterPlan,
  wildlifeGuide,
  worthItScore,
  stepMarkers,
  type SimilarTrek,
} from "@/lib/trek/enrich";
import { googleMapsUrl, osmUrl } from "@/lib/trek/exports";
import { SunPlan } from "@/components/sun-plan";
import { TrekConditions } from "@/components/trek-conditions";
import { TrekShouldIGo } from "@/components/trek-should-i-go";
import { TrekCalendarHeatmap } from "@/components/trek-calendar";
import { TrekAdvisor } from "@/components/trek-advisor";
import { TrekExports } from "@/components/trek-exports";
import { TrekReports } from "@/components/trek-reports";
import { TrekHero } from "@/components/trek-hero";
import { TrekTrailJourney, type JourneyStep } from "@/components/trek-trail-journey";
import { TrekLightWildlife } from "@/components/trek-light-wildlife";
import { goldenHourImage, waypointImage, wildlifeImages } from "@/lib/trek/imagery";
import { TrekPackingAssistant } from "@/components/trek-packing-assistant";
import { TrekMemory } from "@/components/trek-memory";

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

export function TrekDetail({
  trek,
  heroImageUrl,
  alternatives = [],
}: {
  trek: Trek;
  heroImageUrl: string | null;
  alternatives?: SimilarTrek[];
}) {
  const coords = trek.trailheadCoords;
  const hubs = nearestHubs(coords);
  const destination = destinations.find((d) => d.slug === trek.destinationSlug);
  const hoursToViewpoint = Math.min(Math.max((trek.durationHours ?? 4) / 2, 1), 4);
  const turnarounds = turnaroundPoints(trek);
  const heatmap = crowdHeatmap(trek);
  const traffic = trafficEstimate(trek);
  const elevation = elevationProfile(trek);
  // Expanded, image-resolved trail steps (server-side) for the visual journey.
  const expanded = expandedTimeline(trek);
  const journeySteps: JourneyStep[] = expanded.map((s) => {
    const img = waypointImage(trek, s);
    return {
      km: s.km,
      label: s.label,
      description: s.description || landmarkDescription(s.type),
      type: s.type,
      synthesized: s.synthesized,
      imageUrl: img.url,
      representative: img.representative,
      markers: stepMarkers(trek, s, expanded),
    };
  });
  // Light & wildlife imagery, and a picture for each hidden moment (the nearest
  // trail-step image, else the golden-hour shot).
  const golden = goldenHourImage(trek);
  const wildlifeShots = wildlifeImages(trek);
  const hiddenWithImage = trek.hiddenMoments.map((m) => {
    let imageUrl = golden;
    if (m.km != null && journeySteps.length > 0) {
      imageUrl = journeySteps.reduce((best, s) =>
        Math.abs(s.km - m.km!) < Math.abs(best.km - m.km!) ? s : best,
      ).imageUrl;
    }
    return { text: m.text, km: m.km, imageUrl };
  });
  const efficiency = travelEfficiency(trek, hubs[0]?.km ?? null);
  const worth = worthItScore(trek, efficiency);
  const paces = paceEstimates(trek);
  const trekDays = estimateTrekDays(trek);
  const wildlife = wildlifeGuide(trek);
  const photoGuide = photographyGuide(trek);
  const footwear = terrainFootwear(trek);
  const hydration = waterPlan(trek);
  const logistics = trailheadLogistics(trek);

  return (
    <article className="trek-detail">
      <TrekHero
        trek={trek}
        imageUrl={heroImageUrl}
        emotionalLine={emotionalTrekLine(trek)}
      />

      <section className="trek-section trek-ai-summary">
        <p className="eyebrow">Why Safar thinks this trek works</p>
        <h2>{trekMatchSummary(trek)}</h2>
        {trek.description && <p>{trek.description}</p>}
      </section>

      <section className="trek-section">
        <TrekShouldIGo
          trek={trek}
          coords={coords}
          alternative={
            alternatives[0]
              ? { slug: alternatives[0].trek.slug, name: alternatives[0].trek.name }
              : null
          }
        />
      </section>

      <section className="trek-section trek-ask-section">
        <p className="eyebrow">Ask the trek advisor</p>
        <h2>Anything on your mind before you commit?</h2>
        <TrekAdvisor slug={trek.slug} />
      </section>

      <section className="trek-section trek-decision-grid">
        <div className="decision-card">
          <span>Travel efficiency</span>
          <strong>{efficiency.score}<small>/100</small></strong>
          <p>{efficiency.verdict}</p>
          <small>~{efficiency.travelHours.toFixed(1)}h approach from {hubs[0]?.city ?? "nearest hub"} · ~{efficiency.trekHours}h trail · {efficiency.payoff}/10 payoff</small>
        </div>
        <div className="decision-card worth-card">
          <span>Worth-it meter</span>
          <strong>{worth.score}<small>/100</small></strong>
          <p>{worth.label}</p>
          <small>{worth.reasons.join(" · ")}</small>
        </div>
        <div className="decision-card pace-card">
          <span>Pace calculator{trekDays > 1 ? ` · ~${trekDays} days` : ""}</span>
          <div className="pace-options">
            {paces.map((pace) => (
              <div key={pace.label}>
                <strong>{pace.hours}h{trekDays > 1 ? "/day" : ""}</strong>
                <b>{pace.label}</b>
                <small>{pace.note}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live conditions + deterministic risk score */}
      {coords && (
        <section className="trek-section">
          <TrekConditions trek={trek} coords={coords} />
        </section>
      )}

      {/* Best time to go — calendar heatmap */}
      {trek.bestMonths.length > 0 && (
        <section className="trek-section">
          <h2>Best time to go</h2>
          <p className="trek-sub">Colour-coded by season, altitude and monsoon risk — hover a month for why.</p>
          <TrekCalendarHeatmap trek={trek} />
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

      {/* The journey, km by km — elevation + photo-timeline, hover-synced */}
      {journeySteps.length > 0 && (
        <section className="trek-section">
          <h2>The trail, km by km</h2>
          <p className="trek-sub">
            A photo at every step — hover the elevation or a step to follow the route.
            Images tagged &ldquo;representative&rdquo; show the terrain type, not the exact spot;
            elevation is estimated, not DEM/survey data.
          </p>
          <TrekTrailJourney steps={journeySteps} points={elevation} />
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

      {/* Hidden moments — the Safar soul, now with a picture each */}
      {hiddenWithImage.length > 0 && (
        <section className="trek-section trek-hidden">
          <h2>🤫 Hidden moments</h2>
          <div className="hm-grid">
            {hiddenWithImage.map((m, i) => (
              <article key={i} className="hm-card">
                <span
                  className="hm-photo"
                  style={{ backgroundImage: `url("${m.imageUrl.replaceAll('"', "%22")}")` }}
                  role="img"
                  aria-label="A representative moment along the trail"
                />
                <p>
                  {m.km != null && <span className="hm-km">{m.km} km</span>}
                  {m.text}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Sun & golden hour (date-aware, client) + light/wildlife image band */}
      {coords && (
        <section className="trek-section">
          <SunPlan coords={coords} hoursToViewpoint={hoursToViewpoint} />
          <TrekLightWildlife goldenImage={golden} wildlife={wildlifeShots} />
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

      <section className="trek-section trek-companion-grid">
        <div className="companion-card water-card">
          <p className="eyebrow">Water planner</p>
          <h2>Carry about {hydration.carryLitres} litres</h2>
          {hydration.refillPoints.length > 0 ? (
            <ul>
              {hydration.refillPoints.map((point) => <li key={point}>{point}</li>)}
            </ul>
          ) : (
            <p>No reliable refill point is mapped in the current trail record.</p>
          )}
          <small>{hydration.warning}</small>
        </div>
        <div className="companion-card">
          <p className="eyebrow">Footwear call</p>
          <h2>Dress for the ground</h2>
          <ul>
            {footwear.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <small>Terrain percentages are curated estimates; recent weather can change the surface completely.</small>
        </div>
      </section>

      <section className="trek-section trek-two-col">
        <div>
          <h2>Wildlife likelihood</h2>
          <div className="wildlife-list">
            {wildlife.map((item) => (
              <article key={item.label}>
                <span className={`likelihood likelihood-${item.probability.toLowerCase()}`}>{item.probability}</span>
                <h3>{item.label}</h3>
                <p>{item.note}</p>
              </article>
            ))}
          </div>
        </div>
        <div>
          <h2>Photography guide</h2>
          <div className="photo-guide">
            {photoGuide.map((item) => (
              <article key={item.moment}>
                <strong>{item.moment}</strong>
                <p>{item.guidance}</p>
              </article>
            ))}
          </div>
        </div>
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

      <section className="trek-section">
        <h2>AI packing assistant</h2>
        <p className="trek-sub">Tune the checklist, mark items as packed, and keep the conservative defaults.</p>
        <TrekPackingAssistant trek={trek} />
      </section>

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

      {/* Trailhead map (OSM embed — no key, pan/zoomable) */}
      {coords && (
        <section className="trek-section">
          <h2>Trailhead map</h2>
          <div className="trek-map">
            <iframe
              title={`${trek.name} trailhead map`}
              loading="lazy"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords[1] - 0.06}%2C${coords[0] - 0.04}%2C${coords[1] + 0.06}%2C${coords[0] + 0.04}&layer=mapnik&marker=${coords[0]}%2C${coords[1]}`}
            />
          </div>
          <p className="trek-sub">
            <a href={osmUrl(trek)} target="_blank" rel="noopener noreferrer">Open in OpenStreetMap</a>
            {" · "}
            <a href={googleMapsUrl(trek)} target="_blank" rel="noopener noreferrer">Google Maps</a>
            {" — marker is the trailhead; the route line needs survey data (later)."}
          </p>
        </section>
      )}

      <section className="trek-section">
        <h2>Trailhead logistics</h2>
        <p className="trek-sub">Known facts are separated from estimates and items that must be verified locally.</p>
        <div className="logistics-grid">
          {logistics.map((item) => (
            <article key={item.label}>
              <span className={`confidence-label confidence-${item.confidence.toLowerCase()}`}>{item.confidence}</span>
              <strong>{item.label}</strong>
              <p>{item.value}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Field intelligence — sourced logistics + hazards (V1.5) */}
      {(trek.logistics || trek.waterSources.length > 0 || trek.hazards) && (
        <section className="trek-section trek-fieldintel">
          <h2>Field intelligence</h2>
          <p className="trek-sub">
            Sourced logistics &amp; hazard notes from field reports — a curated
            baseline, not a live feed. Always verify locally.
          </p>

          {trek.logistics && (
            <div className="fieldintel-grid">
              {trek.logistics.rescueDifficulty != null && (
                <article className="fi-card">
                  <span className="fi-label">Rescue difficulty</span>
                  <strong className={`fi-rescue fi-rescue-${trek.logistics.rescueDifficulty}`}>
                    {trek.logistics.rescueDifficulty}/5
                  </strong>
                  {trek.logistics.rescueNote && <p>{trek.logistics.rescueNote}</p>}
                </article>
              )}
              {trek.logistics.connectivity && (
                <article className="fi-card">
                  <span className="fi-label">Mobile network</span>
                  <p>{trek.logistics.connectivity}</p>
                  {trek.logistics.lastReliableSignal && (
                    <p className="fi-dim">Last reliable: {trek.logistics.lastReliableSignal}</p>
                  )}
                </article>
              )}
              {trek.logistics.gpx !== "unknown" && (
                <article className="fi-card">
                  <span className="fi-label">GPX track</span>
                  <p className="fi-cap">{trek.logistics.gpx}</p>
                  {trek.logistics.trailMarkings !== "unknown" && (
                    <p className="fi-dim">Markings: {trek.logistics.trailMarkings}</p>
                  )}
                </article>
              )}
              {(trek.logistics.porters !== "unknown" || trek.logistics.mules !== "unknown") && (
                <article className="fi-card">
                  <span className="fi-label">Support</span>
                  <p>Porters: <span className="fi-cap">{trek.logistics.porters}</span></p>
                  <p>Mules: <span className="fi-cap">{trek.logistics.mules}</span></p>
                </article>
              )}
              {trek.logistics.toilets !== "unknown" && (
                <article className="fi-card">
                  <span className="fi-label">Toilets</span>
                  <p className="fi-cap">{trek.logistics.toilets}</p>
                </article>
              )}
              {(trek.logistics.nearestATM || trek.logistics.nearestMedical) && (
                <article className="fi-card">
                  <span className="fi-label">Nearest services</span>
                  {trek.logistics.nearestATM && <p>ATM: {trek.logistics.nearestATM}</p>}
                  {trek.logistics.nearestMedical && <p>Medical: {trek.logistics.nearestMedical}</p>}
                </article>
              )}
              {trek.logistics.permitsNote && (
                <article className="fi-card fi-wide">
                  <span className="fi-label">Permits</span>
                  <p>{trek.logistics.permitsNote}</p>
                </article>
              )}
            </div>
          )}

          {trek.waterSources.length > 0 && (
            <div className="fi-water">
              <h3>Water sources</h3>
              <ul className="fi-water-list">
                {trek.waterSources.map((w, i) => (
                  <li key={`${w.name}-${i}`} className={`fi-water-${w.reliability}`}>
                    <span className="fi-water-km">{w.km != null ? `${w.km} km` : "—"}</span>
                    <strong>{w.name}</strong>
                    <span className="fi-water-rel">{w.reliability}</span>
                    {w.note && <span className="fi-water-note">{w.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {trek.hazards && (
            <div className="fi-hazards">
              <h3>Hazard notes</h3>
              <div className="fieldintel-grid">
                {trek.hazards.riverCrossings != null && (
                  <article className="fi-card">
                    <span className="fi-label">River crossings</span>
                    <strong>{trek.hazards.riverCrossings}</strong>
                  </article>
                )}
                {trek.hazards.landslideSegments.length > 0 && (
                  <article className="fi-card">
                    <span className="fi-label">Landslide-prone</span>
                    <p>{trek.hazards.landslideSegments.join("; ")}</p>
                  </article>
                )}
                {trek.hazards.avalancheSegments.length > 0 && (
                  <article className="fi-card">
                    <span className="fi-label">Avalanche-prone</span>
                    <p>{trek.hazards.avalancheSegments.join("; ")}</p>
                  </article>
                )}
                {trek.hazards.lightningExposure && (
                  <article className="fi-card">
                    <span className="fi-label">Lightning exposure</span>
                    <p>{trek.hazards.lightningExposure}</p>
                  </article>
                )}
                {trek.hazards.wildlife.length > 0 && (
                  <article className="fi-card fi-wide">
                    <span className="fi-label">Wildlife encountered</span>
                    <p>{trek.hazards.wildlife.join(" · ")}</p>
                  </article>
                )}
              </div>
            </div>
          )}
        </section>
      )}

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
              <Link href={`/?trek=${encodeURIComponent(trek.name)}#top`}>
                Plan stays, cafés and nearby attractions around this trek →
              </Link>
            </p>
          )}
        </section>
      )}

      <section className="trek-section trek-memory-section">
        <p className="eyebrow">After the trail</p>
        <h2>Make a trek memory</h2>
        <p className="trek-sub">Turn the route stats, your notes and selected photos into a private hiking journal.</p>
        <TrekMemory trek={trek} />
      </section>

      {/* Take it with you: calendar / GPX / maps / share */}
      <section className="trek-section">
        <h2>Take it with you</h2>
        <TrekExports trek={trek} />
      </section>

      {/* Smart alternatives — deterministic DNA neighbours with a reason */}
      {alternatives.length > 0 && (
        <section className="trek-section trek-alts">
          <h2>You might also like</h2>
          <p className="trek-sub">Closest matches by trek character — with why they fit.</p>
          <div className="trek-alts-grid">
            {alternatives.map(({ trek: alt, reason }) => (
              <Link key={alt.slug} className="trek-alt-card" href={`/trek/${alt.slug}`}>
                <div className="trek-alt-head">
                  <strong>{alt.name}</strong>
                  <span className={`trek-grade grade-${alt.difficulty}`}>{alt.difficulty}</span>
                </div>
                <p className="trek-alt-where">{alt.region || alt.state}</p>
                <p className="trek-alt-why">{reason}</p>
              </Link>
            ))}
          </div>
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
