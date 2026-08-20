import { supabaseAdmin } from "./supabase/admin";
import { allPeople, type AuthPerson } from "./auth-store";

/**
 * The ledger, positions, marks, addresses, notifications, activity and the
 * watchlist — in Postgres (migration 0006), replacing the JSON file that
 * lib/db.ts used to keep them in.
 *
 * Same reason as lib/auth-store.ts: DATA_DIR is /tmp on Vercel, /tmp is
 * per-instance and disposable. Cash here is a sum over the ledger, so an
 * ephemeral ledger meant the balance depended on which lambda answered.
 *
 * Three things moved INTO the database rather than being ported as-is, because
 * they were never safe as a read-then-write across a network hop:
 *
 *   app_record_fill      position + ledger row in one transaction, under a
 *                        per-account advisory lock, with the cash and holding
 *                        checks inside it
 *   app_post_correction  same lock, refuses to take cash negative
 *   app_assign_address   retire-then-issue as one step
 *
 * Marks revalue positions; they do not change cash or cost_basis. Market value
 * and unrealized P/L are derived at read time (see latestMarksBySymbol /
 * valuePositions).
 *
 * Everything is async. Server-side only — it uses the service-role key.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const ms = (t: string | null | undefined): number =>
  t ? new Date(t).getTime() : 0;
const msOrNull = (t: string | null | undefined): number | null =>
  t ? new Date(t).getTime() : null;
const iso = (n: number) => new Date(n).toISOString();
const num = (v: any): number => (v == null ? 0 : Number(v));
const numOrNull = (v: any): number | null => (v == null ? null : Number(v));

/* ------------------------------------------------------------------ types */

export interface Position {
  id: string;
  user_id: string;
  symbol: string;
  quantity: number;
  cost_basis: number;
  opened_at: number;
}

/** Position plus mark-to-market fields. Cost basis is never rewritten by a mark. */
export interface ValuedPosition extends Position {
  /** Latest mark (or public quote if you pass one in). Null = no price. */
  mark_price: number | null;
  /** quantity × mark_price when priced; otherwise null. */
  market_value: number | null;
  /** market_value − cost_basis when priced; otherwise null. */
  unrealized_pl: number | null;
}

export type TxKind = "deposit" | "withdrawal" | "buy" | "sell" | "correction";

/**
 * One ledger row.
 *
 * Sign convention, in one place so nothing else re-derives it — and it is now
 * also written down in SQL, in app_cash():
 *   deposit / sell / correction → `amount` used as stored (correction is
 *                                 signed at write time; the others positive)
 *   withdrawal / buy            → positive magnitude, subtracted
 */
export interface Transaction {
  id: string;
  user_id: string;
  kind: TxKind;
  symbol: string | null;
  amount: number;
  status: "pending" | "settled" | "rejected" | "failed";

  quantity: number | null;
  price: number | null;
  realised: number | null;
  basis_relieved: number | null;

  method: string | null;
  /** Which rail — matches an id in lib/networks.ts. Null for trades. */
  network: string | null;
  reference: string | null;
  destination: string | null;

  note: string | null;
  reviewed_at: number | null;
  reviewed_by: string | null;

  created_at: number;
}

export interface Mark {
  id: string;
  symbol: string;
  price: number;
  effective_at: number;
  basis: string;
  source: string;
  created_by: string;
  created_at: number;
}

export interface DepositAddress {
  id: string;
  user_id: string;
  asset: string;
  network: string;
  address: string;
  memo: string | null;
  active: number;
  assigned_by: string;
  created_at: number;
}

export interface Notification {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read_at: number | null;
  created_at: number;
}

export interface Activity {
  id: string;
  user_id: string | null;
  actor: string;
  action: string;
  entity: string;
  entity_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: number;
}

/* ---------------------------------------------------------------- mappers */

const toPosition = (r: any): Position => ({
  id: r.id,
  user_id: r.user_id,
  symbol: r.symbol,
  quantity: num(r.quantity),
  cost_basis: num(r.cost_basis),
  opened_at: ms(r.opened_at),
});

const toTransaction = (r: any): Transaction => ({
  id: r.id,
  user_id: r.user_id,
  kind: r.kind,
  symbol: r.symbol ?? null,
  amount: num(r.amount),
  status: r.status,
  quantity: numOrNull(r.quantity),
  price: numOrNull(r.price),
  realised: numOrNull(r.realised),
  basis_relieved: numOrNull(r.basis_relieved),
  method: r.method ?? null,
  network: r.network ?? null,
  reference: r.reference ?? null,
  destination: r.destination ?? null,
  note: r.note ?? null,
  reviewed_at: msOrNull(r.reviewed_at),
  reviewed_by: r.reviewed_by ?? null,
  created_at: ms(r.created_at),
});

const toMark = (r: any): Mark => ({
  id: r.id,
  symbol: r.symbol,
  price: num(r.price),
  effective_at: ms(r.effective_at),
  basis: r.basis,
  source: r.source,
  created_by: r.created_by,
  created_at: ms(r.created_at),
});

const toAddress = (r: any): DepositAddress => ({
  id: r.id,
  user_id: r.user_id,
  asset: r.asset,
  network: r.network,
  address: r.address,
  memo: r.memo ?? null,
  active: r.active ? 1 : 0,
  assigned_by: r.assigned_by,
  created_at: ms(r.created_at),
});

const toNotification = (r: any): Notification => ({
  id: r.id,
  user_id: r.user_id,
  kind: r.kind,
  title: r.title,
  body: r.body ?? "",
  href: r.href ?? null,
  read_at: msOrNull(r.read_at),
  created_at: ms(r.created_at),
});

const toActivity = (r: any): Activity => ({
  id: r.id,
  user_id: r.user_id ?? null,
  actor: r.actor,
  action: r.action,
  entity: r.entity,
  entity_id: r.entity_id ?? null,
  detail: r.detail ?? null,
  created_at: ms(r.created_at),
});

/* -------------------------------------------------------------- positions */

export async function positionsForUser(userId: string): Promise<Position[]> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_positions")
    .select("*")
    .eq("user_id", userId)
    .order("opened_at", { ascending: true });
  if (error) {
    console.error("[ledger] positionsForUser", error);
    return [];
  }
  return (data ?? []).map(toPosition);
}

/** Every position across every account — used to find a mark's holders. */
export async function allPositions(): Promise<Position[]> {
  const db = await supabaseAdmin();
  const { data, error } = await db.from("app_positions").select("*");
  if (error) {
    console.error("[ledger] allPositions", error);
    return [];
  }
  return (data ?? []).map(toPosition);
}

export async function holdersOf(symbol: string): Promise<string[]> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_positions")
    .select("user_id")
    .eq("symbol", symbol.toUpperCase());
  if (error) {
    console.error("[ledger] holdersOf", error);
    return [];
  }
  return [...new Set((data ?? []).map((r: any) => r.user_id as string))];
}

/* ------------------------------------------------------------------ fills */

export type FillResult =
  | { ok: true; row: Transaction }
  | { ok: false; error: "insufficient_cash"; available: number }
  | { ok: false; error: "insufficient_position"; held: number }
  | { ok: false; error: "failed"; message: string };

/**
 * Buy or sell, atomically.
 *
 * The cash check (buy) and the holding check (sell) happen inside the same
 * transaction as the writes, so they can't be raced. Realised P/L and basis
 * relieved come back from the database, computed against the position as it
 * stood before the sale.
 */
export async function recordFill(input: {
  userId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  priceSource?: string | null;
}): Promise<FillResult> {
  const db = await supabaseAdmin();
  const { data, error } = await db.rpc("app_record_fill", {
    uid: input.userId,
    sym: input.symbol.toUpperCase(),
    side: input.side,
    qty: input.quantity,
    px: input.price,
    price_src: input.priceSource ?? null,
  });

  if (error) {
    const m = error.message ?? "";
    const cash = m.match(/insufficient_cash:([\d.]+)/);
    if (cash) return { ok: false, error: "insufficient_cash", available: Number(cash[1]) };
    const held = m.match(/insufficient_position:([\d.]+)/);
    if (held) return { ok: false, error: "insufficient_position", held: Number(held[1]) };
    console.error("[ledger] recordFill", error);
    return { ok: false, error: "failed", message: m };
  }

  return { ok: true, row: toTransaction(data) };
}

/* ----------------------------------------------------------------- ledger */

/**
 * Append a funding row. Deposits and withdrawals land here as `pending` and
 * are decided later — nothing credits on submit.
 *
 * Corrections do NOT go through this: use postCorrection, which checks the
 * resulting balance under a lock.
 */
export async function appendTransaction(t: {
  user_id: string;
  kind: TxKind;
  symbol: string | null;
  amount: number;
  status?: Transaction["status"];
  quantity?: number | null;
  price?: number | null;
  realised?: number | null;
  basis_relieved?: number | null;
  method?: string | null;
  network?: string | null;
  reference?: string | null;
  destination?: string | null;
  note?: string | null;
  reviewed_at?: number | null;
  reviewed_by?: string | null;
}): Promise<Transaction> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_transactions")
    .insert({
      user_id: t.user_id,
      kind: t.kind,
      symbol: t.symbol,
      amount: Math.round(t.amount * 100) / 100,
      status: t.status ?? "pending",
      quantity: t.quantity ?? null,
      price: t.price ?? null,
      realised: t.realised ?? null,
      basis_relieved: t.basis_relieved ?? null,
      method: t.method ?? null,
      network: t.network ?? null,
      reference: t.reference ?? null,
      destination: t.destination ?? null,
      note: t.note ?? null,
      reviewed_at: t.reviewed_at ? iso(t.reviewed_at) : null,
      reviewed_by: t.reviewed_by ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[ledger] appendTransaction", error);
    throw new Error("ledger_write_failed");
  }
  return toTransaction(data);
}

/** Signed, attributed, customer-visible balance adjustment. */
export async function postCorrection(
  userId: string,
  delta: number,
  reason: string,
  by: string,
): Promise<
  | { ok: true; row: Transaction }
  | { ok: false; error: "negative_balance"; before: number }
  | { ok: false; error: "failed"; message: string }
> {
  const db = await supabaseAdmin();
  const { data, error } = await db.rpc("app_post_correction", {
    uid: userId,
    delta: Math.round(delta * 100) / 100,
    reason,
    by,
  });

  if (error) {
    const neg = (error.message ?? "").match(/negative_balance:(-?[\d.]+)/);
    if (neg) return { ok: false, error: "negative_balance", before: Number(neg[1]) };
    console.error("[ledger] postCorrection", error);
    return { ok: false, error: "failed", message: error.message ?? "" };
  }
  return { ok: true, row: toTransaction(data) };
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[ledger] getTransaction", error);
    return null;
  }
  return data ? toTransaction(data) : null;
}

export async function transactionsForUser(
  userId: string,
  limit = 25,
): Promise<Transaction[]> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ledger] transactionsForUser", error);
    return [];
  }
  return (data ?? []).map(toTransaction);
}

/** Full history, unsliced — lib/pnl.ts needs every row, not the last 25. */
export async function allTransactionsForUser(
  userId: string,
): Promise<Transaction[]> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_transactions")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    console.error("[ledger] allTransactionsForUser", error);
    return [];
  }
  return (data ?? []).map(toTransaction);
}

async function withEmails(
  rows: Transaction[],
): Promise<Array<Transaction & { user_email: string }>> {
  if (rows.length === 0) return [];
  const people = await allPeople();
  const byId = new Map(people.map((p) => [p.id, p.email]));
  return rows.map((t) => ({ ...t, user_email: byId.get(t.user_id) ?? t.user_id }));
}

export async function pendingTransfers() {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_transactions")
    .select("*")
    .in("kind", ["deposit", "withdrawal"])
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[ledger] pendingTransfers", error);
    return [];
  }
  return withEmails((data ?? []).map(toTransaction));
}

export async function recentTransfers(limit = 50) {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_transactions")
    .select("*")
    .in("kind", ["deposit", "withdrawal"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ledger] recentTransfers", error);
    return [];
  }
  const rows = (data ?? []).map(toTransaction).sort((a, b) => {
    // Pending first — the queue is a to-do list, not a history.
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return b.created_at - a.created_at;
  });
  return withEmails(rows);
}

/**
 * Settle or reject a pending transfer.
 *
 * Compare-and-set in one statement: if two operators hit Approve at the same
 * moment the second matches no rows and gets `false`, rather than crediting
 * the deposit twice. The database enforces the same rule independently — a
 * decided row can't be updated at all.
 */
export async function decideTransfer(
  id: string,
  status: "settled" | "rejected",
  adminEmail: string,
  note: string,
): Promise<boolean> {
  const db = await supabaseAdmin();
  const patch: Record<string, unknown> = {
    status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: adminEmail,
  };
  if (note) patch.note = note;

  const { data, error } = await db
    .from("app_transactions")
    .update(patch)
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[ledger] decideTransfer", error);
    return false;
  }
  return Boolean(data);
}

/** Cash = sum over the ledger. Defined once, in SQL — see app_cash(). */
export async function cashForUser(userId: string): Promise<number> {
  const db = await supabaseAdmin();
  const { data, error } = await db.rpc("app_cash", { uid: userId });
  if (error) {
    console.error("[ledger] cashForUser", error);
    return 0;
  }
  return num(data);
}

export interface UserWithCash {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_suspended: number;
  created_at: number;
  cash: number;
}

/** Every account with its balance, in two queries rather than one per user. */
export async function usersWithCash(): Promise<UserWithCash[]> {
  const db = await supabaseAdmin();
  const [people, cashRows] = await Promise.all([
    allPeople(),
    db.rpc("app_cash_all"),
  ]);

  if (cashRows.error) console.error("[ledger] app_cash_all", cashRows.error);
  const byId = new Map<string, number>(
    (cashRows.data ?? []).map((r: any) => [r.user_id as string, num(r.cash)]),
  );

  return people.map((p: AuthPerson) => ({
    id: p.id,
    email: p.email,
    first_name: p.first_name,
    last_name: p.last_name,
    is_suspended: p.is_suspended ? 1 : 0,
    created_at: p.created_at,
    cash: byId.get(p.id) ?? 0,
  }));
}

/* ------------------------------------------------------- valuation marks */

export async function addMark(m: {
  symbol: string;
  price: number;
  effective_at: number;
  basis: string;
  source: string;
  created_by: string;
}): Promise<Mark> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_marks")
    .insert({
      symbol: m.symbol.toUpperCase(),
      price: Math.round(m.price * 100) / 100,
      effective_at: iso(m.effective_at),
      basis: m.basis,
      source: m.source,
      created_by: m.created_by,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[ledger] addMark", error);
    throw new Error("mark_write_failed");
  }
  return toMark(data);
}

/** Oldest → newest by effective date. Feeds the stepped chart. */
export async function marksFor(symbol: string): Promise<Mark[]> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_marks")
    .select("*")
    .eq("symbol", symbol.toUpperCase())
    .order("effective_at", { ascending: true });
  if (error) {
    console.error("[ledger] marksFor", error);
    return [];
  }
  return (data ?? []).map(toMark);
}

export async function latestMark(symbol: string): Promise<Mark | null> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_marks")
    .select("*")
    .eq("symbol", symbol.toUpperCase())
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[ledger] latestMark", error);
    return null;
  }
  return data ? toMark(data) : null;
}

/**
 * Latest mark price per symbol in one query.
 *
 * Used by loadViewer / portfolio so private holdings revalue without N+1.
 * Symbols with no mark are omitted from the map (callers treat that as
 * "no price" — never invent a quote from cost basis).
 */
export async function latestMarksBySymbol(
  symbols: string[],
): Promise<Map<string, number>> {
  const uniq = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  if (uniq.length === 0) return new Map();

  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_marks")
    .select("symbol, price, effective_at")
    .in("symbol", uniq)
    .order("effective_at", { ascending: false });

  if (error) {
    console.error("[ledger] latestMarksBySymbol", error);
    return new Map();
  }

  const map = new Map<string, number>();
  for (const r of data ?? []) {
    const sym = r.symbol as string;
    // First row per symbol wins — query is newest effective_at first.
    if (!map.has(sym)) map.set(sym, num(r.price));
  }
  return map;
}

/**
 * Attach mark-to-market fields to positions.
 *
 * `quotePrices` is optional: pass public quote last prices so listed holdings
 * are valued in the same pass. Marks win when both exist for a symbol (private
 * vehicles should only appear in marks).
 *
 * cost_basis is never modified — that is invested capital from fills.
 */
export function valuePositions(
  positions: Position[],
  markPrices: Map<string, number>,
  quotePrices?: Map<string, number>,
): ValuedPosition[] {
  return positions.map((p) => {
    const sym = p.symbol.toUpperCase();
    const price =
      markPrices.get(sym) ?? quotePrices?.get(sym) ?? null;
    const market_value =
      price != null && Number.isFinite(price) ? price * p.quantity : null;
    const unrealized_pl =
      market_value != null ? market_value - p.cost_basis : null;
    return {
      ...p,
      mark_price: price,
      market_value,
      unrealized_pl,
    };
  });
}

/** Sum of market values; unpriced legs contribute 0 (same as hiding them from equity). */
export function totalMarketValue(valued: ValuedPosition[]): number {
  return valued.reduce((s, p) => s + (p.market_value ?? 0), 0);
}

export async function recentMarks(limit = 40): Promise<Mark[]> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_marks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ledger] recentMarks", error);
    return [];
  }
  return (data ?? []).map(toMark);
}

/**
 * Remove a mark — only by the admin who recorded it, only within 24 hours.
 * Both rules are enforced in SQL; a direct DELETE is refused by a trigger.
 */
export async function removeMark(id: string, adminEmail: string): Promise<boolean> {
  const db = await supabaseAdmin();
  const { data, error } = await db.rpc("app_remove_mark", {
    mid: id,
    admin_email: adminEmail,
  });
  if (error) {
    console.error("[ledger] removeMark", error);
    return false;
  }
  return Boolean(data);
}

/* ------------------------------------------------------ deposit addresses */

export async function addressesForUser(userId: string): Promise<DepositAddress[]> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_deposit_addresses")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true);
  if (error) {
    console.error("[ledger] addressesForUser", error);
    return [];
  }
  return (data ?? []).map(toAddress);
}

export async function allAddresses(): Promise<
  Array<DepositAddress & { user_email: string }>
> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_deposit_addresses")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[ledger] allAddresses", error);
    return [];
  }
  const people = await allPeople();
  const byId = new Map(people.map((p) => [p.id, p.email]));
  return (data ?? [])
    .map(toAddress)
    .map((a) => ({ ...a, user_email: byId.get(a.user_id) ?? a.user_id }));
}

/**
 * Assign an address to one account. Retiring the previous one and issuing the
 * new one happen together, and an address already issued to somebody else is
 * refused — a shared address makes deposits unattributable.
 */
export async function assignAddress(a: {
  user_id: string;
  asset: string;
  network: string;
  address: string;
  memo: string | null;
  assigned_by: string;
}): Promise<{ ok: true; row: DepositAddress } | { ok: false; error: string }> {
  const db = await supabaseAdmin();
  const { data, error } = await db.rpc("app_assign_address", {
    uid: a.user_id,
    p_asset: a.asset,
    p_net: a.network,
    p_addr: a.address,
    p_memo: a.memo,
    by: a.assigned_by,
  });

  if (error) {
    if ((error.message ?? "").includes("address_taken")) {
      return {
        ok: false,
        error:
          "That address is already assigned to another account. Deposits into a shared address can't be attributed.",
      };
    }
    console.error("[ledger] assignAddress", error);
    return { ok: false, error: "Could not issue that address." };
  }
  return { ok: true, row: toAddress(data) };
}

/* --------------------------------------------------- network addresses */

export interface NetworkAddress {
  network: string;
  address: string;
  memo: string | null;
  updated_by: string;
  updated_at: number;
}

const toNetAddr = (r: any): NetworkAddress => ({
  network: r.network,
  address: r.address,
  memo: r.memo ?? null,
  updated_by: r.updated_by,
  updated_at: ms(r.updated_at),
});

/** Every configured rail, for the admin desk. */
export async function networkAddresses(): Promise<NetworkAddress[]> {
  const db = await supabaseAdmin();
  const { data, error } = await db.from("app_network_addresses").select("*");
  if (error) {
    console.error("[ledger] networkAddresses", error);
    return [];
  }
  return (data ?? []).map(toNetAddr);
}

/**
 * Set the global address for a rail.
 *
 * Every change is written to the audit log by a database trigger, carrying the
 * previous address — the row itself only holds the current value, and this is
 * the one setting where "what was it before, and who changed it" is the
 * question you'll actually need answered.
 */
export async function setNetworkAddress(
  network: string,
  address: string,
  memo: string | null,
  by: string,
): Promise<{ ok: true; row: NetworkAddress } | { ok: false; error: string }> {
  const db = await supabaseAdmin();
  const { data, error } = await db.rpc("app_set_network_address", {
    net: network,
    addr: address,
    p_memo: memo,
    by,
  });

  if (error) {
    if ((error.message ?? "").includes("address_too_short")) {
      return { ok: false, error: "That address is too short to be real." };
    }
    console.error("[ledger] setNetworkAddress", error);
    return { ok: false, error: "Could not save that address." };
  }
  return { ok: true, row: toNetAddr(data) };
}

/**
 * Where this customer should send on this rail: their own override if one
 * exists, otherwise the global default, otherwise nothing.
 *
 * Nothing is a real answer — an unconfigured rail is closed, and the UI says
 * so. Falling back to another chain's address would lose the deposit.
 */
export async function resolveDepositAddress(
  userId: string,
  network: string,
): Promise<{ address: string; memo: string | null; source: "user" | "global" } | null> {
  const db = await supabaseAdmin();
  const { data, error } = await db.rpc("app_resolve_deposit_address", {
    uid: userId,
    net: network,
  });
  if (error) {
    console.error("[ledger] resolveDepositAddress", error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.address) return null;
  return { address: row.address, memo: row.memo ?? null, source: row.source };
}

/* ---------------------------------------------------------- notifications */

export async function pushNotification(n: {
  userId: string;
  kind: string;
  title: string;
  body: string;
  href?: string | null;
}): Promise<Notification | null> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_notifications")
    .insert({
      user_id: n.userId,
      kind: n.kind,
      title: n.title,
      body: n.body,
      href: n.href ?? null,
    })
    .select("*")
    .single();

  // A notification that fails to write must not take the money movement down
  // with it — the ledger row is the record, this is the courtesy copy.
  if (error) {
    console.error("[ledger] pushNotification", error);
    return null;
  }
  return toNotification(data);
}

export async function notificationsForUser(userId: string, limit = 30) {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ledger] notificationsForUser", error);
    return [];
  }
  return (data ?? []).map(toNotification);
}

export async function unreadCount(userId: string): Promise<number> {
  const db = await supabaseAdmin();
  const { count, error } = await db
    .from("app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) {
    console.error("[ledger] unreadCount", error);
    return 0;
  }
  return count ?? 0;
}

/** Marks everything unread as read. Returns HOW MANY changed, not void. */
export async function markNotificationsRead(userId: string): Promise<number> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null)
    .select("id");
  if (error) {
    console.error("[ledger] markNotificationsRead", error);
    return 0;
  }
  return (data ?? []).length;
}

/* -------------------------------------------------------------- audit log */

/**
 * Append-only, enforced by trigger — there is no update or delete for this
 * table. If you find yourself wanting one, what you want is another row.
 */
export async function logActivity(a: {
  userId?: string | null;
  actor: string;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: Record<string, unknown> | null;
}): Promise<Activity | null> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_activity")
    .insert({
      user_id: a.userId ?? null,
      actor: a.actor,
      action: a.action,
      entity: a.entity,
      entity_id: a.entityId ?? null,
      detail: a.detail ?? null,
    })
    .select("*")
    .single();
  if (error) {
    console.error("[ledger] logActivity", error);
    return null;
  }
  return toActivity(data);
}

export async function activityForUser(userId: string, limit = 50) {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_activity")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ledger] activityForUser", error);
    return [];
  }
  return (data ?? []).map(toActivity);
}

export async function recentActivity(limit = 100) {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_activity")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ledger] recentActivity", error);
    return [];
  }
  return (data ?? []).map(toActivity);
}

/* -------------------------------------------------------------- watchlist */

export async function watchlistForUser(userId: string): Promise<string[]> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("app_watchlist")
    .select("symbol")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[ledger] watchlistForUser", error);
    return [];
  }
  return (data ?? []).map((r: any) => r.symbol as string);
}

/** Returns the state AFTER the toggle: true = now watching. */
export async function toggleWatch(userId: string, symbol: string): Promise<boolean> {
  const db = await supabaseAdmin();
  const { data, error } = await db.rpc("app_toggle_watch", {
    uid: userId,
    sym: symbol.toUpperCase(),
  });
  if (error) {
    console.error("[ledger] toggleWatch", error);
    return false;
  }
  return Boolean(data);
}

