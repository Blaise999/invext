"use client";

import { useState } from "react";

/**
 * Order ticket. Robinhood's shape — dollars-or-shares toggle, live estimate,
 * one primary action — with Wall Street disclosure underneath.
 *
 * NOT WIRED TO EXECUTION. There is no broker connected, so submitting records
 * the intent and returns an explicit "no venue" response instead of inventing
 * a filled position. See app/api/orders/route.ts for where the broker adapter
 * plugs in.
 */
export default function OrderPanel({
  symbol,
  price,
  cash,
  demo,
}: {
  symbol: string;
  price: number | null;
  cash: number;
  demo: boolean;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [mode, setMode] = useState<"shares" | "dollars">("shares");
  const [raw, setRaw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const n = parseFloat(raw) || 0;
  const shares = price ? (mode === "shares" ? n : n / price) : 0;
  const cost = price ? shares * price : 0;
  const overCash = side === "buy" && cost > cash;

  const fmt = (v: number, dp = 2) =>
    v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, side, mode, amount: n }),
      });
      const d = await res.json();
      setMsg(d.error ?? d.message ?? "Submitted");
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ticket">
      <div className="ticket__sides">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            className={side === s ? `tside is-on is-${s}` : "tside"}
            onClick={() => setSide(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="ticket__row">
        <span className="mono ticket__k">Amount in</span>
        <div className="ticket__seg">
          {(["shares", "dollars"] as const).map((m) => (
            <button
              key={m}
              className={mode === m ? "tseg is-on mono" : "tseg mono"}
              onClick={() => setMode(m)}
            >
              {m === "shares" ? "Shares" : "$"}
            </button>
          ))}
        </div>
      </div>

      <div className="ticket__input">
        {mode === "dollars" && <span className="ticket__pre mono">$</span>}
        <input
          inputMode="decimal"
          placeholder="0"
          value={raw}
          onChange={(e) => setRaw(e.target.value.replace(/[^\d.]/g, ""))}
          aria-label={`Amount in ${mode}`}
        />
        <span className="ticket__unit mono">{mode === "shares" ? symbol : "USD"}</span>
      </div>

      <dl className="ticket__calc">
        <div>
          <dt className="mono">Market price</dt>
          <dd className="mono">{price != null ? `$${fmt(price)}` : "—"}</dd>
        </div>
        <div>
          <dt className="mono">{mode === "shares" ? "Estimated cost" : "Estimated shares"}</dt>
          <dd className="mono">
            {price == null || !n
              ? "—"
              : mode === "shares"
                ? `$${fmt(cost)}`
                : fmt(shares, 4)}
          </dd>
        </div>
        <div>
          <dt className="mono">Buying power</dt>
          <dd className="mono">${fmt(cash)}</dd>
        </div>
      </dl>

      {overCash && (
        <p className="ticket__warn mono">
          Exceeds buying power by ${fmt(cost - cash)}
        </p>
      )}

      <button
        className="btn btn--solid btn--wide"
        disabled={busy || !n || price == null}
        onClick={submit}
      >
        {busy ? "…" : `Review ${side} ${symbol}`}
      </button>

      {msg && <p className="ticket__msg mono">{msg}</p>}

      <p className="ticket__fine mono">
        {demo
          ? "Demo account — no order is placed and no venue is connected."
          : "Market orders execute at the next available price, which may differ from the quote shown. Quotes here are delayed."}
      </p>
    </div>
  );
}
