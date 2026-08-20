"use client";

import { useState } from "react";
import StockChart from "./StockChart";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Headline price + chart, joined so the number tracks the finger.
 *
 * When nothing is being scrubbed it shows the live quote and today's move.
 * While scrubbing it shows the value at that point and the move from the
 * start of the selected range — the label changes with it, so it's never
 * ambiguous which question the percentage is answering.
 */
export default function StockView({
  symbol,
  price,
  changeAbs,
  changePct,
  series,
  kind = "listed",
  markedAt = null,
  basis = null,
}: {
  symbol: string;
  price: number | null;
  changeAbs: number | null;
  changePct: number | null;
  series: number[];
  kind?: "listed" | "private";
  markedAt?: number | null;
  basis?: string | null;
}) {
  const [scrub, setScrub] =
    useState<{ price: number; changeAbs: number; changePct: number } | null>(null);

  const shown = scrub?.price ?? price;
  const abs = scrub ? scrub.changeAbs : changeAbs;
  const pc = scrub ? scrub.changePct : changePct;
  const up = (pc ?? 0) >= 0;

  return (
    <section className="quote">
      <div className="quote__head">
        <span className="mono quote__k">
          {scrub
            ? "At cursor"
            : kind === "private"
              ? "Prevailing mark"
              : "Last traded"}
        </span>
        <span className="quote__px">{shown != null ? usd(shown) : "—"}</span>
        {abs != null && pc != null ? (
          <span className={up ? "quote__d up" : "quote__d down"}>
            {up ? "▲" : "▼"} {usd(Math.abs(abs))} ({pc >= 0 ? "+" : ""}
            {pc.toFixed(2)}%)
            <span className="quote__span">
              {" "}
              {scrub
                ? "over range"
                : kind === "private"
                  ? "since previous mark"
                  : "today"}
            </span>
          </span>
        ) : (
          <span className="mono quote__none">No quote available</span>
        )}
      </div>

      {kind === "private" && markedAt != null && (
        <p className="mono quote__mark">
          As of {new Date(markedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          {basis ? ` · ${basis}` : ""} · not a traded price
        </p>
      )}

      {series.length > 1 ? (
        <StockChart series={series} onScrub={setScrub} stepped={kind === "private"} />
      ) : (
        <div className="blank">
          <p className="blank__lead">
            {kind === "private"
              ? `No marks recorded for ${symbol}.`
              : `No price history for ${symbol}.`}
          </p>
          <p className="blank__body">
            {kind === "private"
              ? "A private vehicle has no value to show until a valuation mark has been recorded against it, with a date and a source."
              : "The provider answered without a series. The quote above, if present, came from an end-of-day source that doesn't carry one."}
          </p>
        </div>
      )}
    </section>
  );
}
