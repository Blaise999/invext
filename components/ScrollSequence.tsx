"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SeqVariant } from "@/lib/sequence-server";
import { cropAt, heatAt } from "@/lib/hero-motion";

interface SeqSource {
  id: string;
  src: (i: number) => string;
  frameCount: number;
  width: number;
  height: number;
  budget: number;
}

export interface Props {
  /** Resolved on the server. Null means the directory is genuinely empty. */
  desktop: SeqVariant | null;
  mobile: SeqVariant | null;
  /** Viewport heights of pinned scroll. */
  scrollLength?: number;
  mobileScrollLength?: number;
  /** 0-1. Lower is heavier; the scrubber trails the scroll and settles. */
  damping?: number;
  breakpoint?: number;
  onProgress?: (p: number) => void;
  /** Fires only when the painted frame changes — not every rAF. */
  onFrame?: (index: number, total: number) => void;
  children?: React.ReactNode;
}

/* ----------------------------------------------------------------- utils -- */

/**
 * Load order by binary subdivision: first and last, then halves, then
 * quarters. The alternative - loading 0,1,2,3 in order - means the last third
 * of the sequence is still blank when someone has already scrolled to it. This
 * way the whole timeline is covered coarsely within a second and refines in
 * place, so an early scrub is choppy rather than empty.
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

/** Nearest loaded key to `target`, over a sorted ascending array. */
function nearestKey(keys: number[], target: number): number {
  const n = keys.length;
  if (n === 0) return -1;
  if (target <= keys[0]) return keys[0];
  if (target >= keys[n - 1]) return keys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] <= target) lo = mid;
    else hi = mid;
  }
  return target - keys[lo] <= keys[hi] - target ? keys[lo] : keys[hi];
}

/**
 * The two loaded keys either side of `target`, plus how far between them we are.
 *
 * A thousand-frame render sampled down to ~130 means roughly one stored frame
 * every eight scroll positions, and snapping to the nearest one is what made the
 * motion step instead of flow. Painting the lower frame and then the upper frame
 * over it at partial alpha costs one extra drawImage and removes the stepping
 * entirely — the eye reads the blend as an in-between frame.
 */
function bracket(keys: number[], target: number): [number, number, number] {
  const n = keys.length;
  if (n === 0) return [-1, -1, 0];
  if (target <= keys[0]) return [keys[0], keys[0], 0];
  if (target >= keys[n - 1]) return [keys[n - 1], keys[n - 1], 0];

  let lo = 0;
  let hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] <= target) lo = mid;
    else hi = mid;
  }
  const a = keys[lo];
  const b = keys[hi];
  const span = b - a;
  return [a, b, span > 0 ? (target - a) / span : 0];
}

function insertSorted(keys: number[], k: number) {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] < k) lo = mid + 1;
    else hi = mid;
  }
  keys.splice(lo, 0, k);
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ------------------------------------------------------------- component -- */

export default function ScrollSequence({
  scrollLength = 3.6,
  mobileScrollLength = 2.8,
  damping = 0.14,
  desktop,
  mobile,
  breakpoint = 820,
  onProgress,
  onFrame,
  children,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /** Sampled source index -> decoded frame. */
  const bmp = useRef(new Map<number, ImageBitmap | HTMLImageElement>());
  /** Sorted sampled indices that are decoded and drawable. */
  const keys = useRef<number[]>([]);

  const target = useRef(0);
  const current = useRef(0);
  const raf = useRef(0);
  const onScreen = useRef(true);
  const painted = useRef(false);
  const cb = useRef(onProgress);
  cb.current = onProgress;
  const fcb = useRef(onFrame);
  fcb.current = onFrame;

  const [narrow, setNarrow] = useState<boolean | null>(null);
  const [source, setSource] = useState<SeqSource | null>(null);
  /**
   * pending — still asking the server what's on disk
   * ok      — a sequence resolved and at least one frame has painted
   * none    — nothing usable; the poster carries the hero instead
   *
   * Tracked explicitly because the old code had no way to distinguish "still
   * loading" from "there is nothing to load", so an empty directory rendered
   * as a black rectangle under a progress readout stuck at 100%.
   */
  const [phase, setPhase] = useState<"pending" | "ok" | "none">("pending");
  const [loaded, setLoaded] = useState(0);
  const [firstPaint, setFirstPaint] = useState(false);

  /* --------------------------------------------------------- breakpoint -- */

  // Resolved on mount and on breakpoint crossing, never mid-scroll: swapping
  // sequences under a moving scrubber reads as a glitch, not a refinement.
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);

  /* ------------------------------------------------------------- resolve -- */

  /**
   * No resolution happens here any more — the server already did it. This only
   * picks which of the two prop-supplied variants applies to this viewport and
   * turns it into an indexable source.
   *
   * Narrow viewports take the portrait cut and fall back to landscape only if
   * seq-m is empty; a landscape frame on a phone crops to about a third of its
   * width, so whatever the render was composed around ends up off screen.
   */
  useEffect(() => {
    if (narrow === null) return;

    const picked = narrow ? (mobile ?? desktop) : (desktop ?? mobile);
    if (!picked || picked.frameCount < 2) {
      setSource(null);
      setPhase("none");
      return;
    }

    const pad = (n: number) => String(n).padStart(picked.pad, "0");

    // `numbers` is present only when the sequence isn't a clean run from
    // `first` — see sequence-server. When it's absent, arithmetic is exact.
    const numberAt = picked.numbers
      ? (i: number) => picked.numbers![Math.min(i, picked.numbers!.length - 1)]
      : (i: number) => picked.first + i;

    setSource({
      id: `${picked.dir}/${picked.stem}*.${picked.ext}`,
      src: (i) => `/${picked.dir}/${picked.stem}${pad(numberAt(i))}.${picked.ext}`,
      frameCount: picked.frameCount,
      width: picked.width,
      height: picked.height,
      // Decoded RGBA is the real cost, not the download. Sample evenly to this
      // many and scrub the sample; the blend between neighbours covers the gap.
      // Placeholder — the real budget is derived from decoded frame size below,
      // because a frame count alone says nothing about memory.
      budget: picked.frameCount,
    });
    setPhase("pending");
  }, [narrow, desktop, mobile]);

  /* ---------------------------------------------------------------- load -- */

  useEffect(() => {
    if (!source) return;

    let dead = false;
    const { src, frameCount, width, height, budget } = source;

    // Decode near the size we will actually paint. A native-resolution decode
    // of a 1920x1080 frame costs 8 MB of RGBA whether or not it is ever drawn
    // that large.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cover = Math.max((vw * dpr) / width, (vh * dpr) / height);

    /**
     * Cap the long edge as well as the cover scale.
     *
     * A 1600x900 master decoded at native costs 5.8 MB of RGBA per frame. Over
     * any useful number of frames that is hundreds of megabytes, and a phone
     * kills the tab long before it becomes a rendering problem. Painting a
     * hero at 1280 (or 720 on a phone) is indistinguishable atthis size and costs
     * a third as much.
     */
    const longCap = narrow ? 720 : 1280;
    const capScale = Math.min(1, longCap / Math.max(width, height));
    const scale = Math.min(cover, 1, capScale);
    const decodeW = Math.max(1, Math.round(width * scale));
    const decodeH = Math.max(1, Math.round((decodeW / width) * height));

    /**
     * Budget by BYTES, not by frame count.
     *
     * The previous rule — 150 desktop, 80 mobile — is meaningless without the
     * frame size. At 1600x900 those numbers are 864 MB and 461 MB. Deriving the
     * count from a memory ceiling and the actual decoded size means the same
     * code is safe whether the sequence is 96 frames or 1000.
     *
     * The floor of 24 exists because below that the scrub reads as a slideshow;
     * if even 24 frames exceed the ceiling the sequence is simply too big and
     * needs thinning on disk (see tools/thin-frames.mjs).
     */
    const perFrame = decodeW * decodeH * 4;
    const ceiling = narrow ? 96 * 1024 * 1024 : 224 * 1024 * 1024;
    const affordable = Math.max(24, Math.floor(ceiling / perFrame));
    const take = Math.min(budget, frameCount, affordable);

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[hero] ${frameCount} frames available, sampling ${take} at ` +
          `${decodeW}x${decodeH} ≈ ${((take * perFrame) / 1048576).toFixed(0)} MB decoded`,
      );
    }
    const sampled: number[] = [];
    for (let i = 0; i < take; i++) {
      sampled.push(Math.round((i * (frameCount - 1)) / Math.max(1, take - 1)));
    }

    // Reset any previous sequence.
    bmp.current.forEach((f) => {
      if (f && "close" in f) (f as ImageBitmap).close();
    });
    bmp.current.clear();
    keys.current = [];
    painted.current = false;
    setLoaded(0);
    setFirstPaint(false);

    const order = subdivide(sampled.length);
    let done = 0;
    let cursor = 0;

    const decode = async (slot: number) => {
      const idx = sampled[slot];
      try {
        const res = await fetch(src(idx), { cache: "force-cache" });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();

        let img: ImageBitmap | HTMLImageElement;
        if ("createImageBitmap" in window) {
          try {
            img = await createImageBitmap(blob, {
              resizeWidth: decodeW,
              resizeHeight: decodeH,
              resizeQuality: "high",
            });
          } catch {
            // Safari has historically rejected or ignored resize options.
            img = await createImageBitmap(blob);
          }
        } else {
          const url = URL.createObjectURL(blob);
          img = await new Promise<HTMLImageElement>((ok, no) => {
            const im = new Image();
            im.onload = () => ok(im);
            im.onerror = no;
            im.src = url;
          });
        }

        if (dead) {
          if ("close" in img) (img as ImageBitmap).close();
          return;
        }
        bmp.current.set(idx, img);
        insertSorted(keys.current, idx);
        if (!painted.current) {
          painted.current = true;
          setFirstPaint(true);
          setPhase("ok");
        }
      } catch {
        // A dropped frame is survivable - nearest-key lookup covers the gap.
      }
      done++;
      setLoaded(done / order.length);

      // Every frame attempted and none of them decoded: the manifest and the
      // files disagree. Fail over to the poster instead of reporting 100%.
      if (done === order.length && !painted.current) setPhase("none");
    };

    // Small pool: six in flight keeps the connection busy without starving
    // the rest of the page during first paint.
    const POOL = 6;
    const workers = Array.from({ length: POOL }, async () => {
      while (!dead && cursor < order.length) {
        const slot = order[cursor++];
        await decode(slot);
      }
    });
    void Promise.all(workers);

    return () => {
      dead = true;
      bmp.current.forEach((f) => {
        if (f && "close" in f) (f as ImageBitmap).close();
      });
      bmp.current.clear();
      keys.current = [];
    };
  }, [source]);

  /* ---------------------------------------------------------------- fit -- */

  const fit = useRef({ w: 0, h: 0 });

  const resize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    fit.current = { w: c.width, h: c.height };
  }, []);

  /* -------------------------------------------------------------- scrub -- */

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || !source) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);

    const io = new IntersectionObserver(
      ([e]) => {
        onScreen.current = e.isIntersecting;
      },
      { rootMargin: "15% 0px" },
    );
    io.observe(wrap);

    const readScroll = () => {
      const r = wrap.getBoundingClientRect();
      const total = wrap.offsetHeight - window.innerHeight;
      target.current = total > 0 ? clamp01(-r.top / total) : 0;
    };
    readScroll();
    current.current = target.current;
    window.addEventListener("scroll", readScroll, { passive: true });

    let lastGeom = "";
    let lastKey = -1;
    let lastHeat = -1;

    const tick = () => {
      raf.current = requestAnimationFrame(tick);
      if (!onScreen.current) return;

      // Damped follow. The lag is the point: it turns a jittery wheel or a
      // trackpad's stepped deltas into continuous motion.
      const delta = target.current - current.current;
      current.current += reduced ? delta : delta * damping;
      if (Math.abs(delta) < 0.00008) current.current = target.current;

      const p = current.current;
      cb.current?.(p);

      // Written as a custom property rather than through React: the blades and
      // the focal blur need this every frame, and re-rendering the whole hero
      // sixty times a second to move two divs is not a trade worth making.
      const heat = reduced ? 0 : heatAt(p);
      if (Math.abs(heat - lastHeat) > 0.004) {
        lastHeat = heat;
        stageRef.current?.style.setProperty("--heat", heat.toFixed(3));
      }

      const n = source.frameCount;
      // Fractional, not rounded — the blend below needs the position between
      // frames, and rounding here is what threw that information away.
      const want = p * (n - 1);
      const [ka, kb, t] = bracket(keys.current, want);
      if (ka < 0) return;

      const imgA = bmp.current.get(ka);
      if (!imgA) return;
      const imgB = kb !== ka ? bmp.current.get(kb) : undefined;

      const crop = reduced ? { x: 0.5, y: 0.44, zoom: 1 } : cropAt(p);

      const cw = fit.current.w;
      const ch = fit.current.h;
      const sw = source.width;
      const sh = source.height;

      const cover = Math.max(cw / sw, ch / sh) * crop.zoom;
      const dw = sw * cover;
      const dh = sh * cover;

      // Anchors are 0-1 across the frame, so a portrait viewport crops toward
      // whichever part of the render the plate is about instead of always
      // centring and letting the subject sit behind the headline.
      const dx = (cw - dw) * crop.x;
      const dy = (ch - dh) * crop.y;

      // Quantise the blend to 1/24 so a still scrubber doesn't repaint forever
      // on floating-point noise, but keep enough steps that it reads continuous.
      const tq = Math.round(t * 24) / 24;
      const geom = `${ka}|${kb}|${tq}|${dx.toFixed(1)}|${dy.toFixed(1)}|${dw.toFixed(1)}`;
      if (geom === lastGeom) return;
      lastGeom = geom;

      if (ka !== lastKey) {
        lastKey = ka;
        fcb.current?.(ka, n);
      }

      ctx.fillStyle = "#08080a";
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalAlpha = 1;
      ctx.drawImage(imgA as CanvasImageSource, dx, dy, dw, dh);
      if (imgB && tq > 0) {
        ctx.globalAlpha = tq;
        ctx.drawImage(imgB as CanvasImageSource, dx, dy, dw, dh);
        ctx.globalAlpha = 1;
      }
    };
    raf.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("scroll", readScroll);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      io.disconnect();
    };
  }, [source, damping, resize]);

  const len = narrow && mobileScrollLength ? mobileScrollLength : scrollLength;

  return (
    <div
      ref={wrapRef}
      className="seq"
      /**
       * Height in dvh, not svh.
       *
       * The sticky stage is one viewport tall and the track is `len` of them.
       * If the track is measured in svh (toolbar showing) while the stage
       * resolves to the larger dvh once the toolbar retracts, the last stage
       * height doesn't fit inside the last unit of track — and the difference
       * shows up as a band of empty page between the hero and the ticker. Both
       * now use the same unit, so the pin releases exactly at the seam.
       */
      style={{ height: `${len * 100}dvh` }}
    >
      <div ref={stageRef} className={`seq__stage${phase === "none" ? " is-poster" : ""}`}>
        <canvas ref={canvasRef} className="seq__canvas" aria-hidden="true" />

        {/**
          * Poster. Shown only when there is no sequence to scrub.
          *
          * It is a designed state, not a placeholder: a slow aurora over the
          * brand black, driven by the same scroll progress the frames would
          * have used, so the hero still has motion and the copy still has
          * something to sit on. The page should never look broken because an
          * asset directory is empty.
          */}
        {phase === "none" && (
          <div className="poster" aria-hidden="true">
            <i className="poster__a" />
            <i className="poster__b" />
            <span className="poster__grid" />
          </div>
        )}

        <div className="seq__grain" aria-hidden="true" />
        {children}

        {/* Boot readout only while there is genuinely something in flight. */}
        {phase === "pending" && !firstPaint && (
          <div className="seq__boot">
            <span className="mono">Loading sequence</span>
            <span className="mono seq__bootN">
              {String(Math.round(loaded * 100)).padStart(3, "0")}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
