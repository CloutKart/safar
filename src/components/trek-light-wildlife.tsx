import type { TrekPhoto } from "@/lib/trek/schema";
import { PhotoCredit } from "@/components/trek-trail-journey";

// A visual band of the trek's OWN real photos: a golden-hour shot and any
// wildlife captured on the trek. Renders only what actually exists in the pool —
// nothing representative, and nothing at all when neither is available.
export function TrekLightWildlife({
  golden,
  wildlife,
}: {
  golden: TrekPhoto | null;
  wildlife: TrekPhoto[];
}) {
  if (!golden && wildlife.length === 0) return null;
  const tiles: Array<{ photo: TrekPhoto; caption: string }> = [];
  if (golden) tiles.push({ photo: golden, caption: "🌅 Golden hour" });
  for (const w of wildlife) tiles.push({ photo: w, caption: w.title });

  return (
    <div className="light-wildlife">
      {tiles.map(({ photo, caption }, i) => (
        <figure
          key={i}
          className={`lw-tile${i === 0 && golden ? " lw-golden" : ""}`}
          style={{ backgroundImage: `url("${photo.url.replaceAll('"', "%22")}")` }}
        >
          <figcaption>{caption}</figcaption>
          <PhotoCredit photo={photo} />
        </figure>
      ))}
    </div>
  );
}
