import { monthSuitability } from "@/lib/trek/enrich";
import type { Trek } from "@/lib/trek/schema";

const SHORT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Best-time-to-go strip: 12 colour-coded months, deterministic from the trek's
// season + altitude + landslide hazards. Pure presentational (no client state).
export function TrekCalendarHeatmap({ trek }: { trek: Trek }) {
  const cells = monthSuitability(trek);
  return (
    <div className="trek-calendar">
      <div className="cal-row">
        {cells.map((c, i) => (
          <div key={c.month} className={`cal-cell cal-${c.level}`} title={`${FULL[i]}: ${c.note}`}>
            <span>{SHORT[i]}</span>
          </div>
        ))}
      </div>
      <div className="cal-legend">
        <span className="cal-key cal-ideal">Ideal</span>
        <span className="cal-key cal-okay">Okay</span>
        <span className="cal-key cal-avoid">Avoid</span>
      </div>
    </div>
  );
}
