"use client";

import { useEffect, useRef } from "react";

/**
 * A 2px bar across the top, mobile only.
 *
 * A long page with no visible end is what makes people bail. This is the
 * smallest possible fix: it says how much is left without taking any control
 * away, and it writes to a CSS transform on an element that is already
 * composited, so it costs nothing per frame.
 */
export default function ReadingProgress() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      el.style.transform = `scaleX(${p.toFixed(4)})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return <div className="progress" ref={ref} aria-hidden="true" />;
}
