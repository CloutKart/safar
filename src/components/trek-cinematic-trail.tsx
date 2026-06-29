"use client";

import { useEffect, useRef } from "react";
import { PhotoCredit, type JourneyStep } from "@/components/trek-trail-journey";

// A cinematic, full-bleed scroll of the trek's REAL photos: each photo'd step is
// a screen-filling panel whose image pans against the scroll (parallax depth) with
// its caption overlaid. Built only from steps that actually carry a photo — no
// blank panels, no representative stand-ins. Parallax is skipped under
// prefers-reduced-motion (panels then render as static full-screen photos).
export function TrekCinematicTrail({ steps }: { steps: JourneyStep[] }) {
  const panels = steps.filter((s) => s.photo);
  const imgRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      for (const img of imgRefs.current) {
        const frame = img?.parentElement;
        if (!img || !frame) continue;
        const r = frame.getBoundingClientRect();
        if (r.bottom < -120 || r.top > vh + 120) continue; // offscreen
        const p = (r.top + r.height / 2) / vh; // 1 = entering at bottom, 0 = leaving at top
        const shift = (0.5 - p) * r.height * 0.1; // stays within the layer's 14% overscan
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

  if (panels.length === 0) return null;

  return (
    <section className="trek-cinema" aria-label="The trail in photos">
      {panels.map((s, i) => {
        const photo = s.photo!;
        return (
          <div key={i} className={`cine-panel cine-${s.type}`}>
            <div
              className="cine-img"
              ref={(el) => {
                imgRefs.current[i] = el;
              }}
              style={{ backgroundImage: `url("${photo.url.replaceAll('"', "%22")}")` }}
              role="img"
              aria-label={photo.title || s.label}
            />
            <div className="cine-cap">
              <p className="cine-eyebrow">
                {s.km} km · {String(i + 1).padStart(2, "0")} / {String(panels.length).padStart(2, "0")}
              </p>
              <h3 className="cine-label">{s.label}</h3>
              {s.description && <p className="cine-desc">{s.description}</p>}
              {s.markers.length > 0 && (
                <p className="cine-markers" aria-hidden="true">
                  {s.markers.join(" ")}
                </p>
              )}
            </div>
            <PhotoCredit photo={photo} />
          </div>
        );
      })}
    </section>
  );
}
