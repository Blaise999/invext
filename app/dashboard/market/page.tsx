import { loadViewer } from "@/lib/viewer";
import { PUBLIC_TICKERS, alpacaConfigured } from "@/lib/market";
import { PRIVATE_LISTINGS } from "@/lib/private";
import { LISTING_OUTLOOK } from "@/lib/listing";
import MarketBoard from "@/components/dash/MarketBoard";
import { marksFor } from "@/lib/ledger";
import { orPrivateMarks } from "@/lib/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Forty listed names and twelve private vehicles on one board — a movers rail
 * for the question people arrive with, then one dense sortable list.
 */
export default async function Market() {
  const v = await loadViewer();

  const qtyOf = (symbol: string) =>
    v.positions
      .filter((x) => x.symbol.toUpperCase() === symbol.toUpperCase())
      .reduce((n, x) => n + x.quantity, 0);

  const privateRows = await Promise.all(
    PRIVATE_LISTINGS.map(async (p) => {
      const recorded = await marksFor(p.symbol).catch(() => []);
      const { marks, isPrivate } = orPrivateMarks(p.symbol, recorded);
      const last = marks[marks.length - 1];
      const prev = marks[marks.length - 2];
      const qty = qtyOf(p.symbol);
      return {
        symbol: p.symbol,
        name: p.name,
        what: p.what,
        price: last?.price ?? null,
        change:
          last && prev ? ((last.price - prev.price) / prev.price) * 100 : null,
        markedAt: last?.effective_at ?? null,
        basis: last?.basis ?? null,
        listing: LISTING_OUTLOOK[p.symbol]?.window ?? null,
        // MarketBoard still types this field as `illustrative`
        illustrative: isPrivate,
        held: qty > 0,
        heldQty: qty,
      };
    }),
  );

  const listed = v.quotes.map((q) => {
    const qty = qtyOf(q.symbol);
    return {
      symbol: q.symbol,
      name: q.name,
      price: q.price,
      change: q.change,
      changeAbs: q.changeAbs,
      series: q.series.slice(-60),
      illustrative: false,
      held: qty > 0,
      heldQty: qty,
    };
  });

  const resolved = v.quotes.filter((q) => q.price != null).length;
  const live = v.quotes.filter((q) => q.source === "alpaca" || q.source === "finnhub").length;

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
        <span className="phead__meta num">
          {resolved}/{listed.length} quoted
          {alpacaConfigured() && live > 0 ? " · Alpaca" : ""}
        </span>
      </div>

      <MarketBoard listed={listed} priv={privateRows} />
    </>
  );
}