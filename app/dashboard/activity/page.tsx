import { loadViewer } from "@/lib/viewer";
import Activity from "@/components/dash/Activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const v = await loadViewer();
  const deposits = v.transactions.filter((t) => t.kind === "deposit");
  const trades = v.transactions.filter((t) => t.kind === "buy" || t.kind === "sell");

  return (
    <>
      <div className="block__head block__head--page">
        <div>
          <h1 className="page__h">Activity</h1>
          <p className="page__sub">Every movement, with status and timestamp.</p>
        </div>
        <span className="mono page__meta">{v.transactions.length} records</span>
      </div>

      <div className="strip">
        <div><span className="mono strip__k">Records</span><span className="strip__v">{v.transactions.length}</span></div>
        <div><span className="mono strip__k">Trades</span><span className="strip__v">{trades.length}</span></div>
        <div><span className="mono strip__k">Deposits</span><span className="strip__v">{deposits.length}</span></div>
      </div>

      <Activity rows={v.transactions as any} />
    </>
  );
}
