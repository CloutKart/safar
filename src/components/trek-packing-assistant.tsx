"use client";

import { useMemo, useState } from "react";
import type { Trek } from "@/lib/trek/schema";
import { trekPacking } from "@/lib/trek/enrich";

export function TrekPackingAssistant({ trek }: { trek: Trek }) {
  const [camping, setCamping] = useState(
    trek.suitability.includes("camping") || trek.timeline.some((point) => point.type === "camp"),
  );
  const [rain, setRain] = useState(
    trek.suitability.includes("monsoon") || [6, 7, 8, 9].some((month) => trek.bestMonths.includes(month)),
  );
  const [checked, setChecked] = useState<string[]>([]);
  const groups = useMemo(() => {
    const next = trekPacking(trek).map((group) => ({
      ...group,
      items: [...group.items],
    }));
    if (camping) {
      const camp = next.find((group) => group.title === "For this trail");
      const items = ["Tent / confirmed shelter", "Sleeping bag rated for night temperature", "Headlamp + spare cells"];
      if (camp) camp.items = [...new Set([...camp.items, ...items])];
      else next.push({ title: "Camping", items });
    }
    if (rain) {
      const climate = next.find((group) => group.title === "For the conditions");
      const items = ["Rain shell", "Pack cover / dry bag", "Quick-dry spare socks"];
      if (climate) climate.items = [...new Set([...climate.items, ...items])];
      else next.push({ title: "For the conditions", items });
    }
    return next;
  }, [camping, rain, trek]);

  const allItems = groups.flatMap((group) => group.items);
  const progress = allItems.length
    ? Math.round((checked.filter((item) => allItems.includes(item)).length / allItems.length) * 100)
    : 0;

  function toggle(item: string) {
    setChecked((current) =>
      current.includes(item)
        ? current.filter((candidate) => candidate !== item)
        : [...current, item],
    );
  }

  return (
    <div className="packing-assistant">
      <div className="packing-controls">
        <label><input type="checkbox" checked={camping} onChange={(event) => setCamping(event.target.checked)} /> Camping overnight</label>
        <label><input type="checkbox" checked={rain} onChange={(event) => setRain(event.target.checked)} /> Rain / wet trail likely</label>
        <strong>{progress}% packed</strong>
      </div>
      <div className="packing-progress"><span style={{ width: `${progress}%` }} /></div>
      <div className="pack-groups">
        {groups.map((group) => (
          <div className="pack-group" key={group.title}>
            <h3>{group.title}</h3>
            <ul className="pack-checklist">
              {group.items.map((item) => (
                <li key={item}>
                  <label>
                    <input type="checkbox" checked={checked.includes(item)} onChange={() => toggle(item)} />
                    <span>{item}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="trek-sub">This checklist adapts to altitude, terrain, season, water reliability and your camping choice. It does not replace local guide advice.</p>
    </div>
  );
}
