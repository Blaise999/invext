"use client";

import { useState } from "react";
import CopyButton from "./CopyButton";
import { requestDeposit, requestWithdrawal } from "@/lib/orders";
import { checkAddress, AMOUNT_PRESETS, shortAddress } from "@/lib/networks";

export interface Rail {
  id: string;
  label: string;
  chain: string;
  mark: string;
  min: number;
  confirmations: string;
  fastest: boolean;
  patternHint: string;
  address: string | null;
  memo: string | null;
  qr: string | null;
}

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Deposit and withdrawal.
 *
 * The two are deliberately the same three steps in the same order — pick a
 * network, deal with an address, enter an amount — because they're the same
 * transaction in opposite directions, and a customer who has done one should
 * recognise the other. The only asymmetry is whose address it is: on a deposit
 * we show you ours, on a withdrawal you give us yours.
 *
 * Both file a pending row and stop. Nothing credits or pays out on submit —
 * an operator decides it, and until then a withdrawal is already held out of
 * the balance so the same money can't be requested twice.
 */
export default function TransferPanel({
  available,
  rails,
  demo,
}: {
  available: number;
  rails: Rail[];
  demo: boolean;
}) {
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [railId, setRailId] = useState<string | null>(null);
  const [amt, setAmt] = useState("");
  const [dest, setDest] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const rail = rails.find((r) => r.id === railId) ?? null;
  const value = parseFloat(amt) || 0;

  const destCheck = rail && dest ? checkAddress(rail.id, dest) : null;
  const destBad = destCheck && !destCheck.ok ? destCheck.reason : null;

  const over = tab === "withdraw" && value > available;
  const underMin = value > 0 && rail != null && value < rail.min;

  const canSubmit =
    rail != null &&
    value > 0 &&
    !over &&
    !underMin &&
    (tab === "deposit" ? rail.address != null : destCheck?.ok === true);

  function reset(next: "deposit" | "withdraw") {
    setTab(next);
    setRailId(null);
    setAmt("");
    setDest("");
    setMsg(null);
  }

  async function submit() {
    if (!rail) return;
    setBusy(true);
    setMsg(null);
    try {
      const res =
        tab === "deposit"
          ? await requestDeposit(rail.id, value, "")
          : await requestWithdrawal(rail.id, value, dest);

      if (res.ok) {
        setMsg({
          ok: true,
          text:
            tab === "deposit"
              ? `Filed. Once your transfer confirms on ${rail.chain}, the desk releases $${value.toFixed(2)} into your balance.`
              : `Filed. $${value.toFixed(2)} is held from your balance and pays out to ${shortAddress(dest)} once reviewed.`,
        });
        setAmt("");
        setDest("");
      } else {
        setMsg({ ok: false, text: res.error });
      }
    } catch {
      setMsg({ ok: false, text: "No connection. Check your network and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="acts" role="group" aria-label="Transfer">
        <button
          className={tab === "deposit" ? "acts__b is-on" : "acts__b"}
          onClick={() => reset("deposit")}
        >
          <span className="acts__i" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
              <path d="M12 4.5v13m0 0-5-5m5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Deposit
        </button>

        <button
          className={tab === "withdraw" ? "acts__b is-on" : "acts__b"}
          onClick={() => reset("withdraw")}
        >
          <span className="acts__i" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
              <path d="M12 19.5v-13m0 0-5 5m5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Withdraw
        </button>

        <span className="acts__avail num">
          <span className="acts__availK">Available</span>
          {usd(available)}
        </span>
      </div>

      <section className="sheet">
        {/* ---------- step 1: the rail ---------- */}
        <p className="sheet__k sheet__k--first">
          {tab === "deposit" ? "Send from your wallet" : "Pay out to"}
        </p>

        <div className="nets">
          {rails.map((r) => {
            const closed = tab === "deposit" && r.address == null;
            return (
              <button
                key={r.id}
                className={
                  railId === r.id ? "net is-on" : closed ? "net is-closed" : "net"
                }
                onClick={() => {
                  if (closed) return;
                  setRailId(r.id);
                  setMsg(null);
                }}
                disabled={closed}
                aria-pressed={railId === r.id}
              >
                <span className="net__mark" aria-hidden="true">{r.mark}</span>
                <span className="net__id">
                  <span className="net__l">
                    {r.label} ({r.chain})
                  </span>
                  <span className="net__c">
                    {closed ? "Not open yet" : r.chain}
                  </span>
                </span>
                {r.fastest && !closed && <span className="net__fast">Fastest</span>}
              </button>
            );
          })}
        </div>

        {rail && (
          <>
            {/* ---------- step 2: the address ---------- */}
            {tab === "deposit" ? (
              <div className="addr">
                {rail.qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="addr__qr" src={rail.qr} alt={`${rail.chain} deposit address`} width={168} height={168} />
                )}

                <p className="addr__k">Deposit address</p>
                <div className="addr__box">
                  <code className="addr__v">{rail.address}</code>
                  <CopyButton value={rail.address ?? ""} />
                </div>

                {rail.memo && (
                  <>
                    <p className="addr__k">Memo / tag — required</p>
                    <div className="addr__box">
                      <code className="addr__v">{rail.memo}</code>
                      <CopyButton value={rail.memo} />
                    </div>
                  </>
                )}

                <p className="addr__warn">
                  Only send {rail.label} on {rail.chain}. Minimum ${rail.min}.
                  Anything sent on another chain is lost — by you, by us, by
                  everyone.
                </p>
              </div>
            ) : (
              <label className="amt amt--dest">
                <span className="amt__k">Your {rail.chain} address</span>
                <input
                  className={destBad ? "input is-bad" : "input"}
                  placeholder={rail.patternHint.replace(/^A(n?) /, "").replace(/\.$/, "")}
                  value={dest}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={Boolean(destBad)}
                  onChange={(e) => { setDest(e.target.value.trim()); setMsg(null); }}
                />
                <span className={destBad ? "amt__hint is-bad" : "amt__hint"}>
                  {destBad ??
                    "Paste it — don't type it. Payouts to a wrong address can't be reversed."}
                </span>
              </label>
            )}

            {/* ---------- step 3: the amount ---------- */}
            <label className="amt">
              <span className="amt__k">Amount (USD)</span>
              <div className={over || underMin ? "amt__box is-bad" : "amt__box"}>
                <span className="amt__cur">$</span>
                <input
                  className="num"
                  inputMode="decimal"
                  placeholder={`Min: ${rail.min}`}
                  value={amt}
                  aria-invalid={over || underMin}
                  onChange={(e) => { setAmt(e.target.value.replace(/[^\d.]/g, "")); setMsg(null); }}
                />
              </div>
            </label>

            <div className="chips">
              {tab === "deposit"
                ? AMOUNT_PRESETS.map((n) => (
                    <button
                      key={n}
                      className={value === n ? "chips__b is-on num" : "chips__b num"}
                      onClick={() => { setAmt(String(n)); setMsg(null); }}
                    >
                      ${n.toLocaleString("en-US")}
                    </button>
                  ))
                : [0.25, 0.5, 1].map((f) => (
                    <button
                      key={f}
                      className="chips__b num"
                      disabled={available <= 0}
                      onClick={() => setAmt((available * f).toFixed(2))}
                    >
                      {f === 1 ? "Max" : `${f * 100}%`}
                    </button>
                  ))}
            </div>

            {over && (
              <p className="sheet__bad" role="alert">
                That&rsquo;s more than the {usd(available)} available.
              </p>
            )}
            {underMin && (
              <p className="sheet__bad" role="alert">
                Minimum on {rail.label} {rail.chain} is ${rail.min}.
              </p>
            )}

            <button className="sheet__go" disabled={!canSubmit || busy} onClick={submit}>
              {busy
                ? "Filing…"
                : value > 0
                  ? `Continue · ${usd(value)}`
                  : "Continue"}
            </button>

            <p className="sheet__note">
              {tab === "deposit"
                ? `Credits after ${rail.confirmations}, once the desk confirms the transfer arrived. Nothing is added to your balance before that.`
                : "Held from your balance the moment you file, so the same money can't be sent twice. Paid out after review."}
            </p>
          </>
        )}

        {!rail && (
          <p className="sheet__note">
            Pick a network to {tab === "deposit" ? "get your address" : "continue"}.
          </p>
        )}

        {demo && (
          <p className="sheet__note">
            This is the demo account — the address above is a placeholder and
            nothing can be filed.
          </p>
        )}

        {msg && (
          <p className={msg.ok ? "sheet__msg is-ok" : "sheet__msg is-bad"} role="status">
            {msg.text}
          </p>
        )}
      </section>
    </>
  );
}
