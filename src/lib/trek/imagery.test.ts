import { describe, expect, it } from "vitest";
import { getSeedTrek } from "@/data/treks";
import { goldenHourImage, regionBucket, waypointImage, wildlifeImages } from "@/lib/trek/imagery";

describe("imagery library", () => {
  it("buckets treks by macro-region", () => {
    expect(regionBucket(getSeedTrek("kedarkantha")!)).toBe("himalaya");
    expect(regionBucket(getSeedTrek("tadiandamol")!)).toBe("western-ghats");
    expect(regionBucket(getSeedTrek("kanamo-peak")!)).toBe("trans-himalaya"); // Spiti
    expect(regionBucket(getSeedTrek("dzukou-valley")!)).toBe("northeast");
    expect(regionBucket(getSeedTrek("chhattisgarh-jungle")!)).toBe("central");
  });

  it("resolves a real image for every waypoint (specific photo wins, else representative)", () => {
    const trek = getSeedTrek("kedarkantha")!;
    for (const w of trek.timeline) {
      const img = waypointImage(trek, w);
      expect(img.url).toMatch(/^https:\/\/upload\.wikimedia\.org\//);
    }
    // A waypoint with its own photo is marked specific (not representative).
    const withPhoto = { ...trek.timeline[0], photoUrl: "https://upload.wikimedia.org/x.jpg" };
    const specific = waypointImage(trek, withPhoto);
    expect(specific).toEqual({ url: "https://upload.wikimedia.org/x.jpg", representative: false });
  });

  it("gives a golden-hour image and matches wildlife species to photos", () => {
    const trek = getSeedTrek("kanamo-peak")!;
    expect(goldenHourImage(trek)).toMatch(/^https:\/\//);
    const shots = wildlifeImages(trek);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((s) => /^https:\/\//.test(s.url) && s.species.length > 0)).toBe(true);
  });
});
