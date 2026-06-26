import { describe, expect, it } from "vitest";
import { dishesFor } from "@/data/dishes";
import { destinations } from "@/data/destinations";

describe("dishesFor", () => {
  it("prefers a city-specific override over the state list", () => {
    const names = dishesFor({ slug: "udaipur", name: "Udaipur", state: "Rajasthan" }).map(
      (d) => d.name,
    );
    expect(names).toContain("Laal maas");
  });

  it("falls back to the destination's state when no city override exists", () => {
    const names = dishesFor({ slug: "jodhpur", name: "Jodhpur", state: "Rajasthan" }).map(
      (d) => d.name,
    );
    expect(names).toContain("Dal baati churma");
  });

  it("returns an empty list for a place we have no seed for", () => {
    expect(dishesFor({ name: "Atlantis", state: "Nowhere" })).toEqual([]);
  });

  // Guards against state-string drift between the catalog and the dish seed
  // (e.g. "Daman & Diu" vs "Daman and Diu"), which would silently drop dishes.
  it("resolves at least one dish for every catalog destination", () => {
    const uncovered = destinations.filter(
      (d) => dishesFor({ slug: d.slug, name: d.name, state: d.state }).length === 0,
    );
    expect(uncovered.map((d) => `${d.name} (${d.state})`)).toEqual([]);
  });
});
