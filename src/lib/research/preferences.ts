import type { InterestTag } from "@/lib/domain";
import type { Gem, GemType } from "@/lib/research/gems";

// What each interest actually MEANS as concrete, real experiences — fed to the
// planner LLM so it curates a specific named stop per preference instead of a
// generic temple/viewpoint. `gemTypes` are the Gem.type buckets that cleanly
// proxy the interest (broad/ambiguous types like "nature" are deliberately
// omitted so we don't, e.g., file every restaurant under "cafes"); `match` is a
// name/blurb test that catches the right real gems regardless of their type.
interface TagExperience {
  means: string;
  gemTypes: GemType[];
  match: RegExp;
}

export const TAG_EXPERIENCES: Record<InterestTag, TagExperience> = {
  haunted: {
    means:
      "folklore forts, abandoned havelis/villages and after-dark ghost-walks — framed as local legend, never stated as verified fact",
    gemTypes: ["quirky"],
    match: /fort|haveli|abandon|ghost|haunt|cemeter|graveyard|ruin|legend|spooky/i,
  },
  cafes: {
    means:
      "named cafes, roasteries and bakeries worth hopping between, plus one unhurried brunch",
    gemTypes: [],
    match: /caf[eé]|coffee|roast|bakery|brew|patisserie|tea ?room|brunch/i,
  },
  trekking: {
    means: "a named trail or summit hike with its trailhead and a rough duration",
    gemTypes: ["experience"],
    match: /trek|trail|hike|summit|peak|ridge|\bpass\b|valley/i,
  },
  adventure: {
    means:
      "a named adventure-sport spot or operator — paragliding, rafting, zip-line, scuba and the like",
    gemTypes: ["experience"],
    match: /paraglid|raft|zip|bungee|scuba|dive|kayak|surf|climb|adventure|atv|quad/i,
  },
  food: {
    means:
      "named street-food lanes, signature local dishes and real eateries — never 'a local restaurant'",
    gemTypes: ["food"],
    match: /food|eat|dhaba|thali|chaat|kitchen|\bmess\b|cuisine|bhojan|sweets/i,
  },
  nightlife: {
    means: "named bars, rooftops, breweries or live-music spots that stay open late",
    gemTypes: [],
    match: /\bbar\b|\bbars\b|\bpub\b|rooftop|lounge|\bclub\b|brewery|live music|nightclub/i,
  },
  relaxation: {
    means:
      "an unhurried, low-mileage rhythm — a sunset viewpoint, a riverside afternoon, a spa hour; no back-to-back stops",
    gemTypes: ["viewpoint"],
    match: /view|sunset|sunrise|lake|river|garden|\bspa\b|riverside|meadow|hammock/i,
  },
  culture: {
    means:
      "named heritage walks, forts/palaces and old-city lanes, each told with its story",
    gemTypes: ["history"],
    match: /fort|palace|haveli|temple|museum|heritage|old ?city|monument|ruin|step ?well|architecture/i,
  },
  spiritual: {
    means: "a named temple, ashram, ghat or monastery and one quiet ritual moment",
    gemTypes: [],
    match: /temple|ashram|ghat|monaster|church|mosque|gurudwara|shrine|meditat|dargah/i,
  },
  wildlife: {
    means: "a named sanctuary, safari zone or birding spot with the species to look for",
    gemTypes: [],
    match: /safari|sanctuar|national park|wildlife|jungle|tiger|\bbird|reserve/i,
  },
  photography: {
    means: "named viewpoints and photogenic corners, with the best light to shoot them",
    gemTypes: ["viewpoint"],
    match: /view|point|sunset|sunrise|vista|lookout|scenic|skyline|panorama/i,
  },
  beaches: {
    means: "named beaches, shacks and coastal coves",
    gemTypes: [],
    match: /beach|cove|shore|coast|shack|lagoon/i,
  },
  mountains: {
    means: "named ridges, passes and high-altitude viewpoints",
    gemTypes: ["viewpoint"],
    match: /peak|ridge|\bpass\b|summit|view|valley|glacier|snow|hill/i,
  },
  "road-trip": {
    means: "a scenic named drive with worthwhile stops strung along the route",
    gemTypes: ["viewpoint"],
    match: /road|highway|\bdrive\b|\bpass\b|route|viewpoint|ghat/i,
  },
  caves: {
    means: "a named cave system or rock-cut site to explore",
    gemTypes: [],
    match: /cave|cavern|rock.?cut|grotto/i,
  },
  camping: {
    means: "a named campsite or lakeside spot for a night under the stars",
    gemTypes: ["experience"],
    match: /camp|tent|bonfire|lakeside|meadow|stargaz/i,
  },
  rafting: {
    means: "a named rafting/kayaking stretch with its grade and put-in point",
    gemTypes: ["experience"],
    match: /raft|kayak|rapids|canoe|river|white.?water/i,
  },
};

export interface PreferenceFocus {
  interest: InterestTag;
  means: string;
  // Real candidate places (from the live gem pool) that satisfy this interest.
  // May be empty — the LLM then leans on `means` or skips if the place can't
  // support it.
  places: Array<{ name: string; note: string }>;
}

const MAX_INTERESTS = 5;
const PLACES_PER_INTEREST = 3;

function gemMatchesInterest(gem: Gem, exp: TagExperience): boolean {
  if (exp.match.test(gem.name)) return true;
  if (gem.blurb && exp.match.test(gem.blurb)) return true;
  return exp.gemTypes.includes(gem.type);
}

// Turn the group's weighted interests into a ranked, gem-backed focus list the
// planner can curate against. Top positive interests first; each carries the
// best real candidate places (name-matches floated above mere type-matches).
export function buildPreferenceFocus(
  weights: Map<InterestTag, number>,
  gems: Gem[],
): PreferenceFocus[] {
  const ranked = [...weights.entries()]
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_INTERESTS)
    .map(([tag]) => tag);

  return ranked.map((interest) => {
    const exp = TAG_EXPERIENCES[interest];
    const places = gems
      .filter((gem) => gemMatchesInterest(gem, exp))
      // Name/blurb hits are a stronger signal than a categorical type match, so
      // float them up; break ties by the gem's own quality score.
      .map((gem) => ({
        gem,
        rank:
          gem.score +
          (exp.match.test(gem.name) || (gem.blurb && exp.match.test(gem.blurb)) ? 1000 : 0),
      }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, PLACES_PER_INTEREST)
      .map(({ gem }) => ({ name: gem.name, note: gem.blurb || "" }));
    return { interest, means: exp.means, places };
  });
}

// gemKey-style normalization isn't needed here, but expose the set of gem names
// that matched any of the group's interests — the fallback itinerary floats
// these first so even no-LLM plans skew toward preference-relevant spots.
export function preferredGemNames(focus: PreferenceFocus[]): Set<string> {
  return new Set(
    focus.flatMap((entry) => entry.places.map((place) => place.name.toLowerCase())),
  );
}
