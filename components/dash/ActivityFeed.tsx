"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Row {
  id: number;
  action: string;
  entity: string | null;
  detail: Record<string, unknown> | null;
  actor_id: string | null;
  created_at: string;
}

/**
 * Full history bar, live. Every state change lands in activity_log — including
 * anything staff did to this account, with the actor recorded. The customer
 * sees admin actions on their own account; that visibility is the point.
 */
export default function ActivityFeed({
  initial,
  selfId,
}: {
  initial: Row[];
  selfId: string;
}) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void (async () => {
      const sb = await supabaseBrowser();
      if (!sb) return; // no database connected — static list, no live updates
      const ch = sb
      .channel("activity")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log" },
        (p) => setRows((prev) => [p.new as Row, ...prev].slice(0, 200)),
      )
        .subscribe();
      cleanup = () => {
        sb.removeChannel(ch);
      };
    })();
    return () => cleanup?.();
  }, []);

  const groups = ["all", "deposit", "withdrawal", "ledger", "account", "session"];
  const shown =
    filter === "all" ? rows : rows.filter((r) => r.action.startsWith(filter));

  return (
    <>
      <div className="feed__tabs">
        {groups.map((g) => (
          <button
            key={g}
            className={filter === g ? "feed__tab is-on mono" : "feed__tab mono"}
            onClick={() => setFilter(g)}
          >
            {g}
            {g !== "all" && (
              <span className="feed__n">
                {rows.filter((r) => r.action.startsWith(g)).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="blank">
          <p className="blank__lead">Nothing recorded here yet.</p>
          <p className="blank__body">
            Every deposit, withdrawal, balance movement and sign-in is journalled
            with a timestamp. Entries cannot be edited or deleted, including by
            staff — the log has database triggers that reject any update or
            delete outright.
          </p>
        </div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th className="hide-sm">Detail</th>
              <th className="num">By</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="mono" style={{ whiteSpace: "nowrap" }}>
                  {new Date(r.created_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </td>
                <td className="tbl__sym">{r.action.replace(/\./g, " · ")}</td>
                <td className="hide-sm tbl__what">
                  {r.detail
                    ? Object.entries(r.detail)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join("  ")
                    : "—"}
                </td>
                <td className="num mono">
                  {r.actor_id == null
                    ? "system"
                    : r.actor_id === selfId
                      ? "you"
                      : "staff"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
