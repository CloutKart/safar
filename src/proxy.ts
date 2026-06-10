import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

export function proxy(request: NextRequest) {
  if (!env.ADMIN_PASSWORD) return NextResponse.next();
  const authorization = request.headers.get("authorization");
  const expected = `Basic ${Buffer.from(`safar:${env.ADMIN_PASSWORD}`).toString("base64")}`;
  if (authorization === expected) return NextResponse.next();
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Safar operations"' },
  });
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/admin/:path*"],
};
