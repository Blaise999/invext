import { timeline } from "@/lib/facts";

const TAGS: Record<string, string> = {
  structure: "Structure",
  market: "Market",
  funding: "Funding",
  product: "Product",
};

/** Replaces the empty testimonial grid with something checkable. */
export default function Timeline() {
  return (
    <ol className="tl">
      {timeline.map((e) => (
        <li className="tl__row" key={e.iso + e.title}>
          <time className="mono tl__date" dateTime={e.iso}>
            {e.date}
          </time>
          <span className={`mono tl__tag tl__tag--${e.tag}`}>{TAGS[e.tag]}</span>
          <div className="tl__body">
            <h3 className="tl__title">{e.title}</h3>
            <p className="tl__detail">{e.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
