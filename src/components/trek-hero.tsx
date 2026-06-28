"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { LatLng } from "@/lib/cityCoords";
import type { Trek } from "@/lib/trek/schema";
import { fetchWeather, type WeatherSummary } from "@/lib/weather";
import { trekRisk } from "@/lib/trek/enrich";

const iso = (date: Date) => date.toISOString().slice(0, 10);

function timeMood(hour: number) {
  if (hour < 7) return "dawn";
  if (hour < 16) return "day";
  if (hour < 19) return "dusk";
  return "night";
}

export function TrekHero({
  trek,
  imageUrl,
  emotionalLine,
}: {
  trek: Trek;
  imageUrl: string | null;
  emotionalLine: string;
}) {
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const mood = useMemo(() => timeMood(new Date().getHours()), []);

  useEffect(() => {
    if (!trek.trailheadCoords) return;
    const controller = new AbortController();
    const today = new Date();
    const end = new Date(today.getTime() + 2 * 86_400_000);
    fetchWeather(
      trek.trailheadCoords as LatLng,
      iso(today),
      iso(end),
      controller.signal,
    ).then(setWeather);
    return () => controller.abort();
  }, [trek.trailheadCoords]);

  const risk = trekRisk(trek, new Date().getMonth() + 1, weather);
  const style = imageUrl
    ? ({ "--trek-hero-image": `url("${imageUrl.replaceAll('"', "%22")}")` } as CSSProperties)
    : undefined;

  return (
    <header
      className={`trek-immersive-hero hero-${mood}${weather && weather.rainPct >= 50 ? " hero-rain" : ""}`}
      style={style}
    >
      <div className="trek-hero-overlay">
        <div className="trek-hero-top">
          <p className="eyebrow">{trek.region || trek.state}</p>
          <span className={`risk-chip risk-${risk.level.toLowerCase()}`}>
            {risk.level} risk today
          </span>
        </div>
        <h1>{trek.name}</h1>
        <p className="trek-emotional-line">{emotionalLine}</p>
        <div className="trek-hero-stats">
          <div><strong>{trek.distanceKm ?? "—"}</strong><span>km</span></div>
          <div><strong>{trek.elevationGainM ?? "—"}</strong><span>m gain</span></div>
          <div><strong>{trek.durationHours ?? "—"}</strong><span>hours</span></div>
          <div><strong>{trek.maxAltitudeM ?? "—"}</strong><span>m altitude</span></div>
          <div><strong>{trek.permitRequired ? "Yes" : "No"}</strong><span>permit</span></div>
          <div><strong className="capitalize">{trek.difficulty}</strong><span>grade</span></div>
          <div>
            <strong>{trek.bestMonths.length ? trek.bestMonths.length : "—"}</strong>
            <span>good months</span>
          </div>
        </div>
      </div>
    </header>
  );
}
