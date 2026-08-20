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
    const scale = Math.max((vw * dpr) / width, (vh * dpr) / height);
    const decodeW = Math.min(width, Math.ceil(width * Math.min(scale, 1)));
    const decodeH = Math.round((decodeW / width) * height);

    const step = vw < 420 ? 2 : 1;
    const indices = Array.from(
      { length: Math.ceil(frameCount / step) },
      (_, i) => Math.min(frameCount - 1, i * step),
    );

    frames.current.forEach((f) => {
      if (f && "close" in f) (f as ImageBitmap).close();
    });
    frames.current = new Array(frameCount).fill(null);
    setReady(false);
    setLoaded(0);

    let done = 0;

    (async () => {
      for (const i of indices) {
        if (cancelled) return;
        try {
          const res = await fetch(src(i));
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
          if (step === 2 && i + 1 < frameCount) frames.current[i + 1] = bmp;
        } catch {
          /* a dropped frame is survivable — nearest lookup covers it */
        }
        done++;
        setLoaded(done / indices.length);
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
      for (let d = 1; d < 14; d++) {
        if (frames.current[i - d]) return frames.current[i - d];
        if (frames.current[i + d]) return frames.current[i + d];
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
