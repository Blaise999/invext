"use client";

import { useEffect, useRef, useState } from "react";

/**
 * REVEAL
 *
 * The desktop landing page has the pinned hero doing the work — you scroll and
 * something responds. On a phone that whole mechanism is shortened, so below
 * the fold the page was just blocks arriving in order with nothing acknowledging
 * the scroll. That is the "it just goes down, no excitement" problem: not a
 * shortage of decoration, a shortage of response.
 *
 * This gives every zone a single entrance keyed to the scroll. One transform,
 * one clip, once — it fires on first intersection and then disconnects, so
 * nothing re-animates on the way back up, which is what makes reveal effects
 * feel cheap.
 *
 * Deliberately does nothing on wide viewports: the desktop composition is
 * already carrying motion and adding more would fight it.
 */
export default function Reveal({
  children,
  /** Seconds of delay, for staggering siblings. Keep under ~0.25. */
  delay = 0,
  /** "up" lifts into place, "wipe" opens from the bottom edge like the hero. */
  mode = "up",
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  mode?: "up" | "wipe";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect the setting, and don't bother on wide screens.
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(min-width: 821px)").matches
    ) {
      setOn(true);
      return;
    }

    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setOn(true);
        io.disconnect();
      },
      // Fires a little before the block reaches the fold, so the entrance has
      // finished by the time it's properly in view rather than animating under
      // the reader's eye.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.06 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={["rv", `rv--${mode}`, on ? "is-in" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}
