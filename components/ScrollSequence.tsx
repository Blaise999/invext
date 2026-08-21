"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface SeqVariant {
  src: (i: number) => string;
  frameCount: number;
  width: number;
  height: number;
}

interface Props {
  desktop: SeqVariant;
  /** Portrait render for narrow viewports. Falls back to desktop if omitted. */
  mobile?: SeqVariant;
  breakpoint?: number;
  scrollLength?: number;
  /** Shorter pin on phones — 3+ viewports of pinned scroll reads as a dead zone. */
  mobileScrollLength?: number;
  damping?: number;
  onProgress?: (p: number) => void;
  children?: React.ReactNode;
}

export default function ScrollSequence({
  desktop,
  mobile,
  breakpoint = 820,
  scrollLength = 3.4,
  mobileScrollLength,
  damping = 0.16,
  onProgress,
  children,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const frames = useRef<(ImageBitmap | HTMLImageElement | null)[]>([]);
  /**
   * Sorted list of indices actually decoded.
   *
   * The old lookup scanned +-14 around the wanted index. That worked when
   * every frame was stored; sampling 63 frames out of 1000 leaves gaps of
   * ~16, so the scan falls into a hole and nothing paints. A sorted list plus
   * a binary search can never miss, whatever the sampling step.
   */
  const have = useRef<number[]>([]);
  const target = useRef(0);
  const current = useRef(0);
  const raf = useRef<number>(0);
  const visible = useRef(true);
  const cb = useRef(onProgress);
  cb.current = onProgress;

  const [isNarrow, setIsNarrow] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);

  // Resolved on mount and on breakpoint crossing — never mid-scroll, because
  // swapping sequences under a moving scrubber reads as a glitch.
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);

  const variant = isNarrow && mobile ? mobile : desktop;

  /* ------------------------------------------------------------------
     LOAD

     Decoded RGBA is the real cost, not the download. 96 frames at
     900x630 decoded natively is ~218 MB, which is what gets a mobile
     Safari tab reaped mid-scroll.

     Three mitigations, by effect:
       1. A smaller portrait render for narrow viewports (64 frames, 560x700).
       2. createImageBitmap resize options, so frames decode near the size
          they'll actually be painted instead of at native resolution.
       3. Every other frame on very small screens.
  ------------------------------------------------------------------ */
  useEffect(() => {
    if (isNarrow === null) return;

    let cancelled = false;
    const { src, frameCount, width, height } = variant;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    /**
     * Frame size and count are worked out from the first frame, not from the
     * declared width/height, because those are a guess that goes stale the
     * moment the sequence is re-rendered at a different size.
     *
     * The count matters more than it looks. The old rule — every frame, or
     * every other one under 420px — is fine for 96 frames and catastrophic for
     * 1000: at 1920x1080 that is 8 MB of RGBA each, so the full set is 8 GB.
     * Budgeting by BYTES and sampling evenly across the whole sequence means
     * the same code handles 96 or 1000 without changing.
     */
    const longCap = isNarrow ? 720 : 1280;
    const ceiling = (isNarrow ? 96 : 224) * 1024 * 1024;

    let decodeW = Math.min(width, Math.ceil(width * Math.min(
      Math.max((vw * dpr) / width, (vh * dpr) / height), 1)));
    let decodeH = Math.round((decodeW / width) * height);
    let take = frameCount;
    let indices: number[] = [];

    const planFrom = (w: number, h: number) => {
      const cover = Math.max((vw * dpr) / w, (vh * dpr) / h);
      const k = Math.min(cover, 1, longCap / Math.max(w, h));
      decodeW = Math.max(1, Math.round(w * k));
      decodeH = Math.max(1, Math.round((decodeW / w) * h));
      const afford = Math.max(24, Math.floor(ceiling / (decodeW * decodeH * 4)));
      take = Math.min(frameCount, afford);
      indices = Array.from({ length: take }, (_, i) =>
        Math.round((i * (frameCount - 1)) / Math.max(1, take - 1)),
      );
    };

    frames.current.forEach((f) => {
      if (f && "close" in f) (f as ImageBitmap).close();
    });
    frames.current = new Array(frameCount).fill(null);
    have.current = [];
    setReady(false);
    setLoaded(0);

    let done = 0;

    (async () => {
      // Probe frame one at native size: it gives the real dimensions and
      // confirms the path is right before a thousand requests go out.
      try {
        const res = await fetch(src(0));
        if (!res.ok) throw new Error(String(res.status));
        const probe = await createImageBitmap(await res.blob());
        planFrom(probe.width, probe.height);
        probe.close();
        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[hero] ${src(0)} is ${probe.width}x${probe.height} — sampling ${take} of ` +
              `${frameCount} at ${decodeW}x${decodeH} ` +
              `≈ ${((take * decodeW * decodeH * 4) / 1048576).toFixed(0)} MB`,
          );
        }
      } catch {
        planFrom(width, height);
        if (process.env.NODE_ENV !== "production") {
          console.error(`[hero] could not read ${src(0)} — check the folder and filenames`);
        }
      }
      if (cancelled) return;

      for (const i of indices) {
        if (cancelled) return;
        try {
          const res = await fetch(src(i));
          // A 404 body is HTML; decoding it throws deep inside the bitmap
          // decoder. Bail here so a short sequence just ends instead of
          // producing a wall of console noise.
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();

          let bmp: ImageBitmap | HTMLImageElement;
          if ("createImageBitmap" in window) {
            try {
              bmp = await createImageBitmap(blob, {
                resizeWidth: decodeW,
                resizeHeight: decodeH,
                resizeQuality: "high",
              });
            } catch {
              // Safari has historically ignored or rejected resize options.
              bmp = await createImageBitmap(blob);
            }
          } else {
            bmp = await new Promise<HTMLImageElement>((ok, no) => {
              const im = new Image();
              im.onload = () => ok(im);
              im.onerror = no;
              im.src = URL.createObjectURL(blob);
            });
          }

          if (cancelled) {
            if ("close" in bmp) (bmp as ImageBitmap).close();
            return;
          }
          frames.current[i] = bmp;
          have.current.push(i);
          have.current.sort((a, b) => a - b);
        } catch {
          /* a dropped frame is survivable — nearest lookup covers it */
        }
        done++;
        setLoaded(done / Math.max(1, indices.length));
        if (done === 1) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      frames.current.forEach((f) => {
        if (f && "close" in f) (f as ImageBitmap).close();
      });
      frames.current = [];
    };
  }, [variant, isNarrow]);

  /* ---------------- size ---------------- */
  const fit = useRef({ dx: 0, dy: 0, dw: 0, dh: 0 });

  const resize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const scale = Math.max((w * dpr) / variant.width, (h * dpr) / variant.height);
    const dw = variant.width * scale;
    const dh = variant.height * scale;
    // Bias the crop upward in portrait so the ring sits above the headline
    // instead of behind it.
    const yBias = h > w ? 0.34 : 0.5;
    fit.current = { dx: (w * dpr - dw) / 2, dy: (h * dpr - dh) * yBias, dw, dh };
  }, [variant]);

  /* ---------------- scrub ---------------- */
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);

    const io = new IntersectionObserver(
      ([e]) => (visible.current = e.isIntersecting),
      { rootMargin: "12% 0px" },
    );
    io.observe(wrap);

    const readScroll = () => {
      const r = wrap.getBoundingClientRect();
      const total = wrap.offsetHeight - window.innerHeight;
      target.current = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
    };
    readScroll();
    current.current = target.current;
    window.addEventListener("scroll", readScroll, { passive: true });

    let lastDrawn = -1;

    const nearest = (i: number) => {
      if (frames.current[i]) return frames.current[i];
      const arr = have.current;
      if (arr.length) {
        let lo = 0;
        let hi = arr.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (arr[mid] < i) lo = mid + 1;
          else hi = mid;
        }
        const a = arr[lo];
        const b = lo > 0 ? arr[lo - 1] : a;
        const pick = Math.abs(a - i) <= Math.abs(b - i) ? a : b;
        if (frames.current[pick]) return frames.current[pick];
      }
      return null;
    };

    const tick = () => {
      raf.current = requestAnimationFrame(tick);
      if (!visible.current) return;

      current.current += reduced
        ? target.current - current.current
        : (target.current - current.current) * damping;

      const p = current.current;
      cb.current?.(p);

      const n = variant.frameCount;
      const idx = Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))));
      if (idx === lastDrawn) return;

      const img = nearest(idx);
      if (!img) return;
      const { dx, dy, dw, dh } = fit.current;
      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img as CanvasImageSource, dx, dy, dw, dh);
      lastDrawn = idx;
    };
    raf.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("scroll", readScroll);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      io.disconnect();
    };
  }, [variant, damping, resize]);

  return (
    <div ref={wrapRef} className="seq" style={{ height: `${(isNarrow && mobileScrollLength ? mobileScrollLength : scrollLength) * 100}svh` }}>
      <div className="seq__stage">
        <canvas ref={canvasRef} className="seq__canvas" />
        {children}
        {!ready && (
          <div className="seq__loading">
            <span>Loading</span>
            <span>{String(Math.round(loaded * 100)).padStart(3, "0")}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
