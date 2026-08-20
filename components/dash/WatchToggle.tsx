"use client";

import { useState, useTransition } from "react";
import { toggleWatchlist } from "@/lib/orders";

/**
 * Optimistic on purpose: the state flips on click and only reverts if the
 * server disagrees. Watching a ticker is reversible and costs nothing, so
 * waiting on a round-trip buys nothing but latency.
 */
export default function WatchToggle({
  symbol,
  initial,
  disabled,
}: {
  symbol: string;
  initial: boolean;
  disabled?: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();

  return (
    <button
      className={on ? "watch is-on" : "watch"}
      disabled={disabled || pending}
      aria-pressed={on}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(async () => {
          const res = await toggleWatchlist(symbol);
          setOn(res.watching);
        });
      }}
    >
      <span aria-hidden="true">{on ? "★" : "☆"}</span>
      {on ? "Watching" : "Watch"}
    </button>
  );
}
