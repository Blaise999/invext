"use client";

import type { Quote } from "@/lib/data";

/**
 * A price that hasn't resolved shows an em dash and the word "queued", not
 * "no data" — the figure is on its way, and an interface that announces its
 * own failures in a customer-facing strip reads as broken rather than careful.
 * Illustrative figures carry a dot so they're never mistaken for live ones.
 */
export default function Ticker({ quotes }: { quotes: Quote[] }) {
  const row = [...quotes, ...quotes];
  return (
    <div className="ticker" aria-label="Live public market quotes">
      <div className="ticker__track">
        {row.map((q, i) => (
          <span className="ticker__item" key={`${q.symbol}-${i}`}>
            <b>{q.symbol}</b>
            {q.source === "preview" && (
              <span className="ticker__illus" title="Illustrative figure" aria-label="Illustrative figure">
                &bull;
              </span>
            )}
            <span className="ticker__px">
              {q.price != null ? `$${q.price.toFixed(2)}` : "—"}
            </span>
            <span
              className={
                q.change == null
                  ? "ticker__ch"
                  : q.change >= 0
                    ? "ticker__ch up"
                    : "ticker__ch down"
              }
            >
              {q.change == null
                ? "queued"
                : `${q.change >= 0 ? "+" : ""}${q.change.toFixed(2)}%`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
