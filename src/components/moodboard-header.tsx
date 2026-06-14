import type { GeneratedPlan } from "@/lib/domain";

// A growing collage of the plans' real photos, faded into the island header
// behind the title so it starts to "look like the trip" by plan time. Uses the
// top plan's four categorised photos first (coherent), then fills from others.
// Each photo fades in as it loads; the .island-veil keeps the title legible.
export function MoodboardHeader({ plans }: { plans: GeneratedPlan[] }) {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const plan of plans) {
    for (const image of plan.destinationImages ?? []) {
      if (seen.has(image.url)) continue;
      seen.add(image.url);
      urls.push(image.url);
      if (urls.length >= 4) break;
    }
    if (urls.length >= 4) break;
  }
  if (urls.length === 0) return null;
  return (
    <div className="moodboard" aria-hidden="true" data-count={urls.length}>
      {urls.map((url) => (
        // eslint-disable-next-line @next/next/no-img-element -- external dynamic photo URLs
        <img
          key={url}
          src={url}
          alt=""
          loading="eager"
          onLoad={(event) => event.currentTarget.classList.add("loaded")}
        />
      ))}
    </div>
  );
}
