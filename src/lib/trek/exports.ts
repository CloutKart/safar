import { leaveBy } from "@/lib/trek/sun";
import type { Trek } from "@/lib/trek/schema";

// Trek exports — calendar (.ics + Google Calendar), a GPX trailhead waypoint, and
// map links. Trek-specific (the trip planner's exports are bound to GeneratedPlan).
// Note: we only have the trailhead point, not a surveyed track, so the GPX is an
// honest single waypoint, not a full route.

const pad = (n: number) => String(n).padStart(2, "0");

// The next Saturday (ISO yyyy-mm-dd) — a sensible default trek date for the event.
export function nextSaturdayISO(from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const delta = (6 - d.getUTCDay() + 7) % 7 || 7; // always a future Saturday
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// "4:50 AM" → minutes past local midnight.
function clockToMinutes(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/PM/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
}

// A UTC ICS timestamp for a given local date + local minutes (IST offset default).
function utcStamp(dateISO: string, localMinutes: number, offsetMinutes: number): string {
  const [y, mo, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d) + (localMinutes - offsetMinutes) * 60_000);
  return (
    `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}` +
    `T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00Z`
  );
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// A timed VEVENT: start at the sunrise "leave-by" time (else 6 AM), end after the
// trek's duration, with a reminder the evening before.
export function trekIcs(trek: Trek, dateISO: string, offsetMinutes = 330): string {
  const coords = trek.trailheadCoords ?? [0, 0];
  const toViewpoint = Math.min(Math.max((trek.durationHours ?? 4) / 2, 1), 4);
  const leave = leaveBy(coords, new Date(`${dateISO}T00:00:00Z`), toViewpoint, offsetMinutes);
  const startMin = clockToMinutes(leave) ?? 360; // 6:00 AM default
  const endMin = startMin + Math.round((trek.durationHours ?? 5) * 60);
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const desc = [
    trek.blurb,
    trek.distanceKm != null ? `${trek.distanceKm} km` : "",
    `${trek.difficulty} grade`,
    leave ? `Leave the trailhead by ${leave} for sunrise.` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Safar//Trek Mode//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:safar-trek-${trek.slug}-${stamp}@safar.app`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${utcStamp(dateISO, startMin, offsetMinutes)}`,
    `DTEND:${utcStamp(dateISO, endMin, offsetMinutes)}`,
    `SUMMARY:${icsEscape(`${trek.name} trek`)}`,
    `LOCATION:${icsEscape(trek.trailhead || trek.nearestCity || trek.name)}`,
    `DESCRIPTION:${icsEscape(desc)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT12H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(`${trek.name} trek tomorrow — pack and rest`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function trekGoogleCalendarUrl(trek: Trek, dateISO: string, offsetMinutes = 330): string {
  const coords = trek.trailheadCoords ?? [0, 0];
  const toViewpoint = Math.min(Math.max((trek.durationHours ?? 4) / 2, 1), 4);
  const leave = leaveBy(coords, new Date(`${dateISO}T00:00:00Z`), toViewpoint, offsetMinutes);
  const startMin = clockToMinutes(leave) ?? 360;
  const endMin = startMin + Math.round((trek.durationHours ?? 5) * 60);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${trek.name} trek`,
    dates: `${utcStamp(dateISO, startMin, offsetMinutes)}/${utcStamp(dateISO, endMin, offsetMinutes)}`,
    details: trek.blurb,
    location: trek.trailhead || trek.nearestCity || trek.name,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// A minimal GPX with the trailhead waypoint (no surveyed track available).
export function trekGpx(trek: Trek): string {
  const [lat, lng] = trek.trailheadCoords ?? [0, 0];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="Safar" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `  <wpt lat="${lat}" lon="${lng}">\n` +
    `    <name>${esc(trek.name)} — trailhead</name>\n` +
    `    <desc>${esc(trek.blurb)}</desc>\n` +
    `  </wpt>\n` +
    `</gpx>\n`
  );
}

export function osmUrl(trek: Trek): string {
  const [lat, lng] = trek.trailheadCoords ?? [0, 0];
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}`;
}

export function googleMapsUrl(trek: Trek): string {
  const [lat, lng] = trek.trailheadCoords ?? [0, 0];
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
