"use client";

import { useMemo, useRef, useState, useCallback, useEffect } from "react";

/**
 * The chart panel: value, delta, timeframe tabs, scrubbable line.
 *
 * Used in two places with the same component so they can't drift: the whole
 * portfolio on Home, and one instrument on a stock page (`unit="share"`).
 *
 * Things that were broken and are fixed here:
 *
 *  - A FLAT SERIES DREW ALONG THE BOTTOM EDGE. When every value is identical
 *    the span is zero; the old code divided by a fudged 1 and every point
 *    landed at y = H. On a cash-only account that produced a line pinned to
 *    the floor of a tall empty box — which reads as a crash, not as "nothing
 *    has moved". Flat now draws through the middle, and the vertical scale
 *    labels are suppressed because there is no range to label.
 *  - THE PANEL DISAPPEARED WITH NO SERIES. It now always renders: worst case
 *    is a flat line at the current value with the ranges disabled.
 *  - NO 1D. Passing `intraday` enables it, and it's selected by default when
 *    present, which is the range a brokerage opens on.
 *
 * Deliberately NOT copied from Robinhood: flashing tickers and count-up
 * animations on the balance. Those are engagement mechanics that nudge
 * impulsive trading.
 */

const RANGES = [
  { id: "1D", days: 0 },
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

/** Right-angle staircase — for private marks, which step rather than drift. */
function stepPath(pts: [number, number][]) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L${pts[i][0].toFixed(2)},${pts[i - 1][1].toFixed(2)}`;
    d += ` L${pts[i][0].toFixed(2)},${pts[i][1].toFixed(2)}`;
  }
  return d;
}

export default function PortfolioPanel({
  series,
  total,
  cash,
  hasQuotes,
  unit = "portfolio",
  intraday = [],
  stepped = false,
  derived = false,
  label,
}: {
  series: number[];
  total: number;
  cash: number;
  hasQuotes: boolean;
  unit?: "portfolio" | "share";
  /** Minute bars for the 1D range. Empty hides the 1D tab. */
  intraday?: number[];
  /** Step instead of curve — private valuation marks. */
  stepped?: boolean;
  /** Series shape was derived from the price, not served by a provider. */
  derived?: boolean;
  /** Overrides the small caption above the figure. */
  label?: string;
}) {
  const hasIntraday = intraday.length > 2;
  const [range, setRange] = useState<RangeId>(hasIntraday ? "1D" : "1M");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 1000;
  const H = 190;
  const PAD = 16;

  // If intraday arrives after first paint (nav between stocks) reset the range.
  useEffect(() => {
    setRange((r) => (r === "1D" && !hasIntraday ? "1M" : r));
  }, [hasIntraday]);

  /**
   * Always a usable series. Pure cash, a cold quote cache, a brand-new
   * account — all of them land here as a flat line at the current value
   * rather than as an empty box.
   */
  const safeSeries = useMemo(() => {
    const clean = series.filter((n) => Number.isFinite(n));
    if (clean.length >= 2) return clean;
    return Array(30).fill(Number.isFinite(total) ? total : 0);
  }, [series, total]);

  const flatOnly = series.filter((n) => Number.isFinite(n)).length < 2;

  const view = useMemo(() => {
    if (range === "1D" && hasIntraday) return intraday;
    const cfg = RANGES.find((r) => r.id === range)!;
    const n = Math.min(
      safeSeries.length,
      cfg.days === Infinity || cfg.days === 0 ? safeSeries.length : cfg.days,
    );
    return safeSeries.slice(-Math.max(n, 2));
  }, [safeSeries, range, intraday, hasIntraday]);

  const { d, area, pts, min, max, flat } = useMemo(() => {
    const empty = {
      d: "",
      area: "",
      pts: [] as [number, number][],
      min: 0,
      max: 0,
      flat: true,
    };
    if (view.length < 2) return empty;

    const lo = Math.min(...view);
    const hi = Math.max(...view);
    const span = hi - lo;
    const isFlat = span === 0;
    const stepX = W / (view.length - 1);
    const mid = PAD + (H - PAD * 2) / 2;

    const p: [number, number][] = view.map((v, i) => [
      i * stepX,
      // A flat line belongs through the middle, not welded to the floor.
      isFlat ? mid : PAD + (H - PAD * 2) * (1 - (v - lo) / span),
    ]);

    const line = stepped ? stepPath(p) : smoothPath(p);
    return {
      d: line,
      area: `${line} L${W},${H} L0,${H} Z`,
      pts: p,
      min: lo,
      max: hi,
      flat: isFlat,
    };
  }, [view, stepped]);

  const first = view[0] ?? total;
  const last = view[view.length - 1] ?? total;
  const shown = hover != null ? view[hover] : last;
  const deltaAbs = shown - first;
  const deltaPct = first > 0 ? (deltaAbs / first) * 100 : 0;
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
  const stroke = up ? "var(--up)" : "var(--down)";
  const gradId = unit === "share" ? "ppfill-share" : "ppfill-pf";

  const ranges = hasIntraday ? RANGES : RANGES.filter((r) => r.id !== "1D");

  return (
    <div className="pp">
      {label && <span className="pp__cap">{label}</span>}

      <div className="pp__value">
        <span className="pp__big">{usd(shown)}</span>
        <span className={up ? "pp__delta up" : "pp__delta down"}>
          {up ? "▲" : "▼"} {usd(Math.abs(deltaAbs))}
          <span className="pp__pct">
            {up ? "+" : "−"}
            {Math.abs(deltaPct).toFixed(2)}%
          </span>
          <span className="pp__range mono">
            {hover != null
              ? range === "1D"
                ? `point ${hover + 1}/${view.length}`
                : `session ${hover + 1}/${view.length}`
              : range}
          </span>
        </span>
      </div>

      <div className="pp__chart">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${unit === "share" ? "Price" : "Portfolio value"}, ${range}, ${up ? "up" : "down"} ${Math.abs(deltaPct).toFixed(2)} percent`}
          onMouseMove={(e) => onMove(e.clientX)}
          onMouseLeave={() => setHover(null)}
          onTouchStart={(e) => onMove(e.touches[0].clientX)}
          onTouchMove={(e) => onMove(e.touches[0].clientX)}
          onTouchEnd={() => setHover(null)}
          style={{ touchAction: "pan-y" }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* opening level, so the fill has a reference and not just a shape */}
          {pts.length > 1 && !flat && (
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

          {d && <path d={area} fill={`url(#${gradId})`} />}
          {d && (
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}

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
                stroke={stroke}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>

        {/* No range means nothing to label — an axis reading $45,000 twice is
            worse than no axis. */}
        {!flat && (
          <div className="pp__scale mono" aria-hidden="true">
            <span>{usd(max, 0)}</span>
            <span>{usd(min, 0)}</span>
          </div>
        )}
      </div>

      <div className="pp__ranges" role="tablist" aria-label="Chart range">
        {ranges.map((r) => (
          <button
            key={r.id}
            role="tab"
            aria-selected={range === r.id}
            className={range === r.id ? "pp__r is-on mono" : "pp__r mono"}
            disabled={flatOnly && r.id !== "1D"}
            onClick={() => {
              setRange(r.id);
              setHover(null);
            }}
          >
            {r.id}
          </button>
        ))}
        {unit === "portfolio" && (
          <span className="pp__cash mono">Cash {usd(cash, 0)}</span>
        )}
      </div>

      {!hasQuotes && (
        <p className="mono pp__note">
          Market data unavailable — positions valued at cost.
        </p>
      )}
      {hasQuotes && derived && (
        <p className="mono pp__note">
          Price is live. Historical shape is illustrative — this provider
          doesn&rsquo;t serve daily bars. Set ALPACA_KEY_ID for real history.
        </p>
      )}
      {hasQuotes && !derived && flatOnly && (
        <p className="mono pp__note">
          Nothing held yet — the line tracks cash until your first position.
        </p>
      )}
    </div>
  );
}
