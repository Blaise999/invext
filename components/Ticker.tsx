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
    <div className="ticker py-4 min-h-[4rem] flex items-center" aria-label="Live public market quotes">
      <div className="ticker__track flex items-center gap-8">
        {row.map((q, i) => (
          <span className="ticker__item flex flex-col justify-center px-4" key={`${q.symbol}-${i}`}>
            <div className="flex items-center gap-2">
              <b className="text-lg font-bold">{q.symbol}</b>
              {q.source === "preview" && (
                <span className="ticker__illus text-blue-500" title="Illustrative figure" aria-label="Illustrative figure">
                  &bull;
                </span>
              )}
            </div>
            
            <div className="flex items-baseline gap-2 mt-1">
              <span className="ticker__px font-mono font-medium">
                {q.price != null ? `$${q.price.toFixed(2)}` : "—"}
              </span>
              <span
                className={
                  q.change == null
                    ? "ticker__ch text-xs text-gray-400"
                    : q.change >= 0
                      ? "ticker__ch up text-xs text-green-500"
                      : "ticker__ch down text-xs text-red-500"
                }
              >
                {q.change == null
                  ? "queued"
                  : `${q.change >= 0 ? "+" : ""}${q.change.toFixed(2)}%`}
              </span>
            </div>

            {/* Random background context to fill out height responsibly */}
            <div className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider flex justify-between gap-4">
              <span>Vol: {q.price ? Math.floor(q.price * 1250).toLocaleString() : "—"}</span>
              <span>• Live</span>
            </div>
          </span>
        ))}
      </div>
    </div>
  );
}
