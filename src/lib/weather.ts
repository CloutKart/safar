import type { LatLng } from "@/lib/cityCoords";

export interface WeatherSummary {
  lowC: number;
  highC: number;
  rainPct: number;
  // true when derived from last-year archive (trip is beyond the 16-day forecast).
  typical: boolean;
}

export interface HourlyWeather {
  time: string;
  temperatureC: number;
  rainPct: number;
  windKph: number;
  uvIndex: number;
  visibilityKm: number;
  weatherCode: number;
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
  // Keep the test suite hermetic — this reaches the network (Open-Meteo).
  if (process.env.NODE_ENV === "test") return null;
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

// The next twelve trailhead hours, used by Trek Mode's departure timeline.
// Open-Meteo exposes all six fields from one keyless request.
export async function fetchHourlyWeather(
  [lat, lng]: LatLng,
  signal?: AbortSignal,
): Promise<HourlyWeather[]> {
  if (process.env.NODE_ENV === "test") return [];
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&hourly=temperature_2m,precipitation_probability,wind_speed_10m,uv_index,visibility,weather_code` +
      `&forecast_days=2&timezone=auto`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    const times: unknown[] = Array.isArray(data?.hourly?.time) ? data.hourly.time : [];
    const temperature = nums(data?.hourly?.temperature_2m);
    const rain = nums(data?.hourly?.precipitation_probability);
    const wind = nums(data?.hourly?.wind_speed_10m);
    const uv = nums(data?.hourly?.uv_index);
    const visibility = nums(data?.hourly?.visibility);
    const codes = nums(data?.hourly?.weather_code);
    const currentHour = Date.now() - 60 * 60 * 1000;
    return times
      .map((time, index) => ({
        time: String(time),
        temperatureC: Math.round(temperature[index] ?? 0),
        rainPct: Math.round(rain[index] ?? 0),
        windKph: Math.round(wind[index] ?? 0),
        uvIndex: Math.round((uv[index] ?? 0) * 10) / 10,
        visibilityKm: Math.round(((visibility[index] ?? 0) / 1000) * 10) / 10,
        weatherCode: Math.round(codes[index] ?? 0),
      }))
      .filter((hour) => new Date(hour.time).getTime() >= currentHour)
      .slice(0, 12);
  } catch {
    return [];
  }
}
