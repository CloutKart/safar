import type { LatLng } from "@/lib/cityCoords";

export interface WeatherSummary {
  lowC: number;
  highC: number;
  rainPct: number;
  // true when derived from last-year archive (trip is beyond the 16-day forecast).
  typical: boolean;
}

const nums = (values: unknown): number[] =>
  Array.isArray(values) ? values.filter((v): v is number => typeof v === "number") : [];

function sameDatesLastYear(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

// Free, keyless temperature range + rain likelihood for a destination over the
// travel window. Uses the Open-Meteo forecast within its 16-day horizon, and
// otherwise the archive for the same dates last year as a "typical" proxy.
export async function fetchWeather(
  [lat, lng]: LatLng,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<WeatherSummary | null> {
  const daysOut = (new Date(`${start}T00:00:00Z`).getTime() - Date.now()) / 86_400_000;
  try {
    if (daysOut >= -1 && daysOut <= 15) {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&start_date=${start}&end_date=${end}&timezone=auto`;
      const res = await fetch(url, { signal });
      if (!res.ok) return null;
      const data = await res.json();
      const lows = nums(data?.daily?.temperature_2m_min);
      const highs = nums(data?.daily?.temperature_2m_max);
      const rain = nums(data?.daily?.precipitation_probability_max);
      if (!lows.length || !highs.length) return null;
      return {
        lowC: Math.round(Math.min(...lows)),
        highC: Math.round(Math.max(...highs)),
        rainPct: rain.length ? Math.round(Math.max(...rain)) : 0,
        typical: false,
      };
    }
    const url =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
      `&start_date=${sameDatesLastYear(start)}&end_date=${sameDatesLastYear(end)}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    const lows = nums(data?.daily?.temperature_2m_min);
    const highs = nums(data?.daily?.temperature_2m_max);
    const precip = nums(data?.daily?.precipitation_sum);
    if (!lows.length || !highs.length) return null;
    const rainyDays = precip.filter((mm) => mm > 1).length;
    return {
      lowC: Math.round(Math.min(...lows)),
      highC: Math.round(Math.max(...highs)),
      rainPct: precip.length ? Math.round((rainyDays / precip.length) * 100) : 0,
      typical: true,
    };
  } catch {
    return null;
  }
}
