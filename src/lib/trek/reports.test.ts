import { afterEach, describe, expect, it } from "vitest";
import {
  addTrekReport,
  conditionConfidence,
  getTrekReports,
  TrekReportInputSchema,
} from "@/lib/trek/reports";

// Tests run with Supabase off → the in-memory fallback. Reset between tests.
afterEach(() => {
  (globalThis as { __safarTrekReports?: unknown[] }).__safarTrekReports = [];
});

describe("trek reports (in-memory fallback)", () => {
  it("validates and defaults the report input", () => {
    const ok = TrekReportInputSchema.safeParse({ trailStatus: "clear", rating: 4 });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.waterStatus).toBe("unknown");
    expect(TrekReportInputSchema.safeParse({ trailStatus: "nope", rating: 4 }).success).toBe(false);
    expect(TrekReportInputSchema.safeParse({ trailStatus: "clear", rating: 9 }).success).toBe(false);
  });

  it("stores and reads back a report for a trek, scoped by slug", async () => {
    await addTrekReport("triund", { trailStatus: "muddy", waterStatus: "flowing", rating: 3, note: "slippery after rain" });
    const reports = await getTrekReports("triund");
    expect(reports).toHaveLength(1);
    expect(reports[0].trailStatus).toBe("muddy");
    expect(reports[0].note).toContain("slippery");
    expect(await getTrekReports("other-trek")).toHaveLength(0);
  });

  it("derives a fresh condition confidence from a recent report", async () => {
    await addTrekReport("nag-tibba", { trailStatus: "snow", waterStatus: "low", rating: 4, note: "" });
    const reports = await getTrekReports("nag-tibba");
    const conf = conditionConfidence(reports);
    expect(conf.level).toBe("fresh");
    expect(conf.count).toBe(1);
    expect(conditionConfidence([]).level).toBe("none");
  });
});
