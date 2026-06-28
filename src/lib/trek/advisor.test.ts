import { describe, expect, it } from "vitest";
import { getSeedTrek } from "@/data/treks";
import { buildAdvisorContext, fallbackAnswer } from "@/lib/trek/advisor";

describe("trek advisor fallback", () => {
  const kanamo = () => getSeedTrek("kanamo-peak")!; // permit, 5,974 m
  const deoria = () => getSeedTrek("deoria-tal")!; // easy, year-round water

  it("defers medical questions to a doctor and never clears the user", () => {
    const a = fallbackAnswer(kanamo(), "I have asthma, can I do this?");
    expect(a).toMatch(/doctor/i);
    expect(a).not.toMatch(/\bsafe for you\b|you'll be fine|you will be fine/i);
  });

  it("answers permit, days and water from structured fields", () => {
    expect(fallbackAnswer(kanamo(), "Do I need a permit?")).toMatch(/permit is required/i);
    expect(fallbackAnswer(kanamo(), "How many days do I need?")).toMatch(/day/i);
    expect(fallbackAnswer(deoria(), "Is there water on the trail?")).toMatch(/water/i);
  });

  it("builds a context string that names the trek and its grade", () => {
    const ctx = buildAdvisorContext(kanamo());
    expect(ctx).toMatch(/Kanamo/);
    expect(ctx).toMatch(/difficulty: expert/);
  });
});
