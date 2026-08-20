"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { placeOrder } from "@/lib/orders";

/**
 * WHY THIS NO LONGER POSTS TO /api/orders
 *
 * It used to `fetch("/api/orders")`, which was a stub that returned 501 with
 * the text "Order not placed. No broker-dealer is connected to this build."
 * Every Buy in the app hit that wall — while `placeOrder` in lib/orders.ts,
 * which does the real work (re-fetches the quote server-side, checks buying
 * power, writes the position and the ledger row in one locked transaction),
 * sat there unused.
 *
 * The ticket now calls that server action directly. The client still sends
 * only an intent — symbol, side, mode, size. It never sends a price. The
 * server re-derives every number, which is the whole point.
 */

const usd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function TradeTicket({
  symbol,
  price,
  buyingPower,
  holdingQty,
}: {
  symbol: string;
  price: number | null;
  buyingPower: number;
  holdingQty: number;
  demo?: boolean; // kept for compatibility, never shown
}) {
  const router = useRouter();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [mode, setMode] = useState<"shares" | "dollars">("shares");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<"buy" | "sell" | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** What the server actually filled — not what was typed into the box. */
  const [fill, setFilled] = useState<{
    quantity: number;
    price: number;
    notional: number;
  } | null>(null);

  const n = Number(raw) || 0;

  const { shares, notional } = useMemo(() => {
    if (!price || n <= 0) return { shares: 0, notional: 0 };
    return mode === "shares"
      ? { shares: n, notional: n * price }
      : { shares: n / price, notional: n };
  }, [n, mode, price]);

  const overBuy = side === "buy" && notional > buyingPower;
  const overSell = side === "sell" && shares > holdingQty;
  const invalid = !price || shares <= 0 || overBuy || overSell;

  async function submit() {
    if (invalid || busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await placeOrder(symbol, side, mode, n);

      if (res.ok) {
        setFilled(res.filled);
        setSuccess(side);
        setRaw("");
        // Refresh straight away so cash and holdings are correct behind the
        // overlay, then clear it. The old version waited 2.2s before even
        // asking for fresh data, so dismissing early showed stale numbers.
        router.refresh();
        setTimeout(() => setSuccess(null), 2400);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Couldn't reach the order desk. Nothing was placed — try again.");
    } finally {
      setBusy(false);
    }
  }

  // Auto-clear error after a few seconds
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <div className={`tkt ${success ? "tkt--celebrate" : ""}`}>
      {/* ───── Success celebration overlay ───── */}
      {success && (
        <div className={`tkt__celebrate is-${success}`}>
          <div className="tkt__burst" />
          <div className="tkt__check">
            <svg viewBox="0 0 24 24" width="48" height="48">
              <path
                d="M5 13l4 4L19 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="tkt__celebrate-text">
            {success === "buy" ? "Bought" : "Sold"} {symbol}
          </p>
          <p className="tkt__celebrate-sub">
            {fill
              ? `${fill.quantity.toFixed(4)} sh @ ${usd(fill.price)} · ${usd(fill.notional)}`
              : mode === "shares"
                ? `${shares.toFixed(4)} shares`
                : usd(notional)}
          </p>
        </div>
      )}

      {/* ───── Side toggle ───── */}
      <div className="tkt__side">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            className={side === s ? `tkt__sb is-on is-${s}` : "tkt__sb"}
            onClick={() => {
              setSide(s);
              setError(null);
            }}
          >
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      {/* ───── Mode toggle ───── */}
      <div className="tkt__mode">
        {(["shares", "dollars"] as const).map((m) => (
          <button
            key={m}
            className={mode === m ? "tkt__mb is-on" : "tkt__mb"}
            onClick={() => {
              setMode(m);
              setRaw("");
            }}
          >
            {m === "shares" ? "Shares" : "Dollars"}
          </button>
        ))}
      </div>

      {/* ───── Input ───── */}
      <label className="tkt__field">
        <span className="tkt__lab">
          {mode === "shares" ? "Quantity" : "Amount"}
        </span>
        <div className={`tkt__input ${overBuy || overSell ? "is-bad" : ""}`}>
          {mode === "dollars" && <span className="tkt__pre">$</span>}
          <input
            inputMode="decimal"
            placeholder="0"
            value={raw}
            onChange={(e) =>
              setRaw(e.target.value.replace(/[^\d.]/g, ""))
            }
            autoComplete="off"
          />
        </div>
      </label>

      {/* ───── Live calc ───── */}
      <div className="tkt__calc">
        <div className="tkt__row">
          <span>Market price</span>
          <span className="mono">{price != null ? usd(price) : "—"}</span>
        </div>
        <div className="tkt__row">
          <span>{mode === "shares" ? "Estimated cost" : "You get"}</span>
          <span className="mono">
            {mode === "shares"
              ? usd(notional)
              : shares > 0
                ? `${shares.toFixed(4)} sh`
                : "—"}
          </span>
        </div>
        <div className="tkt__row tkt__row--strong">
          <span>{side === "buy" ? "Buying power" : "Shares held"}</span>
          <span className="mono">
            {side === "buy" ? usd(buyingPower) : holdingQty}
          </span>
        </div>
      </div>

      {/* ───── Errors ───── */}
      {overBuy && (
        <p className="tkt__err">
          Exceeds buying power by {usd(notional - buyingPower)}
        </p>
      )}
      {overSell && (
        <p className="tkt__err">You only hold {holdingQty} shares</p>
      )}
      {error && <p className="tkt__err">{error}</p>}

      {/* ───── Main button ───── */}
      <button
        className={`tkt__go is-${side} ${busy ? "is-busy" : ""}`}
        disabled={invalid || busy}
        onClick={submit}
      >
        {busy ? (
          <span className="tkt__spinner" />
        ) : (
          `${side === "buy" ? "Buy" : "Sell"} ${symbol}`
        )}
      </button>
    </div>
  );
}