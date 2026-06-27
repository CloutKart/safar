"use client";

import { useEffect, useState } from "react";
import type { LatLng } from "@/lib/cityCoords";
import { fetchWeather, type WeatherSummary } from "@/lib/weather";
import { trekRisk } from "@/lib/trek/enrich";
import type { Trek } from "@/lib/trek/schema";

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Live conditions + a deterministic risk score for the trailhead. Weather is
// fetched client-side straight from keyless Open-Meteo (same pattern as the trip
// planner's PlanWeather); the risk heuristic works with or without it.
export function TrekConditions({ trek, coords }: { trek: Trek; coords: LatLng }) {
  const [wx, setWx] = useState<WeatherSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const today = new Date();
    const end = new Date(today.getTime() + 3 * 86_400_000);
    fetchWeather(coords, iso(today), iso(end), controller.signal).then((data) => {
      if (!cancelled && data) setWx(data);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [coords]);

  const risk = trekRisk(trek, new Date().getMonth() + 1, wx);
  const icon = wx ? (wx.rainPct >= 50 ? "🌧️" : wx.rainPct >= 20 ? "🌦️" : "☀️") : "🧭";

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
      <p className="cond-note">
        A heuristic from terrain, season &amp; weather — not a live landslide/avalanche
        feed. Always verify conditions locally.
      </p>
    </div>
  );
}
