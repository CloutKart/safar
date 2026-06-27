"use client";

import { useMemo, useState } from "react";
import type { LatLng } from "@/lib/cityCoords";
import { leaveBy, sunTimes } from "@/lib/trek/sun";

// A date-aware golden-hour plan for a trek's trailhead. Pure client-side compute
// (no API) via the SunCalc helper, so it's always accurate for the chosen day.
export function SunPlan({
  coords,
  hoursToViewpoint,
}: {
  coords: LatLng;
  hoursToViewpoint: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  const { sun, leave } = useMemo(() => {
    const d = new Date(`${date}T00:00:00Z`);
    return { sun: sunTimes(coords, d), leave: leaveBy(coords, d, hoursToViewpoint) };
  }, [coords, date, hoursToViewpoint]);

  return (
    <div className="sun-plan">
      <div className="sun-plan-head">
        <h3>☀️ Light &amp; golden hour</h3>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          aria-label="Trek date"
        />
      </div>
      <div className="sun-grid">
        {leave && (
          <div className="sun-cell sun-leave">
            <span className="sun-k">Leave trailhead by</span>
            <strong>{leave}</strong>
            <span className="sun-note">to catch sunrise at a viewpoint</span>
          </div>
        )}
        <div className="sun-cell">
          <span className="sun-k">Sunrise</span>
          <strong>{sun.sunrise ?? "—"}</strong>
          {sun.goldenMorning && (
            <span className="sun-note">
              golden {sun.goldenMorning.start}–{sun.goldenMorning.end}
            </span>
          )}
        </div>
        <div className="sun-cell">
          <span className="sun-k">Sunset</span>
          <strong>{sun.sunset ?? "—"}</strong>
          {sun.goldenEvening && (
            <span className="sun-note">
              golden {sun.goldenEvening.start}–{sun.goldenEvening.end}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
