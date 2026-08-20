"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Logo from "./Logo";
import Sparkline from "./Sparkline";

/**
 * The market list.
 *
 * Every row is a Link to that ticker's own page, prefetched. That is the point
 * of the screen — a market list you can only look at is a table, not a market.
 *
 * Search and sort are client-side because seven rows do not warrant a server
 * round-trip. If this ever holds hundreds, move both to the server and
 * paginate; the row markup won't need to change.
 */

export interface Row {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  prevClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  series: number[];
  held: boolean;
  watching: boolean;
  /** Listed assets carry a quote; private ones carry a dated mark. */
  kind?: "listed" | "private";
  markedAt?: number | null;
  basis?: string | null;
}

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type Sort = "symbol" | "move" | "price";

export default function MarketList({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("symbol");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter(
          (r) =>
            r.symbol.toLowerCase().includes(needle) ||
            r.name.toLowerCase().includes(needle),
        )
      : rows;

    return [...filtered].sort((a, b) => {
      if (sort === "symbol") return a.symbol.localeCompare(b.symbol);
      if (sort === "price") return (b.price ?? -1) - (a.price ?? -1);
      return (b.change ?? -Infinity) - (a.change ?? -Infinity);
    });
  }, [rows, q, sort]);

  return (
    <>
      <div className="mbar">
        <input
          className="input mbar__q"
          placeholder="Search ticker or company"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search the market"
          autoComplete="off"
        />
        <div className="mbar__sort" role="group" aria-label="Sort">
          {(["symbol", "move", "price"] as const).map((s) => (
            <button
              key={s}
              className={sort === s ? "mbar__s is-on" : "mbar__s"}
              onClick={() => setSort(s)}
              aria-pressed={sort === s}
            >
              {s === "symbol" ? "A–Z" : s === "move" ? "Movers" : "Price"}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="blank">
          <p className="blank__lead">Nothing matches &ldquo;{q}&rdquo;.</p>
          <p className="blank__body">
Nothing in this list matches. Listed securities and private vehicles are
            searched separately.
          </p>
        </div>
      ) : (
        <div className="mkt">
          {shown.map((r) => {
            const up = (r.change ?? 0) >= 0;
            return (
              <Link
                className="mcard mcard--link"
                key={r.symbol}
                href={`/dashboard/stock/${r.symbol.toLowerCase()}`}
                prefetch
              >
                <header className="mcard__top">
                  <Logo symbol={r.symbol} size={40} />
                  <div className="mcard__id">
                    <span className="mcard__t">{r.symbol}</span>
                    <span className="mcard__n">{r.name}</span>
                  </div>
                  <span className="mcard__tags">
                    {r.kind === "private" && (
                      <span className="mono chip chip--priv">Mark</span>
                    )}
                    {r.held && <span className="mono mcard__held">Held</span>}
                    {r.watching && <span className="mcard__star" aria-label="On your watchlist">★</span>}
                  </span>
                </header>

                <div className="mcard__px">
                  <span className="mono mcard__last">
                    {r.price != null ? usd(r.price) : "—"}
                  </span>
                  <span className={r.change == null ? "mono" : up ? "mono up" : "mono down"}>
                    {r.change != null
                      ? `${r.change >= 0 ? "+" : ""}${r.change.toFixed(2)}%`
                      : r.kind === "private"
                        ? r.price != null ? "first mark" : "unmarked"
                        : "no data"}
                  </span>
                </div>

                <Sparkline series={r.series.slice(-60)} up={up} w={240} h={54} />

                <dl className="mcard__meta">
                  {r.kind === "private" ? (
                    <>
                      <div>
                        <dt>Marked</dt>
                        <dd>
                          {r.markedAt
                            ? new Date(r.markedAt).toLocaleDateString("en-US", {
                                month: "short", day: "numeric", year: "numeric",
                              })
                            : "never"}
                        </dd>
                      </div>
                      <div>
                        <dt>Basis</dt>
                        <dd>{r.basis ?? "—"}</dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt>Prev close</dt>
                        <dd>{r.prevClose != null ? usd(r.prevClose) : "—"}</dd>
                      </div>
                      <div>
                        <dt>Day range</dt>
                        <dd>
                          {r.dayLow != null && r.dayHigh != null
                            ? `${r.dayLow.toFixed(2)}–${r.dayHigh.toFixed(2)}`
                            : "—"}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>

                <span className="mcard__go mono" aria-hidden="true">
                  Trade {r.symbol} →
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
