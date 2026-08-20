import Link from "next/link";
import { loadViewer } from "@/lib/viewer";
import { usd, pct } from "@/lib/market";
import PortfolioPanel from "@/components/dash/PortfolioPanel";
import Allocation from "@/components/dash/Allocation";
import Sparkline from "@/components/dash/Sparkline";
import Logo from "@/components/dash/Logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Overview() {
  const v = await loadViewer();

  return (
    <>
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
                recalculated against the live quote on every load.
              </p>
            </div>
          ) : (
            <ul className="hold">
              {v.positions.map((p) => {
                const q = v.bySymbol.get(p.symbol);
                const px = v.priceFor(p.symbol, p.cost_basis / p.quantity);
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
                      series={v.seriesFor(p.symbol, p.cost_basis / p.quantity).slice(-30)}
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
        </aside>
      </div>
    </>
  );
}
