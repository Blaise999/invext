"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SeqConfig {
  dir: string;
  stem: string;
  ext: string;
  pad: number;
  first: number;
  frameCount?: number;
}

export interface Crop {
  x: number;
  y: number;
  zoom: number;
}

interface Props {
  desktop: SeqConfig;
  mobile?: SeqConfig;
  breakpoint?: number;
  scrollLength?: number;
  mobileScrollLength?: number;
  damping?: number;
  crop?: (p: number, narrow: boolean) => Crop;
  heat?: (p: number) => number;
  onProgress?: (p: number) => void;
  onFrame?: (index: number, total: number) => void;
  children?: React.ReactNode;
}

const frameUrl = (c: SeqConfig, n: number) =>
  `/${c.dir}/${c.stem}${String(c.first + n).padStart(c.pad, "0")}.${c.ext}`;

const countCache = new Map<string, number>();

async function exists(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal, cache: "force-cache" });
    return res.ok;
  } catch {
    return false;
  }
}

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

  let lo = Math.floor(hi / 2);
  hi = Math.min(hi, ceiling + 1);

  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (await exists(frameUrl(cfg, mid), signal)) lo = mid;
    else hi = mid;
  }

  const count = lo + 1;
  countCache.set(key, count);
  return count;
}

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
  scrollLength = 3.2,
  mobileScrollLength = 2.4,
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

  useEffect(() => {
    if (narrow === null) return;
    const ac = new AbortController();
    let dead = false;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const longCap = narrow ? 960 : 1280;
    const ceilingBytes = (narrow ? 120 : 240) * 1024 * 1024;

    const plan = (w: number, h: number) => {
      const cover = Math.max(
        (window.innerWidth * dpr) / w,
        (window.innerHeight * dpr) / h,
      );
      const scale = Math.min(cover * 1.18, 1, longCap / Math.max(w, h));
      const dw = Math.max(1, Math.round(w * scale));
      const dh = Math.max(1, Math.round((dw / w) * h));
      return {
        dw,
        dh,
        take: Math.max(16, Math.floor(ceilingBytes / (dw * dh * 4))),
      };
    };

    bitmaps.current.forEach((f) => {
      if (f && "close" in f) (f as ImageBitmap).close();
    });
    bitmaps.current = [];
    ready.current = [];
    slots.current = 0;
    setLoaded(0);
    setPainted(false);
    setFault(null);

    (async () => {
      let dw = 0,
        dh = 0,
        n = 0,
        total = 0;

      try {
        const [count, res] = await Promise.all([
          cfg.frameCount
            ? Promise.resolve(cfg.frameCount)
            : probeCount(cfg, ac.signal),
          fetch(frameUrl(cfg, 0), { signal: ac.signal }),
        ]);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (count < 1) throw new Error("no frames found");

        const type = res.headers.get("content-type") || "";
        if (!type.startsWith("image/"))
          throw new Error(`served ${type || "no content-type"}`);

        const probe = await createImageBitmap(await res.blob());
        const sw = probe.width,
          sh = probe.height;
        probe.close();

        source.current = { w: sw, h: sh };
        const p = plan(sw, sh);
        dw = p.dw;
        dh = p.dh;
        total = count;
        n = Math.min(count, p.take);
      } catch (err) {
        if (dead || ac.signal.aborted) return;
        const why = err instanceof Error ? err.message : String(err);
        setFault(`${frameUrl(cfg, 0)} — ${why}`);
        return;
      }
      if (dead) return;

      slots.current = n;
      bitmaps.current = new Array(n);
      const frameAt = (slot: number) =>
        Math.round((slot * (total - 1)) / Math.max(1, n - 1));

      for (const slot of subdivide(n)) {
        if (dead) return;
        if (bitmaps.current[slot]) continue;
        try {
          const res = await fetch(frameUrl(cfg, frameAt(slot)), {
            signal: ac.signal,
          });
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          if (!blob.type.startsWith("image/")) throw new Error("not an image");

          let img: ImageBitmap | HTMLImageElement;
          try {
            img = await createImageBitmap(blob, {
              resizeWidth: dw,
              resizeHeight: dh,
              resizeQuality: "high",
            });
          } catch {
            img = await createImageBitmap(blob);
          }
          if (dead) {
            if ("close" in img) (img as ImageBitmap).close();
            return;
          }

          bitmaps.current[slot] = img;
          ready.current.push(slot);
          ready.current.sort((a, b) => a - b);
          setLoaded(ready.current.length / n);
          if (ready.current.length === 1) setPainted(true);
        } catch {
          // skip missing frame
        }
      }
    })();

    return () => {
      dead = true;
      ac.abort();
      bitmaps.current.forEach((f) => {
        if (f && "close" in f) (f as ImageBitmap).close();
      });
      bitmaps.current = [];
      ready.current = [];
    };
  }, [cfg, narrow]);

  const surface = useRef({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = c.clientWidth,
      ch = c.clientHeight;
    if (!cw || !ch) return;
    const w = Math.round(cw * dpr),
      h = Math.round(ch * dpr);
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    surface.current = { w, h };
  }, []);

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

    const read = () => {
      const travel = wrap.offsetHeight - stage.offsetHeight;
      const top = wrap.getBoundingClientRect().top;
      target.current =
        travel > 0 ? Math.min(1, Math.max(0, -top / travel)) : 0;
    };
    read();
    current.current = target.current;
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);

    const nearest = (want: number) => {
      const arr = ready.current;
      if (arr.length === 0) return -1;
      let lo = 0,
        hi = arr.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] < want) lo = mid + 1;
        else hi = mid;
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
      style={{
        // INLINE height — nothing in globals.css can override this
        height: `${pin * 100}svh`,
        position: "relative",
        margin: 0,
      }}
    >
      <div
        ref={stageRef}
        className="seq__stage"
        style={{
          position: "sticky",
          top: 0,
          height: "100lvh",
          minHeight: "100svh",
          overflow: "hidden",
          background: "#08080a",
        }}
      >
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