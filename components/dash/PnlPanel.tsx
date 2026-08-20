import type { PortfolioPnl } from "@/lib/pnl";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const sgn = (n: number) => (n >= 0 ? "+" : "−");
const pc = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);

/**
 * The P/L block.
 *
 * Three figures, kept apart on purpose, because conflating them is how an
 * account gets misread:
 *
 *   UNREALISED  what you'd make if you sold everything right now. Moves
 *               constantly. Not money you have.
 *   REALISED    locked in by sales already made. Never moves again.
 *   TOTAL       the two together, over what you actually paid in.
 *
 * Most consumer apps show only unrealised, which flatters an account that has
 * been selling its winners and holding its losers — the classic disposition
 * effect. Total return against net contributions is the number that can't be
 * gamed by which side of the ledger you look at, so it gets the accent.
 */
export default function PnlPanel({ pnl }: { pnl: PortfolioPnl }) {
  return (
    <div className="panel">
      <div className="panel__head">
        <h2 className="panel__h">Profit &amp; loss</h2>
        <span className="mono panel__meta">All time</span>
      </div>

      <dl className="mini">
        <div>
          <dt>Unrealised</dt>
          <dd className={pnl.unrealised >= 0 ? "mono up" : "mono down"}>
            {sgn(pnl.unrealised)}{usd(Math.abs(pnl.unrealised))}
            <span className="mini__sub"> {pc(pnl.unrealisedPct)}</span>
          </dd>
        </div>
        <div>
          <dt>Realised</dt>
          <dd className={pnl.realised >= 0 ? "mono up" : "mono down"}>
            {sgn(pnl.realised)}{usd(Math.abs(pnl.realised))}
          </dd>
        </div>
        <div>
          <dt>Net contributed</dt>
          <dd className="mono">{usd(pnl.netContributed)}</dd>
        </div>
        <div className="is-total">
          <dt>Total return</dt>
          <dd className={pnl.totalPnl >= 0 ? "mono up" : "mono down"}>
            {sgn(pnl.totalPnl)}{usd(Math.abs(pnl.totalPnl))}
            <span className="mini__sub"> {pc(pnl.totalReturnPct)}</span>
          </dd>
        </div>
      </dl>

      {pnl.unpriced.length > 0 && (
        <p className="mono panel__note">
          {pnl.unpriced.join(", ")} {pnl.unpriced.length === 1 ? "has" : "have"} no
          current price, so {pnl.unpriced.length === 1 ? "it is" : "they are"}{" "}
          excluded from these figures rather than counted as zero.
        </p>
      )}
    </div>
  );
}
