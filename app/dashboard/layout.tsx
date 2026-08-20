import Link from "next/link";
import { loadViewer } from "@/lib/viewer";
import Shell from "@/components/dash/Shell";
import DemoBanner from "@/components/dash/DemoBanner";
import LogoutButton from "@/components/auth/LogoutButton";
import Greeting from "@/components/dash/Greeting";
import Brand from "@/components/Brand";
import { usd, pct } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shell for every dashboard route. The topline (greeting, portfolio value,
 * day move) persists across screens so the number you care about is never
 * more than a glance away, whichever section you're in.
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
          <Link href="/" className="brandlink" aria-label="InveXt home">
            <Brand size={28} />
          </Link>

          <div className="top__mid">
            <Greeting name={v.user.first_name} serverHour={new Date().getHours()} />
            <span className="mono top__date">
              {new Date().toLocaleDateString("en-US", {
                weekday: "short", month: "short", day: "numeric",
              })}
            </span>
          </div>

          <div className="top__val">
            <span className="mono top__num">{usd(v.total)}</span>
            <span className={dayUp ? "mono top__d up" : "mono top__d down"}>
              {dayUp ? "▲" : "▼"} {pct(dayPct)}
            </span>
          </div>

          <div className="top__act">
            <span className="mono top__who">{v.user.email}</span>
            {!v.demo && <LogoutButton />}
          </div>
        </div>
      </header>

      <div className="app__body">
        <Shell>{children}</Shell>
      </div>
    </div>
  );
}
