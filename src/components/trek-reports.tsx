"use client";

import { useEffect, useState } from "react";
import {
  TRAIL_STATUS,
  WATER_STATUS,
  type ConditionConfidence,
  type TrekReport,
} from "@/lib/trek/reports";

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

interface Payload {
  reports: TrekReport[];
  confidence: ConditionConfidence;
}

export function TrekReports({ slug }: { slug: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    trailStatus: "clear" as (typeof TRAIL_STATUS)[number],
    waterStatus: "unknown" as (typeof WATER_STATUS)[number],
    rating: 4,
    note: "",
    name: "",
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/treks/${slug}/reports`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setData(d as Payload);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/treks/${slug}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trailStatus: form.trailStatus,
          waterStatus: form.waterStatus,
          rating: form.rating,
          note: form.note.trim() || undefined,
          name: form.name.trim() || undefined,
        }),
      });
      if (res.ok) {
        setData((await res.json()) as Payload);
        setForm((f) => ({ ...f, note: "" }));
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  const confidence = data?.confidence;
  const reports = data?.reports ?? [];

  return (
    <div className="trek-reports">
      <div className="tr-head">
        <h3>Trail reports</h3>
        {confidence && <span className={`tr-conf tr-${confidence.level}`}>{confidence.label}</span>}
      </div>

      {reports.length > 0 ? (
        <ul className="tr-list">
          {reports.slice(0, 6).map((r) => (
            <li key={r.id}>
              <div className="tr-meta">
                <span className={`tr-status status-${r.trailStatus}`}>{r.trailStatus.replace(/-/g, " ")}</span>
                <span className="tr-water">💧 {r.waterStatus}</span>
                <span className="tr-rating">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                <span className="tr-when">{ago(r.createdAt)}{r.name ? ` · ${r.name}` : ""}</span>
              </div>
              {r.note && <p className="tr-note">{r.note}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="tr-empty">No reports in the last 3 days. Trekked it recently? Be the first.</p>
      )}

      {open ? (
        <div className="tr-form">
          <div className="tr-form-row">
            <label>
              Trail
              <select value={form.trailStatus} onChange={(e) => setForm((f) => ({ ...f, trailStatus: e.target.value as typeof f.trailStatus }))}>
                {TRAIL_STATUS.map((s) => (
                  <option key={s} value={s}>{s.replace(/-/g, " ")}</option>
                ))}
              </select>
            </label>
            <label>
              Water
              <select value={form.waterStatus} onChange={(e) => setForm((f) => ({ ...f, waterStatus: e.target.value as typeof f.waterStatus }))}>
                {WATER_STATUS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Overall
              <select value={form.rating} onChange={(e) => setForm((f) => ({ ...f, rating: Number(e.target.value) }))}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{n} ★</option>
                ))}
              </select>
            </label>
          </div>
          <input
            type="text"
            placeholder="What should others know? (e.g. stream knee-high, start early)"
            maxLength={280}
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          />
          <div className="tr-form-row">
            <input type="text" placeholder="Your name (optional)" maxLength={40} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <button type="button" onClick={() => void submit()} disabled={busy}>{busy ? "Posting…" : "Post report"}</button>
            <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="tr-add" onClick={() => setOpen(true)}>＋ Add a report</button>
      )}

      <p className="tr-disclaimer">Community reports expire after 72 hours. Verify critical conditions locally.</p>
    </div>
  );
}
