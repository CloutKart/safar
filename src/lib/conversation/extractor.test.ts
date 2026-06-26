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

  it("extracts budget from natural phrasing (k, lakh, rupees, cap)", () => {
    const k = extractDeterministically("my budget cap is 15k");
    expect(k.facts.find((f) => f.kind === "budget_max")?.value).toBe(15000);
    const rupees = extractDeterministically("Budget is 150000 rupees");
    expect(rupees.facts.find((f) => f.kind === "budget_max")?.value).toBe(150000);
    const lakh = extractDeterministically("around 1.5 lakh total");
    expect(lakh.facts.find((f) => f.kind === "budget_max")?.value).toBe(150000);
  });

  it("does not read day counts or dates as budget", () => {
    const result = extractDeterministically("3 day trip leaving on 17th june");
    expect(result.facts.some((f) => f.kind.startsWith("budget"))).toBe(false);
  });

  it("extracts origin from 'departure city is X' and a natural date", () => {
    const result = extractDeterministically("Departure city is Dehradun, leaving 17th june");
    expect(result.facts.find((f) => f.kind === "origin")?.value).toBe("Dehradun");
    expect(result.facts.find((f) => f.kind === "start_date")?.value).toMatch(/-06-17$/);
  });

  it("does not let a later clause negate an earlier interest", () => {
    const r = extractDeterministically("quiet beach, no party");
    expect(r.preferences.find((p) => p.tag === "beaches")?.weight).toBe(1);
    expect(r.preferences.find((p) => p.tag === "nightlife")?.weight).toBe(-1);
  });

  it("reads interests from a longer fact-mixed message (2+ interests)", () => {
    const r = extractDeterministically(
      "beaches and relaxation, good seafood, 4 days from Mumbai budget 15k",
    );
    expect(r.preferences.map((p) => p.tag)).toEqual(
      expect.arrayContaining(["beaches", "relaxation", "food"]),
    );
  });

  it("detects an explicitly suggested destination, ignoring non-places", () => {
    expect(
      extractDeterministically("lets go to Manali next week").facts.find(
        (f) => f.kind === "destination",
      )?.value,
    ).toBe("Manali");
    expect(
      extractDeterministically("how about Goa?").facts.find(
        (f) => f.kind === "destination",
      )?.value,
    ).toBe("Goa");
    expect(
      extractDeterministically("lets go to sleep").facts.some(
        (f) => f.kind === "destination",
      ),
    ).toBe(false);
  });

  it("extracts excluded destinations, ignoring preference negations", () => {
    expect(
      extractDeterministically("goa nahi jaana").facts.find(
        (f) => f.kind === "exclude_destination",
      )?.value,
    ).toBe("Goa");
    expect(
      extractDeterministically("not Manali please").facts.find(
        (f) => f.kind === "exclude_destination",
      )?.value,
    ).toBe("Manali");
    // "no nightlife" is a preference, not a city to exclude
    expect(
      extractDeterministically("no nightlife please").facts.some(
        (f) => f.kind === "exclude_destination",
      ),
    ).toBe(false);
  });

  it("keeps forwarded facts soft", () => {
    const result = extractDeterministically(
      "I can only spend INR 5000",
      true,
    );
    expect(result.facts.every((fact) => !fact.isHard)).toBe(true);
  });

  // Every headline interest the landing page markets must be detectable from a
  // natural first-person phrasing — "slow travel" was previously dropped.
  it.each([
    ["I love haunted trails", "haunted"],
    ["we want cafe hopping", "cafes"],
    ["I'm into trekking", "trekking"],
    ["I'm up for adventure sports", "adventure"],
    ["I love street food", "food"],
    ["I want some nightlife", "nightlife"],
    ["I prefer slow travel", "relaxation"],
    ["I'm into heritage", "culture"],
  ])("detects the headline interest in %j", (text, tag) => {
    const result = extractDeterministically(text);
    expect(result.preferences.map((p) => p.tag)).toContain(tag);
    expect(result.preferences.find((p) => p.tag === tag)?.weight).toBe(1);
  });

  it("catches natural variants beyond the bare keyword", () => {
    expect(
      extractDeterministically("I want to go paragliding and ziplining").preferences.map(
        (p) => p.tag,
      ),
    ).toContain("adventure");
    expect(
      extractDeterministically("I'd love a ghost tour of the old forts").preferences.map(
        (p) => p.tag,
      ),
    ).toEqual(expect.arrayContaining(["haunted", "culture"]));
    expect(
      extractDeterministically("looking for a leisurely, unhurried trip").preferences.map(
        (p) => p.tag,
      ),
    ).toContain("relaxation");
  });

  // Word-boundary matching: short aliases must not fire inside larger words.
  it("does not false-fire on substrings of unrelated words", () => {
    expect(
      extractDeterministically("I want a comfortable stay").preferences.map((p) => p.tag),
    ).not.toContain("culture"); // "fort" ⊄ "comfortable"
    expect(
      extractDeterministically("I prefer public transport").preferences.map((p) => p.tag),
    ).not.toContain("nightlife"); // "pub" ⊄ "public"
    expect(
      extractDeterministically("we walked slowly through the lanes").preferences.map(
        (p) => p.tag,
      ),
    ).not.toContain("relaxation"); // bare "slow" is not an alias; "slowly" ⊄ "slow down"
    const barbecue = extractDeterministically("I want a barbecue on the beach");
    expect(barbecue.preferences.map((p) => p.tag)).toContain("beaches");
    expect(barbecue.preferences.map((p) => p.tag)).not.toContain("nightlife"); // "bars" ⊄ "barbecue"
  });

  // Real Hinglish trip-talk: the place precedes a Hindi verb, plus hazaar /
  // per-head money and din/raat/weekend durations.
  it("reads a place that precedes a Hinglish go-verb", () => {
    expect(
      extractDeterministically("Goa chalein 4 din, per head 12k").facts.find(
        (f) => f.kind === "destination",
      )?.value,
    ).toBe("Goa");
    expect(
      extractDeterministically("chalo Manali").facts.find(
        (f) => f.kind === "destination",
      )?.value,
    ).toBe("Manali");
    // a Hinglish non-place before a go-verb must NOT register
    expect(
      extractDeterministically("ghar chalein").facts.some(
        (f) => f.kind === "destination",
      ),
    ).toBe(false);
  });

  it("captures din/raat/weekend durations and hazaar money", () => {
    const trip = extractDeterministically("Goa chalein 4 din, per head 12k");
    expect(trip.facts.find((f) => f.kind === "duration_days")?.value).toBe(4);
    expect(trip.facts.find((f) => f.kind === "budget_max")?.value).toBe(12000);

    expect(
      extractDeterministically("long weekend pe ghoomne ka mann hai").facts.find(
        (f) => f.kind === "duration_days",
      )?.value,
    ).toBe(3);
    expect(
      extractDeterministically("3 din 2 raat ka plan").facts.find(
        (f) => f.kind === "duration_days",
      )?.value,
    ).toBe(3);
    expect(
      extractDeterministically("1.5 hazaar per head").facts.find(
        (f) => f.kind === "budget_max",
      )?.value,
    ).toBe(1500);
  });

  it("handles a Hinglish destination + clause-bound skip negation together", () => {
    const result = extractDeterministically("Manali nikalte hain, nightlife rehne do");
    expect(result.facts.find((f) => f.kind === "destination")?.value).toBe("Manali");
    expect(result.preferences.find((p) => p.tag === "nightlife")?.weight).toBe(-1);
  });

  it("detects Hinglish food/nightlife slang as interests", () => {
    expect(
      extractDeterministically("mujhe street food aur daru chahiye").preferences.map(
        (p) => p.tag,
      ),
    ).toEqual(expect.arrayContaining(["food", "nightlife"]));
  });

  it("detects a shopping interest without firing on substrings", () => {
    expect(
      extractDeterministically("I'm up for some mall hopping and street shopping")
        .preferences.map((p) => p.tag),
    ).toContain("shopping");
    // "mall" must not fire inside "small"
    expect(
      extractDeterministically("we are a small group, love trekking").preferences.map(
        (p) => p.tag,
      ),
    ).not.toContain("shopping");
  });
});

describe("hardened extraction on a real multi-fact Hinglish message", () => {
  const MSG =
    "Hey Safar, hum 5 friends Delhi se trip plan kar rahe hain around the second week of July. 4 days ka trip chahiye with a budget of around ₹12,000-15,000 per person including stay and travel. Goa aur Manali avoid karna hai because we've already been there. We want a good mix of adventure and chill, not just sightseeing all day. Trekking ya waterfalls would be nice, but we also want cafés, good local food and a place where we can just sit and enjoy the views. Nightlife isn't a priority, but if there are some nice local markets or live music cafés that's a bonus. We don't want an overhyped tourist trap; hidden gems are preferred, but do include a few must-visit popular places if they're actually worth it.";
  const r = extractDeterministically(MSG);
  const fact = (kind: string) => r.facts.filter((f) => f.kind === kind).map((f) => f.value);

  it("captures origin, budget range, duration and group size", () => {
    expect(fact("origin")).toEqual(["Delhi"]);
    expect(fact("budget_min")).toEqual([12000]);
    expect(fact("budget_max")).toEqual([15000]);
    expect(fact("duration_days")).toEqual([4]);
    expect(fact("group_size")).toEqual([5]);
  });

  it("captures both ruled-out places and invents no destinations", () => {
    expect(fact("exclude_destination")).toEqual(
      expect.arrayContaining(["Goa", "Manali"]),
    );
    // the verb-regex must NOT emit "Kar Rahe" or "Popular Places"
    expect(fact("destination")).toEqual([]);
  });

  it("reads real interests and drops a de-prioritised one", () => {
    const tags = r.preferences.map((p) => p.tag);
    expect(tags).toEqual(
      expect.arrayContaining(["adventure", "trekking", "cafes", "food", "relaxation"]),
    );
    // "Nightlife isn't a priority" → neither a want nor a dislike
    expect(tags).not.toContain("nightlife");
  });
});

describe("hardened extraction — targeted regressions", () => {
  it("ignores Hinglish filler after a planning verb", () => {
    expect(
      extractDeterministically("trip plan kar rahe hain").facts.some(
        (f) => f.kind === "destination",
      ),
    ).toBe(false);
  });

  it("does not treat 'must-visit popular places' as a place", () => {
    expect(
      extractDeterministically("include a few must-visit popular places").facts.some(
        (f) => f.kind === "destination",
      ),
    ).toBe(false);
  });

  it("reads an origin even with words between 'hum' and 'se'", () => {
    expect(
      extractDeterministically("hum 5 friends Delhi se aa rahe hain").facts.find(
        (f) => f.kind === "origin",
      )?.value,
    ).toBe("Delhi");
  });

  it("captures a comma-grouped budget range stated with filler", () => {
    const r = extractDeterministically("budget of around ₹12,000-15,000 per person");
    expect(r.facts.find((f) => f.kind === "budget_min")?.value).toBe(12000);
    expect(r.facts.find((f) => f.kind === "budget_max")?.value).toBe(15000);
  });

  it("excludes both places in 'X aur Y avoid'", () => {
    const values = extractDeterministically("Goa aur Manali avoid karna hai")
      .facts.filter((f) => f.kind === "exclude_destination")
      .map((f) => f.value);
    expect(values).toEqual(expect.arrayContaining(["Goa", "Manali"]));
  });

  it("does not read a year as a budget amount", () => {
    const r = extractDeterministically("budget around 12000 for July 2026");
    expect(r.facts.find((f) => f.kind === "budget_max")?.value).toBe(12000);
    expect(r.facts.find((f) => f.kind === "budget_min")?.value).toBe(12000);
  });

  it("still treats a hard 'no nightlife' as a dislike", () => {
    const pref = extractDeterministically("beaches but no nightlife").preferences.find(
      (p) => p.tag === "nightlife",
    );
    expect(pref?.weight).toBe(-1);
  });
});
