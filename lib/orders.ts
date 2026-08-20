"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "./auth";
import { isDemo } from "./demo";
import { getQuote } from "./market";
import { getPrivateQuote, isPrivate, privateListingFor } from "./private";
import { networkById, checkAddress, NETWORKS } from "./networks";
import {
  appendTransaction,
  cashForUser,
  positionsForUser,
  resolveDepositAddress,
  logActivity,
  pushNotification,
  recordFill,
  toggleWatch as dbToggleWatch,
} from "./ledger";

/**
 * Order handling and funding requests.
 *
 * Everything here is server-side and re-derives its own numbers. The client
 * sends an intent — symbol, side, size — and nothing else. It never sends a
 * price, a balance, or a position size, because a client that can name the
 * price it fills at is not a brokerage, it's a form.
 *
 * Two things this deliberately does NOT do:
 *
 *  1. It does not route to a market. Nothing here reaches an exchange, a
 *     broker-dealer or a clearing firm, so a fill is a bookkeeping entry
 *     against a live quote, not a trade. Wire an executing broker (Alpaca,
 *     DriveWealth, Apex) before a single real dollar goes near it, and see
 *     README → "Connecting real execution".
 *  2. It does not invent liquidity. If the quote provider is down, the order
 *     is refused rather than filled at a guess.
 */

export type OrderResult =
  | { ok: true; filled: { symbol: string; side: string; quantity: number; price: number; notional: number } }
  | { ok: false; error: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

async function actor() {
  if (await isDemo()) return { demo: true as const, user: null };
  const user = await currentUser();
  return { demo: false as const, user };
}

/**
 * Market order. `size` is shares when mode is "shares", dollars when "dollars".
 * Fractional shares are supported on dollar orders, which is how a $25 order
 * on a $400 stock is possible at all.
 */
export async function placeOrder(
  symbol: string,
  side: "buy" | "sell",
  mode: "shares" | "dollars",
  size: number,
): Promise<OrderResult> {
  const { demo, user } = await actor();
  if (demo) {
    return {
      ok: false,
      error: "Demo accounts can't place orders — the ledger is read-only here. Sign up for a real account.",
    };
  }
  if (!user) return { ok: false, error: "Sign in to trade." };

  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }

  /**
   * Two kinds of asset, two kinds of number.
   *
   * A listed security fills at a live quote re-fetched right here — never at a
   * price the client sent, and never at a cached figure that could be minutes
   * stale. A private vehicle fills at the prevailing recorded mark, because
   * that is the only number that exists for it.
   *
   * Either way, if there's no number, the order is refused. Nothing in this
   * function invents a price.
   */
  const priv = isPrivate(symbol) ? await getPrivateQuote(symbol) : null;
  const quote = priv ? null : await getQuote(symbol);

  if (!priv && !quote) return { ok: false, error: `${symbol} isn't a symbol we carry.` };

  const resolved = priv
    ? { symbol: priv.symbol, price: priv.price, source: "mark" as const }
    : { symbol: quote!.symbol, price: quote!.price, source: quote!.source };

  if (resolved.price == null) {
    return {
      ok: false,
      error: priv
        ? `No valuation mark has been recorded for ${resolved.symbol}, so there is no price to transact at.`
        : "No live quote for this symbol right now, so there's no honest price to fill at. Try again shortly.",
    };
  }

  const price = resolved.price;

  /**
   * SIZING
   *
   * The naive version — divide, round to six places, multiply back — is what
   * made "buy with everything" and "sell everything" fail on a cent.
   *
   * Buying $500.00 of a $173.33 stock gives 2.884671... shares. Rounded up to
   * six places that is 2.884672, and 2.884672 x 173.33 rounds to $500.01. The
   * ledger then rejects the order for insufficient cash against a balance of
   * exactly $500.00, which to the person typing it looks like the app can't do
   * arithmetic.
   *
   * Selling has the mirror problem: a holding of 2.884672 shares entered as
   * 2.884672 can land a hair above the stored quantity once both sides have
   * been rounded, and the position check refuses a sale of the whole position.
   *
   * So: floor when converting dollars to shares, never round up — the fill can
   * come in a cent under what was asked, never a cent over. Then snap to the
   * true edge when the request is within a rounding whisker of it, because
   * "all of it" is what was meant.
   */
  const EPS = 5e-6;

  let quantity =
    mode === "shares"
      ? Number(size.toFixed(6))
      : Math.floor((size / price) * 1e6) / 1e6;

  if (quantity <= 0) {
    return { ok: false, error: "That works out to zero shares at the current price." };
  }

  if (side === "buy") {
    // Clamp to what's actually spendable. Catches the max-buy case above and
    // gives a truthful error instead of one that reads as a bug.
    const available = await cashForUser(user.id);
    const affordable = Math.floor((available / price) * 1e6) / 1e6;

    if (affordable <= 0) {
      return {
        ok: false,
        error: `Your available cash is ${available.toFixed(2)}, which isn't enough for one share of ${resolved.symbol} at ${price.toFixed(2)}.`,
      };
    }
    // Only ever trims — an order well inside the balance is untouched.
    if (quantity > affordable) quantity = affordable;
  } else {
    const held = (await positionsForUser(user.id))
      .filter((x) => x.symbol.toUpperCase() === resolved.symbol.toUpperCase())
      .reduce((n, x) => n + x.quantity, 0);

    if (held <= 0) {
      return { ok: false, error: `You don't hold any ${resolved.symbol}.` };
    }
    // Sell-all: within a rounding whisker of the whole position means the whole
    // position, so no unsellable dust is left behind.
    if (quantity > held - EPS) quantity = Number(held.toFixed(6));
    if (quantity > held) {
      return {
        ok: false,
        error: `You hold ${held} ${resolved.symbol}, which is less than you're trying to sell.`,
      };
    }
  }

  const notional = round2(quantity * price);
  if (notional < 1) return { ok: false, error: "Minimum order is $1.00." };

  /**
   * One call, one database transaction: the cash or holding check, the
   * position change and the ledger row all happen together under a per-account
   * lock. Previously these were four separate writes with network hops in
   * between — a failure in the gap left shares with no debit against them, and
   * two simultaneous buys could both pass the same balance check.
   *
   * Realised P/L and basis relieved come back computed against the position as
   * it stood BEFORE the sale, which is the only moment those figures are
   * knowable.
   */
  const fill = await recordFill({
    userId: user.id,
    symbol: resolved.symbol,
    side,
    quantity,
    price,
    priceSource: resolved.source ?? null,
  });

  if (!fill.ok) {
    if (fill.error === "insufficient_cash") {
      return {
        ok: false,
        error: `Buying power is $${fill.available.toFixed(2)}. Deposit before placing this order.`,
      };
    }
    if (fill.error === "insufficient_position") {
      return { ok: false, error: `You hold ${fill.held} of ${resolved.symbol}.` };
    }
    return { ok: false, error: "That order couldn't be recorded. Nothing was changed." };
  }

  const row = fill.row;
  const realised = row.realised;

  const verb = side === "buy" ? "Bought" : "Sold";
  await pushNotification({
    userId: user.id,
    kind: "order_filled",
    title: `${verb} ${quantity.toFixed(4)} ${resolved.symbol}`,
    body:
      `Filled at $${price.toFixed(2)} for $${notional.toFixed(2)}.` +
      (realised != null
        ? ` Realised ${realised >= 0 ? "gain" : "loss"} of $${Math.abs(realised).toFixed(2)}.`
        : ""),
    href: `/dashboard/stock/${resolved.symbol.toLowerCase()}`,
  });

  await logActivity({
    userId: user.id,
    actor: `user:${user.email}`,
    action: `order.${side}`,
    entity: "order",
    entityId: row.id,
    detail: { symbol: resolved.symbol, quantity, price, notional, realised, source: resolved.source },
  });

  revalidatePath("/dashboard", "layout");

  return { ok: true, filled: { symbol: resolved.symbol, side, quantity, price, notional } };
}

/* ---------------- funding ---------------- */

export type TransferResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * A deposit request. It creates a PENDING row and credits nothing. Cash only
 * moves when a processor webhook or an admin marks it settled — see
 * app/api/webhooks/deposits/route.ts. Anything that credits on submit is
 * crediting money it hasn't received.
 */
export async function requestDeposit(
  network: string,
  amount: number,
  reference: string,
): Promise<TransferResult> {
  const { demo, user } = await actor();
  if (demo) return { ok: false, error: "Demo accounts can't move money." };
  if (!user) return { ok: false, error: "Sign in first." };

  const net = networkById(network);
  if (!net) return { ok: false, error: "Pick a network." };
  if (!Number.isFinite(amount) || amount < net.min) {
    return { ok: false, error: `Minimum on ${net.label} ${net.chain} is $${net.min}.` };
  }
  if (amount > 250_000) {
    return { ok: false, error: "Amounts above $250,000 need to go through support." };
  }

  // Filed against the address this customer was actually shown, so the desk
  // can check the chain for a payment rather than guessing which rail it
  // arrived on.
  const addr = await resolveDepositAddress(user.id, net.id);
  if (!addr) {
    return { ok: false, error: `Deposits on ${net.label} ${net.chain} aren't open yet.` };
  }

  const row = await appendTransaction({
    user_id: user.id,
    kind: "deposit",
    symbol: null,
    amount: round2(amount),
    status: "pending",
    method: "crypto",
    network: net.id,
    reference: reference.trim().slice(0, 120) || null,
    destination: addr.address,
  });

  await pushNotification({
    userId: user.id,
    kind: "deposit_filed",
    title: `Deposit of $${round2(amount).toFixed(2)} filed`,
    body: `Once your ${net.label} transfer confirms on ${net.chain}, the desk releases it into your balance. It stays out of your buying power until then.`,
    href: "/dashboard/transfer",
  });
  await logActivity({
    userId: user.id,
    actor: `user:${user.email}`,
    action: "deposit.requested",
    entity: "transfer",
    entityId: row.id,
    detail: { amount: round2(amount), network: net.id, to: addr.address },
  });

  revalidatePath("/dashboard", "layout");
  return { ok: true, id: row.id };
}

/**
 * A withdrawal request. Funds are held the moment it is filed — `cashForUser`
 * subtracts pending withdrawals — so the same balance can't be requested twice
 * while the first sits in the review queue.
 */
export async function requestWithdrawal(
  network: string,
  amount: number,
  destination: string,
): Promise<TransferResult> {
  const { demo, user } = await actor();
  if (demo) return { ok: false, error: "Demo accounts can't move money." };
  if (!user) return { ok: false, error: "Sign in first." };

  const net = networkById(network);
  if (!net) return { ok: false, error: "Pick a network." };
  if (!Number.isFinite(amount) || amount < net.min) {
    return { ok: false, error: `Minimum on ${net.label} ${net.chain} is $${net.min}.` };
  }

  /**
   * Checked here as well as in the browser.
   *
   * A client-side check is a convenience; this one is the control. An address
   * for the wrong chain is unrecoverable by anyone once paid out, so the last
   * place that can still catch it is before the row is written — after that
   * the destination is immutable and an operator is reading it in a queue.
   */
  const clean = destination.trim();
  const shape = checkAddress(net.id, clean);
  if (!shape.ok) return { ok: false, error: shape.reason };

  const cash = await cashForUser(user.id);
  if (amount > cash) {
    return {
      ok: false,
      error: `Available to withdraw is $${cash.toFixed(2)}. Sell holdings first if you need more.`,
    };
  }

  const row = await appendTransaction({
    user_id: user.id,
    kind: "withdrawal",
    symbol: null,
    amount: round2(amount),
    status: "pending",
    method: "crypto",
    network: net.id,
    destination: clean.slice(0, 120),
  });

  await pushNotification({
    userId: user.id,
    kind: "withdrawal_filed",
    title: `Withdrawal of $${round2(amount).toFixed(2)} filed`,
    body: `Held from your balance now, paid to your ${net.chain} address once the desk reviews it.`,
    href: "/dashboard/transfer",
  });
  await logActivity({
    userId: user.id,
    actor: `user:${user.email}`,
    action: "withdrawal.requested",
    entity: "transfer",
    entityId: row.id,
    detail: { amount: round2(amount), network: net.id, to: clean.slice(0, 120) },
  });

  revalidatePath("/dashboard", "layout");
  return { ok: true, id: row.id };
}

/* ---------------- watchlist ---------------- */

export async function toggleWatchlist(symbol: string): Promise<{ watching: boolean }> {
  const { demo, user } = await actor();
  if (demo || !user) return { watching: false };
  const watching = await dbToggleWatch(user.id, symbol.toUpperCase());
  revalidatePath("/dashboard", "layout");
  return { watching };
}
