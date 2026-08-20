import { sparkPath } from "@/lib/market";

/**
 * Robinhood's signature move: one big line for the whole portfolio, not per
 * holding. Built server-side as SVG from the weighted sum of each position's
 * daily series plus cash — no charting library, no client JS.
 */
export default function PortfolioChart({
  series,
  up,
}: {
  series: number[];
  up: boolean;
}) {
  if (series.length < 3) return null;

  const w = 1000;
  const h = 168;
  const d = sparkPath(series, w, h, 6);
  const stroke = up ? "var(--up)" : "var(--down)";
  const first = series[0];
  const last = series[series.length - 1];

  return (
    <div className="pchart">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Portfolio value over ${series.length} days, ${up ? "up" : "down"}`}
      >
        <defs>
          <linearGradient id="pfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L${w},${h} L0,${h} Z`} fill="url(#pfill)" />
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="pchart__axis mono">
        <span>{series.length} sessions</span>
        <span>
          {first > 0
            ? `${last >= first ? "+" : ""}${(((last - first) / first) * 100).toFixed(2)}% period`
            : ""}
        </span>
      </div>
    </div>
  );
}
