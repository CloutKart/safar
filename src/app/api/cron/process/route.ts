import { NextResponse } from "next/server";
import { drainWebhookQueue } from "@/lib/conversation/engine";
import { runCoordinator } from "@/lib/conversation/coordinator";
import { env } from "@/lib/env";

// Drains the webhook queue and runs the coordinator (may touch the LLM).
export const maxDuration = 60;

function authorized(request: Request): boolean {
  if (!env.CRON_SECRET) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [queue, coordinator] = await Promise.all([
    drainWebhookQueue(50),
    runCoordinator(),
  ]);
  return NextResponse.json({ queue, coordinator });
}

export async function GET(request: Request) {
  return POST(request);
}
