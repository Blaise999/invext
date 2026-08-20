import { loadViewer } from "@/lib/viewer";
import { PUBLIC_TICKERS } from "@/lib/market";
import { PRIVATE_LISTINGS } from "@/lib/private";
import MarketBoard from "@/components/dash/MarketBoard";
import { marksFor } from "@/lib/ledger";
import { orPreviewMarks } from "@/lib/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Forty listed names and twelve private vehicles on one board.
 *
 * The old page rendered every symbol as a large card with a sparkline and a
 * spec list — fine for seven, unusable for fifty-two, and on a phone it was a
 * single column of chest-high cards you had to scroll for a minute to reach
 * the bottom of. It's a dense sortable list now, with the cards kept only for
 * the row you open.
 */
export default async function Market() {
  const v = await loadViewer();

  const privateRows = await Promise.all(
    PRIVATE_LISTINGS.map(async (p) => {
      const recorded = await marksFor(p.symbol).catch(() => []);
      const { marks, illustrative } = orPreviewMarks(p.symbol, recorded);
      const last = marks[marks.length - 1];
      const prev = marks[marks.length - 2];
      return {
        symbol: p.symbol,
        name: p.name,
        what: p.what,
        price: last?.price ?? null,
        change:
          last && prev ? ((last.price - prev.price) / prev.price) * 100 : null,
        markedAt: last?.effective_at ?? null,
        basis: last?.basis ?? null,
        illustrative,
        held: v.positions.some((x) => x.symbol === p.symbol),
      };
    }),
  );

  const listed = v.quotes.map((q) => ({
    symbol: q.symbol,
    name: q.name,
    price: q.price,
    change: q.change,
    series: q.series.slice(-40),
    illustrative: q.source === "preview",
    held: v.positions.some((x) => x.symbol === q.symbol),
  }));

  const resolved = v.quotes.filter((q) => q.price != null).length;

  return (
    <>
      <div className="phead">
        <div>
          <h1 className="phead__h">Market</h1>
          <p className="phead__sub">
            {PUBLIC_TICKERS.length} listed securities, quoted live.{" "}
            {PRIVATE_LISTINGS.length} private vehicles, priced to their most
            recent recorded mark.
          </p>
        </div>
        <span className="phead__meta num">{resolved}/{listed.length} quoted</span>
      </div>

      <MarketBoard listed={listed} priv={privateRows} />
    </>
  );
}
