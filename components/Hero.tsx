"use client";

import { useCallback, useState } from "react";
import ScrollSequence from "./ScrollSequence";
import Brand from "./Brand";

/* ------------------------------------------------------------------ frames --

   /public/seq/frame_001.webp    …   landscape
   /public/seq-m/frame_001.webp  …   portrait

   Two things differ from the old iris_0000 sequence:

   - pad is 3, not 4. printf "%03d" pads to a MINIMUM of three, so frame 1000
     comes out four digits rather than truncating. padStart(3) does exactly the
     same: "001" and "1000" both correct.
   - numbering starts at 1, not 0, so index i maps to file i + 1.

   frameCount can be larger than what is on disk. Missing frames are skipped,
   so you can render more later without touching this. width/height are a hint
   only — the real dimensions are read off the first frame at load.
--------------------------------------------------------------------------- */

const pad = (i: number) => String(i).padStart(3, "0");

const DESKTOP = {
  src: (i: number) => `/seq/frame_${pad(i + 1)}.webp`,
  frameCount: 1000,
  width: 1920,
  height: 1080,
};

// Portrait render — a landscape frame letterboxes badly on a phone.
const MOBILE = {
  src: (i: number) => `/seq-m/frame_${pad(i + 1)}.webp`,
  frameCount: 1000,
  width: 1080,
  height: 1920,
};

const win = (p: number, a: number, b: number) =>
  Math.min(1, Math.max(0, (p - a) / (b - a)));

export default function Hero() {
  const [p, setP] = useState(0);
  const onProgress = useCallback((v: number) => setP(v), []);

  const one = 1 - win(p, 0.16, 0.32);
  const two = win(p, 0.44, 0.58) * (1 - win(p, 0.72, 0.84));
  const three = win(p, 0.82, 0.94);

  return (
    <ScrollSequence
      desktop={DESKTOP}
      mobile={MOBILE}
      scrollLength={3.4}
      mobileScrollLength={2.0}
      damping={0.15}
      onProgress={onProgress}
    >
      <div className="hero">
        <header className="hero__nav">
<Brand size={30} />
          <nav>
            {["Market", "Private", "Media", "Questions"].map((l) => (
              <a key={l} href={`#${l.toLowerCase()}`}>
                {l}
              </a>
            ))}
          </nav>
        </header>

        <span className="hero__ver mono">[ independent · not affiliated ]</span>

        <div className="hero__stage">
          <div
            className="hero__panel"
            style={{ opacity: one, transform: `translateY(${(1 - one) * -30}px)` }}
          >
            <p className="mono hero__eyebrow">Frontier technology exposure</p>
            <h1>
              Invest in the
              <br />
              future of <em>humanity</em>
            </h1>
            <p className="hero__lede">
              Seven listed securities, quoted live. Two private companies,
              covered properly. One page that tells you which is which.
            </p>
          </div>

          <div
            className="hero__panel"
            style={{ opacity: two, transform: `translateY(${(1 - two) * 30}px)` }}
          >
            <p className="mono hero__eyebrow">The distinction that matters</p>
            <h2>
              Seven of these
              <br />
              <em>trade.</em> Two don&rsquo;t.
            </h2>
            <p className="hero__lede">
              SpaceX listed on Nasdaq in June 2026 as SPCX. Grok, X and Starlink
              are divisions inside it, not separate tickers. Neuralink and The
              Boring Company are private.
            </p>
          </div>

          <div
            className="hero__panel"
            style={{ opacity: three, transform: `translateY(${(1 - three) * 30}px)` }}
          >
            <p className="mono hero__eyebrow">Start here</p>
            <h2>
              Know what
              <br />
              you <em>own</em>.
            </h2>
            <div className="hero__actions">
              <a className="btn btn--solid" href="#market">
                Open live market
              </a>
              <a className="btn" href="#private">
                The two private names
              </a>
            </div>
          </div>
        </div>

      </div>
    </ScrollSequence>
  );
}
