"use client";

import { useEffect, useState } from "react";

const ALL_TABS = [
  { id: "overview", label: "Home" },
  { id: "market", label: "Market" },
  { id: "deposit", label: "Deposit" },
  { id: "watchlist", label: "Watchlist" },
  { id: "activity", label: "Activity" },
];

/**
 * Bottom tab bar, mobile only. Thumb-reachable, 56px targets, and it tracks
 * which section is on screen so the active tab is never a lie.
 * Sits above the iOS home indicator via env(safe-area-inset-bottom).
 */
export default function MobileNav() {
  const [active, setActive] = useState("overview");
  // Only show tabs whose section is actually on the page — the deposit section
  // is absent in demo mode, and a tab that scrolls nowhere is worse than none.
  const [tabs, setTabs] = useState(ALL_TABS.filter((t) => t.id !== "deposit"));

  useEffect(() => {
    setTabs(ALL_TABS.filter((t) => document.getElementById(t.id)));
  }, []);

  useEffect(() => {
    const els = ALL_TABS.map((t) => document.getElementById(t.id)).filter(
      (e): e is HTMLElement => Boolean(e),
    );
    if (els.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        const onScreen = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (onScreen?.target.id) setActive(onScreen.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5] },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  return (
    <nav
      className="mnav"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
      aria-label="Sections"
    >
      {tabs.map((t) => (
        <a
          key={t.id}
          href={`#${t.id}`}
          className={active === t.id ? "mnav__t is-on" : "mnav__t"}
          aria-current={active === t.id ? "true" : undefined}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}
