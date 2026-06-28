"use client";

import { useMemo, useState } from "react";
import type { ElevationPoint } from "@/lib/trek/enrich";

export function InteractiveElevation({ points }: { points: ElevationPoint[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const geometry = useMemo(() => {
    const width = 640;
    const height = 180;
    const pad = 8;
    const maxKm = Math.max(...points.map((point) => point.km), 1);
    const minM = Math.min(...points.map((point) => point.m));
    const maxM = Math.max(...points.map((point) => point.m));
    const span = Math.max(maxM - minM, 1);
    const xy = points.map((point) => ({
      x: pad + (point.km / maxKm) * (width - pad * 2),
      y: pad + (1 - (point.m - minM) / span) * (height - pad * 2),
    }));
    return {
      width,
      height,
      minM,
      maxM,
      maxKm,
      line: xy.map((point) => `${point.x},${point.y}`).join(" "),
      area: `${pad},${height - pad} ${xy.map((point) => `${point.x},${point.y}`).join(" ")} ${width - pad},${height - pad}`,
      xy,
    };
  }, [points]);

  if (points.length < 2) return null;
  const active = points[activeIndex];
  const cursor = geometry.xy[activeIndex];

  function inspect(clientX: number, rect: DOMRect) {
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setActiveIndex(Math.round(ratio * (points.length - 1)));
  }

  return (
    <div className="elev-interactive">
      <div className="elev-readout" aria-live="polite">
        <strong>{active.km} km</strong>
        <span>{active.m} m elevation</span>
        <span>
          {activeIndex === 0
            ? "Trailhead"
            : activeIndex === points.length - 1
              ? "Route end"
              : active.m > points[activeIndex - 1].m
                ? "Climbing"
                : "Descending"}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Interactive estimated elevation profile"
        onPointerMove={(event) => inspect(event.clientX, event.currentTarget.getBoundingClientRect())}
        onPointerDown={(event) => inspect(event.clientX, event.currentTarget.getBoundingClientRect())}
      >
        <polygon points={geometry.area} className="elev-area" />
        <polyline points={geometry.line} className="elev-line" fill="none" />
        <line
          x1={cursor.x}
          x2={cursor.x}
          y1={4}
          y2={geometry.height - 4}
          className="elev-cursor-line"
        />
        <circle cx={cursor.x} cy={cursor.y} r={6} className="elev-cursor" />
      </svg>
      <input
        className="elev-range"
        type="range"
        min={0}
        max={points.length - 1}
        value={activeIndex}
        onChange={(event) => setActiveIndex(Number(event.target.value))}
        aria-label="Inspect elevation along the route"
      />
      <div className="elev-axis">
        <span>{geometry.minM} m</span>
        <span>Drag or hover to inspect terrain</span>
        <span>{geometry.maxKm} km · {geometry.maxM} m peak</span>
      </div>
    </div>
  );
}
