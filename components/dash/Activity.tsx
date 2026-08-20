"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { brandOf } from "@/lib/brands";
import Logo from "./Logo";

/**
 * WHY THIS PAGE WAS BLANK
 *
 * The old `KIND` map had four entries — deposit, withdrawal, buy, sell — and
 * the ledger writes five. A `correction` row (which is how the desk adjusts a
 * balance, so most real accounts have one) hit `KIND[t.kind]` → undefined →
 * `k.label` → TypeError, and because this renders inside the page body the
 * whole route fell over rather than dropping one line. Same story for a
 * `rejected` status, which had no badge style.
 *
 * Now: every kind is mapped, and anything unrecognised falls back to a generic
 * badge instead of throwing. A page whose entire job is "show me everything
 * that happened" must not be able to crash on an unfamiliar row.
 */

export interface Tx {
  id: string;
  kind: string;
  symbol: string | null;
  amount: number;
  status: string;
  quantity?: number | null;
  price?: number | null;
  realised?: number | null;
  network?: string | null;
  reference?: string | null;
  destination?: string | null;
  note?: string | null;
  created_at: number;
}

type Meta = { label: string; glyph: string; tone: string; sign: "+" | "−" | "" };

const KIND: Record<string, Meta> = {
  deposit:    { label: "Deposit",    glyph: "↓", tone: "in",   sign: "+" },
  withdrawal: { label: "Withdrawal", glyph: "↑", tone: "out",  sign: "−" },
  buy:        { label: "Buy",        glyph: "+", tone: "buy",  sign: "−" },
  sell:       { label: "Sell",       glyph: "−", tone: "sell", sign: "+" },
  correction: { label: "Adjustment", glyph: "±", tone: "adj",  sign: "" },
};

/** Never returns undefined. That was the bug. */
const metaFor = (kind: string): Meta =>
  KIND[kind] ?? {
    label: kind ? kind[0].toUpperCase() + kind.slice(1) : "Entry",
    glyph: "•",
    tone: "adj",
    sign: "",
  };

const usd = (n: number) =>
  Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const monthKey = (t: number) =>
  new Date(t).toLocaleDateString("en-US", { month: "long", year: "numeric" });

const FILTERS = [
  { id: "all", label: "All" },
  { id: "trades", label: "Trades" },
  { id: "money", label: "Transfers" },
  { id: "pending", label: "Pending" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

export default function Activity({ rows }: { rows: Tx[] }) {
  const [filter, setFilter] = useState<FilterId>("all");

  const shown = useMemo(() => {
    const safe = (rows ?? []).filter((r) => r && Number.isFinite(r.created_at));
    const sorted = [...safe].sort((a, b) => b.created_at - a.created_at);
    if (filter === "trades") return sorted.filter((r) => r.kind === "buy" || r.kind === "sell");
    if (filter === "money")
      return sorted.filter((r) => r.kind === "deposit" || r.kind === "withdrawal");
    if (filter === "pending") return sorted.filter((r) => r.status === "pending");
    return sorted;
  }, [rows, filter]);

  const groups = useMemo(() => {
    const out: { key: string; items: Tx[] }[] = [];
    for (const r of shown) {
      const k = monthKey(r.created_at);
      const last = out[out.length - 1];
      if (last && last.key === k) last.items.push(r);
      else out.push({ key: k, items: [r] });
    }
    return out;
  }, [shown]);

  if (!rows || rows.length === 0) {
    return (
      <div className="blank">
        <p className="blank__lead">No activity yet.</p>
        <p className="blank__body">
          Deposits, withdrawals, trades and desk adjustments all appear here,
          each with its status and the timestamp it was written.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="segs segs--quiet act__filters" role="tablist" aria-label="Filter activity">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            className={filter === f.id ? "segs__b is-on" : "segs__b"}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="blank">
          <p className="blank__lead">Nothing under this filter.</p>
          <p className="blank__body">
            There are {rows.length} records in total — switch back to All.
          </p>
        </div>
      ) : (
        <div className="act">
          {groups.map((g) => (
            <section className="act__group" key={g.key}>
              <header className="act__month mono">
                <span>{g.key}</span>
                <span className="act__count">{g.items.length}</span>
              </header>

              <ol className="act__list">
                {g.items.map((t) => {
                  const k = metaFor(t.kind);
                  const b = t.symbol ? brandOf(t.symbol) : null;

                  const detail =
                    t.kind === "buy" || t.kind === "sell"
                      ? t.quantity != null && t.price != null
                        ? `${Number(t.quantity).toFixed(4)} sh @ ${usd(Number(t.price))}`
                        : null
                      : t.network
                        ? t.network.toUpperCase()
                        : (t.note ?? null);

                  const body = (
                    <>
                      <span className={`act__dot act__dot--${k.tone}`} aria-hidden="true">
                        {t.symbol ? <Logo symbol={t.symbol} size={36} /> : <em>{k.glyph}</em>}
                      </span>

                      <span className="act__body">
                        <span className="act__title">
                          {k.label}
                          {t.symbol && (
                            <span className="act__sym" style={{ color: b?.accent }}>
                              {t.symbol}
                            </span>
                          )}
                        </span>
                        <span className="mono act__when">
                          {new Date(t.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                          {" · "}
                          {new Date(t.created_at).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                          {detail && ` · ${detail}`}
                        </span>
                      </span>

                      <span className="act__right">
                        <span className={`mono act__amt act__amt--${k.tone}`}>
                          {k.sign ||
                            (t.amount < 0 ? "−" : "+")}
                          {usd(t.amount)}
                        </span>
                        <span className={`mono act__status act__status--${t.status}`}>
                          {t.status}
                        </span>
                        {t.realised != null && (
                          <span
                            className={
                              t.realised >= 0 ? "mono act__real up" : "mono act__real down"
                            }
                          >
                            {t.realised >= 0 ? "+" : "−"}
                            {usd(t.realised)} realised
                          </span>
                        )}
                      </span>
                    </>
                  );

                  // A trade row links to the instrument. A transfer has
                  // nowhere useful to go, so it stays inert rather than
                  // pretending to be tappable.
                  return (
                    <li className="act__row" key={t.id}>
                      {t.symbol ? (
                        <Link className="act__link" href={`/dashboard/stock/${t.symbol}`}>
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
