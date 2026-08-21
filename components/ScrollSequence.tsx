"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * SCROLL-SCRUBBED FRAME SEQUENCE
 *
 * Blender (or ffmpeg) writes numbered stills; scroll picks one; a canvas draws
 * it. No <video>, because seeking a video by currentTime is keyframe-bound and
 * iOS will not do it smoothly.
 *
 *   /public/seq/frame_001.webp      landscape, desktop
 *   /public/seq-m/frame_001.webp    portrait, phones
 *
 * Note the folder is `public`, lower case. Next only serves static files from
 * a lower-case `public/`. A capital `Public/` works on macOS and Windows,
 * whose filesystems are case-insensitive, and 404s on every Linux host you
 * will ever deploy to — which looks exactly like "the frames are broken in
 * production but fine in dev".
 *
 * THREE THINGS DO THE WORK
 *
 * 1. Frame count is discovered, not declared. A hard-coded count that is too
 *    high maps most of the scroll onto files that do not exist; the scrub
 *    freezes for the back half. A binary probe over HEAD requests costs about
 *    twenty round trips once and is always right.
 *
 * 2. The budget is decoded BYTES, not frame count. 96 frames of 1920x1080 is
 *    796 MB of RGBA and mobile Safari reaps the tab. Frames are decoded at the
 *    size they will be painted and taken evenly across the sequence until the
 *    memory ceiling is hit. Levers are smaller frames or fewer frames; never
 *    more frames.
 *
 * 3. Scroll writes a target, rAF eases toward it:
 *
 *        current += (target - current) * damping;
 *
 *    Drawing frames[round(progress * n)] straight off the scroll event feels
 *    notched and cheap. That one line is most of what reads as weight.
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
  /** Number on the first file. 1 from ffmpeg, often 0 from Blender. */
  first: number;
  /**
   * Optional. Leave it out and the count is probed from the server, which is
   * the sane default — set it only to skip the probe once you are certain.
   */
  frameCount?: number;
}

export interface Crop {
  /** 0 = crop anchored left, 1 = right, 0.5 = centred. */
  x: number;
  y: number;
  zoom: number;
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
  /** Camera travel, evaluated every frame. Pure and synchronous. */
  crop?: (p: number, narrow: boolean) => Crop;
  /** 0-1 hand-off intensity. Written to --heat on the stage. */
  heat?: (p: number) => number;
  onProgress?: (p: number) => void;
  onFrame?: (index: number, total: number) => void;
  children?: React.ReactNode;
}

/* ------------------------------------------------------------- resolving -- */

const frameUrl = (c: SeqConfig, n: number) =>
  `/${c.dir}/${c.stem}${String(c.first + n).padStart(c.pad, "0")}.${c.ext}`;

/** Module-scoped so a remount or a breakpoint flip does not re-probe. */
const countCache = new Map<string, number>();

async function exists(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal, cache: "force-cache" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * How many frames are actually on disk.
 *
 * Double until a frame is missing, then binary-search the boundary. ~2·log2(n)
 * HEAD requests — twenty or so for a thousand frames, and they run while frame
 * one is already downloading, so they cost no visible time.
 */
async function probeCount(
  cfg: SeqConfig,
  signal: AbortSignal,
  ceiling = 4096,
): Promise<number> {
  const key = `${cfg.dir}/${cfg.stem}${cfg.pad}${cfg.first}`;
  const cached = countCache.get(key);
  if (cached !== undefined) return cached;

  if (!(await exists(frameUrl(cfg, 0), signal))) return 0;

  let hi = 1;
  while (hi <= ceiling && (await exists(frameUrl(cfg, hi), signal))) hi *= 2;

  let lo = Math.floor(hi / 2); // known to exist
  hi = Math.min(hi, ceiling + 1); // known to be missing

  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (await exists(frameUrl(cfg, mid), signal)) lo = mid;
    else hi = mid;
  }

  const count = lo + 1;
  countCache.set(key, count);
  return count;
}

/**
 * Load order by binary subdivision: ends first, then halves, then quarters.
 * Loading 0,1,2,3… in order leaves the back half of the timeline blank if the
 * reader has already scrolled there. This covers the whole range coarsely
 * within a second and refines in place, so an early scrub is coarse rather
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

/* ------------------------------------------------------------- component -- */

export default function ScrollSequence({
  desktop,
  mobile,
  breakpoint = 820,
  scrollLength = 2.7,
  mobileScrollLength = 2,
  damping = 0.14,
  crop,
  heat,
  onProgress,
  onFrame,
  children,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const bitmaps = useRef<(ImageBitmap | HTMLImageElement | undefined)[]>([]);
  /** Decoded slots, kept sorted, for nearest-available lookup. */
  const ready = useRef<number[]>([]);
  const slots = useRef(0);
  const source = useRef({ w: 0, h: 0 });

  const target = useRef(0);
  const current = useRef(0);
  const raf = useRef(0);
  const onScreen = useRef(true);
  const narrowRef = useRef(false);

  const cropFn = useRef(crop);
  const heatFn = useRef(heat);
  const progressCb = useRef(onProgress);
  const frameCb = useRef(onFrame);
  cropFn.current = crop;
  heatFn.current = heat;
  progressCb.current = onProgress;
  frameCb.current = onFrame;

  const [narrow, setNarrow] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [painted, setPainted] = useState(false);
  const [fault, setFault] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setNarrow(mq.matches);
    narrowRef.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      setNarrow(e.matches);
      narrowRef.current = e.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);

  const cfg = narrow && mobile ? mobile : desktop;

  /* ------------------------------------------------------------ load ----- */

  useEffect(() => {
    if (narrow === null) return;
    const ac = new AbortController();
    let dead = false;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    /**
     * Sharpness against frame count, and you only get to pick one.
     *
     * Portrait masters are tall, so a phone pays more per frame than a desktop
     * does. 540x960 held 57 deep beats 1080x1920 held 14 — with damping, frame
     * density is what reads as motion and resolution is what reads as a still.
     */
    const longCap = narrow ? 960 : 1280;
    const ceilingBytes = (narrow ? 120 : 240) * 1024 * 1024;

    const plan = (w: number, h: number) => {
      const cover = Math.max(
        (window.innerWidth * dpr) / w,
        (window.innerHeight * dpr) / h,
      );
      // 1.18 covers the largest zoom the travel model asks for, so a pushed-in
      // frame is still sampled down rather than up.
      const scale = Math.min(cover * 1.18, 1, longCap / Math.max(w, h));
      const dw = Math.max(1, Math.round(w * scale));
      const dh = Math.max(1, Math.round((dw / w) * h));
      return { dw, dh, take: Math.max(16, Math.floor(ceilingBytes / (dw * dh * 4))) };
    };

    bitmaps.current.forEach((f) => { if (f && "close" in f) (f as ImageBitmap).close(); });
    bitmaps.current = [];
    ready.current = [];
    slots.current = 0;
    setLoaded(0);
    setPainted(false);
    setFault(null);

    (async () => {
      let dw = 0, dh = 0, n = 0, total = 0;

      try {
        // Probe the count and fetch frame one at the same time. The count tells
        // us how far the scrub reaches; frame one tells us the real pixel
        // dimensions, so nothing has to be declared.
        const [count, res] = await Promise.all([
          cfg.frameCount ? Promise.resolve(cfg.frameCount) : probeCount(cfg, ac.signal),
          fetch(frameUrl(cfg, 0), { signal: ac.signal }),
        ]);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (count < 1) throw new Error("no frames found");

        const type = res.headers.get("content-type") || "";
        if (!type.startsWith("image/")) throw new Error(`served ${type || "no content-type"}`);

        const probe = await createImageBitmap(await res.blob());
        const sw = probe.width, sh = probe.height;
        probe.close();

        source.current = { w: sw, h: sh };
        const p = plan(sw, sh);
        dw = p.dw; dh = p.dh;
        total = count;
        n = Math.min(count, p.take);

        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[hero] /${cfg.dir}/ — ${count} frames on disk at ${sw}x${sh}; ` +
            `sampling ${n} decoded at ${dw}x${dh} ` +
            `≈ ${((n * dw * dh * 4) / 1048576).toFixed(0)} MB`,
          );
        }
      } catch (err) {
        if (dead || ac.signal.aborted) return;
        const why = err instanceof Error ? err.message : String(err);
        setFault(`${frameUrl(cfg, 0)} — ${why}`);
        if (process.env.NODE_ENV !== "production") {
          console.error(
            `[hero] cannot read ${frameUrl(cfg, 0)} (${why}).\n` +
            `       The folder must be lower-case public/${cfg.dir}/ — a capital ` +
            `Public/ resolves on macOS and Windows and 404s on Linux hosts.`,
          );
        }
        return;
      }
      if (dead) return;

      slots.current = n;
      bitmaps.current = new Array(n);
      // Slot -> real frame number, spread evenly across the whole sequence.
      const frameAt = (slot: number) =>
        Math.round((slot * (total - 1)) / Math.max(1, n - 1));

      for (const slot of subdivide(n)) {
        if (dead) return;
        if (bitmaps.current[slot]) continue;
        try {
          const res = await fetch(frameUrl(cfg, frameAt(slot)), { signal: ac.signal });
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          if (!blob.type.startsWith("image/")) throw new Error("not an image");

          let img: ImageBitmap | HTMLImageElement;
          try {
            img = await createImageBitmap(blob, {
              resizeWidth: dw, resizeHeight: dh, resizeQuality: "high",
            });
          } catch {
            // Safari has historically ignored or rejected the resize options.
            img = await createImageBitmap(blob);
          }
          if (dead) { if ("close" in img) (img as ImageBitmap).close(); return; }

          bitmaps.current[slot] = img;
          ready.current.push(slot);
          ready.current.sort((a, b) => a - b);
          setLoaded(ready.current.length / n);
          if (ready.current.length === 1) setPainted(true);
        } catch {
          // A single missing frame is survivable — nearest-available covers it.
        }
      }
    })();

    return () => {
      dead = true;
      ac.abort();
      bitmaps.current.forEach((f) => { if (f && "close" in f) (f as ImageBitmap).close(); });
      bitmaps.current = [];
      ready.current = [];
    };
  }, [cfg, narrow]);

  /* ------------------------------------------------------------- fit ----- */

  const surface = useRef({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = c.clientWidth, ch = c.clientHeight;
    if (!cw || !ch) return;
    const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    surface.current = { w, h };
  }, []);

  /* ----------------------------------------------------------- scrub ----- */

  useEffect(() => {
    const wrap = wrapRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !stage || !canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    window.addEventListener("orientationchange", measure);

    const io = new IntersectionObserver(
      ([e]) => (onScreen.current = e.isIntersecting),
      { rootMargin: "15% 0px" },
    );
    io.observe(wrap);

    /**
     * Progress is measured against the STAGE height, not window.innerHeight.
     *
     * The stage is 100lvh — the viewport with the mobile URL bar hidden — so it
     * is never shorter than what is on screen, which is what stops a strip of
     * page background appearing beneath it. But that also means the pin
     * releases when the wrapper's bottom meets the stage's bottom, which is
     * lvh - svh earlier than innerHeight would suggest. Measuring against the
     * stage makes progress hit exactly 1.0 at the instant the pin lets go: no
     * frozen tail, no early finish.
     */
    const read = () => {
      const travel = wrap.offsetHeight - stage.offsetHeight;
      const top = wrap.getBoundingClientRect().top;
      target.current = travel > 0 ? Math.min(1, Math.max(0, -top / travel)) : 0;
    };
    read();
    current.current = target.current;
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);

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

    let lastSig = "";
    let lastReported = -1;
    let lastHeat = -1;

    const tick = () => {
      raf.current = requestAnimationFrame(tick);
      if (!onScreen.current) return;

      current.current += reduced
        ? target.current - current.current
        : (target.current - current.current) * damping;

      const p = current.current;

      // Re-rendering the copy sixty times a second is most of the cost of this
      // hero on a phone. Below a fifteen-hundredth of the timeline nothing on
      // screen would move anyway, so React is left alone.
      if (Math.abs(p - lastReported) > 0.0015) {
        lastReported = p;
        progressCb.current?.(p);
      }

      if (heatFn.current) {
        const h = Math.round(heatFn.current(p) * 100) / 100;
        if (h !== lastHeat) {
          lastHeat = h;
          stage.style.setProperty("--heat", String(h));
        }
      }

      const n = slots.current;
      if (!n) return;
      const slot = nearest(Math.round(p * (n - 1)));
      if (slot < 0) return;

      const img = bitmaps.current[slot];
      if (!img) return;

      if (!surface.current.w) measure();
      const { w: cw, h: ch } = surface.current;
      if (!cw || !ch) return;

      const c = cropFn.current
        ? cropFn.current(p, narrowRef.current)
        : { x: 0.5, y: ch > cw ? 0.4 : 0.5, zoom: 1 };

      const iw = (img as ImageBitmap).width;
      const ih = (img as ImageBitmap).height;
      const cover = Math.max(cw / iw, ch / ih) * c.zoom;
      const dw = iw * cover;
      const dh = ih * cover;
      const dx = (cw - dw) * c.x;
      const dy = (ch - dh) * c.y;

      // Signature covers the frame AND the camera, so a settled scroll with a
      // moving crop still repaints, and a truly still hero costs nothing.
      const sig = `${slot}|${dx.toFixed(1)}|${dy.toFixed(1)}|${dw.toFixed(1)}`;
      if (sig === lastSig) return;
      lastSig = sig;

      ctx.fillStyle = "#08080a";
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img as CanvasImageSource, dx, dy, dw, dh);
      frameCb.current?.(slot, n);
    };
    raf.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", measure);
      ro.disconnect();
      io.disconnect();
    };
  }, [damping, measure, cfg]);

  const pin = narrow ? mobileScrollLength : scrollLength;

  return (
    <div
      ref={wrapRef}
      className="seq"
      style={{ "--pin": pin } as React.CSSProperties}
    >
      <div ref={stageRef} className="seq__stage">
        <canvas ref={canvasRef} className="seq__canvas" aria-hidden="true" />
        <div className="seq__grain" aria-hidden="true" />
        {children}

        {!painted && !fault && (
          <div className="seq__boot mono" aria-hidden="true">
            <span>Loading sequence</span>
            <span className="seq__bootN">
              {String(Math.round(loaded * 100)).padStart(3, "0")}%
            </span>
          </div>
        )}

        {/* A named failure beats a black rectangle. In production it is a
            single quiet line; in dev the console carries the full diagnosis. */}
        {fault && (
          <div className="seq__fault mono" role="status">
            <span>Sequence unavailable</span>
            {process.env.NODE_ENV !== "production" && <span>{fault}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
