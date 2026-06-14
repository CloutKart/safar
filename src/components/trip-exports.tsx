"use client";

import { useMemo, useState } from "react";
import type { GeneratedPlan } from "@/lib/domain";
import type { Vibe } from "@/lib/trip/vibe";
import {
  buildIcs,
  googleCalendarUrl,
  packingList,
  packingListText,
  topHighlights,
  type TripDates,
} from "@/lib/trip/exports";

const inr = (value: number) => `₹${value.toLocaleString("en-IN")}`;

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "";
  const opts = { month: "short", day: "numeric" } as const;
  const s = new Date(`${start}T00:00:00`);
  const left = s.toLocaleDateString("en-IN", opts);
  if (!end || end === start) return left;
  const e = new Date(`${end}T00:00:00`);
  const right =
    e.getMonth() === s.getMonth()
      ? String(e.getDate())
      : e.toLocaleDateString("en-IN", opts);
  return `${left}–${right}`;
}

function buzz() {
  try {
    navigator.vibrate?.(8);
  } catch {
    // unsupported; ignore
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(" ");
  let line = "";
  let curY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      line = word;
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, curY);
  return curY;
}

// A branded 1080×1080 share image — text only (no external photo), so the
// canvas stays untainted and toBlob/share work.
function renderShareCard(
  plan: GeneratedPlan,
  tripDates: TripDates,
  roomUrl: string,
): Promise<Blob | null> {
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#0c1311");
  grad.addColorStop(1, "#14342a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "#9bb0a8";
  ctx.font = "700 30px system-ui, -apple-system, sans-serif";
  ctx.fillText("SAFAR · GROUP TRIP", 90, 160);
  ctx.fillStyle = "#45c98a";
  ctx.fillRect(90, 188, 110, 10);

  ctx.fillStyle = "#eef3f0";
  ctx.font = "800 92px system-ui, -apple-system, sans-serif";
  const titleY = wrapText(ctx, plan.destinationName, 90, 320, size - 180, 96);

  const dateStr = formatDateRange(tripDates.start, tripDates.end);
  const costStr = `${inr(plan.cost.likelyInr)}/person`;
  ctx.fillStyle = "#cfeede";
  ctx.font = "600 40px system-ui, sans-serif";
  ctx.fillText([dateStr, costStr].filter(Boolean).join("   ·   "), 90, titleY + 78);

  let hy = titleY + 200;
  ctx.font = "500 40px system-ui, sans-serif";
  for (const highlight of topHighlights(plan, 3)) {
    ctx.fillStyle = "#45c98a";
    ctx.fillText("•", 90, hy);
    ctx.fillStyle = "#dfe9e5";
    ctx.fillText(highlight, 134, hy);
    hy += 66;
  }

  ctx.fillStyle = "#9bb0a8";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillText("Plan + vote on Safar", 90, size - 132);
  ctx.fillStyle = "#748a82";
  ctx.font = "400 26px system-ui, sans-serif";
  ctx.fillText(roomUrl.replace(/^https?:\/\//, ""), 90, size - 92);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

// A clean, light-theme document used only for printing (window.print / Save PDF).
function PrintSheet({
  plan,
  tripDates,
  groupSize,
}: {
  plan: GeneratedPlan;
  tripDates: TripDates;
  groupSize: number;
}) {
  const dateStr = formatDateRange(tripDates.start, tripDates.end);
  return (
    <div className="print-sheet" aria-hidden="true">
      <h1>{plan.destinationName}</h1>
      <p className="print-sub">
        {plan.title} · {plan.angle}
        {dateStr ? ` · ${dateStr}` : ""}
      </p>
      <p className="print-summary">{plan.summary}</p>
      {plan.itinerary.map((day) => (
        <div className="print-day" key={day.day}>
          <h2>
            Day {day.day} · {day.title}
          </h2>
          <ul>
            {day.stops.map((stop, index) => (
              <li key={index}>
                {stop.name}
                {stop.note ? ` — ${stop.note}` : ""}
                {stop.approxInr != null ? ` (~${inr(stop.approxInr)})` : ""}
              </li>
            ))}
          </ul>
          {day.stay && (
            <p className="print-stay">
              Stay: {day.stay.name}
              {day.stay.area ? `, ${day.stay.area}` : ""}
              {day.stay.approxInrPerNight != null
                ? ` · ${inr(day.stay.approxInrPerNight)}/night`
                : ""}
            </p>
          )}
        </div>
      ))}
      <div className="print-cost">
        <h2>Estimated cost (per person)</h2>
        <p>
          {inr(plan.cost.lowInr)}–{inr(plan.cost.highInr)} · likely{" "}
          {inr(plan.cost.likelyInr)}
          {groupSize > 1 ? ` · group total ${inr(plan.cost.likelyInr * groupSize)}` : ""}
        </p>
        {plan.cost.breakdown && (
          <p>
            Transport {inr(plan.cost.breakdown.transportInr)} · Stay{" "}
            {inr(plan.cost.breakdown.stayInr)} · Activities{" "}
            {inr(plan.cost.breakdown.activitiesInr)} · Food{" "}
            {inr(plan.cost.breakdown.foodInr)}
          </p>
        )}
      </div>
      {plan.sources.length > 0 && (
        <div className="print-sources">
          <h2>Sources</h2>
          <ul>
            {plan.sources.map((source) => (
              <li key={source.url}>
                {source.publisher} — {source.title} (retrieved{" "}
                {new Date(source.retrievedAt).toLocaleDateString("en-IN")}) · {source.url}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="print-foot">Planned with Safar</p>
    </div>
  );
}

// The post-decision export hub: PDF, share card, calendar, packing checklist.
export function TripExports({
  plan,
  tripDates,
  groupSize,
  roomUrl,
  vibes,
  onShareToRoom,
}: {
  plan: GeneratedPlan;
  tripDates: TripDates;
  groupSize: number;
  roomUrl: string;
  vibes: Vibe[];
  onShareToRoom: (text: string) => void;
}) {
  const [packOpen, setPackOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const sections = useMemo(() => packingList(plan, vibes), [plan, vibes]);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onShareCard = async () => {
    buzz();
    const blob = await renderShareCard(plan, tripDates, roomUrl);
    if (!blob) return;
    const file = new File([blob], `${plan.destinationSlug}-safar.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      try {
        await navigator.share({ files: [file], title: `${plan.destinationName} trip` });
        return;
      } catch {
        // cancelled / unsupported — fall through to download
      }
    }
    downloadBlob(blob, `${plan.destinationSlug}-safar.png`);
  };

  const onCalendar = () => {
    buzz();
    downloadBlob(
      new Blob([buildIcs(plan, tripDates)], { type: "text/calendar;charset=utf-8" }),
      `${plan.destinationSlug}-trip.ics`,
    );
  };

  return (
    <div className="export-block">
      <p className="export-head">🎉 You’re going to {plan.destinationName}! Take it with you:</p>
      <div className="export-bar">
        <button type="button" onClick={() => window.print()}>
          📄 PDF
        </button>
        <button type="button" onClick={onShareCard}>
          🖼️ Share card
        </button>
        <button type="button" onClick={onCalendar}>
          📅 Calendar
        </button>
        <a
          className="export-link"
          href={googleCalendarUrl(plan, tripDates, roomUrl)}
          target="_blank"
          rel="noreferrer"
        >
          Google Cal
        </a>
        <button
          type="button"
          className={packOpen ? "active" : ""}
          onClick={() => setPackOpen((open) => !open)}
        >
          🎒 Packing
        </button>
      </div>

      {packOpen && (
        <div className="packing">
          {sections.map((section) => (
            <div className="packing-section" key={section.category}>
              <p className="packing-cat">{section.category}</p>
              <ul>
                {section.items.map((item) => {
                  const id = `${section.category}:${item}`;
                  const on = checked.has(id);
                  return (
                    <li key={id}>
                      <label className={`packing-item${on ? " checked" : ""}`}>
                        <input type="checkbox" checked={on} onChange={() => toggle(id)} />
                        <span>{item}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <button
            type="button"
            className="packing-share"
            onClick={() => onShareToRoom(packingListText(sections, plan.destinationName))}
          >
            Share list to room
          </button>
        </div>
      )}

      <PrintSheet plan={plan} tripDates={tripDates} groupSize={groupSize} />
    </div>
  );
}
