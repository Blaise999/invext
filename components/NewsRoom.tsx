import type { Placed } from "@/lib/newsroom";

/**
 * The composition is asymmetric by construction rather than by a masonry
 * library: every card declares its own column span and its own vertical
 * offset, so nothing shares a baseline and the gaps between clusters are
 * uneven on purpose. Two cards deliberately overrun the page edge.
 *
 * The one rule the irregularity does not get to break: reading order. Source
 * order is editorial order, offsets are visual only, and every card is a
 * single article element — so a screen reader gets a clean list regardless of
 * how scattered it looks.
 */

function Meta({ n }: { n: Placed }) {
  return (
    <div className="nw__meta">
      <span className={n.live ? "nw__tag is-live" : "nw__tag"}>
        {n.live && <i className="nw__dot" aria-hidden="true" />}
        {n.tag}
      </span>
      <span className="mono nw__kicker">{n.kicker}</span>
      <time className="mono nw__stamp">{n.stamp}</time>
    </div>
  );
}

function Frame({ n, ratio }: { n: Placed; ratio: string }) {
  if (!n.shot) return null;
  return (
    <div className="nw__frame" style={{ aspectRatio: ratio }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={n.shot.src} alt={n.shot.title} loading="lazy" decoding="async" />
      <span className="nw__scrim" aria-hidden="true" />
      <span className="mono nw__credit">{n.shot.credit}</span>
    </div>
  );
}

function Card({ n }: { n: Placed }) {
  const cls = [
    "nw",
    `nw--${n.shape}`,
    n.mod ?? "",
    n.shot ? "has-img" : "no-img",
  ]
    .filter(Boolean)
    .join(" ");

  const style = { "--col": n.col } as React.CSSProperties;

  /* ---- data card: a figure, no picture ---- */
  if (n.shape === "data") {
    return (
      <article className={cls} style={style}>
        <Meta n={n} />
        <p className="nw__figure">{n.figure}</p>
        <h3 className="nw__h nw__h--xs">{n.headline}</h3>
        {n.figureNote && <p className="nw__note">{n.figureNote}</p>}
      </article>
    );
  }

  /* ---- pull quote: the deliberate empty space in the grid ---- */
  if (n.shape === "quote") {
    return (
      <article className={cls} style={style}>
        <Meta n={n} />
        <blockquote className="nw__pull">{n.headline}</blockquote>
      </article>
    );
  }

  /* ---- lead: oversized, image behind the type ---- */
  if (n.shape === "lead") {
    return (
      <article className={cls} style={style}>
        <Frame n={n} ratio="16 / 11" />
        <div className="nw__body">
          <Meta n={n} />
          <h3 className="nw__h nw__h--xl">{n.headline}</h3>
          {n.standfirst && <p className="nw__sf">{n.standfirst}</p>}
        </div>
      </article>
    );
  }

  /* ---- wide: cinematic strip, image beside the type ---- */
  if (n.shape === "wide") {
    return (
      <article className={cls} style={style}>
        <Frame n={n} ratio="auto" />
        <div className="nw__body">
          <Meta n={n} />
          <h3 className="nw__h nw__h--lg">{n.headline}</h3>
          {n.standfirst && <p className="nw__sf">{n.standfirst}</p>}
        </div>
      </article>
    );
  }

  /* ---- tall / half / compact ---- */
  const ratio = n.shape === "tall" ? "4 / 5" : n.shape === "half" ? "16 / 9" : "3 / 2";
  const size = n.shape === "compact" ? "nw__h--sm" : "nw__h--md";

  return (
    <article className={cls} style={style}>
      <Frame n={n} ratio={ratio} />
      <div className="nw__body">
        <Meta n={n} />
        <h3 className={`nw__h ${size}`}>{n.headline}</h3>
        {n.standfirst && <p className="nw__sf">{n.standfirst}</p>}
      </div>
    </article>
  );
}

export default function NewsRoom({ items }: { items: Placed[] }) {
  return (
    <div className="room">
      {items.map((n) => (
        <Card key={n.id} n={n} />
      ))}
    </div>
  );
}
