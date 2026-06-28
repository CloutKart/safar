import { NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured } from "@/lib/ai/client";
import { getTrek } from "@/lib/trek/store";
import {
  ADVISOR_SYSTEM,
  AdvisorReplySchema,
  buildAdvisorContext,
  fallbackAnswer,
} from "@/lib/trek/advisor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ question: z.string().trim().min(3).max(300) });

// POST /api/treks/[slug]/advisor { question } -> { answer, grounded }
// Grounded LLM answer from the trek's own data, with a deterministic templated
// fallback when the LLM is unconfigured or over budget.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const trek = await getTrek(slug);
  if (!trek) return NextResponse.json({ error: "Trek not found." }, { status: 404 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ask a short question (3–300 chars)." }, { status: 400 });
  }
  const question = parsed.data.question;

  const reply = await generateStructured({
    schema: AdvisorReplySchema,
    system: ADVISOR_SYSTEM,
    user: `TREK FACTS:\n${buildAdvisorContext(trek)}\n\nQUESTION: ${question}`,
  }).catch(() => null);

  if (reply?.answer) {
    return NextResponse.json({ answer: reply.answer, grounded: true });
  }
  return NextResponse.json({ answer: fallbackAnswer(trek, question), grounded: false });
}
