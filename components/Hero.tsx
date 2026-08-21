"use client";

import { useState } from "react";
import ScrollSequence, { type SeqConfig } from "./ScrollSequence";
import Brand from "./Brand";
import {
  PLATES,
  SEG,
  clamp01,
  cropAt,
  envelopeAt,
  heatAt,
  localOf,
  plateOf,
  stagger,
  wipe,
} from "@/lib/hero-motion";

/* ---------------------------------------------------------------- frames -- */

const SEQ_DESKTOP: SeqConfig = {
  dir: "seq",
  stem: "frame_",
  ext: "webp",
  pad: 3,
  first: 1,
};

const SEQ_MOBILE: SeqConfig = {
  dir: "seq-m",
  stem: "frame_",
  ext: "webp",
  pad: 3,
  first: 1,
};

/* ------------------------------------------------------------------ copy -- */

interface Plate {
  index: string;
  eyebrow: string;
  head: { text: string; em?: boolean }[];
  lede: string;
  ledeShort: string;
  actions: { label: string; href: string; solid?: boolean }[];
  readout: [string, string][];
}

const DECK: Plate[] = [
  {
    index: "01",
    eyebrow: "Listed",
    head: [
      { text: "Two public" },
      { text: "companies," },
      { text: "quoted live", em: true },
    ],
    lede:
      "SPCX listed on Nasdaq on 12 June 2026 — the largest IPO on record, with an unusually high share allocated to retail. TSLA has traded continuously since 2010. Both price in real time. Both move independently.",
    ledeShort:
      "SPCX listed on Nasdaq in June 2026. TSLA has traded since 2010. Both price continuously. Both move independently.",
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
    head: [
      { text: "Private names." },
      { text: "Dated marks." },
      { text: "No continuous quote", em: true },
    ],
    lede:
      "Private securities do not trade on a continuous market. Units change hands at a dated mark drawn from private rounds and secondary blocks. That mark is a reference point only. A future public listing price can be substantially higher or substantially lower.",
    ledeShort:
      "Private securities have no continuous quote. Units trade at a dated mark. A future public listing can price far higher or far lower.",
    actions: [
      { label: "How access works", href: "#private", solid: true },
      { label: "Read the terms", href: "#private" },
    ],
    readout: [
      ["Neuralink", "Private mark"],
      ["Boring Co", "Private mark"],
      ["Pricing", "Dated mark · not quoted"],
    ],
  },
  {
    index: "03",
    eyebrow: "The group",
    head: [
      { text: "Seven names." },
      { text: "One" },
      { text: "operator", em: true },
    ],
    lede:
      "Starlink, Grok and X sit inside SpaceX. They are divisions, not separate tickers. Neuralink and The Boring Company remain distinct. The full structure is shown on one page, dated and checkable, so the relationships are never left to assumption.",
    ledeShort:
      "Starlink, Grok and X are divisions of SpaceX. Neuralink and Boring remain separate. The full structure is on one page, dated and checkable.",
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

if (process.env.NODE_ENV !== "production" && DECK.length !== PLATES) {
  console.warn(
    `hero: DECK has ${DECK.length} plates, motion model expects ${PLATES} (SEG=${SEG})`
  );
}

export default function Hero() {
  const [p, setProgress] = useState(0);
  const [frame, setFrame] = useState({ i: 0, n: 0 });

  const active = plateOf(p);

  return (
    <ScrollSequence
      desktop={SEQ_DESKTOP}
      mobile={SEQ_MOBILE}
      scrollLength={4.8}
      mobileScrollLength={3.2}
      damping={0.12}
      crop={cropAt}
      heat={heatAt}
      onProgress={setProgress}
      onFrame={(i, n) => setFrame({ i, n })}
    >
      <div className="hero" style={{ position: "relative", zIndex: 1 }}>
        {/* ---------------- masthead ---------------- */}
        <header className="hero__nav">
          <a
            className="wordmark"
            href="/"
            aria-label="InveXt home"
            style={{ color: "inherit", textDecoration: "none" }}
          >
            <Brand size={26} />
          </a>
          <nav aria-label="Primary">
            <a href="#market" style={{ color: "inherit", textDecoration: "none" }}>
              Markets
            </a>
            <a href="#private" style={{ color: "inherit", textDecoration: "none" }}>
              Private
            </a>
            <a
              href="#intelligence"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              Intelligence
            </a>
            <a href="#argument" style={{ color: "inherit", textDecoration: "none" }}>
              Thesis
            </a>
            <a href="/dashboard" style={{ color: "inherit", textDecoration: "none" }}>
              Dashboard
            </a>
          </nav>
        </header>

        {/* ---------------- aperture blades ---------------- */}
        <div
          className="ap"
          aria-hidden="true"
          style={{ position: "absolute", zIndex: 0, pointerEvents: "none" }}
        >
          <i className="ap__blade ap__blade--t" />
          <i className="ap__blade ap__blade--b" />
          <i className="ap__cut" />
        </div>

        {/* ---------------- plates ---------------- */}
        <div className="hero__deck" style={{ position: "relative", zIndex: 10 }}>
          {DECK.map((plate, i) => {
            const local = localOf(p, i);
            const first = i === 0;
            const last = i === PLATES - 1;
            const { enter, exit, presence } = envelopeAt(local, first, last);
            const live = presence > 0.55;
            const off = presence < 0.02;

            return (
              <article
                key={plate.index}
                className={`plate plate--${plate.index}`}
                data-on={live ? "true" : undefined}
                data-off={off ? "true" : undefined}
                style={{
                  opacity: presence,
                  zIndex: i === active ? 3 : live ? 2 : 1,
                  transform: `translate3d(0, ${(1 - enter) * 18 + (1 - exit) * -18}px, 0)`,
                  pointerEvents: live ? "auto" : "none",
                  visibility: off ? "hidden" : "visible",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.5rem",
                  position: "relative",
                }}
                aria-hidden={!live}
              >
                <p
                  className="plate__eyebrow mono"
                  style={{ clipPath: wipe(enter, exit), margin: 0 }}
                >
                  <span className="plate__no">{plate.index}</span>
                  {plate.eyebrow}
                  <i
                    className="plate__rule"
                    style={{ transform: `scaleX(${clamp01(local)})` }}
                    aria-hidden="true"
                  />
                </p>

                <h1
                  className="plate__h"
                  style={{
                    margin: 0,
                    lineHeight: "1.2",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25rem",
                  }}
                >
                  {plate.head.map((line, k) => (
                    <span
                      key={k}
                      className="plate__line"
                      style={{
                        clipPath: wipe(stagger(enter, k), exit),
                        display: "block",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span className={line.em ? "plate__em" : undefined}>
                        {line.text}
                      </span>
                    </span>
                  ))}
                </h1>

                <p
                  className="plate__lede"
                  style={{
                    clipPath: wipe(stagger(enter, 2), exit),
                    margin: 0,
                    lineHeight: "1.5",
                  }}
                >
                  <span className="only-wide">{plate.lede}</span>
                  <span className="only-narrow">{plate.ledeShort}</span>
                </p>

                <div
                  className="plate__actions"
                  style={{
                    clipPath: wipe(stagger(enter, 3), exit),
                    display: "flex",
                    gap: "1rem",
                  }}
                >
                  {plate.actions.map((a) => (
                    <a
                      key={a.label}
                      href={a.href}
                      className={a.solid ? "btn btn--solid" : "btn"}
                      tabIndex={live ? 0 : -1}
                      style={{
                        color: a.solid ? "#ffffff" : "inherit",
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      {a.label}
                    </a>
                  ))}
                </div>

                <dl
                  className="plate__readout"
                  style={{ clipPath: wipe(stagger(enter, 4), exit) }}
                >
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

        {/* ---------------- transport ---------------- */}
        <div className="tp" aria-hidden="true">
          <ol className="tp__segs">
            {DECK.map((plate, i) => (
              <li
                key={plate.index}
                className={i === active ? "tp__seg is-on" : "tp__seg"}
              >
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
        <div
          className="hero__cue mono"
          style={{ opacity: clamp01(1 - p * 16) }}
          aria-hidden="true"
        >
          <span>Scroll</span>
          <i />
        </div>
      </div>
    </ScrollSequence>
  );
}