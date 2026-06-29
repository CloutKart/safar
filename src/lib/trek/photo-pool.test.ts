import { describe, expect, it } from "vitest";
import { getSeedTrek } from "@/data/treks";
import {
  assignStepPhotos,
  trekGoldenPhoto,
  trekWildlifePhotos,
} from "@/lib/trek/photo-pool";
import type { Trek } from "@/lib/trek/schema";

describe("photo pool resolver", () => {
  it("gives a named-landmark step its matching pool photo and distributes the rest", () => {
    const trek = getSeedTrek("kedarkantha")!;
    const steps = [
      { label: "Sankri, 1,920 m" },
      { label: "Forest stretch" },
      { label: "Kedarkantha summit, 3,810 m" },
    ];
    const photos = assignStepPhotos(trek, steps);
    // The summit step matches a Kedarkantha-titled pool photo (landmark match).
    expect(photos[2]?.title.toLowerCase()).toContain("kedarkantha");
    // Every step gets a distinct real photo (no repeats while the pool lasts).
    const used = photos.filter(Boolean).map((p) => p!.url);
    expect(new Set(used).size).toBe(used.length);
    expect(used.length).toBe(3);
  });

  it("never invents a photo: returns null once the pool is exhausted", () => {
    const trek = getSeedTrek("kedarkantha")!; // 6 photos
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `step ${i}` }));
    const photos = assignStepPhotos(trek, many);
    expect(photos.filter(Boolean).length).toBeLessThanOrEqual(trek.photos.length);
    expect(photos.some((p) => p === null)).toBe(true);
  });

  it("returns no photos for an obscure trek with an empty pool", () => {
    const trek = getSeedTrek("namik-glacier")!; // 0 photos
    expect(assignStepPhotos(trek, [{ label: "Namik Glacier" }])).toEqual([null]);
    expect(trekGoldenPhoto(trek)).toBeNull();
    expect(trekWildlifePhotos(trek)).toEqual([]);
  });

  it("classifies a wildlife-titled photo to the band, not a step", () => {
    // Build a tiny synthetic trek with one wildlife + one scene photo.
    const base = getSeedTrek("kedarkantha")!;
    const trek: Trek = {
      ...base,
      photos: [
        { url: "https://x/scene.jpg", title: "Kedarkantha summit view", credit: "a", license: "CC BY 2.0", sourceUrl: null },
        { url: "https://x/bear.jpg", title: "Himalayan Brown Bear with cubs", credit: "b", license: "CC BY 2.0", sourceUrl: null },
      ],
    };
    const steps = assignStepPhotos(trek, [{ label: "Summit" }, { label: "Forest" }]);
    expect(steps.every((p) => !p || !/bear/i.test(p.title))).toBe(true); // bear never on a step
    expect(trekWildlifePhotos(trek).some((p) => /bear/i.test(p.title))).toBe(true);
  });
});
