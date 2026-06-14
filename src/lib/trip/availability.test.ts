import { describe, expect, it } from "vitest";
import type { MemberAvailability } from "@/lib/store/types";
import { commonFreeWindow, datesConflicting } from "@/lib/trip/availability";

const member = (
  participantId: string,
  unavailableDates: string[],
): MemberAvailability => ({ participantId, displayName: participantId, unavailableDates });

describe("commonFreeWindow", () => {
  it("returns the longest run no member blocked, within the horizon", () => {
    const window = commonFreeWindow(
      [member("a", ["2026-06-20", "2026-06-21"])],
      "2026-06-18",
      10, // horizon 18 → 28
    );
    // 22–28 (7 days) beats 18–19 (2 days).
    expect(window).toEqual({ start: "2026-06-22", end: "2026-06-28", days: 7 });
  });

  it("unions every member's blocked dates", () => {
    const window = commonFreeWindow(
      [member("a", ["2026-06-19"]), member("b", ["2026-06-22"])],
      "2026-06-18",
      5, // 18 → 23; free runs: [18], [20,21], [23]
    );
    expect(window).toEqual({ start: "2026-06-20", end: "2026-06-21", days: 2 });
  });

  it("is null when nobody has marked anything", () => {
    expect(commonFreeWindow([member("a", [])], "2026-06-18", 10)).toBeNull();
  });
});

describe("datesConflicting", () => {
  it("flags stated trip dates that overlap a blocked day", () => {
    expect(
      datesConflicting(
        [member("a", ["2026-06-20"])],
        "2026-06-19",
        "2026-06-21",
      ),
    ).toEqual(["2026-06-20"]);
  });

  it("returns nothing when the window is clear or unset", () => {
    expect(
      datesConflicting([member("a", ["2026-06-25"])], "2026-06-19", "2026-06-21"),
    ).toEqual([]);
    expect(datesConflicting([member("a", ["2026-06-20"])], null, null)).toEqual([]);
  });
});
