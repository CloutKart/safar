import type { GeneratedPlan } from "@/lib/domain";
import type { Vibe } from "@/lib/trip/vibe";

export type TripDates = { start: string | null; end: string | null };

const DAY_MS = 86_400_000;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateFromISO(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function addDays(iso: string, days: number): Date {
  return new Date(dateFromISO(iso).getTime() + days * DAY_MS);
}

// Compact UTC date for ICS / Google Calendar (YYYYMMDD).
function ymd(date: Date): string {
  return (
    `${date.getUTCFullYear()}` +
    `${String(date.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(date.getUTCDate()).padStart(2, "0")}`
  );
}

// ── Highlights (share card) ──────────────────────────────────────────────────
const NOTABLE_KINDS = new Set(["sight", "hidden-gem", "activity"]);

// The first few standout, named stops — for the share card and previews.
export function topHighlights(plan: GeneratedPlan, count = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const day of plan.itinerary) {
    for (const stop of day.stops) {
      if (!NOTABLE_KINDS.has(stop.kind)) continue;
      const key = stop.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(stop.name);
      if (out.length >= count) return out;
    }
  }
  return out;
}

// ── ICS (calendar export) ────────────────────────────────────────────────────
function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// One all-day VEVENT per itinerary day, anchored at the trip start (today as a
// fallback so the calendar is always valid). DTEND is exclusive per RFC 5545.
export function buildIcs(plan: GeneratedPlan, tripDates: TripDates): string {
  const anchor = tripDates.start ?? todayISO();
  const stamp = `${ymd(new Date())}T000000Z`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Safar//Trip Planner//EN",
    "CALSCALE:GREGORIAN",
  ];
  plan.itinerary.forEach((day, index) => {
    const start = addDays(anchor, index);
    const end = addDays(anchor, index + 1);
    const description =
      day.stops.map((stop) => stop.name).join(", ") +
      (day.stay ? ` · Stay: ${day.stay.name}` : "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:safar-${plan.destinationSlug}-day${day.day}-${stamp}@safar.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`,
      `DTEND;VALUE=DATE:${ymd(end)}`,
      `SUMMARY:${icsEscape(`Day ${day.day} · ${day.title} — ${plan.destinationName}`)}`,
      `LOCATION:${icsEscape(plan.destinationName)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// A Google Calendar "add event" template URL for the whole trip window.
export function googleCalendarUrl(
  plan: GeneratedPlan,
  tripDates: TripDates,
  roomUrl?: string,
): string {
  const anchor = tripDates.start ?? todayISO();
  const start = dateFromISO(anchor);
  const endDate = tripDates.end
    ? dateFromISO(tripDates.end)
    : addDays(anchor, plan.itinerary.length - 1);
  const endExclusive = new Date(endDate.getTime() + DAY_MS);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${plan.destinationName} trip`,
    dates: `${ymd(start)}/${ymd(endExclusive)}`,
    details: roomUrl ? `${plan.summary}\n\nPlan: ${roomUrl}` : plan.summary,
    location: plan.destinationName,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ── Packing checklist ────────────────────────────────────────────────────────
export interface PackingSection {
  category: string;
  items: string[];
}

// A contextual checklist derived from the winning plan's stops + the room vibe.
export function packingList(plan: GeneratedPlan, vibes: Vibe[] = []): PackingSection[] {
  const names = plan.itinerary
    .flatMap((day) => day.stops.map((stop) => stop.name.toLowerCase()))
    .join(" ");
  const kinds = new Set(
    plan.itinerary.flatMap((day) => day.stops.map((stop) => stop.kind)),
  );
  const has = (re: RegExp) => re.test(names);
  const vibe = (name: Vibe) => vibes.includes(name);
  const sections: PackingSection[] = [
    {
      category: "Essentials",
      items: [
        "ID + travel tickets",
        "Phone + charger / power bank",
        "Cash + cards",
        "Personal medication",
        "Toiletries kit",
        "Reusable water bottle",
      ],
    },
  ];

  const activity: string[] = [];
  if (has(/trek|trail|hike|summit|ridge/) || vibe("trek"))
    activity.push("Trekking / grippy shoes", "Moisture-wicking layers", "Light rain shell", "Daypack");
  if (has(/beach|coast|shack|snorkel|surf/) || vibe("beach"))
    activity.push("Sunscreen SPF 50", "Swimwear", "Flip-flops", "Quick-dry towel");
  if (has(/raft|kayak|canoe/) || vibe("river"))
    activity.push("Quick-dry clothes", "Waterproof dry-bag");
  if (has(/camp|bonfire|stargaz/))
    activity.push("Headlamp / torch", "Warm layer for the night", "Insect repellent");
  if (has(/temple|ghat|monaster|ashram|shrine/) || vibe("spiritual"))
    activity.push("Covered clothing (shoulders / knees)", "Easy slip-off footwear");
  if (has(/\bcave/)) activity.push("Sturdy shoes", "Small torch");
  if (activity.length) {
    sections.push({ category: "For your activities", items: [...new Set(activity)] });
  }

  const climate: string[] = [];
  if (vibe("mountains") || has(/snow|glacier|alpine/))
    climate.push("Warm jacket", "Gloves + beanie", "Thermal base layer");
  if (vibe("desert")) climate.push("Wide-brim hat", "Light full-sleeves", "Lip balm");
  if (climate.length) sections.push({ category: "Climate", items: [...new Set(climate)] });

  const extras: string[] = [];
  if (kinds.has("food")) extras.push("Antacids / digestive meds");
  if (has(/\bbar\b|\bpub\b|club|night|rooftop|lounge/) || vibe("nightlife"))
    extras.push("One going-out outfit");
  if (extras.length) sections.push({ category: "Extras", items: [...new Set(extras)] });

  return sections;
}

// Render the checklist as a chat message to share back into the room.
export function packingListText(
  sections: PackingSection[],
  destinationName: string,
): string {
  const body = sections
    .map(
      (section) =>
        `*${section.category}*\n${section.items.map((item) => `• ${item}`).join("\n")}`,
    )
    .join("\n\n");
  return `🎒 Packing list for ${destinationName}\n\n${body}`;
}
