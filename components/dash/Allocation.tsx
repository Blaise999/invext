import { brandOf } from "@/lib/brands";
import { usd } from "@/lib/market";

/** Stacked bar in brand colours — the bridge between a spreadsheet and an app. */
export default function Allocation({
  rows,
  total,
}: {
  rows: { symbol: string; value: number }[];
  total: number;
}) {
  if (total <= 0 || rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => b.value - a.value);

  return (
    <div className="alloc">
      <div className="alloc__bar" role="img" aria-label="Portfolio allocation">
        {sorted.map((r) => {
          const b = brandOf(r.symbol);
          const pct = (r.value / total) * 100;
          return (
            <span
              key={r.symbol}
              style={{ width: `${pct}%`, background: b.fg }}
              title={`${r.symbol} ${pct.toFixed(1)}%`}
            />
          );
        })}
      </div>
      <ul className="alloc__key">
        {sorted.map((r) => {
          const b = brandOf(r.symbol);
          const pct = (r.value / total) * 100;
          return (
            <li key={r.symbol}>
              <span className="alloc__dot" style={{ background: b.fg }} />
              <span className="mono alloc__sym">{r.symbol}</span>
              <span className="mono alloc__pct">{pct.toFixed(1)}%</span>
              <span className="mono alloc__val">{usd(r.value, 0)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
