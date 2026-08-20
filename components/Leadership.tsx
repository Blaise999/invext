import { leadershipPortrait } from "@/lib/media";
import { spcxSegments } from "@/lib/facts";

/**
 * Editorial: who runs these companies and how they connect. Placed well away
 * from any price, return figure or call to invest — a portrait of a living
 * person next to a performance number reads as an endorsement, which is both
 * a right-of-publicity problem and the exact shape of the impersonation scams
 * that plague this sector.
 */
export default async function Leadership() {
  const portrait = await leadershipPortrait();

  return (
    <div className="lead">
      <div className="lead__media">
        {portrait ? (
          <figure className="lead__fig">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={portrait.src} alt="Elon Musk" loading="lazy" />
            <figcaption className="mono">
              {portrait.credit} ·{" "}
              {portrait.licenceUrl ? (
                <a href={portrait.licenceUrl} target="_blank" rel="noopener noreferrer nofollow">
                  {portrait.licence}
                </a>
              ) : (
                portrait.licence
              )}
              {portrait.sourceUrl && (
                <>
                  {" · "}
                  <a href={portrait.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                    Commons
                  </a>
                </>
              )}
            </figcaption>
          </figure>
        ) : (
          <div className="lead__none mono">
            No freely licensed portrait available right now.
          </div>
        )}
      </div>

      <div className="lead__body">
        <p className="lead__p">
          Elon Musk runs both Tesla and SpaceX. They are separate listed
          companies — TSLA and SPCX — and neither holds equity in the other, so
          they move independently.
        </p>
        <p className="lead__p">
          Three heavily branded things sit inside SpaceX:
        </p>

        <ul className="lead__segs">
          {spcxSegments.map((s) => (
            <li key={s.name}>
              <span className="lead__segName">{s.name}</span>
              <span className="mono lead__segMetric">{s.metric}</span>
              <span className="lead__segDetail">{s.detail}</span>
            </li>
          ))}
        </ul>


      </div>
    </div>
  );
}
