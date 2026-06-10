import { NextResponse } from "next/server";
import { hasSupabase } from "@/lib/env";

export function GET() {
  return NextResponse.json({
    ok: true,
    mode: hasSupabase ? "supabase" : "memory",
    timestamp: new Date().toISOString(),
  });
}
