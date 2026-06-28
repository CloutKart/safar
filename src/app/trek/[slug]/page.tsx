import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrekDetail } from "@/components/trek-detail";
import { wikiImageFromCandidates } from "@/lib/research/photos";
import { similarTreks } from "@/lib/trek/enrich";
import { getTrek, listTreks } from "@/lib/trek/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const trek = await getTrek(slug);
  if (!trek) return { title: "Trek not found · Safar" };
  return {
    title: `${trek.name} · Safar Treks`,
    description: trek.blurb || trek.description.slice(0, 150),
  };
}

export default async function TrekPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trek = await getTrek(slug);
  if (!trek) notFound();
  // Curated landmark photo first (reliable + relevant); else resolve a landmark
  // image from the trail/region — never an unrelated city shot. If everything
  // fails, the hero CSS falls back to a scenic gradient (no broken image).
  const heroImage =
    trek.photoUrl ??
    (await wikiImageFromCandidates([
      trek.name.replace(/\b(trek|trail|summit|via)\b.*$/i, "").trim(),
      trek.trailhead,
      trek.region,
    ]));

  // Deterministic neighbours over the unified corpus ("you might also like").
  const alternatives = similarTreks(trek, await listTreks(), 3);

  return (
    <main>
      <header className="nav shell">
        <Link className="brand" href="/" aria-label="Safar home">
          <span className="brand-mark">S</span>
          <span>Safar</span>
        </Link>
        <Link className="nav-link" href="/treks">
          ← All treks
        </Link>
      </header>

      <section className="shell">
        <TrekDetail trek={trek} heroImageUrl={heroImage} alternatives={alternatives} />
      </section>

      <footer className="footer shell">
        <span>Safar · Trek Intelligence Engine</span>
        <span>Curated, community-informed estimates · verify locally</span>
      </footer>
    </main>
  );
}
