"use client";

import { useState, useTransition } from "react";
import {
  reviewTransfer,
  adjustBalance,
  recordMark,
  deleteMark,
  setDepositAddress,
  setNetworkDefault,
} from "./desk-actions";
import { NETWORKS, checkAddress } from "@/lib/networks";
import { PRIVATE_LISTINGS } from "@/lib/private";   // ← the real 12

type Tab = "transfers" | "balances" | "marks" | "addresses" | "log";

export default function AdminTabs({
  netAddresses = [],
  transfers = [],
  users = [],
  marks = [],
  addresses = [],
  activity = [],
}: {
  netAddresses?: any[];
  transfers?: any[];
  users?: any[];
  marks?: any[];
  addresses?: any[];
  activity?: any[];
}) {
  const [tab, setTab] = useState<Tab>("transfers");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ?? "Done.") : (r.error ?? "Failed"));
      setTimeout(() => setMsg(null), 5000);
    });

  const tabs: [Tab, string, number][] = [
    ["transfers", "Transfers", transfers.length],
    ["balances", "Balances", users.length],
    ["marks", "Private marks", PRIVATE_LISTINGS.length], // ← now shows 12
    ["addresses", "Addresses", addresses.length],
    ["log", "Audit log", activity.length],
  ];

  return (
    <>
      <div className="feed__tabs" style={{ marginTop: "34px" }}>
        {tabs.map(([id, label, n]) => (
          <button
            key={id}
            className={tab === id ? "feed__tab is-on mono" : "feed__tab mono"}
            onClick={() => setTab(id)}
          >
            {label}
            <span className="feed__n">{n}</span>
          </button>
        ))}
      </div>

      {msg && (
        <p className="mono" style={{ color: "var(--amber)", margin: "12px 0 0" }}>
          {msg}
        </p>
      )}

      {/* ---------------- transfers ---------------- */}
      {tab === "transfers" && (
        <section className="dsec">
          <div className="dsec__head">
            <h2 className="dsec__h">Funding queue</h2>
            <span className="mono dsec__meta">Deposits & withdrawals awaiting decision</span>
          </div>

          {transfers.length === 0 ? (
            <div className="blank">
              <p className="blank__lead">Queue is empty.</p>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Rail / destination</th>
                  <th className="num">Amount</th>
                  <th className="num">Status</th>
                  <th className="num">Action</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <TransferRow key={t.id} t={t} run={run} busy={pending} />
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* ---------------- balances ---------------- */}
      {tab === "balances" && (
        <section className="dsec">
          <div className="dsec__head">
            <h2 className="dsec__h">Cash balances</h2>
            <span className="mono dsec__meta">
              Append-only corrections only — never silent overwrites
            </span>
          </div>

          <table className="tbl">
            <thead>
              <tr>
                <th>Account</th>
                <th className="num">Cash</th>
                <th className="num">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <BalanceRow key={u.id} u={u} run={run} busy={pending} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ---------------- private marks ---------------- */}
      {tab === "marks" && (
        <section className="dsec">
          <div className="dsec__head">
            <h2 className="dsec__h">Private valuation marks</h2>
            <span className="mono dsec__meta">
              Changing a mark instantly updates every chart & statement
            </span>
          </div>

          <MarkForm run={run} busy={pending} />

          {marks.length > 0 && (
            <>
              <h3 className="dsec__h" style={{ marginTop: 32 }}>
                Recent marks
              </h3>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th className="num">Price</th>
                    <th>Effective</th>
                    <th>Basis / Source</th>
                    <th className="num">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {marks.map((m) => (
                    <tr key={m.id}>
                      <td className="tbl__sym">{m.symbol}</td>
                      <td className="num mono">${Number(m.price).toFixed(2)}</td>
                      <td className="mono">
                        {new Date(m.effective_at).toLocaleDateString()}
                      </td>
                      <td>
                        <span className="tbl__name">{m.basis}</span>
                        <span className="tbl__name" style={{ opacity: 0.7 }}>
                          {m.source}
                        </span>
                      </td>
                      <td className="num">
                        <button
                          className="btn"
                          disabled={pending}
                          onClick={() => run(() => deleteMark(m.id))}
                        >
                          Undo
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {/* ---------------- addresses ---------------- */}
      {tab === "addresses" && (
        <section className="dsec">
          <div className="dsec__head">
            <h2 className="dsec__h">Deposit addresses</h2>
            <span className="mono dsec__meta">One active per user, per asset</span>
          </div>
          <AddressForm
            users={users}
            addresses={addresses}
            netAddresses={netAddresses}
            run={run}
            busy={pending}
          />
        </section>
      )}

      {/* ---------------- log ---------------- */}
      {tab === "log" && (
        <section className="dsec">
          <div className="dsec__head">
            <h2 className="dsec__h">Audit log</h2>
            <span className="mono dsec__meta">Append-only · cannot be edited</span>
          </div>

          {activity.length === 0 ? (
            <div className="blank">
              <p className="blank__lead">Nothing logged yet.</p>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th className="num">Detail</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((r) => (
                  <tr key={r.id}>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>
                      {new Date(r.created_at ?? r.at).toLocaleString("en-US")}
                    </td>
                    <td className="tbl__sym">{r.action}</td>
                    <td className="num mono tbl__range" data-label="Detail">
                      {r.detail ? JSON.stringify(r.detail).slice(0, 90) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ rows */

function TransferRow({ t, run, busy }: any) {
  const [note, setNote] = useState("");
  return (
    <tr>
      <td>
        <span className="tbl__sym">{t.kind}</span>
        <span className="tbl__name">{t.user_email ?? t.user_id}</span>
      </td>
      <td>
        {t.network ? (
          <>
            <span className="tbl__sym">{t.network}</span>
            {t.destination && (
              <code className="adm__addr adm__addr--dest">{t.destination}</code>
            )}
          </>
        ) : (
          <span className="mono tbl__none">—</span>
        )}
      </td>
      <td className="num mono">${Number(t.amount).toFixed(2)}</td>
      <td className="num mono">{t.status}</td>
      <td className="num">
        {t.status === "pending" ? (
          <div className="adm__act">
            <input
              className="input adm__note"
              placeholder="Reason (required to reject)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              className="btn btn--solid"
              disabled={busy}
              onClick={() => run(() => reviewTransfer(t.id, true, note))}
            >
              Approve
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => run(() => reviewTransfer(t.id, false, note))}
            >
              Reject
            </button>
          </div>
        ) : (
          <span className="mono tbl__none">resolved</span>
        )}
      </td>
    </tr>
  );
}

function BalanceRow({ u, run, busy }: any) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  return (
    <>
      <tr>
        <td>
          <span className="tbl__sym">{u.email}</span>
        </td>
        <td className="num mono">${Number(u.cash ?? 0).toFixed(2)}</td>
        <td className="num">
          <button className="btn" onClick={() => setOpen((o) => !o)}>
            {open ? "Close" : "Adjust"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={3}>
            <div className="adm__panel">
              <div className="adm__act adm__act--wrap">
                <select
                  className="input input--select"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as any)}
                >
                  <option value="credit">Credit</option>
                  <option value="debit">Debit</option>
                </select>
                <input
                  className="input"
                  placeholder="Amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <input
                  className="input adm__note"
                  placeholder="Reason (min 20 chars)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <button
                  className="btn btn--solid"
                  disabled={busy}
                  onClick={() =>
                    run(() => adjustBalance(u.id, direction, amount, reason))
                  }
                >
                  Post correction
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MarkForm({ run, busy }: any) {
  const [symbol, setSymbol] = useState(PRIVATE_LISTINGS[0]?.symbol ?? "");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [basis, setBasis] = useState("");
  const [source, setSource] = useState("");

  return (
    <div className="adm__panel" style={{ marginBottom: 24 }}>
      <p className="mono adm__k">Record new mark</p>
      <div className="adm__act adm__act--wrap">
        <select
          className="input input--select"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        >
          {PRIVATE_LISTINGS.map((c) => (
            <option key={c.symbol} value={c.symbol}>
              {c.symbol} — {c.name}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <input
          className="input"
          placeholder="Basis (e.g. Series D, 409A)"
          value={basis}
          onChange={(e) => setBasis(e.target.value)}
        />
        <input
          className="input adm__note"
          placeholder="Source (data room, broker quote…)"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <button
          className="btn btn--solid"
          disabled={busy}
          onClick={() =>
            run(() => recordMark(symbol, price, date, basis, source))
          }
        >
          Record mark
        </button>
      </div>
    </div>
  );
}

function AddressForm({ users, addresses, netAddresses, run, busy }: any) {
  const [netId, setNetId] = useState(NETWORKS[0].id);
  const [gAddr, setGAddr] = useState("");
  const [gMemo, setGMemo] = useState("");

  const [user, setUser] = useState(users[0]?.id ?? "");
  const [oNet, setONet] = useState(NETWORKS[0].id);
  const [oAddr, setOAddr] = useState("");
  const [oMemo, setOMemo] = useState("");

  const current = (netAddresses ?? []).find((n: any) => n.network === netId);
  const chosen = NETWORKS.find((n) => n.id === netId)!;
  const oChosen = NETWORKS.find((n) => n.id === oNet)!;

  const gBad = gAddr ? checkAddress(netId, gAddr) : null;
  const oBad = oAddr ? checkAddress(oNet, oAddr) : null;

  return (
    <>
      <div className="adm__panel">
        <p className="mono adm__k">Deposit address per network</p>

        <table className="tbl tbl--nets">
          <thead>
            <tr>
              <th>Network</th>
              <th>Address in use</th>
              <th className="num">Set by</th>
            </tr>
          </thead>
          <tbody>
            {NETWORKS.map((n) => {
              const row = (netAddresses ?? []).find((x: any) => x.network === n.id);
              return (
                <tr key={n.id}>
                  <td>
                    <span className="tbl__sym">{n.label} ({n.chain})</span>
                    <span className="tbl__name">min ${n.min} · {n.confirmations}</span>
                  </td>
                  <td>
                    {row ? (
                      <code className="adm__addr">{row.address}</code>
                    ) : (
                      <span className="mono tbl__none">closed — no address set</span>
                    )}
                  </td>
                  <td className="num mono tbl__none">
                    {row ? row.updated_by : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="adm__act adm__act--wrap" style={{ marginTop: 14 }}>
          <select
            className="input input--select"
            value={netId}
            onChange={(e) => { setNetId(e.target.value); setGAddr(""); }}
          >
            {NETWORKS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label} ({n.chain})
              </option>
            ))}
          </select>
          <input
            className="input adm__note"
            placeholder={current ? "Replace address" : `New ${chosen.chain} address`}
            value={gAddr}
            spellCheck={false}
            onChange={(e) => setGAddr(e.target.value.trim())}
          />
          <input
            className="input"
            placeholder="Memo (optional)"
            value={gMemo}
            onChange={(e) => setGMemo(e.target.value)}
          />
          <button
            className="btn btn--solid"
            disabled={busy || !gAddr || gBad?.ok === false}
            onClick={() => run(() => setNetworkDefault(netId, gAddr, gMemo))}
          >
            {current ? "Replace" : "Set"}
          </button>
        </div>

        {gBad && !gBad.ok && <p className="adm__warn">{gBad.reason}</p>}
        {current && gAddr && gBad?.ok && (
          <p className="adm__warn">
            This replaces the address every customer without an override is
            currently sending to. The old one is kept in the audit log.
          </p>
        )}
      </div>

      <div className="adm__panel">
        <p className="mono adm__k">Override for one account</p>
        <div className="adm__act adm__act--wrap">
          <select
            className="input input--select"
            value={user}
            onChange={(e) => setUser(e.target.value)}
          >
            {users.map((u: any) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
          <select
            className="input input--select"
            value={oNet}
            onChange={(e) => { setONet(e.target.value); setOAddr(""); }}
          >
            {NETWORKS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label} ({n.chain})
              </option>
            ))}
          </select>
          <input
            className="input adm__note"
            placeholder={`${oChosen.chain} address`}
            value={oAddr}
            spellCheck={false}
            onChange={(e) => setOAddr(e.target.value.trim())}
          />
          <input
            className="input"
            placeholder="Memo (optional)"
            value={oMemo}
            onChange={(e) => setOMemo(e.target.value)}
          />
          <button
            className="btn btn--solid"
            disabled={busy || !user || !oAddr || oBad?.ok === false}
            onClick={() => run(() => setDepositAddress(user, oNet, oAddr, oMemo))}
          >
            Assign
          </button>
        </div>
        {oBad && !oBad.ok && <p className="adm__warn">{oBad.reason}</p>}

        {(addresses ?? []).length > 0 && (
          <table className="tbl" style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Account</th>
                <th>Network</th>
                <th className="num">Address</th>
              </tr>
            </thead>
            <tbody>
              {addresses.map((a: any) => (
                <tr key={a.id}>
                  <td><span className="tbl__sym">{a.user_email}</span></td>
                  <td className="mono">{a.network}</td>
                  <td className="num"><code className="adm__addr">{a.address}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}