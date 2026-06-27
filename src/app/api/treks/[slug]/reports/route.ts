import { NextResponse } from "next/server";
import {
  addTrekReport,
  conditionConfidence,
  getTrekReports,
  TrekReportInputSchema,
} from "@/lib/trek/reports";

export const dynamic = "force-dynamic";

// GET /api/treks/[slug]/reports -> recent (non-expired) reports + condition confidence.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const reports = await getTrekReports(slug);
  return NextResponse.json({ reports, confidence: conditionConfidence(reports) });
}

// POST /api/treks/[slug]/reports { trailStatus, waterStatus?, rating, note?, name? }
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = TrekReportInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Trail status and a 1–5 rating are required." }, { status: 400 });
  }
  await addTrekReport(slug, parsed.data);
  const reports = await getTrekReports(slug);
  return NextResponse.json({ reports, confidence: conditionConfidence(reports) });
}
