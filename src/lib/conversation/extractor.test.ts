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

  it("keeps forwarded facts soft", () => {
    const result = extractDeterministically(
      "I can only spend INR 5000",
      true,
    );
    expect(result.facts.every((fact) => !fact.isHard)).toBe(true);
  });
});
