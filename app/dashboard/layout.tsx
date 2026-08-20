import Link from "next/link";
import { loadViewer } from "@/lib/viewer";
import Shell from "@/components/dash/Shell";
import DemoBanner from "@/components/dash/DemoBanner";
import LogoutButton from "@/components/auth/LogoutButton";
import Brand from "@/components/Brand";
import { usd, pct } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shell for every dashboard route.
 *
 * The header used to carry four things across a single row: brand, greeting +
 * date, portfolio value, then email + sign-out. Two problems with that, both
 * visible in the screenshot this was rebuilt from:
 *
 *  1. The brand and the greeting sat on the same baseline about twelve pixels
 *     apart, so "INVEXT" and "Good afternoon, Chimdilim" read as one run-on
 *     line. There was no space doing any work between them.
 *  2. A greeting is a page-level welcome, not chrome. Pinning it to a sticky
 *     bar meant it followed you into Market, Activity and Account, where it is
 *     noise — and it competed with the portfolio value, which is the one
 *     number that genuinely belongs in a persistent bar.
 *
 * So the greeting moved to the top of Home (see app/dashboard/page.tsx) and
 * the header is now three parts with real space between them: brand, then a
 * flexible gap, then the value and the account controls grouped as one unit on
 * the right. The value keeps its own vertical stack — figure over label —
 * rather than sitting inline, which is what a brokerage header does.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const v = await loadViewer();
  const dayUp = v.dayChangeAbs >= 0;
  const dayPct =
    v.total - v.dayChangeAbs > 0
      ? (v.dayChangeAbs / (v.total - v.dayChangeAbs)) * 100
      : 0;

  return (
    <div className={v.demo ? "app app--demo" : "app"}>
      {v.demo && <DemoBanner explicit={v.explicitDemo} />}

      <header className="top">
        <div className="top__in">
          <Link href="/" className="brandlink top__brand" aria-label="InveXt home">
            <Brand size={28} />
          </Link>

          <div className="top__right">
            <Link className="top__val" href="/dashboard" aria-label="Portfolio value">
              <span className="mono top__valK">Portfolio</span>
              <span className="top__valRow">
                <span className="mono top__num">{usd(v.total)}</span>
                <span className={dayUp ? "mono top__d up" : "mono top__d down"}>
                  {dayUp ? "▲" : "▼"} {pct(dayPct)}
                </span>
              </span>
            </Link>

            <div className="top__act">
              <span className="mono top__who" title={v.user.email}>
                {v.user.email}
              </span>
              {!v.demo && <LogoutButton />}
            </div>
          </div>
        </div>
      </header>

      <div className="app__body">
        <Shell>{children}</Shell>
      </div>
    </div>
  );
}
