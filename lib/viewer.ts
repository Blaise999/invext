import { redirect } from "next/navigation";
import { currentUser } from "./auth";
import {
  cashForUser,
  positionsForUser,
  transactionsForUser,
  latestMarksBySymbol,
  marksFor,
  type Mark,
  type Position,
  type Transaction,
} from "./ledger";
import { sessionsForUser } from "./auth-store";
import {
  isDemo,
  demoAllowed,
  demoUser,
  demoPositions,
  demoTransactions,
  demoSessions,
  demoCash,
  demoSeries,
} from "./demo";
import { getQuotes, type Quote } from "./market";
import { portfolioPnl } from "./pnl";

/**
 * One loader shared by every dashboard route, so the five pages can't drift
 * apart on how they resolve identity or value positions.
 *
 * Prices, in order:
 *   1. Live public quote (if the symbol is listed and quoted)
 *   2. Latest private valuation mark from app_marks
 *   3. Demo only: cost-per-share fallback so empty demo accounts still chart
 *
 * Never invent a real-account price from cost basis — that looks like a quote.
 */

/** Step chart from marks (value restated on dates, not interpolated). */
function steppedSeries(marks: Mark[], points = 60): number[] {
  if (marks.length === 0) return [];
  if (marks.length === 1) return Array(points).fill(marks[0].price);

  const first = marks[0].effective_at;
  const last = marks[marks.length - 1].effective_at;
  const span = Math.max(last - first, 1);

  return Array.from({ length: points }, (_, i) => {
    const t = first + (span * i) / (points - 1);
    let px = marks[0].price;
    for (const m of marks) {
      if (m.effective_at <= t) px = m.price;
      else break;
    }
    return px;
  });
}

/** Demo fixtures are intentionally slim — pad to ledger Position. */
function asPositions(
  rows: Array<{
    id: string;
    symbol: string;
    quantity: number;
    cost_basis: number;
    opened_at?: number;
    user_id?: string;
  }>,
  userId: string,
): Position[] {
  return rows.map((p) => ({
    id: p.id,
    user_id: p.user_id ?? userId,
    symbol: p.symbol,
    quantity: p.quantity,
    cost_basis: p.cost_basis,
    opened_at: p.opened_at ?? 0,
  }));
}

/**
 * Demo txs only carry what the UI needs. Pad required Transaction fields so
 * portfolioPnl type-checks; realised/basis stay null unless the fixture sets them.
 */
function asTransactions(
  rows: Array<Record<string, unknown>>,
  userId: string,
): Transaction[] {
  return rows.map((t) => {
    const amount = Number(t.amount ?? 0);
    return {
      id: String(t.id ?? ""),
      user_id: String(t.user_id ?? userId),
      kind: t.kind as Transaction["kind"],
      symbol: (t.symbol as string | null | undefined) ?? null,
      amount,
      status: (t.status as Transaction["status"]) ?? "settled",
      quantity: t.quantity != null ? Number(t.quantity) : null,
      price: t.price != null ? Number(t.price) : null,
      realised: t.realised != null ? Number(t.realised) : null,
      basis_relieved: t.basis_relieved != null ? Number(t.basis_relieved) : null,
      method: (t.method as string | null | undefined) ?? null,
      network: (t.network as string | null | undefined) ?? null,
      reference: (t.reference as string | null | undefined) ?? null,
      destination: (t.destination as string | null | undefined) ?? null,
      note: (t.note as string | null | undefined) ?? null,
      reviewed_at: t.reviewed_at != null ? Number(t.reviewed_at) : null,
      reviewed_by: (t.reviewed_by as string | null | undefined) ?? null,
      created_at: Number(t.created_at ?? 0),
    };
  });
}

export async function loadViewer() {
  const explicitDemo = await isDemo();
  const real = explicitDemo ? null : await currentUser();
  const demo = explicitDemo || (!real && demoAllowed());
  if (!demo && !real) redirect("/login");

  const user = demo ? demoUser : real!;

  const [quotes, rawPositions, rawTransactions, sessions, cash] =
    await Promise.all([
      getQuotes(),
      demo ? Promise.resolve(demoPositions) : positionsForUser(user.id),
      demo ? Promise.resolve(demoTransactions) : transactionsForUser(user.id),
      demo ? Promise.resolve(demoSessions) : sessionsForUser(user.id),
      demo ? Promise.resolve(demoCash) : cashForUser(user.id),
    ]);

  // Always full ledger shapes before pnl / mark lookups.
  const positions: Position[] = demo
    ? asPositions(demoPositions as Parameters<typeof asPositions>[0], user.id)
    : (rawPositions as Position[]);
  const transactions: Transaction[] = demo
    ? asTransactions(
        demoTransactions as Array<Record<string, unknown>>,
        user.id,
      )
    : (rawTransactions as Transaction[]);

  const bySymbol = new Map<string, Quote>(quotes.map((q) => [q.symbol, q]));

  const markPrices = demo
    ? new Map<string, number>()
    : await latestMarksBySymbol(positions.map((p) => p.symbol));

  const privateSyms = [
    ...new Set(
      positions
        .map((p) => p.symbol.toUpperCase())
        .filter((s) => bySymbol.get(s)?.price == null && markPrices.has(s)),
    ),
  ];
  const markHistory = new Map<string, Mark[]>();
  if (!demo && privateSyms.length > 0) {
    await Promise.all(
      privateSyms.map(async (sym) => {
        markHistory.set(sym, await marksFor(sym));
      }),
    );
  }

  const priceFor = (sym: string, costPerShare: number): number | null => {
    const key = sym.toUpperCase();
    const live = bySymbol.get(key)?.price ?? bySymbol.get(sym)?.price;
    if (live != null && Number.isFinite(live)) return live;

    const mark = markPrices.get(key);
    if (mark != null && Number.isFinite(mark)) return mark;

    return demo ? costPerShare : null;
  };

  const seriesFor = (sym: string, costPerShare: number): number[] => {
    const key = sym.toUpperCase();
    const live = bySymbol.get(key)?.series ?? bySymbol.get(sym)?.series ?? [];
    if (live.length > 1) return live;

    const marks = markHistory.get(key);
    if (marks && marks.length > 0) return steppedSeries(marks);

    return demo ? demoSeries(sym, costPerShare) : [];
  };

  const pnl = portfolioPnl({
    positions,
    transactions,
    cash,
    priceOf: (sym) => {
      const p = positions.find(
        (x) => x.symbol.toUpperCase() === sym.toUpperCase(),
      );
      const cps = p && p.quantity > 0 ? p.cost_basis / p.quantity : 0;
      return priceFor(sym, cps);
    },
    dayMoveOf: (sym) => {
      const q = bySymbol.get(sym.toUpperCase()) ?? bySymbol.get(sym);
      return q?.changeAbs ?? null;
    },
  });

  const quotesDown =
    positions.length > 0 &&
    positions.every((p) => priceFor(p.symbol, p.cost_basis / p.quantity) == null);

  const holdingsValue = pnl.holdingsValue;
  const costTotal = pnl.costBasis;
  const total = pnl.total;
  const openPL = pnl.unrealised;

  const seriesLens = positions
    .map((p) => seriesFor(p.symbol, p.cost_basis / p.quantity).length)
    .filter((n) => n > 1);
  const span =
    seriesLens.length === positions.length && seriesLens.length > 0
      ? Math.min(...seriesLens)
      : 0;

  const portfolioSeries: number[] =
    span > 1
      ? Array.from({ length: span }, (_, i) =>
          positions.reduce((sum, p) => {
            const ser = seriesFor(p.symbol, p.cost_basis / p.quantity);
            const px = ser[ser.length - span + i];
            return sum + (Number.isFinite(px) ? px * p.quantity : 0);
          }, cash),
        )
      : [];

  const dayChangeAbs = pnl.dayChange;

  const allocation = positions.map((p) => {
    const px = priceFor(p.symbol, p.cost_basis / p.quantity);
    return { symbol: p.symbol, value: px != null ? px * p.quantity : 0 };
  });

  return {
    demo,
    explicitDemo,
    user,
    quotes,
    bySymbol,
    positions,
    transactions,
    sessions,
    cash,
    holdingsValue,
    costTotal,
    total,
    openPL,
    quotesDown,
    portfolioSeries,
    dayChangeAbs,
    allocation,
    priceFor,
    seriesFor,
    pnl,
    markPrices,
  };
}