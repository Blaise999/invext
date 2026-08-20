import type { Position, Transaction } from "./ledger";

/**
 * P&L.
 *
 * Everything here is a pure function of positions, ledger rows and prices —
 * no I/O, no dates read off the clock except where passed in. That's on
 * purpose: these are the numbers people make decisions on, so they need to be
 * the kind of thing you can check by hand and test without a database.
 *
 * ── THE THREE NUMBERS PEOPLE CONFUSE ───────────────────────────────────────
 *
 * UNREALISED P/L   market value − cost basis, on what you still hold.
 *                  Moves every time the price does. Not money you have.
 *
 * REALISED P/L     locked in at the moment of a sale: proceeds − the cost
 *                  basis relieved by that sale. Doesn't move afterwards.
 *
 * TOTAL RETURN     realised + unrealised, against what you actually put in.
 *                  This is the honest headline, and it's the one most apps
 *                  omit — showing only unrealised P/L flatters an account
 *                  that has been selling winners and holding losers.
 *
 * ── COST BASIS METHOD ──────────────────────────────────────────────────────
 *
 * Weighted average. Every sale relieves basis proportionally, so unrealised
 * P/L on the remainder stays correct. This is NOT tax-lot accounting: a real
 * 1099-B needs specific lots with acquisition dates and wash-sale adjustment,
 * and average cost will give a different (usually wrong) answer for tax.
 * Fine for a statement, not fine for a filing. See README.
 */

export interface PositionPnl {
  symbol: string;
  quantity: number;
  costBasis: number;
  avgCost: number;
  price: number | null;
  marketValue: number | null;
  unrealised: number | null;
  unrealisedPct: number | null;
  dayChange: number | null;
  /** Share of the portfolio's holdings value, 0–100. */
  weight: number | null;
}

export interface PortfolioPnl {
  cash: number;
  holdingsValue: number;
  total: number;
  costBasis: number;
  unrealised: number;
  unrealisedPct: number | null;
  realised: number;
  totalPnl: number;
  /** Net cash the customer actually put in: deposits − withdrawals. */
  netContributed: number;
  /** Total P/L over net contributions. The headline. */
  totalReturnPct: number | null;
  dayChange: number;
  dayChangePct: number | null;
  positions: PositionPnl[];
  /** Rows that have no price, so the caller can say so rather than show zero. */
  unpriced: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Realised P/L, read straight off the ledger.
 *
 * A `sell` row stores the basis it relieved at the time it happened, which is
 * the only moment that figure is knowable — recompute it later from today's
 * average cost and you'd get a different, wrong answer. `corrections` count
 * too, since an adjustment is real money in or out of the account.
 */
export function realisedPnl(transactions: Transaction[]): number {
  let total = 0;
  for (const t of transactions) {
    if (t.status !== "settled") continue;
    if (t.kind === "sell" && typeof t.realised === "number") total += t.realised;
  }
  return r2(total);
}

/** Deposits that actually landed, less withdrawals that left. */
export function netContributed(transactions: Transaction[]): number {
  let net = 0;
  for (const t of transactions) {
    if (t.status === "failed" || t.status === "rejected") continue;
    if (t.kind === "deposit" && t.status === "settled") net += t.amount;
    else if (t.kind === "withdrawal") net -= t.amount;
    else if (t.kind === "correction") net += t.amount;
  }
  return r2(net);
}

export function positionPnl(
  p: Position,
  price: number | null,
  dayChangePerShare: number | null,
  holdingsValue: number,
): PositionPnl {
  const avgCost = p.quantity > 0 ? p.cost_basis / p.quantity : 0;
  const marketValue = price != null ? price * p.quantity : null;
  const unrealised = marketValue != null ? marketValue - p.cost_basis : null;

  return {
    symbol: p.symbol,
    quantity: p.quantity,
    costBasis: r2(p.cost_basis),
    avgCost,
    price,
    marketValue: marketValue != null ? r2(marketValue) : null,
    unrealised: unrealised != null ? r2(unrealised) : null,
    unrealisedPct:
      unrealised != null && p.cost_basis > 0 ? (unrealised / p.cost_basis) * 100 : null,
    dayChange: dayChangePerShare != null ? r2(dayChangePerShare * p.quantity) : null,
    weight:
      marketValue != null && holdingsValue > 0 ? (marketValue / holdingsValue) * 100 : null,
  };
}

export function portfolioPnl(input: {
  positions: Position[];
  transactions: Transaction[];
  cash: number;
  /** Latest price per symbol. Missing or null means "no price" — never zero. */
  priceOf: (symbol: string) => number | null;
  /** Today's move per share. Null for private marks, which don't have a day. */
  dayMoveOf: (symbol: string) => number | null;
}): PortfolioPnl {
  const { positions, transactions, cash, priceOf, dayMoveOf } = input;

  const priced = positions.map((p) => ({ p, price: priceOf(p.symbol) }));
  const unpriced = priced.filter((x) => x.price == null).map((x) => x.p.symbol);

  // Unpriced rows contribute nothing rather than zero-valuing the position —
  // the caller shows an em dash and a note instead of a confidently wrong sum.
  const holdingsValue = r2(
    priced.reduce((s, x) => s + (x.price != null ? x.price * x.p.quantity : 0), 0),
  );

  const rows = priced.map(({ p, price }) =>
    positionPnl(p, price, dayMoveOf(p.symbol), holdingsValue),
  );

  const costBasis = r2(positions.reduce((s, p) => s + p.cost_basis, 0));
  // Only count basis for positions we can actually value, or unrealised P/L
  // reads as a loss the size of an unpriced holding.
  const pricedCost = r2(
    priced.reduce((s, x) => s + (x.price != null ? x.p.cost_basis : 0), 0),
  );

  const unrealised = r2(holdingsValue - pricedCost);
  const realised = realisedPnl(transactions);
  const net = netContributed(transactions);
  const total = r2(cash + holdingsValue);
  const totalPnl = r2(unrealised + realised);
  const dayChange = r2(rows.reduce((s, r) => s + (r.dayChange ?? 0), 0));

  return {
    cash: r2(cash),
    holdingsValue,
    total,
    costBasis,
    unrealised,
    unrealisedPct: pricedCost > 0 ? (unrealised / pricedCost) * 100 : null,
    realised,
    totalPnl,
    netContributed: net,
    totalReturnPct: net > 0 ? (totalPnl / net) * 100 : null,
    dayChange,
    dayChangePct:
      total - dayChange > 0 ? (dayChange / (total - dayChange)) * 100 : null,
    positions: rows,
    unpriced,
  };
}

/**
 * Basis relieved by a sale, under weighted average. Called at sell time so the
 * figure is fixed at the moment it's knowable.
 */
export function basisRelieved(
  costBasis: number,
  totalQuantity: number,
  soldQuantity: number,
): number {
  if (totalQuantity <= 0) return 0;
  return r2((costBasis / totalQuantity) * soldQuantity);
}
