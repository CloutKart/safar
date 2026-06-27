import { describe, expect, it } from "vitest";
import { getSeedTrek } from "@/data/treks";
import {
  googleMapsUrl,
  nextSaturdayISO,
  osmUrl,
  trekGoogleCalendarUrl,
  trekGpx,
  trekIcs,
} from "@/lib/trek/exports";

const triund = getSeedTrek("triund")!;

describe("trek exports", () => {
  it("builds a valid timed ICS with a reminder", () => {
    const ics = trekIcs(triund, "2026-08-15");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(ics).toMatch(/DTEND:\d{8}T\d{6}Z/);
    expect(ics).toContain("Triund");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("builds a Google Calendar URL with a dates range", () => {
    const url = trekGoogleCalendarUrl(triund, "2026-08-15");
    expect(url).toContain("calendar.google.com");
    expect(url).toMatch(/dates=\d{8}T\d{6}Z%2F\d{8}T\d{6}Z/);
  });

  it("builds a GPX trailhead waypoint at the trek's coords", () => {
    const [lat, lng] = triund.trailheadCoords!;
    const gpx = trekGpx(triund);
    expect(gpx).toContain("<gpx");
    expect(gpx).toContain(`lat="${lat}"`);
    expect(gpx).toContain(`lon="${lng}"`);
  });

  it("map links include the coordinates", () => {
    const [lat, lng] = triund.trailheadCoords!;
    expect(osmUrl(triund)).toContain(`mlat=${lat}`);
    expect(googleMapsUrl(triund)).toContain(`${lat},${lng}`);
  });

  it("nextSaturdayISO returns a future Saturday", () => {
    const iso = nextSaturdayISO(new Date("2026-08-12T00:00:00Z")); // a Wednesday
    expect(iso).toBe("2026-08-15");
    expect(new Date(`${iso}T00:00:00Z`).getUTCDay()).toBe(6);
  });
});
