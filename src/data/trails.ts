import type { TrailDifficulty } from "@/lib/domain";

// Curated trail backbone (Part C). Real, well-known Indian treks with the
// metadata trekkers decide on — the dependable layer under the live OSM/Reddit
// sources, which are keyless and can fail or return nothing. Keyed by catalog
// slug. `hidden: true` marks offbeat/low-traffic trails so the mix isn't all
// marquee summits. Figures are realistic approximations, not survey-grade.

export interface CuratedTrail {
  name: string;
  distanceKm: number | null;
  elevationGainM: number | null;
  maxAltitudeM: number | null;
  difficulty: TrailDifficulty;
  durationHours: number | null;
  trailhead: string;
  bestMonths: number[];
  permitRequired: boolean;
  guideRecommended: boolean;
  routeType: "loop" | "out-and-back" | "point-to-point";
  hidden: boolean;
  blurb: string;
}

const SUMMER = [4, 5, 6, 9, 10, 11];
const HIMALAYA_HIGH = [5, 6, 9, 10];

export const trailsByDestination: Record<string, CuratedTrail[]> = {
  chopta: [
    {
      name: "Chandrashila Summit via Tungnath",
      distanceKm: 9, elevationGainM: 1000, maxAltitudeM: 4000, difficulty: "moderate",
      durationHours: 6, trailhead: "Chopta", bestMonths: SUMMER, permitRequired: false,
      guideRecommended: false, routeType: "out-and-back", hidden: false,
      blurb: "summit above the world's highest Shiva temple, 360° Himalayan views",
    },
    {
      name: "Deoria Tal",
      distanceKm: 6, elevationGainM: 350, maxAltitudeM: 2438, difficulty: "easy",
      durationHours: 3, trailhead: "Sari village", bestMonths: [3, 4, 5, 6, 9, 10, 11],
      permitRequired: false, guideRecommended: false, routeType: "out-and-back",
      hidden: false, blurb: "a still lake mirroring the Chaukhamba peaks",
    },
    {
      name: "Rohini Bugyal meadow trail",
      distanceKm: 7, elevationGainM: 700, maxAltitudeM: 3300, difficulty: "hard",
      durationHours: 6, trailhead: "Chopta", bestMonths: SUMMER, permitRequired: false,
      guideRecommended: true, routeType: "out-and-back", hidden: true,
      blurb: "offbeat shepherds' meadow most trekkers miss",
    },
  ],
  spiti: [
    {
      name: "Pin Parvati Pass",
      distanceKm: 60, elevationGainM: 2800, maxAltitudeM: 5319, difficulty: "expert",
      durationHours: null, trailhead: "Mud village", bestMonths: HIMALAYA_HIGH,
      permitRequired: true, guideRecommended: true, routeType: "point-to-point",
      hidden: false, blurb: "a serious glacier crossing linking Parvati and Spiti valleys",
    },
    {
      name: "Dhankar Lake",
      distanceKm: 4, elevationGainM: 300, maxAltitudeM: 4270, difficulty: "moderate",
      durationHours: 3, trailhead: "Dhankar village", bestMonths: HIMALAYA_HIGH,
      permitRequired: false, guideRecommended: false, routeType: "out-and-back",
      hidden: true, blurb: "a sacred high lake above the cliff-perched monastery",
    },
    {
      name: "Kanamo Peak",
      distanceKm: 16, elevationGainM: 1900, maxAltitudeM: 5974, difficulty: "expert",
      durationHours: null, trailhead: "Kibber", bestMonths: HIMALAYA_HIGH,
      permitRequired: true, guideRecommended: true, routeType: "out-and-back",
      hidden: true, blurb: "a non-technical 5,974 m summit for acclimatised trekkers",
    },
  ],
  manali: [
    {
      name: "Hampta Pass",
      distanceKm: 26, elevationGainM: 1800, maxAltitudeM: 4270, difficulty: "hard",
      durationHours: null, trailhead: "Jobra", bestMonths: HIMALAYA_HIGH,
      permitRequired: false, guideRecommended: true, routeType: "point-to-point",
      hidden: false, blurb: "a dramatic crossover from green Kullu to barren Lahaul",
    },
    {
      name: "Bhrigu Lake",
      distanceKm: 18, elevationGainM: 1500, maxAltitudeM: 4300, difficulty: "hard",
      durationHours: null, trailhead: "Gulaba", bestMonths: HIMALAYA_HIGH,
      permitRequired: false, guideRecommended: true, routeType: "out-and-back",
      hidden: true, blurb: "an alpine lake on a high meadow, quieter than Hampta",
    },
    {
      name: "Beas Kund",
      distanceKm: 16, elevationGainM: 900, maxAltitudeM: 3700, difficulty: "moderate",
      durationHours: null, trailhead: "Solang", bestMonths: SUMMER, permitRequired: false,
      guideRecommended: false, routeType: "out-and-back", hidden: false,
      blurb: "glacial source of the Beas under the Hanuman Tibba peaks",
    },
  ],
  mcleodganj: [
    {
      name: "Triund",
      distanceKm: 9, elevationGainM: 1100, maxAltitudeM: 2828, difficulty: "moderate",
      durationHours: 5, trailhead: "Dharamkot", bestMonths: [3, 4, 5, 6, 9, 10, 11],
      permitRequired: false, guideRecommended: false, routeType: "out-and-back",
      hidden: false, blurb: "a ridge campsite under the Dhauladhar wall",
    },
    {
      name: "Kareri Lake",
      distanceKm: 26, elevationGainM: 1900, maxAltitudeM: 3000, difficulty: "hard",
      durationHours: null, trailhead: "Kareri village", bestMonths: SUMMER,
      permitRequired: false, guideRecommended: true, routeType: "out-and-back",
      hidden: true, blurb: "a clear glacial lake far quieter than Triund",
    },
    {
      name: "Indrahar Pass",
      distanceKm: 14, elevationGainM: 2300, maxAltitudeM: 4342, difficulty: "expert",
      durationHours: null, trailhead: "Triund", bestMonths: HIMALAYA_HIGH,
      permitRequired: true, guideRecommended: true, routeType: "out-and-back",
      hidden: true, blurb: "a demanding pass on the Dhauladhar crest",
    },
  ],
  "tirthan-valley": [
    {
      name: "Jalori Pass to Serolsar Lake",
      distanceKm: 5, elevationGainM: 300, maxAltitudeM: 3100, difficulty: "easy",
      durationHours: 3, trailhead: "Jalori Pass", bestMonths: [4, 5, 6, 9, 10, 11],
      permitRequired: false, guideRecommended: false, routeType: "out-and-back",
      hidden: true, blurb: "an oak-forest walk to a forest-ringed lake",
    },
    {
      name: "Great Himalayan NP Rolla trail",
      distanceKm: 12, elevationGainM: 600, maxAltitudeM: 2100, difficulty: "moderate",
      durationHours: null, trailhead: "Gushaini", bestMonths: SUMMER, permitRequired: true,
      guideRecommended: true, routeType: "out-and-back", hidden: true,
      blurb: "into a UNESCO park's pristine river valley",
    },
  ],
  rishikesh: [
    {
      name: "Nag Tibba",
      distanceKm: 16, elevationGainM: 1100, maxAltitudeM: 3022, difficulty: "moderate",
      durationHours: null, trailhead: "Pantwari", bestMonths: [1, 2, 3, 4, 5, 6, 9, 10, 11, 12],
      permitRequired: false, guideRecommended: false, routeType: "out-and-back",
      hidden: false, blurb: "the Garhwal's accessible weekend summit, snow in winter",
    },
    {
      name: "Kunjapuri sunrise trail",
      distanceKm: 3, elevationGainM: 250, maxAltitudeM: 1676, difficulty: "easy",
      durationHours: 2, trailhead: "Hindolakhal", bestMonths: [1, 2, 3, 4, 5, 6, 9, 10, 11, 12],
      permitRequired: false, guideRecommended: false, routeType: "out-and-back",
      hidden: true, blurb: "a short dawn climb to a temple with Himalayan horizon",
    },
  ],
  coorg: [
    {
      name: "Tadiandamol Peak",
      distanceKm: 14, elevationGainM: 900, maxAltitudeM: 1748, difficulty: "moderate",
      durationHours: 6, trailhead: "Nalknad Palace", bestMonths: [10, 11, 12, 1, 2, 3],
      permitRequired: false, guideRecommended: false, routeType: "out-and-back",
      hidden: false, blurb: "Coorg's highest peak through shola forest and grassland",
    },
    {
      name: "Brahmagiri Peak",
      distanceKm: 14, elevationGainM: 700, maxAltitudeM: 1608, difficulty: "moderate",
      durationHours: 6, trailhead: "Iruppu Falls", bestMonths: [10, 11, 12, 1, 2],
      permitRequired: true, guideRecommended: true, routeType: "out-and-back",
      hidden: true, blurb: "a wildlife-sanctuary ridge on the Kerala border",
    },
  ],
  mawsynram: [
    {
      name: "David Scott Trail",
      distanceKm: 16, elevationGainM: 400, maxAltitudeM: 1500, difficulty: "moderate",
      durationHours: 6, trailhead: "Mawphlang", bestMonths: [10, 11, 12, 1, 2, 3],
      permitRequired: false, guideRecommended: false, routeType: "point-to-point",
      hidden: false, blurb: "a colonial-era bridle path through Khasi countryside",
    },
    {
      name: "Mawlyngbna to Split Rock",
      distanceKm: 8, elevationGainM: 300, maxAltitudeM: 1300, difficulty: "moderate",
      durationHours: 4, trailhead: "Mawlyngbna", bestMonths: [10, 11, 12, 1, 2, 3],
      permitRequired: false, guideRecommended: true, routeType: "out-and-back",
      hidden: true, blurb: "fossils, springs and canyon views few tourists reach",
    },
  ],
};

// Resolve curated trails for a destination by catalog slug (treks are intensely
// local, so name/state fallbacks aren't meaningful here).
export function curatedTrailsFor(slug: string): CuratedTrail[] {
  return trailsByDestination[slug.toLowerCase()] ?? [];
}
