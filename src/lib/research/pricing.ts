import { env } from "@/lib/env";
import type { TripSummary } from "@/lib/domain";
import type { CuratedDestination } from "@/data/destinations";

export interface SupplierQuote {
  provider: string;
  category: "transport" | "stay" | "food" | "activity";
  amountInr: number;
  live: boolean;
  deepLink: string;
  expiresAt: string | null;
  assumption: string;
  // Set by live stay providers: a real property name + per-night per-person price
  // so the planner can show an actual bookable hotel.
  title?: string;
  perNightInr?: number | null;
}

function encoded(value: string) {
  return encodeURIComponent(value);
}

function fallbackQuotes(
  destination: CuratedDestination,
  summary: TripSummary,
): SupplierQuote[] {
  const days = summary.dates.durationDays ?? destination.minDays;
  const dailyAvg =
    (destination.dailyBudgetInr[0] + destination.dailyBudgetInr[1]) / 2;
  const stayLikely = Math.round(dailyAvg * days * 0.5);
  const foodLikely = Math.round(dailyAvg * days * 0.28);
  const activityLikely = Math.round(dailyAvg * days * 0.22);
  const transportLikely = Math.round(
    (destination.accessCostInr[0] + destination.accessCostInr[1]) / 2,
  );
  return [
    {
      provider: "estimate",
      category: "transport",
      amountInr: transportLikely,
      live: false,
      deepLink: `https://www.google.com/travel/flights?q=${encoded(`${summary.departureCities[0] ?? "India"} to ${destination.nearestAirport}`)}`,
      expiresAt: null,
      assumption: "Round-trip transport estimate from the first known departure city",
    },
    {
      provider: "booking",
      category: "stay",
      amountInr: stayLikely,
      live: false,
      deepLink: `https://www.booking.com/searchresults.html?ss=${encoded(destination.name)}`,
      expiresAt: null,
      assumption: "Mid-range twin-share stay estimate",
    },
    {
      provider: "estimate",
      category: "food",
      amountInr: foodLikely,
      live: false,
      deepLink: `https://www.google.com/maps/search/${encoded(`restaurants in ${destination.name}`)}`,
      expiresAt: null,
      assumption: "Local meals + cafes estimate across the trip",
    },
    {
      provider: "viator",
      category: "activity",
      amountInr: activityLikely,
      live: false,
      deepLink: `https://www.viator.com/searchResults/all?text=${encoded(destination.name)}`,
      expiresAt: null,
      assumption: "One paid activity plus local experiences",
    },
  ];
}

async function fetchAmadeusToken(): Promise<string | null> {
  if (!env.AMADEUS_CLIENT_ID || !env.AMADEUS_CLIENT_SECRET) return null;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.AMADEUS_CLIENT_ID,
    client_secret: env.AMADEUS_CLIENT_SECRET,
  });
  const response = await fetch(
    "https://test.api.amadeus.com/v1/security/oauth2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as { access_token?: string };
  return payload.access_token ?? null;
}

async function tryAmadeusTransport(
  destination: CuratedDestination,
  summary: TripSummary,
): Promise<SupplierQuote | null> {
  const origin = summary.departureCities[0];
  const date = summary.dates.start;
  if (!origin || !date || !/^[A-Z]{3}$/.test(origin)) return null;
  const token = await fetchAmadeusToken();
  if (!token || !/^[A-Z]{3}$/.test(destination.nearestAirport)) return null;
  const url = new URL("https://test.api.amadeus.com/v2/shopping/flight-offers");
  url.searchParams.set("originLocationCode", origin);
  url.searchParams.set("destinationLocationCode", destination.nearestAirport);
  url.searchParams.set("departureDate", date);
  url.searchParams.set("adults", "1");
  url.searchParams.set("max", "5");
  url.searchParams.set("currencyCode", "INR");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    data?: Array<{ price?: { grandTotal?: string } }>;
  };
  const prices = (payload.data ?? [])
    .map((offer) => Number(offer.price?.grandTotal))
    .filter(Number.isFinite);
  if (prices.length === 0) return null;
  return {
    provider: "amadeus",
    category: "transport",
    amountInr: Math.round(Math.min(...prices)),
    live: true,
    deepLink: `https://www.google.com/travel/flights?q=${encoded(`${origin} to ${destination.nearestAirport}`)}`,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    assumption: "Lowest currently returned one-way flight offer; baggage may be extra",
  };
}

async function tryConfiguredProvider(input: {
  url?: string;
  apiKey?: string;
  category: "stay" | "activity";
  destination: CuratedDestination;
  summary: TripSummary;
}): Promise<SupplierQuote | null> {
  if (!input.url || !input.apiKey) return null;
  const response = await fetch(input.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      destination: input.destination.name,
      start_date: input.summary.dates.start,
      end_date: input.summary.dates.end,
      travellers: input.summary.groupSize,
      currency: "INR",
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as Record<string, unknown>;
  const amount = Number(payload.amount_inr ?? payload.price ?? payload.amount);
  const deepLink = String(payload.deep_link ?? payload.url ?? "");
  if (!Number.isFinite(amount) || !deepLink.startsWith("http")) return null;
  return {
    provider: input.category === "stay" ? "booking" : "viator",
    category: input.category,
    amountInr: Math.round(amount),
    live: true,
    deepLink,
    expiresAt: payload.expires_at ? String(payload.expires_at) : null,
    assumption: `Live ${input.category} availability returned by the configured supplier`,
  };
}

// --- RapidAPI "Booking.com" (apidojo) live stay pricing ---------------------
// dest_id lookups are stable, so cache them for the process lifetime; searches
// are cached briefly. Both keep us well under a 500-request/month free tier.
const destIdCache = new Map<string, { destId: string; destType: string } | null>();
const staySearchCache = new Map<string, { quote: SupplierQuote; at: number }>();
const STAY_TTL_MS = 6 * 60 * 60 * 1000;

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function rapidBase(): string {
  const host = env.RAPIDAPI_BOOKING_HOST;
  const scheme =
    host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${scheme}://${host}`;
}

async function rapidGet(path: string): Promise<unknown> {
  const response = await fetch(`${rapidBase()}${path}`, {
    headers: {
      "X-RapidAPI-Key": env.RAPIDAPI_KEY as string,
      "X-RapidAPI-Host": env.RAPIDAPI_BOOKING_HOST,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`rapidapi ${response.status}`);
  return response.json();
}

const SEARCHABLE_DEST = new Set(["city", "region", "district", "landmark"]);

// Booking's location search returns mixed types and countries (a search for
// "Goa" includes Genova, Italy). Prefer a searchable Indian result, in the
// API's own relevance order, rather than the first "city" of any country.
function pickLocation(
  list: Array<Record<string, unknown>>,
): Record<string, unknown> | null {
  const usable = list.filter((item) =>
    SEARCHABLE_DEST.has(String(item.dest_type)),
  );
  const pool = usable.length > 0 ? usable : list;
  return (
    pool.find((item) => String(item.country).toLowerCase() === "india") ??
    pool[0] ??
    null
  );
}

async function resolveDestId(
  name: string,
): Promise<{ destId: string; destType: string } | null> {
  if (destIdCache.has(name)) return destIdCache.get(name) ?? null;
  // Compound catalog names ("Chopta and Tungnath", "Bhangarh and Abhaneri")
  // often miss; retry with the leading part.
  const queries = [name];
  const simple = name.split(/\s+and\s+|,/i)[0].trim();
  if (simple && simple !== name) queries.push(simple);

  let pick: Record<string, unknown> | null = null;
  for (const query of queries) {
    const data = (await rapidGet(
      `/v1/hotels/locations?name=${encodeURIComponent(query)}&locale=en-gb`,
    )) as Array<Record<string, unknown>>;
    pick = pickLocation(Array.isArray(data) ? data : []);
    if (pick) break;
  }
  const result = pick
    ? { destId: String(pick.dest_id), destType: String(pick.dest_type) }
    : null;
  destIdCache.set(name, result);
  return result;
}

function pickHotelPrice(hotel: Record<string, unknown>): number {
  const composite = hotel.composite_price_breakdown as
    | { gross_amount?: { value?: number } }
    | undefined;
  const breakdown = hotel.price_breakdown as { gross_price?: number } | undefined;
  const candidates = [
    Number(hotel.min_total_price),
    Number(composite?.gross_amount?.value),
    Number(breakdown?.gross_price),
    Number(hotel.price),
  ];
  return candidates.find((value) => Number.isFinite(value) && value > 0) ?? 0;
}

async function tryRapidApiStay(
  destination: CuratedDestination,
  summary: TripSummary,
): Promise<SupplierQuote | null> {
  if (!env.RAPIDAPI_KEY) return null;

  const nights = Math.max(1, summary.dates.durationDays ?? destination.minDays);
  const checkinDate = summary.dates.start
    ? new Date(`${summary.dates.start}T00:00:00Z`)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const checkoutDate = summary.dates.end
    ? new Date(`${summary.dates.end}T00:00:00Z`)
    : new Date(checkinDate.getTime() + nights * 24 * 60 * 60 * 1000);
  const guests = Math.max(1, summary.groupSize || 2);
  const rooms = Math.max(1, Math.ceil(guests / 2));
  const checkin = ymd(checkinDate);
  const checkout = ymd(checkoutDate);

  const cacheKey = `${destination.slug}|${checkin}|${checkout}|${guests}`;
  const cached = staySearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < STAY_TTL_MS) return cached.quote;

  const dest = await resolveDestId(destination.name);
  if (!dest) return null;

  const params = new URLSearchParams({
    dest_id: dest.destId,
    dest_type: dest.destType,
    checkin_date: checkin,
    checkout_date: checkout,
    adults_number: String(guests),
    room_number: String(rooms),
    order_by: "price",
    filter_by_currency: "INR",
    locale: "en-gb",
    units: "metric",
    page_number: "0",
    include_adjacency: "true",
  });
  const data = (await rapidGet(`/v1/hotels/search?${params.toString()}`)) as {
    result?: Array<Record<string, unknown>>;
  };
  const hotels = (data.result ?? []).filter((hotel) => pickHotelPrice(hotel) > 0);
  if (hotels.length === 0) return null;
  const cheapest = hotels.reduce((best, hotel) =>
    pickHotelPrice(hotel) < pickHotelPrice(best) ? hotel : best,
  );

  const total = pickHotelPrice(cheapest); // all rooms, whole stay
  const perPerson = Math.round(total / guests);
  const perNight = Math.round(total / Math.max(1, nights) / guests);
  const name = String(cheapest.hotel_name ?? "Booking.com stay");
  const url =
    typeof cheapest.url === "string" && cheapest.url.startsWith("http")
      ? cheapest.url
      : `https://www.booking.com/searchresults.html?ss=${encoded(destination.name)}`;

  const quote: SupplierQuote = {
    provider: "booking-rapidapi",
    category: "stay",
    amountInr: perPerson,
    live: true,
    deepLink: url,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    assumption: `Live cheapest stay: ${name}${summary.dates.start ? "" : " (sample dates ~30 days out)"}`,
    title: name,
    perNightInr: perNight,
  };
  staySearchCache.set(cacheKey, { quote, at: Date.now() });
  return quote;
}

export async function getPriceQuotes(
  destination: CuratedDestination,
  summary: TripSummary,
): Promise<SupplierQuote[]> {
  // fallbacks are ordered [transport, stay, food, activity]
  const fallbacks = fallbackQuotes(destination, summary);
  const liveStay = (async () =>
    (await tryRapidApiStay(destination, summary).catch(() => null)) ??
    (await tryConfiguredProvider({
      url: env.BOOKING_API_URL,
      apiKey: env.BOOKING_API_KEY,
      category: "stay",
      destination,
      summary,
    }).catch(() => null)))();
  const [transport, stay, activity] = await Promise.all([
    tryAmadeusTransport(destination, summary).catch(() => null),
    liveStay,
    tryConfiguredProvider({
      url: env.VIATOR_API_URL,
      apiKey: env.VIATOR_API_KEY,
      category: "activity",
      destination,
      summary,
    }).catch(() => null),
  ]);
  return [
    transport ?? fallbacks[0],
    stay ?? fallbacks[1],
    fallbacks[2], // food is always a local estimate
    activity ?? fallbacks[3],
  ];
}
