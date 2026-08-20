import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadViewer } from "@/lib/viewer";
import { usd, pct } from "@/lib/market";
import Logo from "@/components/dash/Logo";
import PortfolioPanel from "@/components/dash/PortfolioPanel";
import OrderTicket from "@/components/dash/OrderTicket";
import { privateCos } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public equities only on this route.
 *
 * Private vehicles used to render “no market price / not tradable” here, which
 * contradicted /dashboard/stock/[symbol] (marks, MV, P/L). One page owns
 * private marks — the stock route — so private hits redirect there.
 */
export default async function Asset({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: raw } = await params;
  const symbol = raw.toUpperCase();
  const v = await loadViewer();
  const q = v.bySymbol.get(symbol);

  const priv = privateCos.find(
    (c) =>
      c.short.toUpperCase() === symbol ||
      (c as { symbol?: string }).symbol?.toUpperCase() === symbol ||
      c.name.toUpperCase().replace(/[^A-Z]/g, "").startsWith(symbol),
  );

  // Private → stock page (marks, valuation, trade-when-marked).
  if (!q && priv) {
    const dest = (
      (priv as { symbol?: string }).symbol ??
      priv.short
    ).toUpperCase();
    redirect(`/dashboard/stock/${dest}`);
  }

  if (!q) notFound();

  const pos = v.positions.find((p) => p.symbol === symbol);
  const px = v.priceFor(symbol, pos ? pos.cost_basis / pos.quantity : 0);
  const series = v.seriesFor(
    symbol,
    pos ? pos.cost_basis / pos.quantity : (px ?? 0),
  );
  const mv = pos && px != null ? px * pos.quantity : null;
  const pl = mv != null && pos ? mv - pos.cost_basis : null;
  const up = (q.change ?? 0) >= 0;

  return (
    <>
      <div className="ahead">
        <Link href="/dashboard/market" className="mono ahead__back">
          ← Market
        </Link>
        <div className="ahead__id">
          <Logo symbol={symbol} size={52} />
          <div>
            <h1 className="ahead__t">{symbol}</h1>
            <p className="ahead__n">{q.name}</p>
          </div>
          <span className="mono ahead__tag">Public equity</span>
        </div>
      </div>

      <PortfolioPanel
        series={series}
        total={px ?? 0}
        cash={0}
        hasQuotes={px != null}
      />

      <div className="split">
        <section className="block">
          <div className="block__head">
            <h2 className="block__h">Quote</h2>
          </div>
          <dl className="dspecs">
            <div>
              <dt>Last</dt>
              <dd className="mono">{px != null ? usd(px) : "—"}</dd>
            </div>
            <div>
              <dt>Today</dt>
              <dd
                className={
                  q.change == null ? "mono" : up ? "mono up" : "mono down"
                }
              >
                {q.change != null
                  ? `${pct(q.change)} · ${usd(q.changeAbs ?? 0)}`
                  : "no data"}
              </dd>
            </div>
            <div>
              <dt>Previous close</dt>
              <dd className="mono">
                {q.prevClose != null ? usd(q.prevClose) : "—"}
              </dd>
            </div>
            <div>
              <dt>Day range</dt>
              <dd className="mono">
                {q.dayLow != null && q.dayHigh != null
                  ? `${usd(q.dayLow)} – ${usd(q.dayHigh)}`
                  : "—"}
              </dd>
            </div>
            {pos && (
              <>
                <div>
                  <dt>Your position</dt>
                  <dd className="mono">
                    {pos.quantity} sh · {mv != null ? usd(mv) : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Unrealised</dt>
                  <dd
                    className={
                      pl != null && pl >= 0 ? "mono up" : "mono down"
                    }
                  >
                    {pl != null ? `${pl >= 0 ? "+" : ""}${usd(pl)}` : "—"}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </section>

        <aside className="side">
          <div className="panel">
            <div className="panel__head">
              <h2 className="panel__h">Trade</h2>
            </div>
            <OrderTicket
              symbol={symbol}
              price={px}
              held={pos?.quantity ?? 0}
            />
          </div>
        </aside>
      </div>
    </>
  );
}