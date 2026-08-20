"use client";

import { useState } from "react";
import { brandOf, logoSources } from "@/lib/brands";

/**
 * Issuer mark.
 *
 * Walks the source list from lib/brands.ts and steps to the next one on error,
 * landing on a brand-coloured monogram if they all miss. The previous version
 * knew about one source and gave up after it, which is why the board looked
 * like fifty grey squares once there were more than seven names on it.
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
  const sources = logoSources(b, size * 4);
  const [i, setI] = useState(0);

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
          src={src}
          alt=""
          loading="lazy"
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
