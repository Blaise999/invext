import Link from "next/link";
import { loadViewer } from "@/lib/viewer";
import { usd, pct } from "@/lib/market";
import PortfolioPanel from "@/components/dash/PortfolioPanel";
import Allocation from "@/components/dash/Allocation";
import Sparkline from "@/components/dash/Sparkline";
import Greeting from "@/components/dash/Greeting";
import Logo from "@/components/dash/Logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Home.
 *
 * Order of the page, and why:
 *
 *  1. GREETING + DATE. Moved down here out of the sticky header, where it was
 *     jammed against the wordmark and followed you onto every other screen.
 *     It belongs on the landing screen and nowhere else.
 *  2. THE CHART. The value, the day's move, the ranges. It now renders on a
 *     cash-only account too — flat through the middle of the plot rather than
 *     welded to the bottom edge, which is what the old maths produced and what
 *     made the panel look empty and broken.
 *  3. HOLDINGS, then the two summary panels.
 */
export default async function Overview() {
  const v = await loadViewer();

  const dayUp = v.dayChangeAbs >= 0;
  const dayPct =
    v.total - v.dayChangeAbs > 0
      ? (v.dayChangeAbs / (v.total - v.dayChangeAbs)) * 100
      : 0;

  return (
    <>
      <div className="welcome">
        <div className="welcome__l">
          <Greeting name={v.user.first_name} serverHour={new Date().getHours()} />
          <p className="mono welcome__date">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="welcome__r">
          <span className="mono welcome__k">Today</span>
          <span className={dayUp ? "welcome__v num up" : "welcome__v num down"}>
            {dayUp ? "+" : "−"}
            {usd(Math.abs(v.dayChangeAbs))}
            <span className="welcome__pct"> {pct(dayPct)}</span>
          </span>
        </div>
      </div>

      <PortfolioPanel
        series={v.portfolioSeries}
        total={v.total}
        cash={v.cash}
        hasQuotes={!v.quotesDown}
      />

      <div className="split">
        <section className="block">
          <div className="block__head">
            <h2 className="block__h">Holdings</h2>
            <Link className="mono block__more" href="/dashboard/market">
              Market →
            </Link>
          </div>

          {v.positions.length === 0 ? (
            <div className="blank">
              <p className="blank__lead">Nothing held yet.</p>
              <p className="blank__body">
                Positions show cost basis, market value and unrealised P/L,
                recalculated against the live quote on every load.{" "}
                <Link href="/dashboard/market">Browse the market</Link> to place
                your first order.
              </p>
            </div>
          ) : (
            <ul className="hold">
              {v.positions.map((p) => {
                const q = v.bySymbol.get(p.symbol);
                const cps = p.quantity > 0 ? p.cost_basis / p.quantity : 0;
                const px = v.priceFor(p.symbol, cps);
                const mv = px != null ? px * p.quantity : null;
                const pl = mv != null ? mv - p.cost_basis : null;
                const up = (q?.change ?? 0) >= 0;
                const weight =
                  v.holdingsValue > 0 && mv != null
                    ? (mv / v.holdingsValue) * 100
                    : null;
                return (
                  <li key={p.id}>
                    <Link className="hold__r" href={`/dashboard/stock/${p.symbol}`}>
                      <Logo symbol={p.symbol} size={44} />
                      <div className="hold__id">
                        <span className="hold__t">{p.symbol}</span>
                        <span className="hold__n">
                          {p.quantity} sh{weight != null && ` · ${weight.toFixed(0)}%`}
                        </span>
                      </div>
                      <Sparkline
                        series={v.seriesFor(p.symbol, cps).slice(-40)}
                        up={up}
                      />
                      <div className="hold__v">
                        <span className="mono hold__mv">
                          {mv != null ? usd(mv) : "—"}
                        </span>
                        <span
                          className={`mono hold__pl ${pl == null ? "" : pl >= 0 ? "up" : "down"}`}
                        >
                          {pl != null ? `${pl >= 0 ? "+" : ""}${usd(pl)}` : "—"}
                          {q?.change != null && (
                            <span className="hold__pc"> {pct(q.change)}</span>
                          )}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="side">
          {v.allocation.length > 0 && v.holdingsValue > 0 && (
            <div className="panel">
              <div className="panel__head">
                <h2 className="panel__h">Allocation</h2>
                <span className="mono panel__meta">{v.positions.length}</span>
              </div>
              <Allocation rows={v.allocation} total={v.holdingsValue} />
            </div>
          )}

          <div className="panel">
            <div className="panel__head">
              <h2 className="panel__h">Position</h2>
            </div>
            <dl className="mini">
              <div><dt>Cash</dt><dd className="mono">{usd(v.cash)}</dd></div>
              <div><dt>Holdings</dt><dd className="mono">{usd(v.holdingsValue)}</dd></div>
              <div><dt>Cost basis</dt><dd className="mono">{usd(v.costTotal)}</dd></div>
              <div>
                <dt>Open P/L</dt>
                <dd className={v.openPL >= 0 ? "mono up" : "mono down"}>
                  {v.openPL >= 0 ? "+" : ""}{usd(v.openPL)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="panel">
            <div className="panel__head">
              <h2 className="panel__h">Shortcuts</h2>
            </div>
            <div className="quicklinks">
              <Link href="/dashboard/market">Browse market</Link>
              <Link href="/dashboard/watchlist">Private book</Link>
              <Link href="/dashboard/transfer">Deposit funds</Link>
              <Link href="/dashboard/activity">Activity</Link>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
