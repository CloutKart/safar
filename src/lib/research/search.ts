import { env } from "@/lib/env";
import type { TripSummary } from "@/lib/domain";
import type { CuratedDestination } from "@/data/destinations";

export interface SearchResult {
  title: string;
  url: string;
  publisher: string;
  excerpt: string;
  sourceType: "search" | "reddit";
}

function normalizeResults(payload: unknown): SearchResult[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const candidates = Array.isArray(record.results)
    ? record.results
    : Array.isArray(record.data)
      ? record.data
      : [];
  return candidates
    .map((candidate) => {
      if (!candidate || typeof candidate !== "object") return null;
      const item = candidate as Record<string, unknown>;
      const url = String(item.url ?? item.link ?? "");
      if (!url.startsWith("http")) return null;
      const host = new URL(url).hostname.replace(/^www\./, "");
      return {
        title: String(item.title ?? host),
        url,
        publisher: host,
        excerpt: String(item.content ?? item.snippet ?? item.description ?? "").slice(
          0,
          400,
        ),
        sourceType: host.includes("reddit.com") ? "reddit" : "search",
      } satisfies SearchResult;
    })
    .filter((result): result is SearchResult => Boolean(result));
}

async function querySearchProvider(query: string): Promise<SearchResult[]> {
  if (!env.SEARCH_API_URL) return [];
  const response = await fetch(env.SEARCH_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.SEARCH_API_KEY
        ? { Authorization: `Bearer ${env.SEARCH_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({ query, max_results: 5 }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return [];
  return normalizeResults(await response.json());
}

export async function researchDestination(
  destination: CuratedDestination,
  summary: TripSummary,
): Promise<SearchResult[]> {
  const interests = summary.memberPreferences
    .flatMap((member) => member.interests)
    .filter((interest) => interest.weight > 0)
    .map((interest) => interest.tag)
    .slice(0, 5)
    .join(" ");
  const queries = [
    `${destination.name} ${destination.state} tourism current access safety ${interests}`,
    `site:reddit.com ${destination.name} travel ${interests}`,
  ];
  const results = (await Promise.all(queries.map(querySearchProvider))).flat();
  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.url)) return false;
    seen.add(result.url);
    return true;
  });
}
