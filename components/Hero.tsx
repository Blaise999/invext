"use client";

import { useState } from "react";
import ScrollSequence from "./ScrollSequence";
import Brand from "./Brand";
import type { HeroSequences } from "@/lib/sequence-server";
import {
  PLATES,
  SEG,
  clamp01,
  envelopeAt,
  heatAt,
  localOf,
  plateOf,
  stagger,
  wipe,
} from "@/lib/hero-motion";

/* ------------------------------------------------------------------ copy -- */

interface Plate {
  index: string;
  eyebrow: string;
  /** One entry per rendered line. `em` sets the line in the display serif. */
  head: { text: string; em?: boolean }[];
  lede: string;
  /** Shorter cut used on phones, where a four-line lede buries the buttons. */
  ledeShort: string;
  actions: { label: string; href: string; solid?: boolean }[];
  readout: [string, string][];
}

const DECK: Plate[] = [
  {
    index: "01",
    eyebrow: "Listed",
    head: [{ text: "Two public" }, { text: "companies," }, { text: "quoted live", em: true }],
    lede:
      "SPCX listed on Nasdaq on 12 June 2026 — the largest IPO on record, with an unusually high share going to retail. TSLA has traded since 2010. Both price continuously, both move independently.",
    ledeShort:
      "SPCX listed on Nasdaq in June 2026. TSLA has traded since 2010. Both price continuously, both move independently.",
    actions: [
      { label: "Open the market", href: "/dashboard/market", solid: true },
      { label: "See the quotes", href: "#market" },
    ],
    readout: [
      ["SPCX", "Nasdaq · since Jun 2026"],
      ["TSLA", "Nasdaq · since Jun 2010"],
      ["Quotes", "End of day · delayed"],
    ],
  },
  {
    index: "02",
    eyebrow: "Private",
    head: [{ text: "Private names," }, { text: "tradeable" }, { text: "under treaty", em: true }],
    lede:
      "A private company has no continuous quote, so we don't invent one. Units carry a dated mark and change hands at it — no price is published, because a published price on an unlisted security is a claim nobody can settle.",
    ledeShort:
      "No continuous quote, so we don't invent one. Units carry a dated mark and change hands at it. No price is published.",
    actions: [
      { label: "How access works", href: "#private", solid: true },
      { label: "Read the terms", href: "#private" },
    ],
    readout: [
      ["Neuralink", "Coverage planned"],
      ["Boring Co", "Coverage planned"],
      ["Pricing", "Dated mark · not quoted"],
    ],
  },
  {
    index: "03",
    eyebrow: "The group",
    head: [{ text: "Seven names." }, { text: "One" }, { text: "operator", em: true }],
    lede:
      "Starlink, Grok and X are divisions of SpaceX, not tickers. Knowing which is which is most of the work — so the whole structure sits on one page, dated and checkable.",
    ledeShort:
      "Starlink, Grok and X are divisions of SpaceX, not tickers. The whole structure sits on one page, dated and checkable.",
    actions: [
      { label: "Request access", href: "#access", solid: true },
      { label: "What changed", href: "#timeline" },
    ],
    readout: [
      ["Inside SPCX", "Starlink · Grok · X"],
      ["Separate", "Neuralink · Boring Co"],
      ["Restructures", "Three since Mar 2025"],
    ],
  },
];

/* ------------------------------------------------------------- component -- */

export default function Hero({ seq }: { seq: HeroSequences }) {
  const [p, setProgress] = useState(0);
  const [frame, setFrame] = useState({ i: 0, n: 0 });

  const active = plateOf(p);
  const heat = heatAt(p);

  return (
    <ScrollSequence
      desktop={seq.desktop}
      mobile={seq.mobile}
      /**
       * Pin length.
       *
       * Was 3.9 viewports for three plates, which left roughly a third of a
       * screen of scroll after the last one had finished saying anything —
       * the dead stretch under the hero. Three plates need three viewports and
       * a little overlap for the hand-offs, not four.
       */
      scrollLength={3.15}
      mobileScrollLength={1.95}
      damping={0.13}
      onProgress={setProgress}
      onFrame={(i, n) => setFrame({ i, n })}
    >
      <div className="hero" style={{ "--heat": heat } as React.CSSProperties}>
        {/* ---------------- masthead ---------------- */}
        <header className="hero__nav">
          {/* The actual mark — same component the dashboard header uses, so the
              logo is one thing in one place rather than a CSS approximation
              that drifts from it. */}
          <a className="wordmark" href="/" aria-label="InveXt home">
            <Brand size={26} />
          </a>
          <nav aria-label="Primary">
            <a href="#market">Markets</a>
            <a href="#private">Private</a>
            <a href="#intelligence">Intelligence</a>
            <a href="#argument">Thesis</a>
            <a href="/dashboard">Dashboard</a>
          </nav>
        </header>

        {/* ---------------- aperture blades ----------------
            Two horizontal blades close toward the centre at each hand-off and
            open again once the new plate has landed. It is the only moment in
            the hero that draws attention to itself, which is why it lasts about
            a fifth of a second and does nothing at all in between. */}
        <div className="ap" aria-hidden="true">
          <i className="ap__blade ap__blade--t" />
          <i className="ap__blade ap__blade--b" />
          <i className="ap__cut" />
        </div>

        {/* ---------------- plates ---------------- */}
        <div className="hero__deck">
          {DECK.map((plate, i) => {
            const local = localOf(p, i);
            const first = i === 0;
            const last = i === PLATES - 1;
            const { enter, exit, presence } = envelopeAt(local, first, last);
            const live = presence > 0.55;

            return (
              <article
                key={plate.index}
                className={`plate plate--${plate.index}`}
                style={{
                  // The block itself only translates. Every reveal below is a
                  // clip, so nothing on this plate fades — which is what keeps
                  // the type crisp instead of ghosting through the canvas.
                  transform: `translate3d(0, ${(1 - enter) * 26 + (1 - exit) * -30}px, 0)`,
                  pointerEvents: live ? "auto" : "none",
                  visibility: presence < 0.02 ? "hidden" : "visible",
                }}
                aria-hidden={!live}
              >
                <p className="plate__eyebrow mono" style={{ clipPath: wipe(enter, exit) }}>
                  <span className="plate__no">{plate.index}</span>
                  {plate.eyebrow}
                  <i
                    className="plate__rule"
                    style={{ transform: `scaleX(${clamp01(local)})` }}
                    aria-hidden="true"
                  />
                </p>

                <h1 className="plate__h">
                  {plate.head.map((line, k) => (
                    <span
                      key={k}
                      className="plate__line"
                      style={{ clipPath: wipe(stagger(enter, k), exit) }}
                    >
                      <span className={line.em ? "plate__em" : undefined}>{line.text}</span>
                    </span>
                  ))}
                </h1>

                <p className="plate__lede" style={{ clipPath: wipe(stagger(enter, 2), exit) }}>
                  <span className="only-wide">{plate.lede}</span>
                  <span className="only-narrow">{plate.ledeShort}</span>
                </p>

                <div className="plate__actions" style={{ clipPath: wipe(stagger(enter, 3), exit) }}>
                  {plate.actions.map((a) => (
                    <a
                      key={a.label}
                      href={a.href}
                      className={a.solid ? "btn btn--solid" : "btn"}
                      tabIndex={live ? 0 : -1}
                    >
                      {a.label}
                    </a>
                  ))}
                </div>

                <dl className="plate__readout" style={{ clipPath: wipe(stagger(enter, 4), exit) }}>
                  {plate.readout.map(([k, v]) => (
                    <div key={k}>
                      <dt className="mono">{k}</dt>
                      <dd className="mono">{v}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            );
          })}
        </div>

        {/* ---------------- transport ----------------
            Replaces the old vertical rail. It reports the thing the hero is
            actually doing — which plate is up, and where in the render we are —
            rather than decorating the edge of the screen with tick marks. On a
            phone it collapses to the segment bar alone. */}
        <div className="tp" aria-hidden="true">
          <ol className="tp__segs">
            {DECK.map((plate, i) => (
              <li key={plate.index} className={i === active ? "tp__seg is-on" : "tp__seg"}>
                <i style={{ transform: `scaleX(${clamp01(localOf(p, i))})` }} />
                <span className="mono">{plate.eyebrow}</span>
              </li>
            ))}
          </ol>
          <p className="mono tp__frame">
            {frame.n > 0
              ? `FRAME ${String(frame.i + 1).padStart(4, "0")} / ${String(frame.n).padStart(4, "0")}`
              : "FRAME ---- / ----"}
          </p>
        </div>

        {/* ---------------- scroll cue ---------------- */}
        <div className="hero__cue mono" style={{ opacity: clamp01(1 - p * 16) }} aria-hidden="true">
          <span>Scroll</span>
          <i />
        </div>
      </div>
    </ScrollSequence>
  );
}

/* Keeps the segment maths honest if PLATES and DECK ever drift apart. */
if (process.env.NODE_ENV !== "production" && DECK.length !== PLATES) {
  console.warn(`hero: DECK has ${DECK.length} plates, motion model expects ${PLATES} (SEG=${SEG})`);
}
