// Free, keyless coordinates for the journey map, route map and weather lookups.
// Catalog destinations are keyed by their slug; common Indian departure cities
// by name. Anything not here falls back to a Nominatim geocode at call time.

export type LatLng = [number, number];

const COORDS: Record<string, LatLng> = {
  // ── Curated destinations (by slug) ──
  landour: [30.4593, 78.0905],
  chopta: [30.4894, 79.0669],
  mandawa: [28.0556, 75.1417],
  "bhangarh-abhaneri": [27.0962, 76.287],
  "tirthan-valley": [31.63, 77.345],
  ziro: [27.5447, 93.832],
  mawsynram: [25.2974, 91.5826],
  gokarna: [14.5479, 74.3188],
  gandikota: [14.8145, 78.286],
  majuli: [26.95, 94.17],
  varkala: [8.7333, 76.7167],
  orchha: [25.3518, 78.642],
  goa: [15.4909, 73.8278],
  pondicherry: [11.9416, 79.8083],
  udaipur: [24.5854, 73.7125],
  hampi: [15.335, 76.46],
  rishikesh: [30.0869, 78.2676],
  coorg: [12.4209, 75.7397],
  jaisalmer: [26.9157, 70.9083],
  spiti: [32.227, 78.073],
  havelock: [11.96, 93.0],
  tarkarli: [16.05, 73.4667],
  diu: [20.7144, 70.9874],
  manali: [32.2396, 77.1887],
  mcleodganj: [32.243, 76.322],
  // Vibe-coverage expansion (jaipur/agra/lucknow/kolkata reuse the city entries below)
  kovalam: [8.4004, 76.9787],
  "leh-ladakh": [34.1526, 77.577],
  "valley-of-flowers": [30.7283, 79.605],
  ranthambore: [26.0173, 76.5026],
  kaziranga: [26.5775, 93.1711],
  gir: [21.1245, 70.8244],
  shimla: [31.1048, 77.1734],
  darjeeling: [27.041, 88.2663],
  munnar: [10.0889, 77.0595],
  amritsar: [31.634, 74.8723],
  varanasi: [25.3176, 82.9739],
  "bodh-gaya": [24.6961, 84.987],
  kumarakom: [9.6177, 76.4274],
  gulmarg: [34.0484, 74.3805],
  "nubra-valley": [34.6868, 77.5619],
  "zanskar-valley": [33.46, 76.9],
  cherrapunji: [25.2702, 91.7323],

  // ── Common departure cities (by name + alias) ──
  delhi: [28.6139, 77.209],
  "new delhi": [28.6139, 77.209],
  gurgaon: [28.4595, 77.0266],
  noida: [28.5355, 77.391],
  mumbai: [19.076, 72.8777],
  bangalore: [12.9716, 77.5946],
  bengaluru: [12.9716, 77.5946],
  hyderabad: [17.385, 78.4867],
  chennai: [13.0827, 80.2707],
  kolkata: [22.5726, 88.3639],
  pune: [18.5204, 73.8567],
  ahmedabad: [23.0225, 72.5714],
  jaipur: [26.9124, 75.7873],
  surat: [21.1702, 72.8311],
  lucknow: [26.8467, 80.9462],
  kochi: [9.9312, 76.2673],
  cochin: [9.9312, 76.2673],
  chandigarh: [30.7333, 76.7794],
  indore: [22.7196, 75.8577],
  bhopal: [23.2599, 77.4126],
  nagpur: [21.1458, 79.0882],
  vadodara: [22.3072, 73.1812],
  agra: [27.1767, 78.0081],
  panaji: [15.4909, 73.8278],
  coimbatore: [11.0168, 76.9558],

  // ── Trek-gateway cities & hubs (departure points for the corpus) ──
  dehradun: [30.3165, 78.0322],
  haridwar: [29.9457, 78.1642],
  mussoorie: [30.4599, 78.0664],
  joshimath: [30.555, 79.5645],
  uttarkashi: [30.7268, 78.4354],
  kathgodam: [29.2745, 79.5394],
  nainital: [29.3919, 79.4542],
  almora: [29.5892, 79.6467],
  bageshwar: [29.8389, 79.7717],
  pithoragarh: [29.5829, 80.2182],
  munsiyari: [30.0668, 80.2389],
  leh: [34.1526, 77.5771],
  srinagar: [34.0837, 74.7973],
  pahalgam: [34.0161, 75.3318],
  sonamarg: [34.3032, 75.2911],
  kullu: [31.9576, 77.1095],
  mandi: [31.708, 76.9319],
  kasol: [32.0107, 77.3152],
  kaza: [32.227, 78.073],
  dharamshala: [32.219, 76.3234],
  dalhousie: [32.5387, 75.9706],
  gangtok: [27.3314, 88.6138],
  guwahati: [26.1445, 91.7362],
  shillong: [25.5788, 91.8933],
  kohima: [25.6751, 94.1086],
  imphal: [24.817, 93.9368],
  aizawl: [23.7271, 92.7176],
  lunglei: [22.8879, 92.733],
  itanagar: [27.0844, 93.6053],
  dibrugarh: [27.4728, 94.912],
  raipur: [21.2514, 81.6296],
  bilaspur: [22.0797, 82.1409],
  chikmagalur: [13.3161, 75.772],
  mangalore: [12.9141, 74.856],
  mangaluru: [12.9141, 74.856],
  kozhikode: [11.2588, 75.7804],
  kalpetta: [11.6085, 76.0834],
};

// Aliases for catalog names that don't match their slug directly.
const ALIASES: Record<string, string> = {
  "chopta and tungnath": "chopta",
  "bhangarh and abhaneri": "bhangarh-abhaneri",
  "ziro valley": "ziro",
  "mawsynram and mawlyngbna": "mawsynram",
  "spiti valley": "spiti",
  madikeri: "coorg",
  "coorg madikeri": "coorg",
  "swaraj dweep": "havelock",
  malvan: "tarkarli",
  dharamshala: "mcleodganj",
};

export function lookupCoords(input: string | null | undefined): LatLng | null {
  if (!input) return null;
  const norm = input.toLowerCase().trim();
  if (COORDS[norm]) return COORDS[norm];
  if (ALIASES[norm] && COORDS[ALIASES[norm]]) return COORDS[ALIASES[norm]];
  // Try a slugified form ("Coorg (Madikeri)" -> "coorg-madikeri" -> "coorg").
  const slug = norm
    .replace(/\(.*?\)/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  if (COORDS[slug]) return COORDS[slug];
  if (ALIASES[slug.replace(/-/g, " ")]) return COORDS[ALIASES[slug.replace(/-/g, " ")]];
  const head = norm.split(/[ (,]/)[0];
  return COORDS[head] ?? null;
}

// Last-resort geocode (free, keyless). Caller passes an AbortSignal for a timeout.
export async function geocodeCity(
  name: string,
  signal?: AbortSignal,
): Promise<LatLng | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${name}, India`)}&format=json&limit=1`,
      // Nominatim's usage policy requires an identifying User-Agent; without it
      // requests are rejected (403), so the geocode fallback would never resolve.
      { signal, headers: { Accept: "application/json", "User-Agent": "Safar/1.0 (trek planner)" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(data) || !data[0]) return null;
    return [Number(data[0].lat), Number(data[0].lon)];
  } catch {
    return null;
  }
}

// Great-circle distance in km (footer "~480 km").
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
