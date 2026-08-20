"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adjustBalance, deleteMark, recordMark, reviewTransfer, setDepositAddress } from "./desk-actions";

/**
 * The desk.
 *
 * Three tabs, in the order the work actually happens: things waiting on you,
 * the accounts they belong to, then the full ledger for when you need to
 * reconstruct what happened.
 *
 * Rejecting requires a reason before the button enables. That's deliberate
 * friction on the destructive path — the customer sees this note, and "no
 * reason given" is the kind of thing that turns a support ticket into a
 * complaint to a regulator.
 */

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const when = (t: number) =>
  new Date(t).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

export interface DeskMark {
  id: string;
  symbol: string;
  price: number;
  effective_at: number;
  basis: string;
  source: string;
  created_by: string;
  created_at: number;
  holders: number;
}

export interface DeskAddress {
  id: string;
  email: string;
  asset: string;
  network: string;
  address: string;
  assigned_by: string;
  created_at: number;
}

export interface DeskAudit {
  id: string;
  actor: string;
  action: string;
  entity: string | null;
  detail: Record<string, unknown>;
  created_at: number;
}

export interface DeskUser {
  id: string;
  email: string;
  name: string;
  state: string;
  verified: boolean;
  created_at: number;
  cash: number;
  positions: number;
}

export interface DeskRow {
  id: string;
  user_id: string;
  email: string;
  kind: string;
  symbol: string | null;
  amount: number;
  quantity: number | null;
  price: number | null;
  status: string;
  method: string | null;
  destination: string | null;
  reference: string | null;
  note: string | null;
  reviewed_by: string | null;
  created_at: number;
}

type Tab = "queue" | "accounts" | "marks" | "addresses" | "ledger" | "audit";

export default function Desk({
  queue,
  users,
  ledger,
  marks,
  addresses,
  audit,
  privateSymbols,
}: {
  queue: DeskRow[];
  users: DeskUser[];
  ledger: DeskRow[];
  marks: DeskMark[];
  addresses: DeskAddress[];
  audit: DeskAudit[];
  privateSymbols: { symbol: string; name: string }[];
}) {
  const [tab, setTab] = useState<Tab>("queue");

  return (
    <>
      <div className="atabs" role="tablist" aria-label="Back office sections">
        {([
          ["queue", `Queue${queue.length ? ` (${queue.length})` : ""}`],
          ["accounts", `Accounts (${users.length})`],
          ["marks", `Marks (${marks.length})`],
          ["addresses", `Addresses (${addresses.length})`],
          ["ledger", "Ledger"],
          ["audit", "Audit"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "atabs__b is-on" : "atabs__b"}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "queue" && <Queue rows={queue} />}
      {tab === "accounts" && <Accounts users={users} />}
      {tab === "marks" && <Marks marks={marks} symbols={privateSymbols} />}
      {tab === "addresses" && <Addresses rows={addresses} users={users} />}
      {tab === "ledger" && <Ledger rows={ledger} />}
      {tab === "audit" && <Audit rows={audit} />}
    </>
  );
}

/* ---------------- queue ---------------- */

function Queue({ rows }: { rows: DeskRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="blank">
        <p className="blank__lead">Nothing waiting.</p>
        <p className="blank__body">
          Deposits and withdrawals filed from the dashboard land here as pending.
          Nothing moves in a customer&rsquo;s balance until one of them is
          approved on this screen — or by the processor webhook, if you&rsquo;ve
          connected one.
        </p>
      </div>
    );
  }
  return (
    <div className="aqueue">
      {rows.map((r) => (
        <QueueCard key={r.id} row={r} />
      ))}
    </div>
  );
}

function QueueCard({ row }: { row: DeskRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const act = (approve: boolean) => {
    setError(null);
    start(async () => {
      const res = await reviewTransfer(row.id, approve, note);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  };

  const isDeposit = row.kind === "deposit";

  return (
    <article className="aq">
      <header className="aq__top">
        <span className={isDeposit ? "aq__dir up" : "aq__dir down"}>
          {isDeposit ? "Deposit in" : "Withdrawal out"}
        </span>
        <span className="mono aq__when">{when(row.created_at)}</span>
      </header>

      <p className="aq__amt mono">{usd(row.amount)}</p>

      <dl className="aq__meta">
        <div><dt>Account</dt><dd>{row.email}</dd></div>
        <div><dt>Method</dt><dd className="mono">{row.method?.toUpperCase() ?? "—"}</dd></div>
        {row.destination && <div><dt>Pay to</dt><dd className="mono">{row.destination}</dd></div>}
        {row.reference && <div><dt>Reference</dt><dd className="mono">{row.reference}</dd></div>}
      </dl>

      <input
        className="input"
        placeholder={isDeposit ? "Note (required to reject)" : "Note (required to reject)"}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {error && <p className="ticket__err">{error}</p>}

      <div className="aq__acts">
        <button
          className="btn"
          disabled={pending || note.trim().length < 10}
          onClick={() => act(false)}
          title={note.trim().length < 10 ? "A written reason is required to reject" : undefined}
        >
          Reject
        </button>
        <button className="btn btn--solid" disabled={pending} onClick={() => act(true)}>
          {pending ? "Working…" : isDeposit ? "Mark funds received" : "Approve payout"}
        </button>
      </div>

      <p className="mono aq__warn">
        {isDeposit
          ? "Approve only after the money is confirmed in the custody account. This credits real buying power."
          : "Approve only after the payout has actually been sent. The amount is already held from the balance."}
      </p>
    </article>
  );
}

/* ---------------- accounts ---------------- */

function Accounts({ users }: { users: DeskUser[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (users.length === 0) {
    return (
      <div className="blank">
        <p className="blank__lead">No accounts yet.</p>
        <p className="blank__body">Anyone who completes sign-up appears here.</p>
      </div>
    );
  }

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Account</th>
          <th>Opened</th>
          <th className="num">Cash</th>
          <th className="num">Positions</th>
          <th className="num">Adjust</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <Fragment key={u.id}>
            <tr>
              <td data-label="Account">
                <span className="tbl__sym">{u.name}</span>
                <span className="tbl__name">{u.email}{u.verified ? "" : " · unverified"}</span>
              </td>
              <td data-label="Opened" className="mono">
                {new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </td>
              <td data-label="Cash" className="num mono">{usd(u.cash)}</td>
              <td data-label="Positions" className="num mono">{u.positions}</td>
              <td data-label="Adjust" className="num">
                <button className="mbar__s" onClick={() => setOpen(open === u.id ? null : u.id)}>
                  {open === u.id ? "Close" : "Adjust balance"}
                </button>
              </td>
            </tr>
            {open === u.id && (
              <tr>
                <td colSpan={5}>
                  <Adjust userId={u.id} email={u.email} cash={u.cash} />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

function Adjust({ userId, email, cash }: { userId: string; email: string; cash: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dir, setDir] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const n = Number(amount);
  const preview =
    Number.isFinite(n) && n > 0
      ? cash + (dir === "credit" ? n : -n)
      : null;

  return (
    <div className="acorr">
      <p className="mono acorr__k">Adjust balance · {email}</p>
      <p className="acorr__note">
        Appends a signed entry attributed to you, notifies the customer, and
        shows in their activity feed. The existing rows aren&rsquo;t touched —
        the balance is a sum over them, so there is nothing to overwrite.
      </p>

      <div className="acorr__row">
        <div className="ticket__sides">
          {(["credit", "debit"] as const).map((d) => (
            <button
              key={d}
              className={`ticket__side ${dir === d ? "is-on" : ""}`}
              onClick={() => setDir(d)}
            >
              {d === "credit" ? "Credit" : "Debit"}
            </button>
          ))}
        </div>
        <input
          className="input"
          placeholder="Amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        />
      </div>

      <textarea
        className="input acorr__why"
        rows={2}
        placeholder="Why (20 characters minimum, shown to the customer)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      <dl className="ticket__meta">
        <div><dt>Current</dt><dd className="mono">{usd(cash)}</dd></div>
        <div className="is-total">
          <dt>After this entry</dt>
          <dd className="mono">{preview != null ? usd(preview) : "—"}</dd>
        </div>
      </dl>

      {error && <p className="ticket__err">{error}</p>}
      {ok && <p className="ticket__ok">Posted. {ok}</p>}

      <button
        className="btn btn--solid"
        disabled={pending || reason.trim().length < 20 || !amount}
        onClick={() => {
          setError(null);
          setOk(null);
          start(async () => {
            const res = await adjustBalance(userId, dir, amount, reason);
            if (!res.ok) return setError(res.error);
            setOk(res.message ?? "");
            setAmount("");
            setReason("");
            router.refresh();
          });
        }}
      >
        {pending ? "Posting…" : `Post ${dir}`}
      </button>
    </div>
  );
}

/* ---------------- ledger ---------------- */

function Ledger({ rows }: { rows: DeskRow[] }) {
  const [kind, setKind] = useState<string>("all");
  const kinds = ["all", "deposit", "withdrawal", "buy", "sell", "correction"];
  const shown = kind === "all" ? rows : rows.filter((r) => r.kind === kind);

  return (
    <>
      <div className="mbar__sort" style={{ marginBottom: "var(--s3)" }}>
        {kinds.map((k) => (
          <button
            key={k}
            className={kind === k ? "mbar__s is-on" : "mbar__s"}
            onClick={() => setKind(k)}
          >
            {k}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="blank">
          <p className="blank__lead">Nothing recorded.</p>
          <p className="blank__body">Every movement of value writes a row here.</p>
        </div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Entry</th>
              <th>Account</th>
              <th>When</th>
              <th className="num">Amount</th>
              <th className="num">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td data-label="Entry">
                  <span className="tbl__sym">{r.kind}{r.symbol ? ` ${r.symbol}` : ""}</span>
                  {r.quantity != null && r.price != null && (
                    <span className="tbl__name mono">
                      {r.quantity.toFixed(4)} @ {usd(r.price)}
                    </span>
                  )}
                  {r.note && <span className="tbl__name">{r.note}</span>}
                </td>
                <td data-label="Account" className="tbl__what">{r.email}</td>
                <td data-label="When" className="mono tbl__range">{when(r.created_at)}</td>
                <td data-label="Amount" className="num mono">{usd(r.amount)}</td>
                <td data-label="Status" className="num">
                  <span className={r.status === "settled" ? "chip chip--ok" : r.status === "pending" ? "chip" : "chip chip--bad"}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/* ---------------- valuation marks ---------------- */

function Marks({
  marks,
  symbols,
}: {
  marks: DeskMark[];
  symbols: { symbol: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [symbol, setSymbol] = useState(symbols[0]?.symbol ?? "");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [basis, setBasis] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const BASES = ["Primary round", "Secondary block", "Tender offer", "409A valuation"];

  return (
    <>
      <div className="acorr">
        <p className="mono acorr__k">Record a valuation mark</p>
        <p className="acorr__note">
          This becomes the price the vehicle carries on every holder&rsquo;s
          statement and the point the chart steps to. Everyone holding it is
          notified. The date, basis and source are required — a number without
          them isn&rsquo;t a valuation, it&rsquo;s an assertion, and nobody will
          be able to defend it in six months.
        </p>

        <div className="acorr__grid">
          <label className="mono acorr__f">
            Asset
            <select className="input input--select" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {symbols.map((s) => (
                <option key={s.symbol} value={s.symbol}>{s.symbol} — {s.name}</option>
              ))}
            </select>
          </label>

          <label className="mono acorr__f">
            Price per unit
            <input
              className="input"
              inputMode="decimal"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </label>

          <label className="mono acorr__f">
            Effective date
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label className="mono acorr__f">
            Basis
            <input
              className="input"
              list="mark-bases"
              placeholder="Secondary block"
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
            />
            <datalist id="mark-bases">
              {BASES.map((b) => <option key={b} value={b} />)}
            </datalist>
          </label>
        </div>

        <label className="mono acorr__f">
          Source
          <input
            className="input"
            placeholder="Where this came from — filing, broker confirmation, cap-table provider"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </label>

        {error && <p className="ticket__err">{error}</p>}
        {ok && <p className="ticket__ok">{ok}</p>}

        <button
          className="btn btn--solid"
          disabled={pending || !price || basis.trim().length < 3 || source.trim().length < 8}
          onClick={() => {
            setError(null);
            setOk(null);
            start(async () => {
              const res = await recordMark(symbol, price, date, basis, source);
              if (!res.ok) return setError(res.error);
              setOk(res.message ?? "Recorded.");
              setPrice(""); setBasis(""); setSource("");
              router.refresh();
            });
          }}
        >
          {pending ? "Recording…" : "Record mark"}
        </button>
      </div>

      {marks.length === 0 ? (
        <div className="blank" style={{ marginTop: "var(--s3)" }}>
          <p className="blank__lead">No marks recorded.</p>
          <p className="blank__body">
            Until a vehicle has a mark it has no value on any statement and
            can&rsquo;t be traded — which is the correct behaviour, not a gap.
          </p>
        </div>
      ) : (
        <table className="tbl" style={{ marginTop: "var(--s4)" }}>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Effective</th>
              <th>Basis / source</th>
              <th className="num">Price</th>
              <th className="num">Holders</th>
              <th className="num">Recorded by</th>
            </tr>
          </thead>
          <tbody>
            {marks.map((m) => {
              const fresh = Date.now() - m.created_at < 24 * 60 * 60 * 1000;
              return (
                <tr key={m.id}>
                  <td data-label="Asset"><span className="tbl__sym">{m.symbol}</span></td>
                  <td data-label="Effective" className="mono tbl__range">
                    {new Date(m.effective_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                  </td>
                  <td data-label="Basis">
                    <span className="tbl__what">{m.basis}</span>
                    <span className="tbl__name">{m.source}</span>
                  </td>
                  <td data-label="Price" className="num mono">{usd(m.price)}</td>
                  <td data-label="Holders" className="num mono">{m.holders}</td>
                  <td data-label="Recorded by" className="num">
                    <span className="tbl__name">{m.created_by}</span>
                    {fresh && (
                      <button
                        className="mbar__s"
                        disabled={pending}
                        onClick={() => start(async () => { await deleteMark(m.id); router.refresh(); })}
                      >
                        Undo
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

/* ---------------- deposit addresses ---------------- */

function Addresses({ rows, users }: { rows: DeskAddress[]; users: DeskUser[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [asset, setAsset] = useState("USDC-ETH");
  const [network, setNetwork] = useState("Ethereum (ERC-20)");
  const [address, setAddress] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  return (
    <>
      <div className="acorr">
        <p className="mono acorr__k">Issue a deposit address</p>
        <p className="acorr__note">
          One address per account, never shared. Two people paying into the same
          address makes deposits unattributable, and matching by amount fails the
          first time two of them send the same figure. The address must come from
          your custody provider or an HD wallet derived at a unique index — not
          from a personal wallet.
        </p>

        <div className="acorr__grid">
          <label className="mono acorr__f">
            Account
            <select className="input input--select" value={userId} onChange={(e) => setUserId(e.target.value)}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </label>
          <label className="mono acorr__f">
            Asset
            <input className="input" value={asset} onChange={(e) => setAsset(e.target.value)} />
          </label>
          <label className="mono acorr__f">
            Network
            <input className="input" value={network} onChange={(e) => setNetwork(e.target.value)} />
          </label>
          <label className="mono acorr__f">
            Memo / tag (optional)
            <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
        </div>

        <label className="mono acorr__f">
          Address
          <input
            className="input"
            placeholder="From your custody provider"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>

        {error && <p className="ticket__err">{error}</p>}
        {ok && <p className="ticket__ok">{ok}</p>}

        <button
          className="btn btn--solid"
          disabled={pending || !userId || address.trim().length < 16}
          onClick={() => {
            setError(null); setOk(null);
            start(async () => {
              // setDepositAddress is network-first now; the asset comes from the
              // network catalogue rather than being typed in.
              const res = await setDepositAddress(userId, network, address, memo);
              if (!res.ok) return setError(res.error);
              setOk(res.message ?? "Issued.");
              setAddress(""); setMemo("");
              router.refresh();
            });
          }}
        >
          {pending ? "Issuing…" : "Issue address"}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="blank" style={{ marginTop: "var(--s3)" }}>
          <p className="blank__lead">No addresses issued.</p>
          <p className="blank__body">
            Deposits still credit only through the signed webhook or an explicit
            approval in the queue. An address on its own moves nothing.
          </p>
        </div>
      ) : (
        <table className="tbl" style={{ marginTop: "var(--s4)" }}>
          <thead>
            <tr>
              <th>Account</th>
              <th>Asset</th>
              <th>Address</th>
              <th className="num">Issued</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td data-label="Account" className="tbl__what">{a.email}</td>
                <td data-label="Asset">
                  <span className="tbl__sym">{a.asset}</span>
                  <span className="tbl__name">{a.network}</span>
                </td>
                <td data-label="Address"><span className="mono tbl__addr">{a.address}</span></td>
                <td data-label="Issued" className="num">
                  <span className="mono tbl__range">{when(a.created_at)}</span>
                  <span className="tbl__name">{a.assigned_by}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/* ---------------- audit ---------------- */

function Audit({ rows }: { rows: DeskAudit[] }) {
  if (rows.length === 0) {
    return (
      <div className="blank">
        <p className="blank__lead">Nothing logged yet.</p>
        <p className="blank__body">
          Every order, transfer decision, balance adjustment, mark and address
          assignment writes a row here, attributed to whoever did it. Nothing in
          this table is ever updated or deleted.
        </p>
      </div>
    );
  }

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Action</th>
          <th>Actor</th>
          <th>Detail</th>
          <th className="num">When</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id}>
            <td data-label="Action"><span className="tbl__sym">{a.action}</span></td>
            <td data-label="Actor" className="tbl__what">{a.actor}</td>
            <td data-label="Detail">
              <span className="mono tbl__detail">
                {Object.entries(a.detail)
                  .map(([k, val]) => `${k}=${typeof val === "object" ? JSON.stringify(val) : String(val)}`)
                  .join("  ") || "—"}
              </span>
            </td>
            <td data-label="When" className="num mono tbl__range">{when(a.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
