"use client";

import { useState } from "react";

const usd = (n: number, dp = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: dp, maximumFractionDigits: dp });

/**
 * Order ticket. Converts dollars <-> shares against the live last price, the
 * way a fractional-share app does.
 *
 * It does NOT execute. There is no broker-dealer behind this build, so submit
 * calls /api/orders which returns 501 with an explanation. Preview maths is
 * real; the fill is not, and the UI says so rather than implying otherwise.
 */
export default function OrderTicket({
  symbol, price, held,
}: {
  symbol: string;
  price: number | null;
  held: number;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [mode, setMode] = useState<"dollars" | "shares">("dollars");
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amount = parseFloat(raw) || 0;
  const shares = price ? (mode === "dollars" ? amount / price : amount) : 0;
  const cost = price ? (mode === "dollars" ? amount : amount * price) : 0;
  const valid = price != null && amount > 0 && (side === "buy" || shares <= held);

  async function submit() {
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, side, mode, amount, price }),
    });
    const data = await res.json();
    setResult(data.error ?? data.message ?? "No response");
    setBusy(false);
  }

  return (
    <div className="tick">
      <div className="tick__side">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            className={side === s ? `tick__sb is-on is-${s}` : "tick__sb"}
            onClick={() => { setSide(s); setResult(null); }}
          >
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      <div className="tick__row">
        <span className="mono tick__k">Order in</span>
        <div className="tick__seg">
          {(["dollars", "shares"] as const).map((m) => (
            <button
              key={m}
              className={mode === m ? "tick__sg is-on mono" : "tick__sg mono"}
              onClick={() => { setMode(m); setRaw(""); }}
            >
              {m === "dollars" ? "$" : "Shares"}
            </button>
          ))}
        </div>
      </div>

      <label className="tick__field">
        <span className="mono tick__k">{mode === "dollars" ? "Amount" : "Quantity"}</span>
        <div className="tick__input">
          {mode === "dollars" && <span className="tick__pre">$</span>}
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={raw}
            onChange={(e) => { setRaw(e.target.value.replace(/[^\d.]/g, "")); setResult(null); }}
          />
        </div>
      </label>

      <dl className="tick__calc">
        <div><dt>Last price</dt><dd className="mono">{price != null ? usd(price) : "—"}</dd></div>
        <div>
          <dt>{mode === "dollars" ? "Est. shares" : "Est. cost"}</dt>
          <dd className="mono">
            {price == null ? "—" : mode === "dollars" ? shares.toFixed(6) : usd(cost)}
          </dd>
        </div>
        {side === "sell" && (
          <div><dt>You hold</dt><dd className="mono">{held} sh</dd></div>
        )}
      </dl>

      <button
        className={side === "buy" ? "tick__go is-buy" : "tick__go is-sell"}
        disabled={!valid || busy}
        onClick={submit}
      >
        {busy ? "Checking…" : `Review ${side} ${symbol}`}
      </button>

      <p className="mono tick__note">
        {result ??
          "Estimates use the last delayed quote. Execution requires a broker-dealer — none is connected to this build."}
      </p>
    </div>
  );
}
