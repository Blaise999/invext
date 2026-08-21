import Link from "next/link";
import { notFound } from "next/navigation";
import { loadViewer } from "@/lib/viewer";
import { usd, pct } from "@/lib/market";
import { privateListingFor } from "@/lib/private";
import { privateCos } from "@/lib/data";
import { outlookFor, OUTLOOK_DISCLAIMER } from "@/lib/listing";
import { marksFor, type Mark } from "@/lib/ledger";
import { orPrivateMarks } from "@/lib/preview";
import Logo from "@/components/dash/Logo";
import PortfolioPanel from "@/components/dash/PortfolioPanel";
import TradeTicket from "@/components/dash/TradeTicket";
import MarkHistory from "@/components/dash/MarkHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A private holding is worth whatever the last recorded mark says, and nothing
 * at all if no mark has been recorded. There is no fallback price here on
 * purpose: a number with no dated, sourced mark behind it is a guess, and a
 * guess rendered in the "Last" slot next to a Buy button is indistinguishable
 * from a real quote to the person reading it.
 */
function steppedSeries(marks: Mark[] | { price: number; effective_at: number }[], points = 60) {
  if (marks.length === 0) return [];
  if (marks.length === 1) return Array(points).fill(marks[0].price);

  const first = marks[0].effective_at;
  const last = marks[marks.length - 1].effective_at;
  const span = Math.max(last - first, 1);

  return Array.from({ length: points }, (_, i) => {
    const t = first + (span * i) / (points - 1);
    // Step, don't interpolate — the value didn't drift between marks, it was
    // restated on a date. Drawing a slope invents price action.
    let px = marks[0].price;
    for (const m of marks) {
      if (m.effective_at <= t) px = m.price;
      else break;
    }
    return px;
  });
}

const CONF_STEPS = { Low: 1, Moderate: 2, Elevated: 3, High: 4 } as const;

export default async function Stock({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: raw } = await params;
  const symbol = raw.toUpperCase();

  const v = await loadViewer();
  const q = v.quotes.find((x) => x.symbol === symbol);

  // Match on the SYMBOL. The old lookup also matched on `short` ("Anduril")
  // and on the full name, which meant /dashboard/stock/ANDURIL resolved while
  // the links that pointed there used a different key again.
  const priv = privateListingFor(symbol);
  const co = privateCos.find((c) => c.symbol === symbol);
  if (!q && !priv) notFound();

  const recorded = priv ? await marksFor(symbol) : [];
const { marks, isPrivate } = priv
  ? orPrivateMarks(symbol, recorded)
  : { marks: [] as Mark[], isPrivate: false };

  const held = v.positions.find((p) => p.symbol.toUpperCase() === symbol);
  const qty = held?.quantity ?? 0;

  const mark = marks.length ? marks[marks.length - 1] : undefined;
  const rawPx = q
    ? v.priceFor(symbol, qty > 0 ? held!.cost_basis / qty : 0)
    : mark?.price;

  // `priceFor` can return undefined on a cold quote cache. The old code fed
  // that straight into `px * held.quantity` and rendered NaN across the panel.
  const px = Number.isFinite(rawPx as number) ? (rawPx as number) : null;
  const tradable = px !== null && px > 0;

  const series = q
    ? px !== null
      ? v.seriesFor(symbol, px)
      : []
    : steppedSeries(marks);

  const up = (q?.change ?? 0) >= 0;
  const outlook = priv ? outlookFor(symbol) : null;

  /* ---- your position ---- */
  const avgCost = qty > 0 ? held!.cost_basis / qty : null;
  const marketValue = px != null && qty > 0 ? px * qty : null;
  const openPL = marketValue != null ? marketValue - held!.cost_basis : null;
  const openPLPct =
    openPL != null && held!.cost_basis > 0 ? (openPL / held!.cost_basis) * 100 : null;
  const todayMove =
    q?.changeAbs != null && qty > 0 ? q.changeAbs * qty : null;
  const weight =
    marketValue != null && v.total > 0 ? (marketValue / v.total) * 100 : null;

  return (
    <>
      <Link className="mono back" href="/dashboard/market">
        ← Market
      </Link>

      <header className="shead">
        <Logo symbol={symbol} size={56} />
        <div className="shead__id">
          <h1 className="shead__t">{q?.name ?? priv!.name}</h1>
          <p className="mono shead__s">
            {symbol} · {q ? "public equity" : "private company · not listed"}
            {co?.industry ? ` · ${co.industry}` : ""}
          </p>
        </div>
        {qty > 0 && (
          <span className="shead__held">
            <span className="mono shead__heldK">Your position</span>
            <span className="shead__heldV num">
              {qty} {q ? "sh" : "units"}
            </span>
            {marketValue != null && (
              <span className="mono shead__heldM">{usd(marketValue)}</span>
            )}
          </span>
        )}
      </header>

      <PortfolioPanel
        series={series}
        total={px ?? 0}
        cash={v.cash}
        hasQuotes={series.length > 0}
        unit="share"
        intraday={q ? v.intradayFor(symbol) : []}
        stepped={!q}
        derived={q ? v.derivedFor(symbol) : false}
        label={q ? "Last traded" : "Prevailing mark"}
      />

      {/* Position sits directly under the chart — it's the first thing a
          holder wants after the price, and burying it in the sidebar meant it
          fell below the trade ticket on every phone. */}
      {qty > 0 && (
        <section className="pos">
          <div className="pos__head">
            <h2 className="pos__h">Your position</h2>
            <span className="mono pos__meta">
              {weight != null ? `${weight.toFixed(1)}% of portfolio` : ""}
            </span>
          </div>
          <dl className="pos__grid">
            <div>
              <dt>Shares held</dt>
              <dd className="num">{qty}</dd>
            </div>
            <div>
              <dt>Average cost</dt>
              <dd className="num">{avgCost != null ? usd(avgCost) : "—"}</dd>
            </div>
            <div>
              <dt>Market value</dt>
              <dd className="num">{marketValue != null ? usd(marketValue) : "—"}</dd>
            </div>
            <div>
              <dt>Cost basis</dt>
              <dd className="num">{usd(held!.cost_basis)}</dd>
            </div>
            <div>
              <dt>Total return</dt>
              <dd className={openPL == null ? "num" : openPL >= 0 ? "num up" : "num down"}>
                {openPL != null
                  ? `${openPL >= 0 ? "+" : "−"}${usd(Math.abs(openPL))}`
                  : "—"}
                {openPLPct != null && (
                  <span className="pos__pct">
                    {" "}
                    {openPLPct >= 0 ? "+" : ""}
                    {openPLPct.toFixed(2)}%
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Today</dt>
              <dd
                className={
                  todayMove == null ? "num" : todayMove >= 0 ? "num up" : "num down"
                }
              >
                {todayMove != null
                  ? `${todayMove >= 0 ? "+" : "−"}${usd(Math.abs(todayMove))}`
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <div className="split">
        <section className="block">
          <div className="block__head">
            <h2 className="block__h">Key data</h2>
          </div>
          <dl className="dspecs">
            <div>
              <dt>{q ? "Last" : "Last mark"}</dt>
              <dd className="mono">{px !== null ? usd(px) : "no mark recorded"}</dd>
            </div>
            <div>
              <dt>{q ? "Change today" : "Effective"}</dt>
              <dd
                className={
                  q ? (q.change == null ? "mono" : up ? "mono up" : "mono down") : "mono"
                }
              >
                {q
                  ? q.change != null
                    ? pct(q.change)
                    : "—"
                  : mark
                    ? new Date(mark.effective_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "—"}
              </dd>
            </div>
            <div>
              <dt>{q ? "Previous close" : "Basis"}</dt>
              <dd className="mono">
                {q
                  ? q.prevClose != null
                    ? usd(q.prevClose)
                    : "—"
                  : (mark?.basis ?? "—")}
              </dd>
            </div>
            <div>
              <dt>{q ? "Day range" : "Marks on record"}</dt>
              <dd className="mono">
                {q
                  ? q.dayLow != null && q.dayHigh != null
                    ? `${usd(q.dayLow)} – ${usd(q.dayHigh)}`
                    : "—"
                  : String(marks.length)}
              </dd>
            </div>
            {!q && co && (
              <>
                <div>
                  <dt>Founded</dt>
                  <dd className="mono">{co.founded ?? "—"}</dd>
                </div>
                <div>
                  <dt>Stage</dt>
                  <dd className="mono">{co.stage}</dd>
                </div>
              </>
            )}
            <div>
              <dt>Data source</dt>
              <dd className="mono">
              {q?.source ?? mark?.source ?? "—"}
{isPrivate ? " · private mark" : ""}
              </dd>
            </div>
          </dl>

          {outlook && (
            <div className="outlook">
              <div className="outlook__head">
                <h2 className="block__h">Listing outlook</h2>
                <span className="mono outlook__est">desk estimate</span>
              </div>
              <div className="outlook__window">
                <span className="outlook__windowV num">{outlook.window}</span>
                <span className="wc__conf">
                  {[1, 2, 3, 4].map((i) => (
                    <i key={i} className={i <= CONF_STEPS[outlook.confidence] ? "on" : ""} />
                  ))}
                  <em className="mono">{outlook.confidence} confidence</em>
                </span>
              </div>
              <dl className="dspecs">
                <div>
                  <dt>Likely venue</dt>
                  <dd>{outlook.venue}</dd>
                </div>
                <div>
                  <dt>Catalyst</dt>
                  <dd>{outlook.catalyst}</dd>
                </div>
                <div>
                  <dt>What delays it</dt>
                  <dd>{outlook.drag}</dd>
                </div>
                <div>
                  <dt>Route</dt>
                  <dd>{outlook.route}</dd>
                </div>
                <div>
                  <dt>Comparables</dt>
                  <dd className="mono">{outlook.comps.join(" · ")}</dd>
                </div>
              </dl>
              <p className="panel__note outlook__disc">{OUTLOOK_DISCLAIMER}</p>
            </div>
          )}

          {!q && co && (
            <div className="deb" style={{ marginTop: "var(--s3)" }}>
              <div className="deb__col deb__col--bull">
                <h3 className="deb__h">Bull case</h3>
                <ul>
                  {co.body.bullCase.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
              <div className="deb__col deb__col--bear">
                <h3 className="deb__h">Bear case</h3>
                <ul>
                  {co.body.bearCase.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        <aside className="side">
          <div className="panel panel--tkt">
            <div className="panel__head">
              <h2 className="panel__h">Trade</h2>
              <span className="mono panel__meta">{symbol}</span>
            </div>

            {tradable ? (
              <TradeTicket
                symbol={symbol}
                price={px}
                buyingPower={v.cash}
                holdingQty={qty}
                demo={v.demo}
              />
            ) : (
              <p className="panel__note">
                No valuation mark has been recorded for {symbol}, so there is no
                price to trade against. Orders are disabled until one is.
              </p>
            )}

            {!q && tradable && mark && (
              <p className="panel__note" style={{ marginTop: 12 }}>
                {priv!.name} is a private company. This unit is not a listed
                security and does not trade on an exchange. The price above is an
                internal valuation mark dated{" "}
                {new Date(mark.effective_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}{" "}
                on the basis of {mark.basis} — not a market quote, and not a
                price at which units can be redeemed on demand. Private holdings
                are illiquid and can be marked down as well as up.
              </p>
            )}
          </div>

          {!q && priv && (
            <>
              <MarkHistory symbol={symbol} marks={marks} />

              <div className="panel">
                <div className="panel__head">
                  <h2 className="panel__h">Settlement</h2>
                </div>
                <p className="panel__note">{priv.settlement}</p>
                <div className="panel__head" style={{ marginTop: "var(--s2)" }}>
                  <h2 className="panel__h">Risk</h2>
                </div>
                <p className="panel__note">{priv.risk}</p>
              </div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
