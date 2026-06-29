"use client";

import { useEffect, useRef, useState } from "react";
import type { ElevationPoint } from "@/lib/trek/enrich";
import type { TrekPhoto } from "@/lib/trek/schema";
import { creditName } from "@/lib/trek/photo-pool";
import { InteractiveElevation } from "@/components/interactive-elevation";

export interface JourneyStep {
  km: number;
  label: string;
  description: string;
  type: string;
  synthesized: boolean;
  markers: string[];
  photo: TrekPhoto | null;
}

function icon(type: string): string {
  if (type === "trailhead") return "◉";
  if (type === "forest") return "♧";
  if (type === "waterfall" || type === "water" || type === "stream") return "≈";
  if (type === "summit" || type === "pass") return "△";
  if (type === "village") return "⌂";
  return "•";
}

function nearestStep(steps: JourneyStep[], km: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const d = Math.abs(steps[i].km - km);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function PhotoCredit({ photo }: { photo: TrekPhoto }) {
  const text = `📷 ${creditName(photo.credit)}${photo.license ? ` · ${photo.license}` : ""}`;
  return photo.sourceUrl ? (
    <a className="photo-credit" href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  ) : (
    <span className="photo-credit">{text}</span>
  );
}

// The visual trail journey: the elevation profile and the photo-timeline share a
// single `activeKm`. Each step shows a REAL photo of this trek (or none) — no
// representative stand-ins — with attribution.
export function TrekTrailJourney({
  steps,
  points,
}: {
  steps: JourneyStep[];
  points: ElevationPoint[];
}) {
  const [activeKm, setActiveKm] = useState<number>(steps[0]?.km ?? 0);
  const activeIdx = nearestStep(steps, activeKm);

  // Parallax: each photo is an over-sized layer translated against scroll, so the
  // image pans within its frame as the step moves through the viewport (depth on
  // any aspect ratio, not just tall photos). Skipped under reduced-motion.
  const photoRefs = useRef<Array<HTMLElement | null>>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      for (const img of photoRefs.current) {
        const frame = img?.parentElement;
        if (!img || !frame) continue;
        const r = frame.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) continue; // offscreen
        const p = (r.top + r.height / 2) / vh; // 1 = entering at bottom, 0 = leaving at top
        const shift = (0.5 - p) * r.height * 0.26; // stays within the layer's 15% overscan
        img.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [steps]);

  return (
    <div className="trek-journey">
      {points.length > 1 && (
        <InteractiveElevation points={points} activeKm={activeKm} onActiveKm={setActiveKm} />
      )}

      <ol className="trek-timeline">
        {steps.map((s, i) => (
          <li
            key={i}
            className={`tl-${s.type}${i === activeIdx ? " tl-active" : ""}${s.photo ? "" : " tl-nophoto"}`}
            style={{ animationDelay: `${i * 70}ms` }}
            onPointerEnter={() => setActiveKm(s.km)}
            onFocus={() => setActiveKm(s.km)}
            tabIndex={0}
          >
            {s.photo && (
              <span className="tl-photo">
                <span
                  className="tl-photo-img"
                  ref={(el) => {
                    photoRefs.current[i] = el;
                  }}
                  style={{ backgroundImage: `url("${s.photo.url.replaceAll('"', "%22")}")` }}
                  role="img"
                  aria-label={s.photo.title || s.label}
                />
                <PhotoCredit photo={s.photo} />
              </span>
            )}
            <span className="tl-icon" aria-hidden="true">{icon(s.type)}</span>
            <span className="tl-km">{s.km} km</span>
            <span className="tl-label">
              {s.label}
              {s.markers.length > 0 && <span className="tl-markers">{s.markers.join(" ")}</span>}
            </span>
            <span className="tl-description">{s.description}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
