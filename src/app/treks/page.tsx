import type { Metadata } from "next";
import Link from "next/link";
import { TrekExplorer } from "@/components/trek-explorer";
import { listTreks } from "@/lib/trek/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Safar Treks · Find your trail by feel",
  description:
    "Describe the trek you want — terrain, mood, crowds, where you're starting from — and Safar's Trek DNA engine finds the closest match, hidden gems included.",
};

export default async function TreksPage() {
  const featured = await listTreks();
  return (
    <main>
      <header className="nav shell">
        <Link className="brand" href="/" aria-label="Safar home">
          <span className="brand-mark">S</span>
          <span>Safar</span>
        </Link>
        <Link className="nav-link" href="/">
          Plan a group trip
        </Link>
      </header>

      <section className="trek-hero shell">
        <p className="eyebrow">Trek intelligence, not a trail directory</p>
        <h1>Find the trek that fits how you want to feel.</h1>
        <p className="hero-lede">
          Tell Safar what you&apos;re after — an easy sunrise walk with waterfalls and
          no crowds, a hard snow summit, a quiet forest weekend near home. The Trek DNA
          engine reads the mood behind your words and ranks real trails to match,
          hidden gems included.
        </p>
      </section>

      <section className="shell">
        <TrekExplorer featured={featured} />
      </section>

      <footer className="footer shell">
        <span>Safar · Trek Intelligence Engine</span>
        <span>Curated, community-informed estimates · verify conditions locally</span>
      </footer>
    </main>
  );
}
