import { brandOf } from "@/lib/brands";
import { usd } from "@/lib/market";
import Logo from "./Logo";

interface Tx {
  id: string;
  kind: "deposit" | "withdrawal" | "buy" | "sell";
  symbol: string | null;
  amount: number;
  status: "pending" | "settled" | "failed";
  created_at: number;
}

const KIND: Record<Tx["kind"], { label: string; glyph: string; tone: string }> = {
  deposit:    { label: "Deposit",    glyph: "↓", tone: "in" },
  withdrawal: { label: "Withdrawal", glyph: "↑", tone: "out" },
  buy:        { label: "Buy",        glyph: "+", tone: "buy" },
  sell:       { label: "Sell",       glyph: "−", tone: "sell" },
};

const monthKey = (t: number) =>
  new Date(t).toLocaleDateString("en-US", { month: "long", year: "numeric" });

/**
 * Grouped by month with a connector rail, typed badges and a logo per trade.
 * A flat table of dates and figures is technically complete and visually dead —
 * grouping gives the eye somewhere to rest and makes scanning by period work.
 */
export default function Activity({ rows }: { rows: Tx[] }) {
  if (rows.length === 0) {
    return (
      <div className="blank">
        <p className="blank__lead">No activity yet.</p>
        <p className="blank__body">
          Deposits, withdrawals and trades appear here with status and timestamp.
        </p>
      </div>
    );
  }

  const groups: { key: string; items: Tx[] }[] = [];
  for (const r of rows) {
    const k = monthKey(r.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.items.push(r);
    else groups.push({ key: k, items: [r] });
  }

  return (
    <div className="act">
      {groups.map((g) => (
        <section className="act__group" key={g.key}>
          <header className="act__month mono">
            <span>{g.key}</span>
            <span className="act__count">{g.items.length}</span>
          </header>

          <ol className="act__list">
            {g.items.map((t) => {
              const k = KIND[t.kind];
              const b = t.symbol ? brandOf(t.symbol) : null;
              return (
                <li className="act__row" key={t.id}>
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
                        month: "short", day: "numeric",
                      })}
                      {" · "}
                      {new Date(t.created_at).toLocaleTimeString("en-US", {
                        hour: "numeric", minute: "2-digit",
                      })}
                    </span>
                  </span>

                  <span className="act__right">
                    <span className={`mono act__amt act__amt--${k.tone}`}>
                      {t.kind === "deposit" || t.kind === "sell" ? "+" : "−"}
                      {usd(t.amount)}
                    </span>
                    <span className={`mono act__status act__status--${t.status}`}>
                      {t.status}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
