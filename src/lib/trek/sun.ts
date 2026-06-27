import type { LatLng } from "@/lib/cityCoords";

// Deterministic sunrise / sunset / golden-hour for a trek's trailhead on a given
// date — a pure implementation of the standard sunrise equation (NOAA/Almanac),
// no API. Accurate to a few minutes, which is all a "leave by 4:50 AM, golden
// hour 6:10–6:35" plan needs. India only, so the timezone defaults to IST
// (UTC+5:30); pass `offsetMinutes` to generalise.

const RAD = Math.PI / 180;
const sinD = (deg: number) => Math.sin(deg * RAD);
const cosD = (deg: number) => Math.cos(deg * RAD);
const tanD = (deg: number) => Math.tan(deg * RAD);
const asinD = (x: number) => Math.asin(x) / RAD;
const acosD = (x: number) => Math.acos(x) / RAD;
const atanD = (x: number) => Math.atan(x) / RAD;
const norm360 = (x: number) => ((x % 360) + 360) % 360;
const norm24 = (x: number) => ((x % 24) + 24) % 24;

const ZENITH_OFFICIAL = 90.833; // accounts for refraction + the sun's radius.

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const diff = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start;
  return Math.floor(diff / 86_400_000);
}

// Returns local clock hour (0–24) of the event, or null in polar edge cases.
function sunEventHour(
  coords: LatLng,
  date: Date,
  rising: boolean,
  offsetMinutes: number,
): number | null {
  const [lat, lng] = coords;
  const N = dayOfYear(date);
  const lngHour = lng / 15;
  const t = N + ((rising ? 6 : 18) - lngHour) / 24;

  const M = 0.9856 * t - 3.289; // mean anomaly
  let L = M + 1.916 * sinD(M) + 0.02 * sinD(2 * M) + 282.634; // true longitude
  L = norm360(L);

  let RA = atanD(0.91764 * tanD(L));
  RA = norm360(RA);
  // Put RA in the same quadrant as L.
  const Lquad = Math.floor(L / 90) * 90;
  const RAquad = Math.floor(RA / 90) * 90;
  RA = (RA + (Lquad - RAquad)) / 15; // to hours

  const sinDec = 0.39782 * sinD(L);
  const cosDec = cosD(asinD(sinDec));

  const cosH = (cosD(ZENITH_OFFICIAL) - sinDec * sinD(lat)) / (cosDec * cosD(lat));
  if (cosH > 1 || cosH < -1) return null; // sun never rises/sets that day

  const H = (rising ? 360 - acosD(cosH) : acosD(cosH)) / 15;
  const T = H + RA - 0.06571 * t - 6.622; // local mean time
  const UT = norm24(T - lngHour); // to UTC
  return norm24(UT + offsetMinutes / 60);
}

function toClock(hour: number | null): string | null {
  if (hour == null) return null;
  const totalMin = Math.round(hour * 60) % 1440;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

const addMin = (hour: number, min: number): number => norm24(hour + min / 60);

export interface SunTimes {
  sunrise: string | null;
  sunset: string | null;
  // Golden hour: the soft-light window just after sunrise / before sunset.
  goldenMorning: { start: string; end: string } | null;
  goldenEvening: { start: string; end: string } | null;
}

export function sunTimes(coords: LatLng, date: Date, offsetMinutes = 330): SunTimes {
  const riseH = sunEventHour(coords, date, true, offsetMinutes);
  const setH = sunEventHour(coords, date, false, offsetMinutes);
  return {
    sunrise: toClock(riseH),
    sunset: toClock(setH),
    goldenMorning:
      riseH == null
        ? null
        : { start: toClock(riseH)!, end: toClock(addMin(riseH, 40))! },
    goldenEvening:
      setH == null
        ? null
        : { start: toClock(addMin(setH, -40))!, end: toClock(setH)! },
  };
}

// "Leave the trailhead by …" so the group reaches a viewpoint for golden hour —
// walk back `hoursToViewpoint` from sunrise, with a small buffer.
export function leaveBy(
  coords: LatLng,
  date: Date,
  hoursToViewpoint: number,
  offsetMinutes = 330,
): string | null {
  const riseH = sunEventHour(coords, date, true, offsetMinutes);
  if (riseH == null) return null;
  return toClock(addMin(riseH, -(hoursToViewpoint * 60 + 15)));
}
