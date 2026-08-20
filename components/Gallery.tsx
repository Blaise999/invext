import type { Shot } from "@/lib/media";

/**
 * Mosaic rather than a uniform grid — the first tile spans two columns and two
 * rows, which stops eight identical 4:3 rectangles reading as a stock-photo
 * dump. Credits sit as a hairline overlay: CC and NASA both require
 * attribution, but it doesn't need to be body copy.
 */
export default function Gallery({ shots }: { shots: Shot[] }) {
  if (shots.length === 0) return null;

  return (
    <div className="mos">
      {shots.slice(0, 7).map((s, i) => (
        <figure className={i === 0 ? "mos__t mos__t--hero" : "mos__t"} key={s.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.src} alt={s.title} loading={i < 2 ? "eager" : "lazy"} decoding="async" />
          <figcaption>
            <span className="mos__title">{s.title}</span>
            <span className="mono mos__credit">{s.credit}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
