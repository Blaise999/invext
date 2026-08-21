"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * SCROLL-SCRUBBED FRAME SEQUENCE
 *
 * Back to the shape this started as: you say where the frames are, it draws
 * them. No server scan, no directory sniffing, no manifest — all of that
 * existed to guess at naming, and the guessing was what kept breaking. You know
 * the filenames, so they go here.
 *
 *   /public/seq/frame_001.webp    …  frame_1000.webp    landscape
 *   /public/seq-m/frame_001.webp  …  frame_1000.webp    portrait
 *
 * On padding: printf "%03d" pads to a MINIMUM of three, so frame 1000 comes out
 * four digits rather than truncating. padStart(3) reproduces that exactly —
 * "001" and "1000" both correct — which is why `pad` is 3 and not 4.
 *
 * Frame dimensions are measured off the first decoded frame instead of being
 * declared, so re-rendering at a different size needs no code change.
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
  /** 0-1. Lower trails further behind the scroll and settles more slowly. */
  damping?: number;
  onProgress?: (p: number) => void;
  onFrame?: (index: number, total: number) => void;
  children?: React.ReactNode;
}

const frameUrl = (c: SeqConfig, n: number) =>
  `/${c.dir}/${c.stem}${String(c.first + n).padStart(c.pad, "0")}.${c.ext}`;

/**
 * Load order by binary subdivision: ends first, then halves, then quarters.
 * Loading 0,1,2,3… in order leaves the back half of the timeline blank when
 * someone has already scrolled to it. This covers the whole range coarsely
 * within a second and refines in place, so an early scrub is choppy rather
 * than empty.
 */
function subdivide(n: number): number[] {
  const out: number[] = [];
  const seen = new Uint8Array(n);
  const push = (i: number) => {
    if (i >= 0 && i < n && !seen[i]) { seen[i] = 1; out.push(i); }
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
  scrollLength = 2.6,
  mobileScrollLength,
  damping = 0.13,
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
     *
     * A count says nothing about memory — 150 frames of 1600x900 is 864 MB of
     * RGBA, which is what gets a mobile tab reaped mid-scroll. The decode is
     * capped on the long edge too, because a hero painted at 1280 is
     * indistinguishable from one at 1920 and costs a third as much.
     *
     * Frames are sampled evenly across the FULL sequence, so a 1000-frame
     * render is simply scrubbed at a coarser step rather than blowing up.
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

    frames.current.forEach((f) => { if (f && "close" in f) (f as ImageBitmap).close(); });
    frames.current = [];
    ready.current = [];
    slots.current = 0;
    setLoaded(0);
    setPainted(false);

    (async () => {
      // Fetch frame one at native size first: it settles the real dimensions,
      // and everything after is decoded at the size it will actually be drawn.
      let dw = 0, dh = 0, n = 0;

      try {
        const res = await fetch(frameUrl(cfg, 0));
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const probe = await createImageBitmap(blob);
        const plan = decodeFor(probe.width, probe.height);
        dw = plan.dw; dh = plan.dh;
        n = Math.min(cfg.frameCount, plan.take);
        probe.close();

        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[hero] /${cfg.dir}/ ${cfg.frameCount} frames at ${probe.width}x${probe.height} — ` +
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
                resizeWidth: dw, resizeHeight: dh, resizeQuality: "high",
              });
            } catch {
              // Safari has historically ignored or rejected resize options.
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
          if (dead) { if ("close" in img) (img as ImageBitmap).close(); return; }

          frames.current[slot] = img;
          ready.current.push(slot);
          ready.current.sort((a, b) => a - b);
          setLoaded(ready.current.length / n);
          if (ready.current.length === 1) setPainted(true);
        } catch {
          // A missing frame is survivable — nearest-available covers the gap.
        }
      }
    })();

    return () => {
      dead = true;
      frames.current.forEach((f) => { if (f && "close" in f) (f as ImageBitmap).close(); });
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
    // Portrait: bias the crop upward so the subject clears the headline.
    const yBias = ch > cw ? 0.34 : 0.5;
    fit.current = { dx: (cw * dpr - dw) / 2, dy: (ch * dpr - dh) * yBias, dw, dh };
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
      ([e]) => (onScreen.current = e.isIntersecting),
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
      let lo = 0, hi = arr.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] < want) lo = mid + 1; else hi = mid;
      }
      const a = arr[lo];
      const b = lo > 0 ? arr[lo - 1] : a;
      return Math.abs(a - want) < Math.abs(b - want) ? a : b;
    };

    const tick = () => {
      raf.current = requestAnimationFrame(tick);
      if (!onScreen.current) return;

      current.current += reduced
        ? target.current - current.current
        : (target.current - current.current) * damping;

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

  const pin = narrow && mobileScrollLength ? mobileScrollLength : scrollLength;

  return (
    <div ref={wrapRef} className="seq" style={{ height: `${pin * 100}svh` }}>
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
