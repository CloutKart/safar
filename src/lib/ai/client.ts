import type { ZodType } from "zod";
import { env } from "@/lib/env";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface EmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
}

// Stay under the Gemini free-tier rate limits so usage never tips into paid
// billing. Defaults sit just below the gemini-2.0-flash free tier (15 RPM /
// 1500 RPD); tune via LLM_MAX_RPM / LLM_MAX_RPD. When a cap is hit, callers get
// null and degrade gracefully (templated itinerary, heuristic extraction).
// NOTE: this counter is per-process — a real ceiling on a single self-hosted
// server, best-effort on multi-instance serverless. A Cloud Billing budget is
// the only hard guarantee.
const RPM_CAP = env.LLM_MAX_RPM ?? 12;
const RPD_CAP = env.LLM_MAX_RPD ?? 1200;

const globalUsage = globalThis as typeof globalThis & {
  __safarLlmUsage?: {
    minute: number;
    minuteStart: number;
    day: number;
    dayStart: number;
  };
};

function withinBudget(): boolean {
  const now = Date.now();
  const usage = (globalUsage.__safarLlmUsage ??= {
    minute: 0,
    minuteStart: now,
    day: 0,
    dayStart: now,
  });
  if (now - usage.minuteStart >= 60_000) {
    usage.minute = 0;
    usage.minuteStart = now;
  }
  if (now - usage.dayStart >= 86_400_000) {
    usage.day = 0;
    usage.dayStart = now;
  }
  if (usage.minute >= RPM_CAP || usage.day >= RPD_CAP) return false;
  usage.minute += 1;
  usage.day += 1;
  return true;
}

export async function generateStructured<T>(input: {
  schema: ZodType<T>;
  system: string;
  user: string;
}): Promise<T | null> {
  if (!env.LLM_API_URL || !env.LLM_API_KEY || !env.LLM_MODEL) return null;
  if (!withinBudget()) return null;

  const response = await fetch(env.LLM_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.LLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    return input.schema.parse(JSON.parse(content));
  } catch {
    return null;
  }
}

// Embed text for Trek DNA semantic recall (pgvector). Shares the LLM rate budget
// and degrades to null (no embedding) when unconfigured or over budget — callers
// then fall back to the deterministic DNA-cosine + keyword path. OpenAI-compatible
// `/embeddings` shape; LLM_EMBED_URL is separate from the chat endpoint.
export async function generateEmbedding(text: string): Promise<number[] | null> {
  // The embeddings provider is typically separate from the chat LLM (Groq has no
  // embeddings API), so prefer its own key; fall back to LLM_API_KEY when one
  // provider serves both (e.g. all-Gemini).
  const key = env.LLM_EMBED_KEY ?? env.LLM_API_KEY;
  if (!env.LLM_EMBED_URL || !env.LLM_EMBED_MODEL || !key) return null;
  // Note: embeddings are NOT gated by the chat budget (withinBudget) — the
  // embeddings provider is separate (e.g. Gemini/Jina) with its own free limits,
  // so a 20-trek seed isn't throttled by the Groq chat cap.

  try {
    const response = await fetch(env.LLM_EMBED_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: env.LLM_EMBED_MODEL, input: text }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as EmbeddingResponse;
    const embedding = payload.data?.[0]?.embedding;
    return Array.isArray(embedding) && embedding.length > 0 ? embedding : null;
  } catch {
    return null;
  }
}
