import { sparkPath } from "@/lib/market";

/** Server-rendered SVG. No client JS, no charting library. */
export default function Sparkline({
  series, up, w = 108, h = 30,
}: {
  series: number[];
  up: boolean;
  w?: number;
  h?: number;
}) {
  if (series.length < 2) {
    return <div className="spark spark--empty" aria-hidden="true" />;
  }
  const d = sparkPath(series, w, h);
  const stroke = up ? "var(--up)" : "var(--down)";
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={`${series.length}-day trend, ${up ? "up" : "down"}`}
      preserveAspectRatio="none"
    >
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={stroke} opacity="0.10" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
