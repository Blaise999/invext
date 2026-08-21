"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * SCROLL-SCRUBBED FRAME SEQUENCE
 *
 *   /public/seq/frame_001.webp    …  landscape
 *   /public/seq-m/frame_001.webp  …  portrait
 *
 * padStart(pad) matches printf "%0Nd" minimum width (frame 1000 stays 4 digits).
 * Frame size is measured from the first decoded frame.
 */

export interface SeqConfig {
  /** Folder under /public, no slashes. */
  dir: string;
  /** Filename before the number. */
  stem: string;
  /** Extension, no dot. */
  ext: string;
  /** Minimum digit width. 3 for frame_001, 4 for frame_0001. */
  pad: number;
  /** Number on the first file. 1 for ffmpeg, often 0 from Blender. */
  first: number;
  frameCount: number;
}

interface Props {
  desktop: SeqConfig;
  /** Portrait render for phones. Falls back to desktop when absent. */
  mobile?: SeqConfig;
  breakpoint?: number;
  /** Viewport heights of pinned scroll. */
  scrollLength?: number;
  mobileScrollLength?: number;
  /** 0–1. Lower trails further behind the scroll and settles more slowly. */
  damping?: number;
  onProgress?: (p: number) => void;
  onFrame?: (index: number, total: number) => void;
  children?: React.ReactNode;
}

const frameUrl = (c: SeqConfig, n: number) =>
  `/${c.dir}/${c.stem}${String(c.first + n).padStart(c.pad, "0")}.${c.ext}`;

/**
 * Load order by binary subdivision: ends first, then halves, then quarters.
 * Covers the whole range quickly so an early scrub is choppy rather than empty.
 */
function subdivide(n: number): number[] {
  const out: number[] = [];
  const seen = new Uint8Array(n);
  const push = (i: number) => {
    if (i >= 0 && i < n && !seen[i]) {
      seen[i] = 1;
      out.push(i);
    }
  };
  push(0);
  push(n - 1);
  for (let step = n; step > 1; ) {
    step = Math.max(1, Math.floor(step / 2));
    for (let i = step; i < n; i += step) push(i);
    if (step === 1) break;
  }
  for (let i = 0; i < n; i++) push(i);
  return out;
}

export default function ScrollSequence({
  desktop,
  mobile,
  breakpoint = 820,
  scrollLength = 2.4,
  mobileScrollLength,
  damping = 0.14,
  onProgress,
  onFrame,
  children,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const frames = useRef<(ImageBitmap | HTMLImageElement | undefined)[]>([]);
  /** Decoded slots, kept sorted, for nearest-available lookup. */
  const ready = useRef<number[]>([]);
  const slots = useRef(0);

  const target = useRef(0);
  const current = useRef(0);
  const raf = useRef(0);
  const onScreen = useRef(true);

  const progressCb = useRef(onProgress);
  const frameCb = useRef(onFrame);
  progressCb.current = onProgress;
  frameCb.current = onFrame;

  const [narrow, setNarrow] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);

  const cfg = narrow && mobile ? mobile : desktop;

  /* ------------------------------------------------------------ load ----- */

  useEffect(() => {
    if (narrow === null) return;
    let dead = false;

    /**
     * Budget by BYTES, not by frame count.
     * Sample evenly across the FULL sequence so a long render scrubs at a
     * coarser step rather than blowing RAM.
     */
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const longCap = narrow ? 720 : 1280;
    const ceiling = (narrow ? 96 : 224) * 1024 * 1024;

    const decodeFor = (w: number, h: number) => {
      const cover = Math.max(
        (window.innerWidth * dpr) / w,
        (window.innerHeight * dpr) / h,
      );
      const scale = Math.min(cover, 1, longCap / Math.max(w, h));
      const dw = Math.max(1, Math.round(w * scale));
      const dh = Math.max(1, Math.round((dw / w) * h));
      return { dw, dh, take: Math.max(24, Math.floor(ceiling / (dw * dh * 4))) };
    };

    frames.current.forEach((f) => {
      if (f && "close" in f) (f as ImageBitmap).close();
    });
    frames.current = [];
    ready.current = [];
    slots.current = 0;
    setLoaded(0);
    setPainted(false);

    (async () => {
      let dw = 0;
      let dh = 0;
      let n = 0;

      try {
        const res = await fetch(frameUrl(cfg, 0));
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();

        let probeW = 0;
        let probeH = 0;

        if ("createImageBitmap" in window) {
          try {
            const probe = await createImageBitmap(blob);
            probeW = probe.width;
            probeH = probe.height;
            probe.close();
          } catch {
            /* fall through to Image */
          }
        }

        // Safari / some WebP paths report 0×0 from createImageBitmap — measure via Image.
        if (!probeW || !probeH) {
          const dims = await new Promise<{ w: number; h: number }>((ok, no) => {
            const el = new Image();
            el.onload = () => ok({ w: el.naturalWidth, h: el.naturalHeight });
            el.onerror = no;
            el.src = URL.createObjectURL(blob);
          });
          probeW = dims.w;
          probeH = dims.h;
        }

        if (!probeW || !probeH) {
          probeW = narrow ? 760 : 1600;
          probeH = narrow ? 960 : 900;
        }

        const plan = decodeFor(probeW, probeH);
        dw = plan.dw;
        dh = plan.dh;
        n = Math.min(cfg.frameCount, plan.take);

        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[hero] /${cfg.dir}/ ${cfg.frameCount} frames at ${probeW}x${probeH} — ` +
              `sampling ${n} at ${dw}x${dh} ≈ ${((n * dw * dh * 4) / 1048576).toFixed(0)} MB`,
          );
        }
      } catch {
        if (process.env.NODE_ENV !== "production") {
          console.error(
            `[hero] could not load ${frameUrl(cfg, 0)} — check the folder and filenames`,
          );
        }
        return;
      }
      if (dead) return;

      slots.current = n;
      frames.current = new Array(n);
      const order = subdivide(n);
      const frameAt = (slot: number) =>
        Math.round((slot * (cfg.frameCount - 1)) / Math.max(1, n - 1));

      for (const slot of order) {
        if (dead) return;
        if (frames.current[slot]) continue;
        try {
          const res = await fetch(frameUrl(cfg, frameAt(slot)));
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();

          let img: ImageBitmap | HTMLImageElement;
          if ("createImageBitmap" in window) {
            try {
              img = await createImageBitmap(blob, {
                resizeWidth: dw,
                resizeHeight: dh,
                resizeQuality: "high",
              });
            } catch {
              img = await createImageBitmap(blob);
            }
          } else {
            img = await new Promise<HTMLImageElement>((ok, no) => {
              const el = new Image();
              el.onload = () => ok(el);
              el.onerror = no;
              el.src = URL.createObjectURL(blob);
            });
          }
          if (dead) {
            if ("close" in img) (img as ImageBitmap).close();
            return;
          }

          frames.current[slot] = img;
          ready.current.push(slot);
          ready.current.sort((a, b) => a - b);
          setLoaded(ready.current.length / n);
          if (ready.current.length === 1) setPainted(true);
        } catch {
          // Missing frame is survivable — nearest-available covers the gap.
        }
      }
    })();

    return () => {
      dead = true;
      frames.current.forEach((f) => {
        if (f && "close" in f) (f as ImageBitmap).close();
      });
      frames.current = [];
      ready.current = [];
    };
  }, [cfg, narrow]);

  /* ------------------------------------------------------------- fit ----- */

  const fit = useRef({ dx: 0, dy: 0, dw: 0, dh: 0 });

  const measure = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    if (!cw || !ch) return;
    c.width = Math.round(cw * dpr);
    c.height = Math.round(ch * dpr);

    const first = frames.current[ready.current[0]] as ImageBitmap | undefined;
    const w = first?.width || 1920;
    const h = first?.height || 1080;

    const scale = Math.max((cw * dpr) / w, (ch * dpr) / h);
    const dw = w * scale;
    const dh = h * scale;
    // Portrait: bias crop upward so the subject clears the headline.
    const yBias = ch > cw ? 0.34 : 0.5;
    fit.current = {
      dx: (cw * dpr - dw) / 2,
      dy: (ch * dpr - dh) * yBias,
      dw,
      dh,
    };
  }, []);

  /* ----------------------------------------------------------- scrub ----- */

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);

    const io = new IntersectionObserver(
      ([e]) => {
        onScreen.current = e.isIntersecting;
      },
      { rootMargin: "12% 0px" },
    );
    io.observe(wrap);

    const read = () => {
      const r = wrap.getBoundingClientRect();
      const total = wrap.offsetHeight - window.innerHeight;
      target.current = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
    };
    read();
    current.current = target.current;
    window.addEventListener("scroll", read, { passive: true });

    let lastSlot = -1;

    const nearest = (want: number) => {
      const arr = ready.current;
      if (arr.length === 0) return -1;
      let lo = 0;
      let hi = arr.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] < want) lo = mid + 1;
        else hi = mid;
      }
      const a = arr[lo];
      const b = lo > 0 ? arr[lo - 1] : a;
      return Math.abs(a - want) < Math.abs(b - want) ? a : b;
    };

    const tick = () => {
      raf.current = requestAnimationFrame(tick);
      if (!onScreen.current) return;

      // Smooth lag: scroll only writes target; this eases current toward it.
      // That single lerp is most of the “3D weight.”
      const k = reduced ? 1 : damping;
      current.current += (target.current - current.current) * k;

      // Snap when extremely close so it doesn’t crawl forever
      if (Math.abs(target.current - current.current) < 0.00015) {
        current.current = target.current;
      }

      const p = current.current;
      progressCb.current?.(p);

      const n = slots.current;
      if (!n) return;
      const slot = nearest(Math.round(p * (n - 1)));
      if (slot < 0 || slot === lastSlot) return;

      const img = frames.current[slot];
      if (!img) return;

      if (!fit.current.dw) measure();
      const { dx, dy, dw, dh } = fit.current;
      ctx.fillStyle = "#08080a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img as CanvasImageSource, dx, dy, dw, dh);
      lastSlot = slot;
      frameCb.current?.(slot, n);
    };
    raf.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      io.disconnect();
    };
  }, [damping, measure, cfg]);

  const pin =
    narrow && mobileScrollLength != null ? mobileScrollLength : scrollLength;

  return (
    <div ref={wrapRef} className="seq" style={{ height: `${pin * 100}dvh` }}>
      <div className="seq__stage">
        <canvas ref={canvasRef} className="seq__canvas" />
        {children}
        {!painted && (
          <div className="seq__loading">
            <span>Loading</span>
            <span>{String(Math.round(loaded * 100)).padStart(3, "0")}%</span>
          </div>
        )}
      </div>
    </div>
  );
}