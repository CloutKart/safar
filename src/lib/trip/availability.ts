import type { MemberAvailability } from "@/lib/store/types";

const DAY_MS = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);

export interface FreeWindow {
  start: string;
  end: string;
  days: number;
}

// Union of every member's unavailable dates (ISO yyyy-mm-dd).
export function blockedDates(availability: MemberAvailability[]): Set<string> {
  const set = new Set<string>();
  for (const member of availability) {
    for (const date of member.unavailableDates) set.add(date);
  }
  return set;
}

// The longest contiguous run of dates no member marked unavailable, within a
// [horizonStart, +horizonDays] window. Null when nobody has marked anything
// (so the UI only surfaces a window once it's meaningful).
export function commonFreeWindow(
  availability: MemberAvailability[],
  horizonStartISO: string | null,
  horizonDays = 60,
): FreeWindow | null {
  const blocked = blockedDates(availability);
  if (blocked.size === 0) return null;
  const start = horizonStartISO
    ? new Date(`${horizonStartISO}T00:00:00Z`)
    : new Date();
  let best: FreeWindow | null = null;
  let runStart: Date | null = null;
  for (let i = 0; i <= horizonDays; i += 1) {
    const day = new Date(start.getTime() + i * DAY_MS);
    const free = !blocked.has(iso(day));
    if (free && !runStart) runStart = day;
    if ((!free || i === horizonDays) && runStart) {
      const endDay = free ? day : new Date(day.getTime() - DAY_MS);
      const days = Math.round((endDay.getTime() - runStart.getTime()) / DAY_MS) + 1;
      if (!best || days > best.days) {
        best = { start: iso(runStart), end: iso(endDay), days };
      }
      runStart = null;
    }
  }
  return best;
}

// Dates within the stated trip window that a member marked unavailable — used to
// flag a date conflict in the summary.
export function datesConflicting(
  availability: MemberAvailability[],
  startISO: string | null,
  endISO: string | null,
): string[] {
  if (!startISO) return [];
  const blocked = blockedDates(availability);
  if (blocked.size === 0) return [];
  const start = new Date(`${startISO}T00:00:00Z`).getTime();
  const end = new Date(`${endISO ?? startISO}T00:00:00Z`).getTime();
  const hits: string[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const key = iso(new Date(t));
    if (blocked.has(key)) hits.push(key);
  }
  return hits;
}
