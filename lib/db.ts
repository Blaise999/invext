import fs from "node:fs";
import path from "node:path";

/**
 * Zero-dependency persistent store.
 *
 * Everything lives in memory and flushes to one JSON file with an atomic
 * write (temp file + rename), so a crash mid-write can't corrupt it.
 *
 * The exported API is intentionally identical to what a SQL version would
 * expose, so moving to Postgres later means rewriting this file and nothing
 * else. Single-process by design — for multi-instance, do exactly that.
 *
 * This file is the ledger of record. lib/orders.ts, lib/pnl.ts and the admin
 * desk all read and write here; nothing else is allowed to hold a balance.
 */

const DIR = process.env.DATA_DIR || "/tmp/.data";
const FILE = path.join(DIR, "invext.json");

/* ------------------------------------------------------------------ types */

export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  state: string;
  email_verified: number;
  is_admin: number;
  is_suspended: number;
  suspended_reason: string | null;
  created_at: number;
  last_login_at: number | null;
}

export interface Challenge {
  id: string;
  user_id: string;
  purpose: "signup" | "login";
  code_hash: string;
  attempts: number;
  sends: number;
  last_sent_at: number;
  expires_at: number;
  consumed_at: number | null;
  created_at: number;
}

export interface Session {
  id: string;
  user_id: string;
  token_hash: string;
  user_agent: string | null;
  ip: string | null;
  expires_at: number;
  created_at: number;
}

export interface Position {
  id: string;
  user_id: string;
  symbol: string;
  quantity: number;
  cost_basis: number;
  opened_at: number;
}

export type TxKind =
  | "deposit"
  | "withdrawal"
  | "buy"
  | "sell"
  | "correction";

/**
 * One ledger row.
 *
 * The trade fields are nullable because a deposit has no quantity and a buy
 * has no destination — but when they ARE set they are set once, at the moment
 * the figure is knowable, and never recomputed.
 *
 * `realised` and `basis_relieved` in particular: lib/pnl.ts reads realised P/L
 * straight off these rows rather than reconstructing it from today's average
 * cost, because after a sale the average cost is unchanged but the quantity
 * isn't, and the reconstruction gives a different, wrong answer.
 *
 * Sign convention, in one place so nothing else re-derives it:
 *   deposit / sell / correction → `amount` is used as stored (correction is
 *                                 signed at write time; the others positive)
 *   withdrawal / buy            → `amount` is a positive magnitude, subtracted
 */
export interface Transaction {
  id: string;
  user_id: string;
  kind: TxKind;
  symbol: string | null;
  amount: number;
  status: "pending" | "settled" | "rejected" | "failed";

  /* trade legs */
  quantity: number | null;
  price: number | null;
  realised: number | null;
  basis_relieved: number | null;

  /* funding legs */
  method: string | null;
  reference: string | null;
  destination: string | null;

  /* review trail */
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

export interface WatchRow {
  id: string;
  user_id: string;
  symbol: string;
  created_at: number;
}

interface Shape {
  users: User[];
  challenges: Challenge[];
  sessions: Session[];
  positions: Position[];
  transactions: Transaction[];
  marks: Mark[];
  addresses: DepositAddress[];
  notifications: Notification[];
  activity: Activity[];
  watchlist: WatchRow[];
}

const empty: Shape = {
  users: [],
  challenges: [],
  sessions: [],
  positions: [],
  transactions: [],
  marks: [],
  addresses: [],
  notifications: [],
  activity: [],
  watchlist: [],
};

/* ------------------------------------------------------------- persistence */

function load(): Shape {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    if (!fs.existsSync(FILE)) return structuredClone(empty);
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    // Spread over `empty` so a file written by an older build — one with no
    // `marks` or `watchlist` key — loads as empty arrays, not undefined.
    return { ...structuredClone(empty), ...parsed };
  } catch {
    return structuredClone(empty);
  }
}

/** Survive Next's dev-mode module reloading. */
const g = globalThis as unknown as {
  __invextStore?: Shape;
  __invextExitHooked?: boolean;
};
const store: Shape = g.__invextStore ?? (g.__invextStore = load());

let flushTimer: NodeJS.Timeout | null = null;

function flush() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store), "utf8");
    fs.renameSync(tmp, FILE); // atomic
  } catch (e) {
    console.error("[store] flush failed", e);
  }
}

/** Coalesce write bursts; always flush on exit. */
function persist() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 40);
  flushTimer.unref?.();
}

// Guarded: without the flag every hot reload added three more listeners, and
// Node starts warning about a leak around reload ten.
if (!g.__invextExitHooked) {
  g.__invextExitHooked = true;
  for (const sig of ["exit", "SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => {
      flush();
      if (sig !== "exit") process.exit(0);
    });
  }
}

const rid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/* ---------------- users ---------------- */

export function findUserByEmail(email: string): User | undefined {
  const e = email.toLowerCase();
  return store.users.find((u) => u.email === e);
}

export function findUserById(id: string): User | undefined {
  return store.users.find((u) => u.id === id);
}

export function allUsers(): User[] {
  return [...store.users].sort((a, b) => b.created_at - a.created_at);
}

export function createUser(u: {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  state: string;
}) {
  const email = u.email.toLowerCase();
  if (store.users.some((x) => x.email === email)) throw new Error("email_taken");
  store.users.push({
    id: u.id,
    email,
    password_hash: u.passwordHash,
    first_name: u.firstName,
    last_name: u.lastName,
    state: u.state,
    email_verified: 0,
    is_admin: 0,
    is_suspended: 0,
    suspended_reason: null,
    created_at: Date.now(),
    last_login_at: null,
  });
  persist();
}

export function markVerified(userId: string) {
  const u = findUserById(userId);
  if (u) {
    u.email_verified = 1;
    persist();
  }
}

export function touchLogin(userId: string) {
  const u = findUserById(userId);
  if (u) {
    u.last_login_at = Date.now();
    persist();
  }
}

export function setSuspendedFlag(
  userId: string,
  suspended: boolean,
  reason: string | null,
): boolean {
  const u = findUserById(userId);
  if (!u) return false;
  u.is_suspended = suspended ? 1 : 0;
  u.suspended_reason = suspended ? reason : null;
  persist();
  return true;
}

/* ---------------- challenges ---------------- */

export function createChallenge(c: {
  id: string;
  userId: string;
  purpose: "signup" | "login";
  codeHash: string;
  expiresAt: number;
}) {
  const now = Date.now();
  store.challenges = store.challenges.filter(
    (x) => !(x.user_id === c.userId && x.purpose === c.purpose && !x.consumed_at),
  );
  store.challenges.push({
    id: c.id,
    user_id: c.userId,
    purpose: c.purpose,
    code_hash: c.codeHash,
    attempts: 0,
    sends: 1,
    last_sent_at: now,
    expires_at: c.expiresAt,
    consumed_at: null,
    created_at: now,
  });
  persist();
}

export function getChallenge(id: string): Challenge | undefined {
  return store.challenges.find((c) => c.id === id);
}

export function bumpAttempts(id: string) {
  const c = getChallenge(id);
  if (c) {
    c.attempts++;
    persist();
  }
}

export function consumeChallenge(id: string) {
  const c = getChallenge(id);
  if (c) {
    c.consumed_at = Date.now();
    persist();
  }
}

export function rotateChallengeCode(
  id: string,
  codeHash: string,
  expiresAt: number,
) {
  const c = getChallenge(id);
  if (!c) return;
  c.code_hash = codeHash;
  c.expires_at = expiresAt;
  c.last_sent_at = Date.now();
  c.sends++;
  c.attempts = 0;
  persist();
}

/* ---------------- sessions ---------------- */

export function createSession(s: {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: number;
}) {
  store.sessions.push({
    id: s.id,
    user_id: s.userId,
    token_hash: s.tokenHash,
    user_agent: s.userAgent,
    ip: s.ip,
    expires_at: s.expiresAt,
    created_at: Date.now(),
  });
  persist();
}

export function findSessionByTokenHash(hash: string) {
  return store.sessions.find(
    (s) => s.token_hash === hash && s.expires_at > Date.now(),
  );
}

export function deleteSessionByTokenHash(hash: string) {
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((s) => s.token_hash !== hash);
  if (store.sessions.length !== before) persist();
}

export function sessionsForUser(userId: string) {
  return store.sessions
    .filter((s) => s.user_id === userId && s.expires_at > Date.now())
    .sort((a, b) => b.created_at - a.created_at);
}

/* ---------------- positions ---------------- */

export function positionsForUser(userId: string): Position[] {
  return store.positions.filter((p) => p.user_id === userId);
}

/** Every position across every account — used to find a mark's holders. */
export function allPositions(): Position[] {
  return store.positions;
}

/**
 * Add to a position under weighted average cost.
 *
 * Quantity and basis both go up; average cost falls out of the two. Nothing
 * here touches cash — lib/orders.ts appends the ledger row for that, and the
 * two must stay separate or a failed write leaves shares with no debit.
 */
export function applyBuy(
  userId: string,
  symbol: string,
  quantity: number,
  price: number,
): Position {
  const sym = symbol.toUpperCase();
  const existing = store.positions.find(
    (p) => p.user_id === userId && p.symbol === sym,
  );

  if (existing) {
    existing.quantity = r6(existing.quantity + quantity);
    existing.cost_basis = r2(existing.cost_basis + quantity * price);
    persist();
    return existing;
  }

  const row: Position = {
    id: rid(),
    user_id: userId,
    symbol: sym,
    quantity: r6(quantity),
    cost_basis: r2(quantity * price),
    opened_at: Date.now(),
  };
  store.positions.push(row);
  persist();
  return row;
}

/**
 * Reduce a position, relieving basis proportionally so the average cost on
 * what remains is unchanged.
 *
 * Returns the basis relieved, which is the same figure lib/orders.ts computes
 * with `basisRelieved` before calling — recomputed here so the position and
 * the ledger row can never disagree about it.
 *
 * A sale that takes the quantity to (near) zero removes the row entirely
 * rather than leaving a dust position with a rounding-error basis.
 */
export function applySell(
  userId: string,
  symbol: string,
  quantity: number,
): number {
  const sym = symbol.toUpperCase();
  const p = store.positions.find(
    (x) => x.user_id === userId && x.symbol === sym,
  );
  if (!p || p.quantity <= 0) return 0;

  const sold = Math.min(quantity, p.quantity);
  const relieved = r2((p.cost_basis / p.quantity) * sold);

  const left = r6(p.quantity - sold);
  if (left <= 1e-9) {
    store.positions = store.positions.filter((x) => x.id !== p.id);
  } else {
    p.quantity = left;
    p.cost_basis = r2(p.cost_basis - relieved);
  }

  persist();
  return relieved;
}

/* ---------------- watchlist ---------------- */

export function watchlistForUser(userId: string): string[] {
  return store.watchlist
    .filter((w) => w.user_id === userId)
    .sort((a, b) => b.created_at - a.created_at)
    .map((w) => w.symbol);
}

/** Returns the state AFTER the toggle: true = now watching. */
export function toggleWatch(userId: string, symbol: string): boolean {
  const sym = symbol.toUpperCase();
  const existing = store.watchlist.find(
    (w) => w.user_id === userId && w.symbol === sym,
  );

  if (existing) {
    store.watchlist = store.watchlist.filter((w) => w.id !== existing.id);
    persist();
    return false;
  }

  store.watchlist.push({
    id: rid(),
    user_id: userId,
    symbol: sym,
    created_at: Date.now(),
  });
  persist();
  return true;
}

/* ---------------- ledger ---------------- */

export function appendTransaction(t: {
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
  reference?: string | null;
  destination?: string | null;
  note?: string | null;
  reviewed_at?: number | null;
  reviewed_by?: string | null;
}): Transaction {
  const row: Transaction = {
    id: rid(),
    user_id: t.user_id,
    kind: t.kind,
    symbol: t.symbol,
    amount: r2(t.amount),
    status: t.status ?? "pending",
    quantity: t.quantity ?? null,
    price: t.price ?? null,
    realised: t.realised ?? null,
    basis_relieved: t.basis_relieved ?? null,
    method: t.method ?? null,
    reference: t.reference ?? null,
    destination: t.destination ?? null,
    note: t.note ?? null,
    reviewed_at: t.reviewed_at ?? null,
    reviewed_by: t.reviewed_by ?? null,
    created_at: Date.now(),
  };
  store.transactions.push(row);
  persist();
  return row;
}

export function getTransaction(id: string): Transaction | undefined {
  return store.transactions.find((t) => t.id === id);
}

export function transactionsForUser(userId: string, limit = 25): Transaction[] {
  return store.transactions
    .filter((t) => t.user_id === userId)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit);
}

/** Full history, unsliced — lib/pnl.ts needs every row, not the last 25. */
export function allTransactionsForUser(userId: string): Transaction[] {
  return store.transactions.filter((t) => t.user_id === userId);
}

export function pendingTransfers(): Array<Transaction & { user_email: string }> {
  return store.transactions
    .filter(
      (t) =>
        (t.kind === "deposit" || t.kind === "withdrawal") &&
        t.status === "pending",
    )
    .sort((a, b) => a.created_at - b.created_at)
    .map((t) => ({
      ...t,
      user_email: findUserById(t.user_id)?.email ?? t.user_id,
    }));
}

export function recentTransfers(
  limit = 50,
): Array<Transaction & { user_email: string }> {
  return store.transactions
    .filter((t) => t.kind === "deposit" || t.kind === "withdrawal")
    .sort((a, b) => {
      // Pending first — the queue is a to-do list, not a history.
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (b.status === "pending" && a.status !== "pending") return 1;
      return b.created_at - a.created_at;
    })
    .slice(0, limit)
    .map((t) => ({
      ...t,
      user_email: findUserById(t.user_id)?.email ?? t.user_id,
    }));
}

/**
 * Settle or reject a pending transfer.
 *
 * Compare-and-set on `status`: if two operators hit Approve at the same moment,
 * the second sees the row is no longer pending and gets `false` back rather
 * than crediting the deposit twice.
 */
export function decideTransfer(
  id: string,
  status: "settled" | "rejected",
  adminEmail: string,
  note: string,
): boolean {
  const row = store.transactions.find((t) => t.id === id);
  if (!row || row.status !== "pending") return false;
  row.status = status;
  row.reviewed_at = Date.now();
  row.reviewed_by = adminEmail;
  row.note = note || row.note;
  persist();
  return true;
}

/**
 * Cash = sum over the ledger. There is no balance column; this is the only
 * definition of what an account holds.
 *
 * Pending WITHDRAWALS are subtracted even though they haven't settled. That is
 * deliberate and it is the one asymmetry here: filing a withdrawal holds the
 * funds immediately, so the same $500 can't be requested twice while the first
 * request sits in the review queue. Pending DEPOSITS are not credited, for the
 * mirror-image reason — money that hasn't landed isn't buying power.
 */
export function cashForUser(userId: string): number {
  let sum = 0;
  for (const t of store.transactions) {
    if (t.user_id !== userId) continue;
    if (t.status === "failed" || t.status === "rejected") continue;

    if (t.kind === "withdrawal") {
      // pending or settled — both hold
      sum -= Math.abs(t.amount);
      continue;
    }

    if (t.status !== "settled") continue;

    switch (t.kind) {
      case "deposit":
      case "sell":
      case "correction": // already signed at write time
        sum += t.amount;
        break;
      case "buy":
        sum -= Math.abs(t.amount);
        break;
    }
  }
  return r2(sum);
}

export function usersWithCash() {
  return allUsers().map((u) => ({
    id: u.id,
    email: u.email,
    first_name: u.first_name,
    last_name: u.last_name,
    is_suspended: u.is_suspended,
    created_at: u.created_at,
    cash: cashForUser(u.id),
  }));
}

/* ---------------- valuation marks ---------------- */

export function addMark(m: {
  symbol: string;
  price: number;
  effective_at: number;
  basis: string;
  source: string;
  created_by: string;
}): Mark {
  const row: Mark = {
    id: rid(),
    symbol: m.symbol.toUpperCase(),
    price: r2(m.price),
    effective_at: m.effective_at,
    basis: m.basis,
    source: m.source,
    created_by: m.created_by,
    created_at: Date.now(),
  };
  store.marks.push(row);
  persist();
  return row;
}

/** Oldest → newest by effective date. Feeds the stepped chart. */
export function marksFor(symbol: string): Mark[] {
  const s = symbol.toUpperCase();
  return store.marks
    .filter((m) => m.symbol === s)
    .sort((a, b) => a.effective_at - b.effective_at);
}

export function latestMark(symbol: string): Mark | undefined {
  const list = marksFor(symbol);
  return list.length ? list[list.length - 1] : undefined;
}

export function recentMarks(limit = 40): Mark[] {
  return [...store.marks]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit);
}

/**
 * Remove a mark — only by the admin who recorded it, only within 24 hours.
 * Older marks have already appeared on somebody's statement; the correct move
 * there is a superseding mark, not a deletion.
 */
export function removeMark(id: string, adminEmail: string): boolean {
  const m = store.marks.find((x) => x.id === id);
  if (!m) return false;
  if (m.created_by !== adminEmail) return false;
  if (Date.now() - m.created_at > 86_400_000) return false;
  store.marks = store.marks.filter((x) => x.id !== id);
  persist();
  return true;
}

/* ---------------- deposit addresses ---------------- */

export function addressesForUser(userId: string): DepositAddress[] {
  return store.addresses.filter((a) => a.user_id === userId && a.active === 1);
}

export function allAddresses(): Array<DepositAddress & { user_email: string }> {
  return store.addresses
    .filter((a) => a.active === 1)
    .sort((a, b) => b.created_at - a.created_at)
    .map((a) => ({
      ...a,
      user_email: findUserById(a.user_id)?.email ?? a.user_id,
    }));
}

/**
 * Assign an address to one account.
 *
 * The uniqueness check is the point: an address already issued to somebody else
 * is refused outright. Two people paying into one address makes deposits
 * unattributable, and matching by amount fails the first time two of them send
 * the same figure.
 *
 * Re-assigning the same asset to the same user deactivates the previous one
 * rather than leaving two live addresses the customer could pay into.
 */
export function assignAddress(a: {
  user_id: string;
  asset: string;
  network: string;
  address: string;
  memo: string | null;
  assigned_by: string;
}): { ok: true; row: DepositAddress } | { ok: false; error: string } {
  const clash = store.addresses.find(
    (x) =>
      x.address.toLowerCase() === a.address.toLowerCase() &&
      x.user_id !== a.user_id,
  );
  if (clash) {
    return {
      ok: false,
      error:
        "That address is already assigned to another account. Deposits into a shared address can't be attributed.",
    };
  }

  for (const x of store.addresses) {
    if (x.user_id === a.user_id && x.asset === a.asset && x.active === 1) {
      x.active = 0;
    }
  }

  const row: DepositAddress = {
    id: rid(),
    user_id: a.user_id,
    asset: a.asset,
    network: a.network,
    address: a.address,
    memo: a.memo,
    active: 1,
    assigned_by: a.assigned_by,
    created_at: Date.now(),
  };
  store.addresses.push(row);
  persist();
  return { ok: true, row };
}

/* ---------------- notifications ---------------- */

export function pushNotification(n: {
  userId: string;
  kind: string;
  title: string;
  body: string;
  href?: string | null;
}): Notification {
  const row: Notification = {
    id: rid(),
    user_id: n.userId,
    kind: n.kind,
    title: n.title,
    body: n.body,
    href: n.href ?? null,
    read_at: null,
    created_at: Date.now(),
  };
  store.notifications.push(row);
  persist();
  return row;
}

export function notificationsForUser(userId: string, limit = 30) {
  return store.notifications
    .filter((n) => n.user_id === userId)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit);
}

export function unreadCount(userId: string): number {
  return store.notifications.filter((n) => n.user_id === userId && !n.read_at)
    .length;
}

/**
 * Mark everything unread as read. Returns HOW MANY changed, not void — the
 * caller uses the count to decide whether a revalidate is worth doing, and a
 * void return there was silently truthy-tested.
 */
export function markNotificationsRead(userId: string): number {
  const now = Date.now();
  let read = 0;
  for (const n of store.notifications) {
    if (n.user_id === userId && !n.read_at) {
      n.read_at = now;
      read++;
    }
  }
  if (read > 0) persist();
  return read;
}

/* ---------------- audit log ---------------- */

/**
 * Append-only. There is deliberately no update or delete for this table — if
 * you ever find yourself wanting one, what you actually want is another row.
 *
 * `userId` is optional: mark events aren't scoped to one account.
 */
export function logActivity(a: {
  userId?: string | null;
  actor: string;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: Record<string, unknown> | null;
}): Activity {
  const row: Activity = {
    id: rid(),
    user_id: a.userId ?? null,
    actor: a.actor,
    action: a.action,
    entity: a.entity,
    entity_id: a.entityId ?? null,
    detail: a.detail ?? null,
    created_at: Date.now(),
  };
  store.activity.push(row);
  persist();
  return row;
}

export function activityForUser(userId: string, limit = 50): Activity[] {
  return store.activity
    .filter((a) => a.user_id === userId)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit);
}

export function recentActivity(limit = 100): Activity[] {
  return [...store.activity]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit);
}

/* ---------------- housekeeping ---------------- */

export function purgeExpired() {
  const now = Date.now();
  const before = store.sessions.length + store.challenges.length;
  store.sessions = store.sessions.filter((s) => s.expires_at > now);
  store.challenges = store.challenges.filter(
    (c) => c.consumed_at || c.expires_at > now - 86_400_000,
  );
  if (store.sessions.length + store.challenges.length !== before) persist();
}

export default store;
