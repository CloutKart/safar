"use client";

import { useState } from "react";
import { TREK_DNA_DIMS, type Trek, type TrekDnaDim } from "@/lib/trek/schema";
import {
  googleMapsUrl,
  nextSaturdayISO,
  osmUrl,
  trekGoogleCalendarUrl,
  trekGpx,
  trekIcs,
} from "@/lib/trek/exports";

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

const DNA_LABELS: Partial<Record<TrekDnaDim, string>> = {
  views: "Views",
  adventure: "Adventure",
  forest: "Forest",
  waterfalls: "Waterfalls",
  photography: "Photo-ops",
  camping: "Camping",
};

// A branded 1080×1350 text-only share image (no external photo → canvas stays
// untainted so toBlob/share work).
function renderShareCard(trek: Trek): Promise<Blob | null> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#0c1311");
  grad.addColorStop(1, "#14342a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#9bb0a8";
  ctx.font = "700 30px system-ui, -apple-system, sans-serif";
  ctx.fillText("SAFAR · TREKS", 90, 150);
  ctx.fillStyle = "#45c98a";
  ctx.fillRect(90, 178, 110, 10);

  ctx.fillStyle = "#eef3f0";
  ctx.font = "800 88px system-ui, -apple-system, sans-serif";
  const titleY = wrapText(ctx, trek.name, 90, 300, W - 180, 92);

  ctx.fillStyle = "#cfeede";
  ctx.font = "600 38px system-ui, sans-serif";
  ctx.fillText(`${trek.region || trek.state} · ${trek.state}`, 90, titleY + 70);

  const stats = [
    trek.distanceKm != null ? `${trek.distanceKm} km` : "",
    `${trek.difficulty} grade`,
    trek.maxAltitudeM != null ? `${trek.maxAltitudeM} m` : "",
  ].filter(Boolean);
  ctx.fillStyle = "#9bd9b8";
  ctx.font = "500 36px system-ui, sans-serif";
  ctx.fillText(stats.join("   ·   "), 90, titleY + 140);

  const strong = TREK_DNA_DIMS.filter((d) => trek.dna[d] >= 7 && DNA_LABELS[d]).slice(0, 4);
  let hy = titleY + 250;
  ctx.font = "500 40px system-ui, sans-serif";
  for (const dim of strong) {
    ctx.fillStyle = "#45c98a";
    ctx.fillText("•", 90, hy);
    ctx.fillStyle = "#dfe9e5";
    ctx.fillText(`${DNA_LABELS[dim]} ${trek.dna[dim]}/10`, 134, hy);
    hy += 66;
  }

  ctx.fillStyle = "#dfe9e5";
  ctx.font = "400 34px system-ui, sans-serif";
  wrapText(ctx, trek.blurb, 90, Math.max(hy + 40, H - 320), W - 180, 46);

  ctx.fillStyle = "#9bb0a8";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillText("Find your trail on Safar", 90, H - 110);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

export function TrekExports({ trek }: { trek: Trek }) {
  const [date, setDate] = useState(nextSaturdayISO());
  const [busy, setBusy] = useState(false);

  const onIcs = () => downloadBlob(new Blob([trekIcs(trek, date)], { type: "text/calendar" }), `${trek.slug}.ics`);
  const onGpx = () => downloadBlob(new Blob([trekGpx(trek)], { type: "application/gpx+xml" }), `${trek.slug}.gpx`);

  async function onShare() {
    setBusy(true);
    try {
      const blob = await renderShareCard(trek);
      if (!blob) return;
      const file = new File([blob], `${trek.slug}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: trek.name });
      } else {
        downloadBlob(blob, `${trek.slug}.png`);
      }
    } catch {
      // user dismissed share / unsupported — no-op
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="trek-exports">
      <div className="tx-row">
        <label>
          Trek date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <div className="tx-buttons">
        <button type="button" onClick={onIcs}>📅 Calendar (.ics)</button>
        <a className="tx-btn" href={trekGoogleCalendarUrl(trek, date)} target="_blank" rel="noopener noreferrer">Google Calendar</a>
        <button type="button" onClick={onGpx}>🧭 GPX waypoint</button>
        <a className="tx-btn" href={osmUrl(trek)} target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
        <a className="tx-btn" href={googleMapsUrl(trek)} target="_blank" rel="noopener noreferrer">Google Maps</a>
        <button type="button" onClick={() => void onShare()} disabled={busy}>{busy ? "…" : "📤 Share card"}</button>
      </div>
      <p className="tx-note">Calendar event starts at the sunrise leave-by time. GPX marks the trailhead (not a surveyed track).</p>
    </div>
  );
}
