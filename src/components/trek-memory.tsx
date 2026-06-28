"use client";

import { useEffect, useMemo, useState } from "react";
import type { Trek } from "@/lib/trek/schema";

interface LocalPhoto {
  name: string;
  url: string;
}

export function TrekMemory({ trek }: { trek: Trek }) {
  const storageKey = `safar-trek-memory:${trek.slug}`;
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;
    try {
      const value = JSON.parse(stored) as { date?: string; notes?: string };
      // Hydrating a saved draft from localStorage on mount is a legitimate effect;
      // reading it during render would cause an SSR hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDate(value.date ?? "");
      setNotes(value.notes ?? "");
    } catch {
      // Ignore a malformed local draft.
    }
  }, [storageKey]);

  useEffect(
    () => () => photos.forEach((photo) => URL.revokeObjectURL(photo.url)),
    [photos],
  );

  const journal = useMemo(
    () => `# ${trek.name} — my Safar trek memory

Date: ${date || "Not set"}
Distance: ${trek.distanceKm ?? "—"} km
Elevation gain: ${trek.elevationGainM ?? "—"} m
Highest point: ${trek.maxAltitudeM ?? "—"} m
Photos selected: ${photos.map((photo) => photo.name).join(", ") || "None"}

## What I want to remember
${notes || "No notes yet."}

Generated locally by Safar Trek Mode. Weather and route conditions should be recorded from the day itself.`,
    [date, notes, photos, trek],
  );

  function saveDraft() {
    window.localStorage.setItem(storageKey, JSON.stringify({ date, notes }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  function download() {
    const blob = new Blob([journal], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${trek.slug}-trek-memory.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function selectPhotos(files: FileList | null) {
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    setPhotos(
      Array.from(files ?? [])
        .slice(0, 6)
        .map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
    );
  }

  return (
    <div className="trek-memory">
      <div className="memory-fields">
        <label>Trek date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Photos<input type="file" accept="image/*" multiple onChange={(event) => selectPhotos(event.target.files)} /></label>
      </div>
      {photos.length > 0 && (
        <div className="memory-photos">
          {photos.map((photo) => (
            <span key={photo.url} style={{ backgroundImage: `url("${photo.url}")` }} title={photo.name} />
          ))}
        </div>
      )}
      <label className="memory-notes">
        What happened out there?
        <textarea
          value={notes}
          maxLength={2000}
          placeholder="The weather, the people, the moment you nearly turned back, the chai after…"
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <div className="memory-actions">
        <button type="button" onClick={saveDraft}>{saved ? "Saved locally" : "Save private draft"}</button>
        <button type="button" className="ghost" onClick={download}>Download journal</button>
      </div>
      <p className="trek-sub">Draft text stays in this browser. Selected photos are previewed locally and are not uploaded.</p>
    </div>
  );
}
