// app/dashboard/stock/[symbol]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadViewer } from "@/lib/viewer";
import { usd, pct } from "@/lib/market";
import { privateCos } from "@/lib/data";
import { marksFor, type Mark } from "@/lib/ledger";
import { orPreviewMarks } from "@/lib/preview";
import Logo from "@/components/dash/Logo";
import PortfolioPanel from "@/components/dash/PortfolioPanel";
import TradeTicket from "@/components/dash/TradeTicket";
import StockView from "@/components/dash/StockView"; // make sure this path is correct

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A private holding is worth whatever the last recorded mark says, and nothing
 * at all if no mark has been recorded. There is no fallback price here on
 * purpose: a number with no dated, sourced mark behind it is a guess, and a
 * guess rendered in the "Last" slot next to a Buy button is indistinguishable
 * from a real quote to the person reading it.
 */
function steppedSeries(marks: Mark[], points = 60): number[] {
  if (marks.length === 0) return [];
  if (marks.length === 1) return Array(points).fill(marks[0].price);

  const first = marks[0].effective_at;
  const last = marks[marks.length - 1].effective_at;
  const span = Math.max(last - first, 1);

  return Array.from({ length: points }, (_, i) => {
    const t = first + (span * i) / (points - 1);
    // Step, don't interpolate — the value didn't drift between marks, it was
    // restated on a date. Drawing a slope invents price action that never
    // happened.
    let px = marks[0].price;
    for (const m of marks) {
      if (m.effective_at <= t) px = m.price;
      else break;
    }
    return px;
  });
}

export default async function Stock({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: raw } = await params;
  const symbol = raw.toUpperCase();

  const v = await loadViewer();
  const q = v.quotes.find((x) => x.symbol === symbol);

  const priv = privateCos.find(
    (c) =>
      c.symbol === symbol ||
      c.short.toUpperCase() === symbol ||
      c.name.toUpperCase() === symbol,
  );

  if (!q && !priv) notFound();

  // Use the same preview marks system as the market page
  const recorded = priv ? await marksFor(symbol).catch(() => []) : [];
  const { marks, illustrative } = priv
    ? orPreviewMarks(symbol, recorded)
    : { marks: [], illustrative: false };

  const held = v.positions.find((p) => p.symbol === symbol);

  const mark = marks.length ? marks[marks.length - 1] : undefined;
  const prevMark = marks.length > 1 ? marks[marks.length - 2] : undefined;

  // Public: live quote. Private: last recorded (or preview) mark
  const rawPx = q
    ? v.priceFor(
        symbol,
        held && held.quantity ? held.cost_basis / held.quantity : 0,
      )
    : mark?.price;

  const px = Number.isFinite(rawPx as number) ? (rawPx as number) : null;
  const tradable = px !== null && px > 0;

  // Series
  const series = q
    ? px !== null
      ? v.seriesFor(symbol, px)
      : []
    : steppedSeries(marks);

  // Change (same logic as market page)
  const changeAbs =
    q?.changeAbs ??
    (mark && prevMark ? mark.price - prevMark.price : null);

  const changePct =
    q?.change ??
    (mark && prevMark && prevMark.price
      ? ((mark.price - prevMark.price) / prevMark.price) * 100
      : null);

  const up = (changePct ?? 0) >= 0;

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
            {illustrative && " · illustrative"}
          </p>
        </div>
        {held && (
          <span className="mono mcard__held">{held.quantity} sh held</span>
        )}
      </header>

      {/* Better chart + headline price */}
      <StockView
        symbol={symbol}
        price={px}
        changeAbs={changeAbs}
        changePct={changePct}
        series={series}
        kind={q ? "listed" : "private"}
        markedAt={mark?.effective_at ?? null}
        basis={mark?.basis ?? null}
      />

      <div className="split">
        <section className="block">
          <div className="block__head">
            <h2 className="block__h">Key data</h2>
          </div>
          <dl className="dspecs">
            <div>
              <dt>{q ? "Last" : "Last mark"}</dt>
              <dd className="mono">
                {px !== null ? usd(px) : "no mark recorded"}
              </dd>
            </div>
            <div>
              <dt>{q ? "Change today" : "Since previous mark"}</dt>
              <dd
                className={
                  changePct == null
                    ? "mono"
                    : up
                      ? "mono up"
                      : "mono down"
                }
              >
                {changePct != null ? pct(changePct) : "—"}
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

            {held && px !== null && (
              <>
                <div>
                  <dt>Your cost basis</dt>
                  <dd className="mono">{usd(held.cost_basis)}</dd>
                </div>
                <div>
                  <dt>Market value</dt>
                  <dd className="mono">{usd(px * held.quantity)}</dd>
                </div>
              </>
            )}

            <div>
              <dt>Data source</dt>
              <dd className="mono">
                {q?.source ?? mark?.source ?? "—"}
                {illustrative && " (illustrative)"}
              </dd>
            </div>
          </dl>
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
                holdingQty={held?.quantity ?? 0}
                demo={v.demo}
              />
            ) : (
              <p className="panel__note">
                No valuation mark has been recorded for {symbol}, so there is no
                price to trade against. Orders are disabled until one is.
              </p>
            )}

            {!q && tradable && (
              <p className="panel__note" style={{ marginTop: 12 }}>
                {priv!.name} is a private company. This unit is not a listed
                security and does not trade on an exchange. The price above is an
                internal valuation mark
                {mark
                  ? ` dated ${new Date(mark.effective_at).toLocaleDateString(
                      "en-US",
                      {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      },
                    )} on the basis of ${mark.basis}`
                  : ""}{" "}
                — not a market quote, and not a price at which units can be
                redeemed on demand. Private holdings are illiquid and can be
                marked down as well as up.
              </p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}