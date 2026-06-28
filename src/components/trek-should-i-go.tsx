"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LatLng } from "@/lib/cityCoords";
import { fetchWeather, type WeatherSummary } from "@/lib/weather";
import { shouldIGo, type Fitness } from "@/lib/trek/enrich";
import type { Trek } from "@/lib/trek/schema";

const iso = (d: Date) => d.toISOString().slice(0, 10);

const VERDICT_CLASS: Record<string, string> = {
  Go: "verdict-go",
  "Go with caution": "verdict-caution",
  "Wait a week": "verdict-wait",
  "Choose another": "verdict-another",
};
const VERDICT_ICON: Record<string, string> = {
  Go: "✅",
  "Go with caution": "🟠",
  "Wait a week": "🕓",
  "Choose another": "↪",
};

// One-tap "Should I Go?" verdict. Weather is fetched client-side from keyless
// Open-Meteo (same pattern as TrekConditions); the synthesis is deterministic and
// recomputes instantly as the user tweaks fitness / days. A decision aid only.
export function TrekShouldIGo({
  trek,
  coords,
  alternative,
}: {
  trek: Trek;
  coords: LatLng | null;
  alternative?: { slug: string; name: string } | null;
}) {
  const [wx, setWx] = useState<WeatherSummary | null>(null);
  const [fitness, setFitness] = useState<Fitness>("intermediate");
  const [days, setDays] = useState<string>("");

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const today = new Date();
    const end = new Date(today.getTime() + 3 * 86_400_000);
    fetchWeather(coords, iso(today), iso(end), controller.signal).then((summary) => {
      if (!cancelled && summary) setWx(summary);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [coords]);

  const result = useMemo(
    () =>
      shouldIGo(trek, {
        month: new Date().getMonth() + 1,
        weather: wx,
        fitness,
        days: days.trim() === "" ? null : Number(days),
      }),
    [trek, wx, fitness, days],
  );

  return (
    <div className="should-i-go">
      <div className="sig-head">
        <p className="eyebrow">Should I go?</p>
        <span className={`sig-verdict ${VERDICT_CLASS[result.verdict]}`}>
          {VERDICT_ICON[result.verdict]} {result.verdict}
          <em>{result.score}% confidence</em>
        </span>
      </div>

      <div className="sig-controls">
        <label>
          Your level
          <select value={fitness} onChange={(e) => setFitness(e.target.value as Fitness)}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="experienced">Experienced</option>
          </select>
        </label>
        <label>
          Days you have
          <input
            type="number"
            min={1}
            placeholder="e.g. 2"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </label>
      </div>

      <ul className="sig-reasons">
        {result.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>

      {result.verdict === "Choose another" && alternative && (
        <p className="sig-alt">
          Better fit right now:{" "}
          <Link href={`/trek/${alternative.slug}`}>{alternative.name} →</Link>
        </p>
      )}

      <p className="sig-note">
        A heuristic from season, terrain &amp; live weather — not a safety clearance.
        Verify conditions and your own readiness locally.
      </p>
    </div>
  );
}
