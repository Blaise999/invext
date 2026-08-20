"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Order ticket. Toggles between share count and dollar amount — Robinhood's
 * pattern, and the one that stops people fat-fingering a quantity.
 *
 * Submits an *intent* to /api/orders. Nothing executes until a broker adapter
 * is configured: see that route. Placing real orders for customers requires a
 * broker-dealer relationship, so the UI is honest about what it is.
 */
export default function TradeTicket({
  symbol, price, buyingPower, holdingQty, demo,
}: {
  symbol: string;
  price: number | null;
  buyingPower: number;
  holdingQty: number;
  demo: boolean;
}) {
  const router = useRouter();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [mode, setMode] = useState<"shares" | "dollars">("shares");
  const [raw, setRaw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, side, shares: shares.toFixed(6), limit: null }),
    });
    const data = await res.json();
    setMsg(data.error ?? data.message ?? "Submitted");
    setBusy(false);
    if (data.ok) router.refresh();
  }

  return (
    <div className="tkt">
      <div className="tkt__side">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            className={side === s ? `tkt__sb is-on is-${s}` : "tkt__sb"}
            onClick={() => { setSide(s); setMsg(null); }}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="tkt__mode">
        {(["shares", "dollars"] as const).map((m) => (
          <button
            key={m}
            className={mode === m ? "tkt__mb is-on mono" : "tkt__mb mono"}
            onClick={() => { setMode(m); setRaw(""); }}
          >
            {m === "shares" ? "Shares" : "Amount"}
          </button>
        ))}
      </div>

      <label className="tkt__field">
        <span className="mono tkt__lab">
          {mode === "shares" ? "Quantity" : "Dollar amount"}
        </span>
        <div className="tkt__input">
          {mode === "dollars" && <span className="tkt__pre">$</span>}
          <input
            inputMode="decimal"
            placeholder="0"
            value={raw}
            onChange={(e) => setRaw(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </div>
      </label>

      <dl className="tkt__calc">
        <div>
          <dt>Market price</dt>
          <dd className="mono">{price != null ? usd(price) : "—"}</dd>
        </div>
        <div>
          <dt>{mode === "shares" ? "Estimated cost" : "Estimated shares"}</dt>
          <dd className="mono">
            {mode === "shares" ? usd(notional) : shares > 0 ? shares.toFixed(4) : "—"}
          </dd>
        </div>
        <div>
          <dt>{side === "buy" ? "Buying power" : "Shares held"}</dt>
          <dd className="mono">
            {side === "buy" ? usd(buyingPower) : holdingQty}
          </dd>
        </div>
      </dl>

      {overBuy && <p className="tkt__err">Exceeds buying power by {usd(notional - buyingPower)}</p>}
      {overSell && <p className="tkt__err">You hold {holdingQty} shares</p>}

      <button
        className={side === "buy" ? "tkt__go is-buy" : "tkt__go is-sell"}
        disabled={invalid || busy}
        onClick={submit}
      >
        {busy ? "…" : `Review ${side} ${symbol}`}
      </button>

      {msg && <p className="mono tkt__msg">{msg}</p>}

      <p className="mono tkt__fine">
        {demo
          ? "Demo account — no order is placed."
          : "Market order, executed at the next available price. Not a live venue until a broker adapter is connected."}
      </p>
    </div>
  );
}
