import { cookies } from "next/headers";

/**
 * DEMO MODE
 *
 * Lets you see the dashboard populated without a database, a Supabase project,
 * or a real deposit. Enter the access code on the sign-in screen and you get a
 * fully rendered account.
 *
 * Two hard guardrails, because a hidden code that conjures a six-figure balance
 * is exactly the mechanism fake brokerages use:
 *
 *   1. OFF IN PRODUCTION unless you explicitly set ALLOW_DEMO_IN_PROD=1.
 *      Forgetting to disable a demo mode is a normal mistake; this makes the
 *      normal mistake harmless.
 *   2. Every demo page renders a permanent, undismissable banner saying the
 *      numbers are fictional.
 *
 * Demo data never touches the ledger, the store, or any real money path. It is
 * a separate render branch that returns fixtures. Nothing here can create a
 * balance for a real account — there is no code path from these objects into
 * the database.
 */

export const DEMO_COOKIE = "invext_demo";
export const DEMO_CODE = process.env.DEMO_ACCESS_CODE || "2304";

export function demoAllowed(): boolean {
  if (process.env.ALLOW_DEMO_IN_PROD === "1") return true;
  return process.env.NODE_ENV !== "production";
}

export async function isDemo(): Promise<boolean> {
  if (!demoAllowed()) return false;
  const jar = await cookies();
  return jar.get(DEMO_COOKIE)?.value === "1";
}

/* ------------------------------------------------------------------ */

export const demoUser = {
  id: "demo-user",
  email: "james@example.com",
  first_name: "James",
  last_name: "Whitfield",
  us_state: "NY",
  state: "NY",
  email_verified: 1,
  created_at: Date.parse("2026-02-14T09:20:00Z"),
  last_login_at: Date.now() - 1000 * 60 * 42,
};

/** Cost bases are historical; market value is computed against live quotes. */
export const demoPositions = [
  { id: "p1", symbol: "SPCX", quantity: 640, cost_basis: 75_776.0,  opened_at: Date.parse("2026-06-12") },
  { id: "p2", symbol: "TSLA", quantity: 95,  cost_basis: 35_349.5,  opened_at: Date.parse("2026-03-04") },
  { id: "p3", symbol: "NVDA", quantity: 42,  cost_basis: 34_104.0,  opened_at: Date.parse("2026-01-22") },
  { id: "p4", symbol: "PLTR", quantity: 780, cost_basis: 16_614.0,  opened_at: Date.parse("2026-04-18") },
  { id: "p5", symbol: "AMZN", quantity: 34,  cost_basis:  6_069.0,  opened_at: Date.parse("2026-05-30") },
];

/** Invested 167,912.50 + cash 32,087.50 = 200,000 contributed. */
export const demoCash = 32_087.5;

export const demoTransactions = [
  { id: "t1", kind: "buy"        as const, symbol: "SPCX", amount: 75_776.0, status: "settled" as const, created_at: Date.parse("2026-06-12T14:31:00Z") },
  { id: "t2", kind: "deposit"    as const, symbol: null,   amount: 50_000.0, status: "settled" as const, created_at: Date.parse("2026-06-11T10:02:00Z") },
  { id: "t3", kind: "buy"        as const, symbol: "AMZN", amount:  6_069.0, status: "settled" as const, created_at: Date.parse("2026-05-30T15:48:00Z") },
  { id: "t4", kind: "buy"        as const, symbol: "PLTR", amount: 16_614.0, status: "settled" as const, created_at: Date.parse("2026-04-18T13:12:00Z") },
  { id: "t5", kind: "withdrawal" as const, symbol: null,   amount:  8_500.0, status: "settled" as const, created_at: Date.parse("2026-04-02T09:05:00Z") },
  { id: "t6", kind: "buy"        as const, symbol: "TSLA", amount: 35_349.5, status: "settled" as const, created_at: Date.parse("2026-03-04T16:20:00Z") },
  { id: "t7", kind: "deposit"    as const, symbol: null,   amount:100_000.0, status: "settled" as const, created_at: Date.parse("2026-02-14T11:40:00Z") },
  { id: "t8", kind: "buy"        as const, symbol: "NVDA", amount: 34_104.0, status: "settled" as const, created_at: Date.parse("2026-01-22T14:55:00Z") },
];

export const demoSessions = [
  { id: "s1", user_id: "demo-user", token_hash: "", user_agent: "Chrome / macOS", ip: null, expires_at: Date.now() + 6e8, created_at: Date.now() - 1000 * 60 * 42 },
  { id: "s2", user_id: "demo-user", token_hash: "", user_agent: "Safari / iPhone", ip: null, expires_at: Date.now() + 4e8, created_at: Date.now() - 1000 * 60 * 60 * 26 },
];

export const demoNotifications = [
  { id: 1, kind: "account",  title: "Q2 results published for SPCX", body: "Revenue of $7.81bn, ahead of expectations. Your largest holding.", href: "/#argument", read_at: null, created_at: new Date(Date.now() - 36e5).toISOString() },
  { id: 2, kind: "security", title: "New sign-in from iPhone",       body: "Safari on iPhone. If this wasn't you, change your password.", href: "/dashboard", read_at: null, created_at: new Date(Date.now() - 9e7).toISOString() },
  { id: 3, kind: "account",  title: "Lock-up expiry ahead",          body: "Roughly 6bn SPCX shares unlock before June 2027.", href: "/#argument", read_at: new Date(Date.now() - 17e7).toISOString(), created_at: new Date(Date.now() - 18e7).toISOString() },
];

export const demoActivity = [
  { id: 1, action: "account.signin",   entity: "session", detail: { device: "Safari / iPhone" }, actor_id: "demo-user", created_at: new Date(Date.now() - 42 * 6e4).toISOString() },
  { id: 2, action: "trade.buy",        entity: "order",   detail: { symbol: "SPCX", qty: 640 }, actor_id: "demo-user", created_at: new Date(Date.parse("2026-06-12T14:31:00Z")).toISOString() },
  { id: 3, action: "deposit.confirmed",entity: "deposit", detail: { amount: "50000.00", method: "ACH" }, actor_id: null, created_at: new Date(Date.parse("2026-06-11T10:02:00Z")).toISOString() },
  { id: 4, action: "withdrawal.sent",  entity: "withdrawal", detail: { amount: "8500.00" }, actor_id: null, created_at: new Date(Date.parse("2026-04-02T09:05:00Z")).toISOString() },
  { id: 5, action: "account.created",  entity: "profile", detail: {}, actor_id: "demo-user", created_at: new Date(demoUser.created_at).toISOString() },
];


/**
 * Fixture price history, so the portfolio chart and per-holding sparklines have
 * something to draw when the live providers are unreachable. Deterministic
 * seeded walk ending at each position's cost-per-share.
 *
 * Demo only, and only as a fallback — a live quote always wins. The banner
 * already states these are sample figures; without this the chart is simply
 * blank and you cannot review the design at all.
 */
export function demoSeries(symbol: string, endPrice: number, n = 260): number[] {
  let seed = 0;
  for (const ch of symbol) seed = (seed * 31 + ch.charCodeAt(0)) & 0x7fffffff;

  const out: number[] = [];
  let v = endPrice * 0.62;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const drift = (endPrice - v) * 0.02;
    const noise = ((seed % 1000) / 1000 - 0.5) * endPrice * 0.028;
    v = Math.max(endPrice * 0.35, v + drift + noise);
    out.push(Number(v.toFixed(2)));
  }
  out[n - 1] = endPrice;
  return out;
}
