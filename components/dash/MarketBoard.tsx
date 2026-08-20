"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Logo from "./Logo";
import Sparkline from "./Sparkline";

export interface ListedRow {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changeAbs: number | null;
  series: number[];
  illustrative: boolean;
  held: boolean;
  heldQty: number;
}

export interface PrivateRow {
  symbol: string;
  name: string;
  what: string;
  price: number | null;
  change: number | null;
  markedAt: number | null;
  basis: string | null;
  illustrative: boolean;
  held: boolean;
  heldQty: number;
  /** Consensus window for a public listing. Never a promise. */
  listing?: string | null;
}

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type Tab = "all" | "listed" | "private" | "held";
type Sort = "name" | "gain" | "loss" | "price";

/**
 * The market board, leaning on what Robinhood actually gets right:
 *
 *  - MOVERS FIRST. A horizontally-scrolled strip of the day's biggest moves at
 *    the top, each a real card with a mark and a sparkline. It answers the
 *    question people open this screen with before they've typed anything.
 *  - THEN ONE DENSE LIST. Not fifty chest-high cards — at fifty-two names that
 *    is a minute of scrolling on a phone. Logo, ticker, name, price, tinted
 *    change pill, and a sparkline where the width allows.
 *  - SEARCH IS THE PRIMARY CONTROL at this size. Typing three letters beats
 *    scanning, so it sits above everything and stays put.
 *
 * What is NOT copied: confetti, streaks, "most popular" ranking. Those push
 * volume rather than help someone find an instrument.
 */
export default function MarketBoard({
  listed,
  priv,
}: {
  listed: ListedRow[];
  priv: PrivateRow[];
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [q, setQ] = useState("");

  const all = useMemo(
    () => [
      ...listed.map((r) => ({ ...r, kind: "listed" as const, what: "" })),
      ...priv.map((r) => ({
        ...r,
        series: [] as number[],
        changeAbs: null as number | null,
        kind: "private" as const,
      })),
    ],
    [listed, priv],
  );

  /** Biggest absolute movers among names that actually quoted. */
  const movers = useMemo(
    () =>
      listed
        .filter((r) => r.change != null && r.price != null)
        .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))
        .slice(0, 10),
    [listed],
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out = all.filter((r) => {
      if (tab === "listed" && r.kind !== "listed") return false;
      if (tab === "private" && r.kind !== "private") return false;
      if (tab === "held" && !r.held) return false;
      if (!term) return true;
      return (
        r.symbol.toLowerCase().includes(term) ||
        r.name.toLowerCase().includes(term)
      );
    });

    return [...out].sort((a, b) => {
      if (sort === "gain") return (b.change ?? -Infinity) - (a.change ?? -Infinity);
      if (sort === "loss") return (a.change ?? Infinity) - (b.change ?? Infinity);
      if (sort === "price") return (b.price ?? -Infinity) - (a.price ?? -Infinity);
      return a.symbol.localeCompare(b.symbol);
    });
  }, [all, tab, sort, q]);

  const showMovers = !q.trim() && tab !== "private" && movers.length > 2;

  return (
    <>
      <div className="board__ctl">
        <div className="search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
            <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            className="search__i"
            placeholder={`Search ${all.length} names`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search the market"
          />
          {q && (
            <button className="search__x" onClick={() => setQ("")} aria-label="Clear search">
              ✕
            </button>
          )}
        </div>

        <div className="segs" role="tablist" aria-label="Filter">
          {([
            ["all", "All"],
            ["listed", "Listed"],
            ["private", "Private"],
            ["held", "Held"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "segs__b is-on" : "segs__b"}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="segs segs--quiet">
          {([
            ["name", "A–Z"],
            ["gain", "Gainers"],
            ["loss", "Losers"],
            ["price", "Price"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              className={sort === id ? "segs__b is-on" : "segs__b"}
              onClick={() => setSort(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {showMovers && (
        <section className="movers">
          <header className="movers__head">
            <h2 className="movers__h">Today&rsquo;s movers</h2>
            <span className="mono movers__meta">by absolute move</span>
          </header>
          <div className="movers__rail">
            {movers.map((m) => {
              const up = (m.change ?? 0) >= 0;
              return (
                <Link className="mcd" key={m.symbol} href={`/dashboard/stock/${m.symbol}`}>
                  <div className="mcd__top">
                    <Logo symbol={m.symbol} size={30} />
                    <span className="mcd__sym">{m.symbol}</span>
                    {m.held && <span className="mcd__held">Held</span>}
                  </div>
                  <Sparkline series={m.series.slice(-40)} up={up} w={150} h={40} />
                  <div className="mcd__foot">
                    <span className="mcd__px num">
                      {m.price != null ? usd(m.price) : "—"}
                    </span>
                    <span className={up ? "mcd__ch num up" : "mcd__ch num down"}>
                      {up ? "+" : ""}
                      {m.change!.toFixed(2)}%
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <ul className="board">
        {rows.map((r) => {
          const up = (r.change ?? 0) >= 0;
          return (
            <li key={r.symbol}>
              <Link className="brow" href={`/dashboard/stock/${r.symbol}`}>
                <Logo symbol={r.symbol} size={38} />

                <span className="brow__id">
                  <span className="brow__sym">
                    {r.symbol}
                    {r.kind === "private" && <span className="brow__tag">SPV</span>}
                    {r.held && (
                      <span className="brow__tag brow__tag--held">
                        {r.heldQty > 0 ? `${trim(r.heldQty)} sh` : "Held"}
                      </span>
                    )}
                  </span>
                  <span className="brow__name">{r.name}</span>
                </span>

                {r.kind === "listed" && r.series.length > 1 && (
                  <span className="brow__spark" aria-hidden="true">
                    <Sparkline series={r.series} up={up} w={74} h={28} />
                  </span>
                )}

                <span className="brow__px">
                  <span className={r.illustrative ? "brow__last num is-illus" : "brow__last num"}>
                    {r.price != null ? usd(r.price) : "—"}
                  </span>
                  <span
                    className={
                      r.change == null
                        ? "brow__ch num"
                        : up
                          ? "brow__ch num up"
                          : "brow__ch num down"
                    }
                  >
                    {r.change != null
                      ? `${up ? "+" : ""}${r.change.toFixed(2)}%`
                      : r.kind === "private"
                        ? "No mark yet"
                        : "Quote arriving"}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}

        {rows.length === 0 && (
          <li className="board__none">
            Nothing matches &ldquo;{q}&rdquo;. Try a ticker like AAPL, or a
            company name.
          </li>
        )}
      </ul>
    </>
  );
}

/** 4 → "4", 4.5 → "4.5", 4.123456 → "4.1235". Share counts are fractional here. */
function trim(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}
