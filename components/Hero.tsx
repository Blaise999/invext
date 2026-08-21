"use client";

import { useState } from "react";
import ScrollSequence, { type SeqConfig } from "./ScrollSequence";
import Brand from "./Brand";
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
import type { SeqVariant } from "@/lib/hero-sequences";

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
  // ← keep your exact DECK array here
];

interface HeroProps {
  desktop: SeqVariant | null;
  mobile: SeqVariant | null;
}

export default function Hero({ desktop, mobile }: HeroProps) {
  const [p, setProgress] = useState(0);
  const [frame, setFrame] = useState({ i: 0, n: 0 });

  // Convert to the exact shape ScrollSequence expects
  // null → undefined (important for the optional prop)
  const toConfig = (v: SeqVariant | null): SeqConfig | undefined =>
    v
      ? {
          dir: v.dir,
          stem: v.stem,
          ext: v.ext,
          pad: v.pad,
          first: v.first,
          frameCount: v.frameCount,
        }
      : undefined;

  const SEQ_DESKTOP = toConfig(desktop);
  const SEQ_MOBILE = toConfig(mobile);

  // Safety: if even desktop is missing we show a fallback
  if (!SEQ_DESKTOP) {
    return (
      <div className="hero hero--empty">
        <p className="mono">SEQUENCE MISSING</p>
      </div>
    );
  }

  const active = plateOf(p);
  const heat = heatAt(p);

  return (
    <ScrollSequence
      desktop={SEQ_DESKTOP}          // guaranteed non-null
      mobile={SEQ_MOBILE}            // undefined is fine, null is not
      scrollLength={2.5}
      mobileScrollLength={1.55}
      damping={0.14}
      onProgress={setProgress}
      onFrame={(i, n) => setFrame({ i, n })}
    >
      <div className="hero" style={{ "--heat": heat } as React.CSSProperties}>
        {/* ===== keep your entire existing JSX exactly as it was ===== */}
        <header className="hero__nav">
          {/* ... */}
        </header>

        {/* ... all the plates, timeline, cue etc. ... */}
      </div>
    </ScrollSequence>
  );
}

if (process.env.NODE_ENV !== "production" && DECK.length !== PLATES) {
  console.warn(
    `hero: DECK has ${DECK.length} plates, motion model expects ${PLATES} (SEG=${SEG})`,
  );
}