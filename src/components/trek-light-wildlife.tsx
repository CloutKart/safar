import type { WildlifeShot } from "@/lib/trek/imagery";

// A visual band: a golden-hour shot and likely-wildlife photos for the trek's
// region. Purely presentational; all images are representative of the terrain /
// species, not the exact trek (labelled as such), complementing the date-aware
// sun planner and the wildlife-likelihood guide.
export function TrekLightWildlife({
  goldenImage,
  wildlife,
}: {
  goldenImage: string;
  wildlife: WildlifeShot[];
}) {
  return (
    <div className="light-wildlife">
      <figure className="lw-tile lw-golden" style={{ backgroundImage: `url("${goldenImage}")` }}>
        <figcaption>
          🌅 Golden hour
          <span className="lw-tag">representative</span>
        </figcaption>
      </figure>
      {wildlife.map((w, i) => (
        <figure key={i} className="lw-tile" style={{ backgroundImage: `url("${w.url}")` }}>
          <figcaption>
            {w.species}
            <span className="lw-tag">representative</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
