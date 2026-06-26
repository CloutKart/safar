import { describe, expect, it } from "vitest";
import type { GeneratedPlan, ItineraryStop } from "@/lib/domain";
import {
  buildIcs,
  googleCalendarUrl,
  packingList,
  topHighlights,
} from "@/lib/trip/exports";

function stop(name: string, kind: ItineraryStop["kind"] = "sight"): ItineraryStop {
  return {
    name,
    kind,
    note: "",
    approxInr: null,
    rating: null,
    reviewCount: null,
    reviewSnippet: null,
    mapsUrl: null,
    mustTry: null,
    trail: null,
    time: null,
    description: null,
    bestTime: null,
    crowdLevel: null,
    photoScore: null,
  };
}

type Day = GeneratedPlan["itinerary"][number];
function day(partial: Pick<Day, "day" | "title" | "stops" | "stay">): Day {
  return {
    theme: "",
    goal: "",
    narrative: "",
    moments: { photoSpot: null, sunset: null, dish: null, cafe: null, experience: null },
    ...partial,
  };
}

function plan(
  itinerary: GeneratedPlan["itinerary"],
  over: Partial<GeneratedPlan> = {},
): GeneratedPlan {
  return {
    destinationName: "Tirthan Valley",
    destinationSlug: "tirthan-valley",
    summary: "A calm river escape.",
    itinerary,
    ...over,
  } as unknown as GeneratedPlan;
}

const trekPlan = plan([
  day({ day: 1, title: "Arrive, riverside", stops: [stop("Check-in"), stop("Riverside café", "food")], stay: { name: "Doli Guesthouse", area: "Gushaini", approxInrPerNight: 1800 } }),
  day({ day: 2, title: "Trek day", stops: [stop("Jalori Pass trek", "activity"), stop("Serolsar Lake", "hidden-gem")], stay: null }),
]);

describe("topHighlights", () => {
  it("picks the first notable, named stops and skips food/transport", () => {
    expect(topHighlights(trekPlan, 3)).toEqual([
      "Check-in",
      "Jalori Pass trek",
      "Serolsar Lake",
    ]);
  });
});

describe("buildIcs", () => {
  it("emits one all-day VEVENT per day anchored at the trip start", () => {
    const ics = buildIcs(trekPlan, { start: "2026-07-18", end: "2026-07-19" });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260718");
    expect(ics).toContain("DTEND;VALUE=DATE:20260719"); // exclusive end of day 1
    expect(ics).toContain("DTSTART;VALUE=DATE:20260719"); // day 2
    expect(ics).toContain("LOCATION:Tirthan Valley");
    expect(ics.endsWith("END:VCALENDAR")).toBe(true);
  });

  it("escapes commas in summaries and still anchors when no start date", () => {
    const ics = buildIcs(
      plan([day({ day: 1, title: "Forts, lakes & lanes", stops: [stop("Fort")], stay: null })]),
      { start: null, end: null },
    );
    expect(ics).toContain("Forts\\, lakes");
    expect(ics).toContain("DTSTART;VALUE=DATE:");
  });
});

describe("googleCalendarUrl", () => {
  it("builds a TEMPLATE link spanning the trip window", () => {
    const url = googleCalendarUrl(trekPlan, { start: "2026-07-18", end: "2026-07-19" }, "https://safar.app/trip/x");
    expect(url).toContain("calendar.google.com/calendar/render");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("dates=20260718%2F20260720"); // end is exclusive (+1 day)
    expect(decodeURIComponent(url)).toContain("https://safar.app/trip/x");
  });
});

describe("packingList", () => {
  it("always includes essentials and adds gear for the itinerary's activities", () => {
    const sections = packingList(trekPlan, ["trek"]);
    const flat = sections.flatMap((s) => s.items);
    expect(sections[0].category).toBe("Essentials");
    expect(flat).toContain("Trekking / grippy shoes");
  });

  it("derives beach gear + climate from a beach plan and mountain vibe", () => {
    const beach = plan([
      day({ day: 1, title: "Beach day", stops: [stop("Om Beach"), stop("Beach shack", "food")], stay: null }),
    ]);
    const flat = packingList(beach, ["mountains"]).flatMap((s) => s.items);
    expect(flat).toContain("Sunscreen SPF 50");
    expect(flat).toContain("Warm jacket"); // from the mountains vibe
  });
});
