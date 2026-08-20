import { loadViewer } from "@/lib/viewer";
import { allTransactionsForUser } from "@/lib/ledger";
import { usd } from "@/lib/market";
import Activity, { type Tx } from "@/components/dash/Activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The viewer only carries the most recent 25 rows — enough for the summary on
 * Home, wrong for the page whose entire promise is "every movement". This
 * pulls the full history for a real account and falls back to the viewer's
 * slice in demo mode, where there's no database behind it.
 */
export default async function ActivityPage() {
  const v = await loadViewer();

  const rows: Tx[] = v.demo
    ? (v.transactions as unknown as Tx[])
    : ((await allTransactionsForUser(v.user.id)) as unknown as Tx[]);

  const trades = rows.filter((t) => t.kind === "buy" || t.kind === "sell");
  const deposits = rows.filter((t) => t.kind === "deposit");
  const pending = rows.filter((t) => t.status === "pending");

  const realised = trades.reduce(
    (sum, t) => sum + (Number.isFinite(Number(t.realised)) ? Number(t.realised) : 0),
    0,
  );

  return (
    <>
      <div className="block__head block__head--page">
        <div>
          <h1 className="page__h">Activity</h1>
          <p className="page__sub">Every movement, with status and timestamp.</p>
        </div>
        <span className="mono page__meta">{rows.length} records</span>
      </div>

      <div className="strip">
        <div>
          <span className="mono strip__k">Records</span>
          <span className="strip__v">{rows.length}</span>
        </div>
        <div>
          <span className="mono strip__k">Trades</span>
          <span className="strip__v">{trades.length}</span>
        </div>
        <div>
          <span className="mono strip__k">Deposits</span>
          <span className="strip__v">{deposits.length}</span>
        </div>
        <div>
          <span className="mono strip__k">Pending</span>
          <span className="strip__v">{pending.length}</span>
        </div>
        <div>
          <span className="mono strip__k">Realised P/L</span>
          <span className={realised >= 0 ? "strip__v up" : "strip__v down"}>
            {realised >= 0 ? "+" : "−"}
            {usd(Math.abs(realised))}
          </span>
        </div>
      </div>

      <Activity rows={rows} />
    </>
  );
}
