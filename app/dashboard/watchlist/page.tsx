import Link from "next/link";
import { loadViewer } from "@/lib/viewer";
import { PRIVATE_LISTINGS } from "@/lib/private";
import { privateCos } from "@/lib/data";
import { LISTING_OUTLOOK, OUTLOOK_DISCLAIMER } from "@/lib/listing";
import { marksFor } from "@/lib/ledger";
import { orPreviewMarks } from "@/lib/preview";
import { usd } from "@/lib/market";
import Logo from "@/components/dash/Logo";
import Sparkline from "@/components/dash/Sparkline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The private book — all twelve vehicles, with a desk view on each one's route
 * to a public market.
 *
 * Two things fixed from the previous version, both of which made this page
 * quietly broken rather than obviously broken:
 *
 *  1. Every card linked to `/dashboard/stock/{c.short}` where `short` is
 *     "Anduril", "Neuralink", "CFS" — display names, not symbols. Every link
 *     404'd. They point at `symbol` now.
 *  2. `Logo symbol={c.short}` looked up "Anduril" in the brand table, missed,
 *     and drew a grey monogram for all twelve. Same fix.
 *
 * The listing outlook is the new content. It is framed as a desk estimate in
 * the copy, on every card, and in the disclosure below — see lib/listing.ts
 * for why that framing is not optional.
 */

const CONF_STEPS = { Low: 1, Moderate: 2, Elevated: 3, High: 4 } as const;

/** Step chart from mark history — flat between events, jumps on the day of one. */
function stepped(marks: { price: number; effective_at: number }[], points = 40) {
  if (marks.length === 0) return [];
  if (marks.length === 1) return Array(points).fill(marks[0].price);
  const first = marks[0].effective_at;
  const span = Math.max(marks[marks.length - 1].effective_at - first, 1);
  return Array.from({ length: points }, (_, i) => {
    const t = first + (span * i) / (points - 1);
    let px = marks[0].price;
    for (const m of marks) {
      if (m.effective_at <= t) px = m.price;
      else break;
    }
    return px;
  });
}

export default async function Watchlist() {
  const v = await loadViewer();

  const cards = await Promise.all(
    PRIVATE_LISTINGS.map(async (p) => {
      const recorded = await marksFor(p.symbol).catch(() => []);
      const { marks, illustrative } = orPreviewMarks(p.symbol, recorded);
      const last = marks[marks.length - 1];
      const prev = marks[marks.length - 2];
      const co = privateCos.find((c) => c.symbol === p.symbol);
      const qty = v.positions
        .filter((x) => x.symbol.toUpperCase() === p.symbol)
        .reduce((n, x) => n + x.quantity, 0);

      return {
        listing: p,
        co,
        outlook: LISTING_OUTLOOK[p.symbol] ?? null,
        price: last?.price ?? null,
        change:
          last && prev && prev.price
            ? ((last.price - prev.price) / prev.price) * 100
            : null,
        markedAt: last?.effective_at ?? null,
        basis: last?.basis ?? null,
        series: stepped(marks),
        marksCount: marks.length,
        illustrative,
        qty,
      };
    }),
  );

  const marked = cards.filter((c) => c.price != null).length;
  const holding = cards.filter((c) => c.qty > 0).length;
  const soonest = cards
    .map((c) => c.outlook?.window ?? "")
    .filter(Boolean)
    .sort()[0];

  return (
    <>
      <div className="block__head block__head--page">
        <div>
          <h1 className="page__h">Private book</h1>
          <p className="page__sub">
            Twelve single-asset vehicles, priced to their most recent recorded
            mark. Each mark carries its date, its basis and the name of whoever
            recorded it — and each name carries a desk view on what would have
            to happen before it trades publicly.
          </p>
        </div>
        <span className="mono page__meta">{PRIVATE_LISTINGS.length} vehicles</span>
      </div>

      <div className="strip">
        <div>
          <span className="mono strip__k">Vehicles</span>
          <span className="strip__v">{PRIVATE_LISTINGS.length}</span>
        </div>
        <div>
          <span className="mono strip__k">Marked</span>
          <span className="strip__v">
            {marked}/{PRIVATE_LISTINGS.length}
          </span>
        </div>
        <div>
          <span className="mono strip__k">You hold</span>
          <span className="strip__v">{holding}</span>
        </div>
        <div>
          <span className="mono strip__k">Earliest window</span>
          <span className="strip__v">{soonest || "—"}</span>
        </div>
      </div>

      <div className="wgrid">
        {cards.map((c) => {
          const o = c.outlook;
          const up = (c.change ?? 0) >= 0;
          const steps = o ? CONF_STEPS[o.confidence] : 0;

          return (
            <article className="wc" key={c.listing.symbol}>
              <Link className="wc__link" href={`/dashboard/stock/${c.listing.symbol}`}>
                <header className="wc__top">
                  <Logo symbol={c.listing.symbol} size={46} />
                  <div className="wc__id">
                    <h2 className="wc__name">{c.listing.name}</h2>
                    <p className="mono wc__sym">
                      {c.listing.symbol} · {c.co?.industry ?? "Private"} ·{" "}
                      {c.co?.stage ?? "Private"}
                    </p>
                  </div>
                  {c.qty > 0 && (
                    <span className="mono wc__held">{c.qty} u</span>
                  )}
                </header>

                <div className="wc__mark">
                  <div className="wc__px">
                    <span className={c.illustrative ? "wc__last num is-illus" : "wc__last num"}>
                      {c.price != null ? usd(c.price) : "No mark"}
                    </span>
                    <span className="mono wc__unit">per unit</span>
                  </div>
                  {c.change != null && (
                    <span className={up ? "wc__ch num up" : "wc__ch num down"}>
                      {up ? "+" : ""}
                      {c.change.toFixed(2)}%{" "}
                      <span className="wc__chk">since prior mark</span>
                    </span>
                  )}
                  {c.series.length > 1 && (
                    <Sparkline series={c.series} up={up} w={130} h={34} />
                  )}
                </div>

                <p className="wc__what">{c.listing.what}</p>
              </Link>

              {o && (
                <div className="wc__out">
                  <div className="wc__outHead">
                    <span className="mono wc__outK">Listing outlook</span>
                    <span className="mono wc__outEst">desk estimate</span>
                  </div>

                  <div className="wc__window">
                    <span className="wc__windowV num">{o.window}</span>
                    <span className="wc__conf" title={`${o.confidence} confidence`}>
                      {[1, 2, 3, 4].map((i) => (
                        <i key={i} className={i <= steps ? "on" : ""} />
                      ))}
                      <em className="mono">{o.confidence}</em>
                    </span>
                  </div>

                  <dl className="wc__facts">
                    <div>
                      <dt>Venue</dt>
                      <dd>{o.venue}</dd>
                    </div>
                    <div>
                      <dt>Catalyst</dt>
                      <dd>{o.catalyst}</dd>
                    </div>
                    <div>
                      <dt>What delays it</dt>
                      <dd>{o.drag}</dd>
                    </div>
                    <div>
                      <dt>Route</dt>
                      <dd>{o.route}</dd>
                    </div>
                  </dl>

                  {o.comps[0] !== "—" && (
                    <div className="wc__comps">
                      <span className="mono wc__compsK">Comps</span>
                      {o.comps.map((s) => (
                        <span className="wc__comp mono" key={s}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <footer className="wc__foot mono">
                <span>
                  {c.markedAt
                    ? `Marked ${new Date(c.markedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}`
                    : "No mark on record"}
                </span>
                <span>
                  {c.marksCount} mark{c.marksCount === 1 ? "" : "s"}
                  {c.illustrative ? " · illustrative" : ""}
                </span>
              </footer>
            </article>
          );
        })}
      </div>

      <div className="warn">
        <p className="mono warn__k">On the windows above</p>
        <p>{OUTLOOK_DISCLAIMER}</p>
      </div>

      <div className="warn">
        <p className="mono warn__k">Why there&rsquo;s no ticking price</p>
        <p>
          These companies are private, so no exchange is matching buyers and
          sellers minute by minute. Units are priced to a dated mark instead,
          which holds until the next event moves it — that&rsquo;s why the
          chart steps rather than slopes. SpaceX left this list in June 2026
          when it listed as SPCX. Grok, X and Starlink were never on it; they
          are divisions inside SPCX.{" "}
          <Link href="/#private">Full breakdown</Link>.
        </p>
      </div>
    </>
  );
}
