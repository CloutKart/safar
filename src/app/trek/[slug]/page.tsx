import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrekDetail } from "@/components/trek-detail";
import { wikiImage } from "@/lib/research/photos";
import { getTrek } from "@/lib/trek/store";

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
  const heroImage =
    (await wikiImage(trek.name)) ??
    (trek.nearestCity ? await wikiImage(trek.nearestCity) : null);

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
        <TrekDetail trek={trek} heroImageUrl={heroImage} />
      </section>

      <footer className="footer shell">
        <span>Safar · Trek Intelligence Engine</span>
        <span>Curated, community-informed estimates · verify locally</span>
      </footer>
    </main>
  );
}
