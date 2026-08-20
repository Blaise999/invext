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
  series: number[];
  illustrative: boolean;
  held: boolean;
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
}

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type Tab = "all" | "listed" | "private" | "held";
type Sort = "name" | "gain" | "loss" | "price";

/**
 * One scrollable list rather than fifty cards.
 *
 * Search is the primary control at this size — with fifty-two names, scanning
 * is slower than typing three letters. Sorting is by movement rather than
 * alphabetical by default on the gainers/losers views, because that's the
 * question people are actually asking the list.
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

  const rows = useMemo(() => {
    const all = [
      ...listed.map((r) => ({ ...r, kind: "listed" as const })),
      ...priv.map((r) => ({ ...r, series: [] as number[], kind: "private" as const })),
    ];

    const term = q.trim().toLowerCase();
    let out = all.filter((r) => {
      if (tab === "listed" && r.kind !== "listed") return false;
      if (tab === "private" && r.kind !== "private") return false;
      if (tab === "held" && !r.held) return false;
      if (!term) return true;
      return (
        r.symbol.toLowerCase().includes(term) ||
        r.name.toLowerCase().includes(term)
      );
    });

    out = [...out].sort((a, b) => {
      if (sort === "gain") return (b.change ?? -Infinity) - (a.change ?? -Infinity);
      if (sort === "loss") return (a.change ?? Infinity) - (b.change ?? Infinity);
      if (sort === "price") return (b.price ?? -Infinity) - (a.price ?? -Infinity);
      return a.symbol.localeCompare(b.symbol);
    });

    return out;
  }, [listed, priv, tab, sort, q]);

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
            placeholder="Search 52 names"
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

      <ul className="board">
        {rows.map((r) => {
          const up = (r.change ?? 0) >= 0;
          return (
            <li key={r.symbol}>
              <Link className="brow" href={`/dashboard/stock/${r.symbol}`}>
                <Logo symbol={r.symbol} size={36} />

                <span className="brow__id">
                  <span className="brow__sym">
                    {r.symbol}
                    {r.kind === "private" && <span className="brow__tag">SPV</span>}
                    {r.held && <span className="brow__tag brow__tag--held">Held</span>}
                  </span>
                  <span className="brow__name">{r.name}</span>
                </span>

                {r.kind === "listed" && r.series.length > 1 && (
                  <span className="brow__spark" aria-hidden="true">
                    <Sparkline series={r.series} up={up} w={68} h={26} />
                  </span>
                )}

                <span className="brow__px">
                  <span className={r.illustrative ? "brow__last num is-illus" : "brow__last num"}>
                    {r.price != null ? usd(r.price) : "—"}
                  </span>
                  <span className={r.change == null ? "brow__ch num" : up ? "brow__ch num up" : "brow__ch num down"}>
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
