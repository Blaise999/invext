"use client";

import { useState, useEffect } from "react";
import { brandOf, logoSources } from "@/lib/brands";

/**
 * Issuer mark.
 *
 * Walks the source list from lib/brands.ts and steps to the next one on error,
 * landing on a brand-coloured monogram only when every source has missed.
 *
 * Two fixes over the previous version:
 *  - The chain is longer and now leads with TICKER-keyed services rather than
 *    domain-keyed ones. Clearbit alone (what it used to be) is being wound
 *    down, so most of the board fell through to monograms.
 *  - `useEffect` resets the cursor when the symbol changes. Without it, a
 *    client-side navigation from a symbol whose logo 404'd to one whose logo
 *    exists reused the exhausted index and drew a monogram for a name that had
 *    a perfectly good mark available.
 *
 * Circular by default — that's the shape a brokerage list uses, and it makes a
 * square logo and a wordmark sit at the same visual weight in a column.
 */
export default function Logo({
  symbol,
  size = 40,
  square = false,
}: {
  symbol: string;
  size?: number;
  square?: boolean;
}) {
  const b = brandOf(symbol);
  const sources = logoSources(symbol, b, Math.max(96, size * 4));
  const [i, setI] = useState(0);

  useEffect(() => {
    setI(0);
  }, [symbol]);

  const src = sources[i];

  return (
    <span
      className={square ? "logo logo--sq" : "logo"}
      style={{
        width: size,
        height: size,
        background: b.bg,
        color: b.fg,
        fontSize: Math.round(size * 0.34),
        boxShadow: `inset 0 0 0 1px ${b.accent}22`,
      }}
      aria-hidden="true"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setI((n) => n + 1)}
          style={{
            padding: b.pad ?? 6,
            filter: b.invert ? "brightness(0) invert(1)" : "none",
          }}
        />
      ) : (
        b.mark
      )}
    </span>
  );
}
