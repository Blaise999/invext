"use client";

import { useMemo, useRef, useState } from "react";

/**
 * The price chart on a stock page.
 *
 * Robinhood's contribution to charting was making the headline number follow
 * your finger — you read the value at the point you're touching, not a static
 * figure with a tooltip floating somewhere else. That's copied here, and it's
 * the reason the parent passes `onScrub` rather than owning the number itself.
 *
 * Two things that are NOT copied:
 *  - The line does not animate in on every range switch. A 400ms draw is
 *    charming once and an obstruction the fifth time you change range.
 *  - The colour is set by the return over the SELECTED range, not the day.
 *    A stock down 2% today but up 40% over the year is green on 1Y and red on
 *    1D, because that's what those two questions actually answer.
 *
 * Provider data is daily closes, so 1D isn't offered — an intraday range
 * drawn from one daily bar would be a straight line pretending to be a chart.
 * Wire an intraday feed and add it here; nothing else needs to change.
 */

const RANGES = [
  { id: "1W", days: 5 },
  { id: "1M", days: 22 },
  { id: "3M", days: 66 },
  { id: "6M", days: 130 },
  { id: "1Y", days: 260 },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(2)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(2)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(2)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

/** Right-angle staircase: hold, then jump. */
function stepPath(pts: [number, number][]) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L${pts[i][0].toFixed(2)},${pts[i - 1][1].toFixed(2)}`;
    d += ` L${pts[i][0].toFixed(2)},${pts[i][1].toFixed(2)}`;
  }
  return d;
}

export default function StockChart({
  series,
  onScrub,
  stepped = false,
}: {
  series: number[];
  /** null when the finger lifts — the parent goes back to the live price. */
  onScrub?: (v: { price: number; changeAbs: number; changePct: number } | null) => void;
  /**
   * Draw right-angle steps instead of a curve. Used for private valuation
   * marks, where the value genuinely held flat between two dated events —
   * smoothing between them would draw daily prices that never existed.
   */
  stepped?: boolean;
}) {
  const [range, setRange] = useState<RangeId>(stepped ? "1Y" : "3M");
  const [idx, setIdx] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);

  const W = 1000;
  const H = 220;
  const PAD = 14;

  const view = useMemo(() => {
    const cfg = RANGES.find((r) => r.id === range)!;
    return series.slice(-Math.max(Math.min(series.length, cfg.days), 2));
  }, [series, range]);

  const { line, area, pts, lo, hi } = useMemo(() => {
    if (view.length < 2)
      return { line: "", area: "", pts: [] as [number, number][], lo: 0, hi: 0 };
    const min = Math.min(...view);
    const max = Math.max(...view);
    const span = max - min || 1;
    const stepX = W / (view.length - 1);
    const p: [number, number][] = view.map((v, i) => [
      i * stepX,
      PAD + (H - PAD * 2) * (1 - (v - min) / span),
    ]);
    const l = stepped ? stepPath(p) : smoothPath(p);
    return { line: l, area: `${l} L${W},${H} L0,${H} Z`, pts: p, lo: min, hi: max };
  }, [view, stepped]);

  const first = view[0] ?? 0;
  const last = view[view.length - 1] ?? 0;
  const up = last >= first;
  const stroke = up ? "var(--up)" : "var(--down)";

  const report = (i: number | null) => {
    setIdx(i);
    if (!onScrub) return;
    if (i == null) return onScrub(null);
    const v = view[i];
    onScrub({
      price: v,
      changeAbs: v - first,
      changePct: first ? ((v - first) / first) * 100 : 0,
    });
  };

  const track = (clientX: number) => {
    const el = ref.current;
    if (!el || view.length < 2) return;
    const box = el.getBoundingClientRect();
    const r = Math.min(Math.max((clientX - box.left) / box.width, 0), 1);
    report(Math.round(r * (view.length - 1)));
  };

  const cursor = idx != null ? pts[idx] : null;

  return (
    <div className="chart">
      <svg
        ref={ref}
        className="chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Price history, ${range}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          track(e.clientX);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && track(e.clientX)}
        onPointerUp={() => report(null)}
        onPointerCancel={() => report(null)}
        onPointerLeave={() => report(null)}
        style={{ touchAction: "pan-y" }}
      >
        <defs>
          <linearGradient id="fillg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {line && <path d={area} fill="url(#fillg)" />}
        {line && (
          <path
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {cursor && (
          <>
            <line
              x1={cursor[0]} y1="0" x2={cursor[0]} y2={H}
              stroke="var(--dim)" strokeWidth="1"
              strokeDasharray="3 4" vectorEffect="non-scaling-stroke"
            />
            <circle cx={cursor[0]} cy={cursor[1]} r="4.5" fill={stroke} />
          </>
        )}
      </svg>

      {view.length > 1 && (
        <div className="chart__bounds mono">
          <span>lo {lo.toFixed(2)}</span>
          <span>hi {hi.toFixed(2)}</span>
        </div>
      )}

      <div className="ranges" role="tablist" aria-label="Chart range">
        {RANGES.map((r) => (
          <button
            key={r.id}
            role="tab"
            aria-selected={range === r.id}
            className={range === r.id ? "ranges__b is-on" : "ranges__b"}
            onClick={() => { setRange(r.id); report(null); }}
          >
            {r.id}
          </button>
        ))}
      </div>
    </div>
  );
}
