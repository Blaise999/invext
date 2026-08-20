"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestDeposit, requestWithdrawal } from "@/lib/orders";
import { DEPOSIT_METHODS, WITHDRAW_METHODS, type Rail } from "@/lib/funding";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Move money in, move money out.
 *
 * The design decision that matters here is what happens on submit: nothing
 * appears in the balance. A deposit files a PENDING request and credits zero.
 * Plenty of apps optimistically credit the moment you press the button, and
 * the result is a user who believes they have money that hasn't arrived, then
 * places an order against it. The pending row is shown separately, labelled,
 * and excluded from buying power.
 *
 * Withdrawals go the other way: funds are held the instant the request is
 * filed, so the same balance can't be withdrawn twice while the first sits in
 * review. That's enforced in lib/db.ts `cashForUser`, not here — the client is
 * never the place where a balance rule lives.
 */
export default function TransferForm({
  cash,
  pendingIn,
  pendingOut,
  demo,
}: {
  cash: number;
  pendingIn: number;
  pendingOut: number;
  demo: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [tab, setTab] = useState<"deposit" | "withdrawal">("deposit");
  const rails: Rail[] = tab === "deposit" ? DEPOSIT_METHODS : WITHDRAW_METHODS;

  const [method, setMethod] = useState(rails[0].id);
  const [amount, setAmount] = useState("");
  const [dest, setDest] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const rail = rails.find((r) => r.id === method) ?? rails[0];
  const n = Number(amount);
  const valid = Number.isFinite(n) && n >= rail.min;

  const switchTab = (t: "deposit" | "withdrawal") => {
    setTab(t);
    setMethod((t === "deposit" ? DEPOSIT_METHODS : WITHDRAW_METHODS)[0].id);
    setAmount("");
    setDest("");
    setError(null);
    setOk(null);
  };

  const submit = () => {
    setError(null);
    setOk(null);
    start(async () => {
      const res =
        tab === "deposit"
          ? await requestDeposit(method, n, dest)
          : await requestWithdrawal(method, n, dest);

      if (!res.ok) return setError(res.error);

      setOk(
        tab === "deposit"
          ? `Deposit of ${usd(n)} filed. It stays pending — and out of your buying power — until the funds actually land.`
          : `Withdrawal of ${usd(n)} filed. The amount is held from your balance now and pays out once reviewed.`,
      );
      setAmount("");
      setDest("");
      router.refresh();
    });
  };

  return (
    <div className="xfer">
      <div className="xfer__tabs" role="tablist" aria-label="Transfer direction">
        {(["deposit", "withdrawal"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "xfer__tab is-on" : "xfer__tab"}
            onClick={() => switchTab(t)}
          >
            {t === "deposit" ? "Deposit" : "Withdraw"}
          </button>
        ))}
      </div>

      <dl className="strip strip--xfer">
        <div>
          <dt className="mono strip__k">Available</dt>
          <dd className="strip__v">{usd(cash)}</dd>
        </div>
        <div>
          <dt className="mono strip__k">Pending in</dt>
          <dd className="strip__v">{usd(pendingIn)}</dd>
        </div>
        <div>
          <dt className="mono strip__k">Held for payout</dt>
          <dd className="strip__v">{usd(pendingOut)}</dd>
        </div>
      </dl>

      <fieldset className="xfer__rails">
        <legend className="mono xfer__legend">
          {tab === "deposit" ? "Funding method" : "Payout method"}
        </legend>
        {rails.map((r) => (
          <label key={r.id} className={method === r.id ? "rail-opt is-on" : "rail-opt"}>
            <input
              type="radio"
              name="method"
              value={r.id}
              checked={method === r.id}
              onChange={() => setMethod(r.id)}
            />
            <span className="rail-opt__l">{r.label}</span>
            <span className="rail-opt__d mono">{r.detail}</span>
          </label>
        ))}
      </fieldset>

      <label className="mono xfer__k" htmlFor="xfer-amt">Amount</label>
      <div className="ticket__field">
        <span className="ticket__sign">$</span>
        <input
          id="xfer-amt"
          className="ticket__in"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          autoComplete="off"
        />
      </div>

      {tab === "withdrawal" && cash > 0 && (
        <div className="ticket__quick">
          {[0.25, 0.5, 1].map((f) => (
            <button
              key={f}
              className="ticket__q"
              onClick={() => setAmount((Math.floor(cash * f * 100) / 100).toFixed(2))}
            >
              {f === 1 ? "All" : `${f * 100}%`}
            </button>
          ))}
        </div>
      )}

      <label className="mono xfer__k" htmlFor="xfer-dest">
        {tab === "deposit" ? "Reference (optional)" : "Pay out to"}
      </label>
      <input
        id="xfer-dest"
        className="input"
        placeholder={
          tab === "deposit"
            ? "Your bank's reference, if you have one"
            : "Bank account ending 4821"
        }
        value={dest}
        onChange={(e) => setDest(e.target.value)}
        autoComplete="off"
      />

      <p className="xfer__hint mono">Minimum {usd(rail.min)}. {rail.hint}</p>

      {error && <p className="ticket__err">{error}</p>}
      {ok && <p className="ticket__ok">{ok}</p>}

      <button
        className="btn btn--solid ticket__go"
        disabled={!valid || pending || demo}
        onClick={submit}
      >
        {pending
          ? "Filing…"
          : tab === "deposit"
            ? "Request deposit"
            : "Request withdrawal"}
      </button>

      {demo && (
        <p className="ticket__note mono">
          Demo account — funding is disabled. A demo balance can never become a
          real one, which is the entire reason demo mode is a separate render
          branch rather than a seeded account.
        </p>
      )}
    </div>
  );
}
