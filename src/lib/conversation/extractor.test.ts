import { describe, expect, it } from "vitest";
import { extractDeterministically } from "@/lib/conversation/extractor";

describe("deterministic conversation extraction", () => {
  it("extracts direct first-person Hinglish preferences and budget", () => {
    const result = extractDeterministically(
      "Mujhe trekking aur cafe hopping pasand hai, budget INR 12,000 max",
    );
    expect(result.language).toBe("hinglish");
    expect(result.preferences.map((item) => item.tag)).toEqual(
      expect.arrayContaining(["trekking", "cafes"]),
    );
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "budget_max", value: 12000 }),
      ]),
    );
  });

  it("does not attribute third-person or joking preferences", () => {
    expect(
      extractDeterministically("Rohan loves haunted places").preferences,
    ).toHaveLength(0);
    expect(
      extractDeterministically("I love haunted places, just kidding").preferences,
    ).toHaveLength(0);
  });

  it("detects preferences expressed without a pronoun (verb or bare list)", () => {
    const verb = extractDeterministically("love beaches and cafes");
    expect(verb.preferences.map((p) => p.tag)).toEqual(
      expect.arrayContaining(["beaches", "cafes"]),
    );
    const bareList = extractDeterministically("Beach shacks, sunsets, seafood");
    expect(bareList.preferences.map((p) => p.tag)).toEqual(
      expect.arrayContaining(["beaches", "food"]),
    );
  });

  it("still ignores third-person preferences without a pronoun", () => {
    expect(
      extractDeterministically("Rohan loves haunted places").preferences,
    ).toHaveLength(0);
    expect(
      extractDeterministically("she really wants nightlife").preferences,
    ).toHaveLength(0);
  });

  it("captures negated preferences as a downvote", () => {
    const result = extractDeterministically("no nightlife please, hate clubs");
    const nightlife = result.preferences.find((p) => p.tag === "nightlife");
    expect(nightlife?.weight).toBe(-1);
  });

  it("binds negation to its own clause, not earlier preferences", () => {
    const result = extractDeterministically("beaches and cafes but no nightlife");
    expect(result.preferences.find((p) => p.tag === "beaches")?.weight).toBe(1);
    expect(result.preferences.find((p) => p.tag === "cafes")?.weight).toBe(1);
    expect(result.preferences.find((p) => p.tag === "nightlife")?.weight).toBe(-1);
  });

  it("keeps forwarded facts soft", () => {
    const result = extractDeterministically(
      "I can only spend INR 5000",
      true,
    );
    expect(result.facts.every((fact) => !fact.isHard)).toBe(true);
  });
});
