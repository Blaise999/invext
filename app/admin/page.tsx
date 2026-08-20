import { redirect } from "next/navigation";
import Link from "next/link";
import Brand from "@/components/Brand";
import { requireAdmin } from "@/lib/admin";
import {
  allAddresses,
  recentActivity,
  recentMarks,
  recentTransfers,
  usersWithCash,
  networkAddresses,
} from "@/lib/ledger";
import AdminTabs from "./AdminTabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The back office reads the same store the trading app writes to.
 *
 * That sounds obvious and it wasn't: this page read one store while the
 * trading app wrote to another, so an operator could approve a withdrawal the
 * customer's balance had never heard of. One ledger, or none of the numbers
 * mean anything. Both sides are now on public.app_* (migration 0006), and
 * AdminTabs posts to ./desk-actions, which writes that same ledger.
 */
export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/dashboard");

  const [users, transfers, marks, addresses, activity, netAddresses] = await Promise.all([
    usersWithCash(),
    recentTransfers(50),
    recentMarks(40),
    allAddresses(),
    recentActivity(60),
    networkAddresses(),
  ]);

  const pending = transfers.filter((t) => t.status === "pending");
  const held = users.reduce((s, u) => s + u.cash, 0);

  return (
    <div className="dash">
      <header className="dbar">
        <div className="dbar__in">
          <Link href="/" className="brandlink" aria-label="InveXt home">
            <Brand size={26} />
          </Link>
          <span className="mono adm__badge">Admin</span>
          <nav className="dbar__nav" style={{ marginLeft: "auto" }}>
            <Link href="/dashboard">Back to account</Link>
          </nav>
        </div>
      </header>

      <main className="dwrap">
        <section className="stmt">
          <div className="stmt__head">
            <div>
              <p className="mono stmt__label">Signed in as {admin.email}</p>
              <h1 className="stmt__h1">Back office</h1>
            </div>
          </div>

          <dl className="stmt__figs">
            <div>
              <dt className="mono">Accounts</dt>
              <dd>{users.length}</dd>
            </div>
            <div>
              <dt className="mono">Awaiting decision</dt>
              <dd>{pending.length}</dd>
            </div>
            <div className={pending.length > 0 ? "is-total" : ""}>
              <dt className="mono">Customer cash</dt>
              <dd>
                $
                {held.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </dd>
            </div>
          </dl>

          {/* Not decoration. If this figure ever exceeds what is actually in
              the custody account, the difference is money that has been
              promised to customers and isn't there. */}
          <p className="mono stmt__note" style={{ marginTop: 10, opacity: 0.7 }}>
            Total owed to customers. Reconcile against custody before any payout run.
          </p>
        </section>

        <AdminTabs
          transfers={transfers}
          users={users}
          marks={marks}
          addresses={addresses}
          netAddresses={netAddresses}
          activity={activity}
        />
      </main>
    </div>
  );
}
