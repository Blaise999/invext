"use client";

import { useMemo, useRef, useState, useCallback } from "react";

/**
 * The portfolio panel: value, day change, timeframe tabs, scrubbable chart.
 *
 * Research-driven decisions:
 *  - Timeframe selectors sit directly under the chart, never in a menu.
 *    Switching range is a primary action, not a setting.
 *  - Targets are 44px minimum. A published Robinhood audit found four of seven
 *    testers mis-tapping range buttons that were smaller than that.
 *  - Scrubbing updates the headline value and delta, so the number you read is
 *    always the number under your finger.
 *
 * Deliberately NOT copied from Robinhood: flashing tickers and count-up
 * animations on the balance. Those are engagement mechanics that nudge
 * impulsive trading, and they don't belong on a page whose whole argument is
 * that it tells you the truth.
 */

const RANGES = [
  { id: "1W", days: 5 },
  { id: "1M", days: 22 },
  { id: "3M", days: 66 },
  { id: "1Y", days: 260 },
  { id: "ALL", days: Infinity },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

const usd = (n: number, dp = 2) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });

/** Catmull-Rom → cubic bezier. A polyline reads as a chart; a curve reads as a product. */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

export default function PortfolioPanel({
  series,
  total,
  cash,
  hasQuotes,
  unit = "portfolio",
}: {
  series: number[];
  total: number;
  cash: number;
  hasQuotes: boolean;
  unit?: "portfolio" | "share";
}) {
  const [range, setRange] = useState<RangeId>("1M");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 1000;
  const H = 190;
  const PAD = 10;

  const view = useMemo(() => {
    const cfg = RANGES.find((r) => r.id === range)!;
    const n = Math.min(series.length, cfg.days === Infinity ? series.length : cfg.days);
    return series.slice(-Math.max(n, 2));
  }, [series, range]);

  const { d, area, pts, min, max } = useMemo(() => {
    if (view.length < 2) return { d: "", area: "", pts: [] as [number, number][], min: 0, max: 0 };
    const lo = Math.min(...view);
    const hi = Math.max(...view);
    const span = hi - lo || 1;
    const stepX = W / (view.length - 1);
    const p: [number, number][] = view.map((v, i) => [
      i * stepX,
      PAD + (H - PAD * 2) * (1 - (v - lo) / span),
    ]);
    const line = smoothPath(p);
    return { d: line, area: `${line} L${W},${H} L0,${H} Z`, pts: p, min: lo, max: hi };
  }, [view]);

  const first = view[0] ?? 0;
  const last = view[view.length - 1] ?? 0;
  const shown = hover != null ? view[hover] : last;
  const base = hover != null ? first : first;
  const deltaAbs = shown - base;
  const deltaPct = base > 0 ? (deltaAbs / base) * 100 : 0;
  const up = deltaAbs >= 0;

  const onMove = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg || view.length < 2) return;
      const r = svg.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      setHover(Math.round(ratio * (view.length - 1)));
    },
    [view.length],
  );

  const cursor = hover != null ? pts[hover] : null;

  return (
    <div className="pp">
      <div className="pp__value">
        <span className="pp__big">{usd(shown)}</span>
        <span className={up ? "pp__delta up" : "pp__delta down"}>
          {up ? "▲" : "▼"} {usd(Math.abs(deltaAbs))}
          <span className="pp__pct">
            {up ? "+" : "−"}
            {Math.abs(deltaPct).toFixed(2)}%
          </span>
          <span className="pp__range mono">
            {hover != null ? `session ${hover + 1}/${view.length}` : range}
          </span>
        </span>
      </div>

      <div className="pp__chart">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Portfolio value, ${range}, ${up ? "up" : "down"} ${deltaPct.toFixed(2)} percent`}
          onMouseMove={(e) => onMove(e.clientX)}
          onMouseLeave={() => setHover(null)}
          onTouchStart={(e) => onMove(e.touches[0].clientX)}
          onTouchMove={(e) => {
            e.preventDefault();
            onMove(e.touches[0].clientX);
          }}
          onTouchEnd={() => setHover(null)}
        >
          <defs>
            <linearGradient id="ppfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={up ? "var(--up)" : "var(--down)"} stopOpacity="0.26" />
              <stop offset="100%" stopColor={up ? "var(--up)" : "var(--down)"} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* opening level, so the fill has a reference not just a shape */}
          {pts.length > 1 && (
            <line
              x1="0"
              x2={W}
              y1={pts[0][1]}
              y2={pts[0][1]}
              stroke="var(--line)"
              strokeWidth="1"
              strokeDasharray="3 5"
              vectorEffect="non-scaling-stroke"
            />
          )}

          <path d={area} fill="url(#ppfill)" />
          <path
            d={d}
            fill="none"
            stroke={up ? "var(--up)" : "var(--down)"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {cursor && (
            <>
              <line
                x1={cursor[0]}
                x2={cursor[0]}
                y1="0"
                y2={H}
                stroke="var(--dim)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={cursor[0]}
                cy={cursor[1]}
                r="4"
                fill="var(--bg)"
                stroke={up ? "var(--up)" : "var(--down)"}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>

        <div className="pp__scale mono" aria-hidden="true">
          <span>{usd(max, 0)}</span>
          <span>{usd(min, 0)}</span>
        </div>
      </div>

      <div className="pp__ranges" role="tablist" aria-label="Chart range">
        {RANGES.map((r) => {
          const enough = series.length > 2;
          return (
            <button
              key={r.id}
              role="tab"
              aria-selected={range === r.id}
              className={range === r.id ? "pp__r is-on mono" : "pp__r mono"}
              disabled={!enough}
              onClick={() => {
                setRange(r.id);
                setHover(null);
              }}
            >
              {r.id}
            </button>
          );
        })}
        {unit === "portfolio" && (
          <span className="pp__cash mono">Cash {usd(cash, 0)}</span>
        )}
      </div>

      {!hasQuotes && (
        <p className="mono pp__note">
          Market data unavailable — positions valued at cost.
        </p>
      )}
    </div>
  );
}
