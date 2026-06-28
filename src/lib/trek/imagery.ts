import type { Trek } from "@/lib/trek/schema";

// Curated imagery library — REPRESENTATIVE, verified Wikimedia Commons photos by
// terrain type + region, so every trail step / section can show a real, relevant
// image without per-waypoint authoring or unreliable live lookups (which return
// wrong images, as the hero fix proved). A waypoint's OWN photoUrl (a curated
// specific shot) always wins; otherwise we fall back to the type+region library,
// flagged `representative` so the UI can label it honestly.

type WaypointType = Trek["timeline"][number]["type"];
export type RegionBucket =
  | "himalaya"
  | "trans-himalaya"
  | "western-ghats"
  | "northeast"
  | "central";

const C = "https://upload.wikimedia.org/wikipedia/commons";
// 1280px thumbnails keep page weight reasonable and hit Commons' cached CDN.
const t = (xy: string, file: string) => `${C}/thumb/${xy}/${file}/1280px-${file}`;

// Green Himalaya (Garhwal / Kumaon / Dhauladhar / Kashmir).
const HIMALAYA: Partial<Record<WaypointType, string>> = {
  forest: t("d/dc", "Cedrus_deodara_Manali_2.jpg"),
  meadow: t("f/fc", "En_route_to_Dayara_Bugyal_at_Gui_camp_03.jpg"),
  summit: t("6/68", "Kedarkantha_Peak.jpg"),
  ridge: t("4/45", "Chandrasila_RohiniBugiyal_view.jpg"),
  viewpoint: t("4/45", "Chandrasila_RohiniBugiyal_view.jpg"),
  lake: t("8/89", "Roopkund_-_The_Mystery_Lake.jpg"),
  pass: t("4/4e", "Hampta_pass.jpg"),
  camp: t("b/b7", "Morning_Warmth_%28182395183%29.jpeg"),
  stream: t("5/58", "Bhagirathi_River_at_Gangotri.JPG"),
  water: t("5/58", "Bhagirathi_River_at_Gangotri.JPG"),
  waterfall: t("5/58", "Bhagirathi_River_at_Gangotri.JPG"),
  village: t("f/fc", "Tungnath_temple.jpg"),
  trailhead: t("f/fc", "Tungnath_temple.jpg"),
  rest: t("f/fc", "Tungnath_temple.jpg"),
};

// High-altitude desert (Spiti / Ladakh / Zanskar).
const TRANS_HIMALAYA: Partial<Record<WaypointType, string>> = {
  lake: t("3/34", "Mountains_and_grassland_near_the_Chandra_Taal_%28Lake%29%2C_HP%2C_India%2C_D35_7228_nx01.jpg"),
  village: t("4/49", "1000_Year_loop.jpg"),
  trailhead: t("4/49", "1000_Year_loop.jpg"),
  rest: t("4/49", "1000_Year_loop.jpg"),
  pass: t("4/46", "Kunzum_Pass_between_Lahaul_%26_Spiti_28-6-04.jpg"),
  ridge: t("4/46", "Kunzum_Pass_between_Lahaul_%26_Spiti_28-6-04.jpg"),
};

// Western Ghats (Coorg / Karnataka / Kerala).
const WESTERN_GHATS: Partial<Record<WaypointType, string>> = {
  forest: t("3/35", "Shola.jpg"),
  summit: t("2/2b", "Kudremukh_1.jpg"),
  ridge: t("2/2b", "Kudremukh_1.jpg"),
  meadow: t("7/7d", "Tadiandamol%2C_Tadiyantamol_landscape_during_GRV2019_%28194%29.jpg"),
  viewpoint: t("7/7d", "Tadiandamol%2C_Tadiyantamol_landscape_during_GRV2019_%28194%29.jpg"),
  waterfall: t("0/0b", "Doodhsagar_Fall.jpg"),
  stream: t("0/0b", "Doodhsagar_Fall.jpg"),
  water: t("0/0b", "Doodhsagar_Fall.jpg"),
};

// Northeast (Khasi / Naga / Mizoram / Arunachal / Sikkim).
const NORTHEAST: Partial<Record<WaypointType, string>> = {
  meadow: t("8/80", "Dzukou_Valley.jpg"),
  forest: t("5/51", "Living_root_bridges%2C_Nongriat_village%2C_Meghalaya2.jpg"),
  village: t("5/51", "Living_root_bridges%2C_Nongriat_village%2C_Meghalaya2.jpg"),
  trailhead: t("5/51", "Living_root_bridges%2C_Nongriat_village%2C_Meghalaya2.jpg"),
  waterfall: t("7/78", "NohKaLikai_Falls_V2_Wiki.jpg"),
  stream: t("7/78", "NohKaLikai_Falls_V2_Wiki.jpg"),
  water: t("7/78", "NohKaLikai_Falls_V2_Wiki.jpg"),
};

// Central India (Chhattisgarh sal forest).
const CENTRAL: Partial<Record<WaypointType, string>> = {
  forest: t("c/ca", "Elephants_Grass_Sal_Dhikala_Corbett_Reserve_Dec2019_R16_02266.jpg"),
};

const LIBRARY: Record<RegionBucket, Partial<Record<WaypointType, string>>> = {
  himalaya: HIMALAYA,
  "trans-himalaya": TRANS_HIMALAYA,
  "western-ghats": WESTERN_GHATS,
  northeast: NORTHEAST,
  central: CENTRAL,
};

// Per-region fallback when a type isn't in that region's set — always a real,
// sweeping landscape so no step is ever imageless.
const REGION_DEFAULT: Record<RegionBucket, string> = {
  himalaya: HIMALAYA.ridge!,
  "trans-himalaya": TRANS_HIMALAYA.lake!,
  "western-ghats": WESTERN_GHATS.meadow!,
  northeast: NORTHEAST.meadow!,
  central: CENTRAL.forest!,
};

const GOLDEN: Record<RegionBucket, string> = {
  himalaya: t("8/88", "Sandakphu.jpg"), // Kanchenjunga sunrise
  "trans-himalaya": TRANS_HIMALAYA.lake!,
  "western-ghats": WESTERN_GHATS.meadow!,
  northeast: NORTHEAST.meadow!,
  central: CENTRAL.forest!,
};

// Species → photo (matched against the trek's curated `hazards.wildlife` names).
const WILDLIFE_SPECIES: Array<[RegExp, string]> = [
  [/monal|pheasant|tragopan|snowcock|forest bird/i, t("e/e7", "HMonal.jpg")],
  [/bharal|blue sheep/i, t("0/00", "Pseudois_nayaur_137331313.jpg")],
  [/gaur|bison/i, t("8/8f", "Gaur_%28Bos_gaurus%29_female_head.jpg")],
  [/snow leopard/i, t("a/a5", "Irbis4.JPG")],
  [/tiger|leopard|clouded/i, t("8/84", "Bengal_tiger_in_Sanjay_Dubri_Tiger_Reserve_December_2024_by_Tisha_Mukherjee_11.jpg")],
  [/langur|macaque|monkey|gibbon/i, t("c/c7", "Gray_langur_Mudumalai_02.jpg")],
  [/tahr|ibex|takin/i, t("8/89", "Nilgiri_Tahr_at_Eravikulam_National_Park.jpg")],
];
const WILDLIFE_DEFAULT: Record<RegionBucket, string> = {
  himalaya: t("e/e7", "HMonal.jpg"),
  "trans-himalaya": t("0/00", "Pseudois_nayaur_137331313.jpg"),
  "western-ghats": t("8/8f", "Gaur_%28Bos_gaurus%29_female_head.jpg"),
  northeast: t("8/84", "Bengal_tiger_in_Sanjay_Dubri_Tiger_Reserve_December_2024_by_Tisha_Mukherjee_11.jpg"),
  central: t("8/84", "Bengal_tiger_in_Sanjay_Dubri_Tiger_Reserve_December_2024_by_Tisha_Mukherjee_11.jpg"),
};

export function regionBucket(trek: Trek): RegionBucket {
  const s = `${trek.region} ${trek.state}`.toLowerCase();
  if (/spiti|ladakh|zanskar/.test(s)) return "trans-himalaya";
  if (/western ghats|coorg|karnataka|kerala/.test(s)) return "western-ghats";
  if (/khasi|naga|mizoram|arunachal|meghalaya|nagaland|sikkim|kameng|changlang|dibang|hills/.test(s))
    return "northeast";
  if (/chhattisgarh|ghasidas|sarguja/.test(s)) return "central";
  return "himalaya";
}

export interface ResolvedImage {
  url: string;
  representative: boolean;
}

// A waypoint's image: its own curated photo (specific) wins; else the type+region
// library (representative), never null.
export function waypointImage(trek: Trek, w: Trek["timeline"][number]): ResolvedImage {
  if (w.photoUrl) return { url: w.photoUrl, representative: false };
  const bucket = regionBucket(trek);
  return { url: LIBRARY[bucket][w.type] ?? REGION_DEFAULT[bucket], representative: true };
}

export function goldenHourImage(trek: Trek): string {
  return GOLDEN[regionBucket(trek)];
}

export interface WildlifeShot {
  species: string;
  url: string;
}

// Up to n representative wildlife shots, matched from the trek's curated wildlife
// list; falls back to a region-typical species so the band is never empty.
export function wildlifeImages(trek: Trek, n = 3): WildlifeShot[] {
  const bucket = regionBucket(trek);
  const out: WildlifeShot[] = [];
  const seen = new Set<string>();
  for (const name of trek.hazards?.wildlife ?? []) {
    const hit = WILDLIFE_SPECIES.find(([re]) => re.test(name));
    if (!hit || seen.has(hit[1])) continue;
    seen.add(hit[1]);
    // Trim any parenthetical/qualifier for a clean caption.
    out.push({ species: name.replace(/\s*\(.*?\)\s*/g, "").trim(), url: hit[1] });
    if (out.length >= n) break;
  }
  if (out.length === 0) out.push({ species: "Local wildlife", url: WILDLIFE_DEFAULT[bucket] });
  return out;
}
