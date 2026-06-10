import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";

const CreateGroupSchema = z.object({
  subject: z.string().trim().min(3).max(100),
  description: z.string().trim().max(500).optional(),
});

// A readable, collision-resistant room slug: a slugified trip name plus a short
// random suffix. This is the shareable trip-room id (the old WhatsApp invite).
function slugify(subject: string): string {
  const base = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const suffix = randomUUID().slice(0, 8);
  return base ? `${base}-${suffix}` : suffix;
}

export async function POST(request: Request) {
  const parsed = CreateGroupSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a trip name between 3 and 100 characters." },
      { status: 400 },
    );
  }
  const slug = slugify(parsed.data.subject);
  const group = await getStore().ensureGroup({
    waGroupId: slug,
    subject: parsed.data.subject,
    description:
      parsed.data.description ??
      "A Safar trip room. Messages are processed to coordinate this trip.",
  });
  return NextResponse.json({ id: group.id, slug: group.waGroupId });
}
