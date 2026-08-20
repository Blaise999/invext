"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Icons are drawn here rather than pulled from a set: at 20px the unicode
 * glyphs this used before (◧ ▤ ◇ ⇄) render differently on every platform and
 * look like fallback characters on Android, which is most of the mobile
 * traffic a page like this gets.
 */
const I = {
  home: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5",
  market: "M3 17.5 9 11l4 4 7.5-8M14.5 3.5H21v6.5",
  transfer: "M4 8.5h13m0 0-3.5-3.5M17 8.5 13.5 12M20 15.5H7m0 0 3.5-3.5M7 15.5 10.5 19",
  activity: "M3 12h4l2.5-6.5L14 18.5l2.5-6.5H21",
  account: "M12 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5ZM4.5 20.5a7.5 7.5 0 0 1 15 0",
  watchlist: "M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20l1-6L3.4 9.9l6-.9Z",
};

const NAV = [
  { href: "/dashboard", label: "Home", d: I.home, mobile: true },
  { href: "/dashboard/market", label: "Market", d: I.market, mobile: true },
  { href: "/dashboard/watchlist", label: "Watchlist", d: I.watchlist, mobile: false },
  { href: "/dashboard/transfer", label: "Transfer", d: I.transfer, mobile: true },
  { href: "/dashboard/activity", label: "Activity", d: I.activity, mobile: true },
  { href: "/dashboard/account", label: "Account", d: I.account, mobile: true },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none">
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Persistent rail on desktop, floating tab bar on mobile.
 *
 * Six tabs across a phone gave every target about 62px with 8px type — under
 * the 44px comfortable-touch guidance once padding is accounted for, and
 * unreadable besides. Watchlist drops off the mobile bar (it stays in the
 * desktop rail and is reachable from Market), leaving five targets with room
 * to breathe.
 */
export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const isOn = (href: string) =>
    href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);

  const mobileNav = NAV.filter((n) => n.mobile);

  return (
    <>
      <nav className="rail" aria-label="Dashboard sections">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            prefetch
            className={isOn(n.href) ? "rail__i is-on" : "rail__i"}
            aria-current={isOn(n.href) ? "page" : undefined}
          >
            <span className="rail__g" aria-hidden="true">
              <Icon d={n.d} />
            </span>
            <span className="rail__l">{n.label}</span>
          </Link>
        ))}
      </nav>

      <div className="pane">{children}</div>

      <nav
        className="tabs"
        aria-label="Dashboard sections"
        style={{ gridTemplateColumns: `repeat(${mobileNav.length}, 1fr)` }}
      >
        {mobileNav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            prefetch
            className={isOn(n.href) ? "tabs__i is-on" : "tabs__i"}
            aria-current={isOn(n.href) ? "page" : undefined}
          >
            <span className="tabs__g" aria-hidden="true">
              <Icon d={n.d} />
            </span>
            <span className="tabs__l">{n.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
