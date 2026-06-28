"use client";

import { useEffect, useState } from "react";
import type { LatLng } from "@/lib/cityCoords";
import {
  fetchHourlyWeather,
  fetchWeather,
  type HourlyWeather,
  type WeatherSummary,
} from "@/lib/weather";
import { trekRisk } from "@/lib/trek/enrich";
import type { Trek } from "@/lib/trek/schema";

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Live conditions + a deterministic risk score for the trailhead. Weather is
// fetched client-side straight from keyless Open-Meteo (same pattern as the trip
// planner's PlanWeather); the risk heuristic works with or without it.
export function TrekConditions({ trek, coords }: { trek: Trek; coords: LatLng }) {
  const [wx, setWx] = useState<WeatherSummary | null>(null);
  const [hourly, setHourly] = useState<HourlyWeather[]>([]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const today = new Date();
    const end = new Date(today.getTime() + 3 * 86_400_000);
    Promise.all([
      fetchWeather(coords, iso(today), iso(end), controller.signal),
      fetchHourlyWeather(coords, controller.signal),
    ]).then(([summary, timeline]) => {
      if (cancelled) return;
      if (summary) setWx(summary);
      setHourly(timeline);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [coords]);

  const risk = trekRisk(trek, new Date().getMonth() + 1, wx);
  const icon = wx ? (wx.rainPct >= 50 ? "🌧️" : wx.rainPct >= 20 ? "🌦️" : "☀️") : "🧭";
  const windy = hourly.find((hour) => hour.windKph >= 35);
  const lowVisibility = hourly.find((hour) => hour.visibilityKm > 0 && hour.visibilityKm < 3);
  const highUv = hourly.find((hour) => hour.uvIndex >= 7);
  const advice = [
    windy ? `Wind may reach ${windy.windKph} km/h — exposed ridges can feel significantly harder.` : null,
    lowVisibility ? `Visibility may fall near ${lowVisibility.visibilityKm} km — avoid relying on distant landmarks.` : null,
    highUv ? `UV reaches ${highUv.uvIndex} — cover up even if the air feels cool.` : null,
    !windy && !lowVisibility && !highUv ? "No standout hourly trigger, but mountain conditions can change faster than this forecast." : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="trek-conditions">
      <div className="cond-head">
        <h3>Conditions &amp; risk</h3>
        <span className={`risk-chip risk-${risk.level.toLowerCase()}`}>{risk.level} risk</span>
      </div>
      {wx && (
        <p className="cond-wx">
          {icon} {wx.lowC}–{wx.highC}°C · {wx.rainPct}% rain {wx.typical ? "(typical)" : "(forecast)"} ·
          next few days at the trailhead
        </p>
      )}
      <ul className="cond-factors">
        {risk.factors.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
      {hourly.length > 0 && (
        <>
          <div className="weather-timeline" aria-label="Hourly trailhead weather">
            {hourly.map((hour) => (
              <div className="weather-hour" key={hour.time}>
                <strong>
                  {new Date(hour.time).toLocaleTimeString("en-IN", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </strong>
                <span>{hour.temperatureC}°</span>
                <span>Rain {hour.rainPct}%</span>
                <span>Wind {hour.windKph}</span>
                <span>UV {hour.uvIndex}</span>
                <span>Vis {hour.visibilityKm} km</span>
              </div>
            ))}
          </div>
          <div className="trek-advisor">
            <strong>Safar trek advisor</strong>
            {advice.map((item) => <p key={item}>{item}</p>)}
          </div>
        </>
      )}
      <p className="cond-note">
        A heuristic from terrain, season &amp; weather — not a live landslide/avalanche
        feed. Always verify conditions locally.
      </p>
    </div>
  );
}
