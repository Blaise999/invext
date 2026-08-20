"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import {
  assignAddress, addMark, cashForUser, holdersOf, removeMark, setNetworkAddress,
  decideTransfer, getTransaction, logActivity,
  postCorrection, pushNotification,
} from "@/lib/ledger";
import { findPersonById } from "@/lib/auth-store";
import { isPrivate, privateListingFor } from "@/lib/private";
import { networkById, checkAddress, shortAddress } from "@/lib/networks";

/**
 * Back-office actions against the app ledger (public.app_transactions).
 *
 * The rule that shapes all of this: THERE IS NO setBalance.
 *
 * That isn't a missing feature, it's the design. A balance here is a SUM over
 * an append-only ledger, so there is no column an operator could write. When
 * you need to change what someone's account is worth, you append a signed
 * `correction` row: attributed to you by email, carrying a written reason,
 * notified to the customer, and visible in their own activity feed next to
 * everything else. The old rows stay exactly as they were.
 *
 * Functionally this is "edit balance" — you type a number, the balance
 * changes, and the UI shows you the before and after. What it isn't is
 * *silent* or *reversible-without-trace*. An operator who can quietly set a
 * figure and a customer who can't see where their money came from is the
 * mechanism behind every fake-brokerage story, and it's also, more mundanely,
 * how honest firms lose reconciliations they can't explain to an auditor.
 *
 * Every action re-checks admin server-side. The UI hiding a button is not the
 * boundary; this is.
 */

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ---------------- funding queue ---------------- */

export async function reviewTransfer(
  id: string,
  approve: boolean,
  note: string,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };

  const row = await getTransaction(id);
  if (!row) return { ok: false, error: "No such request" };
  if (row.status !== "pending") {
    return { ok: false, error: `Already ${row.status} — approving twice would double it` };
  }
  if (!approve && note.trim().length < 10) {
    return { ok: false, error: "Rejections need a reason of at least 10 characters" };
  }

  const ok = await decideTransfer(id, approve ? "settled" : "rejected", admin.email, note.trim());
  if (!ok) return { ok: false, error: "Request changed underneath you — reload" };

  const kind = row.kind === "deposit" ? "Deposit" : "Withdrawal";
  await pushNotification({
    userId: row.user_id,
    kind: approve ? `${row.kind}_settled` : `${row.kind}_rejected`,
    title: `${kind} of $${row.amount.toFixed(2)} ${approve ? "settled" : "rejected"}`,
    body: approve
      ? row.kind === "deposit"
        ? "The funds have landed and are now in your buying power."
        : "The payout has been sent."
      : note.trim(),
    href: "/dashboard/transfer",
  });

  await logActivity({
    userId: row.user_id,
    actor: `admin:${admin.email}`,
    action: `${row.kind}.${approve ? "approved" : "rejected"}`,
    entity: "transfer",
    entityId: id,
    detail: { amount: row.amount, method: row.method, note: note.trim() },
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/* ---------------- balance adjustment ---------------- */

/**
 * Adjust a customer's cash balance.
 *
 * Append-only: the new balance is the old one plus this entry, and both are
 * reported back so the operator sees the effect before leaving the screen.
 */
export async function adjustBalance(
  userId: string,
  direction: "credit" | "debit",
  amount: string,
  reason: string,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };

  const target = await findPersonById(userId);
  if (!target) return { ok: false, error: "No such account" };

  if (reason.trim().length < 20) {
    return { ok: false, error: "A written reason of at least 20 characters is required" };
  }
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: "Amount must be a positive number" };
  }

  const delta = direction === "credit" ? r2(n) : -r2(n);

  /**
   * The balance is read, checked and written inside one database transaction
   * under a per-account lock. Doing it out here meant two operators — or one
   * operator and a customer's own withdrawal landing at the same moment — could
   * both read the same "before" figure and both pass a check the other had
   * already invalidated.
   *
   * A debit that would drive cash negative is refused. If it genuinely needs to
   * happen, it needs two entries with two reasons, not one silent one.
   */
  const posted = await postCorrection(userId, delta, reason.trim(), admin.email);

  if (!posted.ok) {
    if (posted.error === "negative_balance") {
      return {
        ok: false,
        error: `That debit would take the balance to $${(posted.before + delta).toFixed(2)}. Cash can't go negative here.`,
      };
    }
    return { ok: false, error: "That adjustment couldn't be posted. Nothing was changed." };
  }

  const row = posted.row;

  await pushNotification({
    userId,
    kind: "balance_adjusted",
    title: `Balance ${direction === "credit" ? "credited" : "debited"} $${r2(n).toFixed(2)}`,
    body: reason.trim(),
    href: "/dashboard/activity",
  });

  const after = await cashForUser(userId);
  const before = r2(after - delta);

  await logActivity({
    userId,
    actor: `admin:${admin.email}`,
    action: "balance.adjusted",
    entity: "ledger",
    entityId: row.id,
    detail: { direction, amount: r2(n), before, after, reason: reason.trim() },
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    message: `$${before.toFixed(2)} → $${after.toFixed(2)}`,
  };
}

/* ---------------- valuation marks ---------------- */

/**
 * Record a valuation mark for a private vehicle. This is the price the asset
 * carries on every holder's statement, and the point the chart steps to.
 *
 * The three required fields — effective date, basis, source — are what turn a
 * number into a mark. A figure with no date is not a valuation, it's an
 * assertion, and it will be indistinguishable from a guess in six months when
 * somebody asks where it came from. Everyone holding the asset is notified,
 * because a change to what their position is worth is news to them.
 */
/**
 * The global address for a rail — what every customer without an override
 * sends to.
 *
 * The highest-consequence setting in the back office: change it and everyone's
 * deposits start going somewhere else. A database trigger writes the previous
 * address, the new one and who changed it to the audit log before the change
 * takes effect, because the row itself only ever holds the current value.
 */
export async function setNetworkDefault(
  network: string,
  address: string,
  memo: string,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };

  const net = networkById(network);
  if (!net) return { ok: false, error: "Pick a network from the list" };

  const shape = checkAddress(net.id, address);
  if (!shape.ok) return { ok: false, error: shape.reason };

  const res = await setNetworkAddress(
    net.id,
    address.trim().slice(0, 120),
    memo.trim() ? memo.trim().slice(0, 60) : null,
    admin.email,
  );
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/admin");
  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    message: `${net.label} ${net.chain} now points at ${shortAddress(res.row.address)}`,
  };
}

export async function recordMark(
  symbol: string,
  price: string,
  effectiveDate: string,   // yyyy-mm-dd
  basis: string,
  source: string,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };

  const sym = symbol.toUpperCase();
  if (!isPrivate(sym)) {
    return {
      ok: false,
      error: "Marks apply to private vehicles only. Listed securities are priced by the market, not by us.",
    };
  }

  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: "Price must be a positive number" };
  }
  const at = Date.parse(effectiveDate);
  if (!Number.isFinite(at)) return { ok: false, error: "Effective date is required" };
  if (at > Date.now() + 86_400_000) {
    return { ok: false, error: "A mark can't be effective in the future" };
  }
  if (basis.trim().length < 3) {
    return { ok: false, error: "State the basis — funding round, secondary, 409A, tender" };
  }
  if (source.trim().length < 8) {
    return {
      ok: false,
      error: "State the source. A mark with no source can't be defended later, so it isn't recorded.",
    };
  }

  const mark = await addMark({
    symbol: sym,
    price: r2(n),
    effective_at: at,
    basis: basis.trim().slice(0, 80),
    source: source.trim().slice(0, 160),
    created_by: admin.email,
  });

  // Tell everyone whose position just got revalued. A change in what someone's
  // holding is worth is news to them, not an internal bookkeeping detail.
  const listing = privateListingFor(sym)!;
  const holders = await holdersOf(sym);
  for (const userId of holders) {
    await pushNotification({
      userId,
      kind: "mark_recorded",
      title: `New mark recorded for ${sym}`,
      body: `${basis.trim()} at $${r2(n).toFixed(2)} per unit, effective ${new Date(at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}.`,
      href: `/dashboard/stock/${sym.toLowerCase()}`,
    });
  }

  await logActivity({
    actor: `admin:${admin.email}`,
    action: "mark.recorded",
    entity: "mark",
    entityId: mark.id,
    detail: { symbol: sym, price: r2(n), effective_at: at, basis: basis.trim(), source: source.trim() },
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `${listing.name} marked at $${r2(n).toFixed(2)}` };
}

/** Undo a mark you recorded today. Anything older is history and stands. */
export async function deleteMark(id: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };

  const ok = await removeMark(id, admin.email);
  if (!ok) {
    return {
      ok: false,
      error: "Only the admin who recorded a mark can remove it, and only within 24 hours. Record a superseding mark instead.",
    };
  }

  await logActivity({
    actor: `admin:${admin.email}`,
    action: "mark.removed",
    entity: "mark",
    entityId: id,
    detail: {},
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/* ---------------- deposit addresses ---------------- */

/**
 * Assign a deposit address to one account.
 *
 * Per user, never shared — two people paying into one address makes deposits
 * unattributable, and matching by amount fails the first time two of them send
 * the same figure. The uniqueness check in `assignAddress` enforces that.
 *
 * The address must come from your custody provider or an HD wallet derived at
 * a unique index per user. Assigning an address you control personally, to an
 * account whose balance you can also adjust, is the structure of a scam
 * regardless of intent — and it's the structure an auditor will see.
 */
/**
 * Per-user override for one rail.
 *
 * The network comes from the fixed catalogue rather than a free-text box, so
 * an override can only ever attach to a rail a customer can actually see. The
 * address is shape-checked for that chain before it's saved — an operator
 * pasting an ERC-20 address under TRC20 would send every one of that
 * customer's deposits into nothing.
 */
export async function setDepositAddress(
  userId: string,
  network: string,
  address: string,
  memo: string,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };

  const target = await findPersonById(userId);
  if (!target) return { ok: false, error: "No such account" };

  const net = networkById(network);
  if (!net) return { ok: false, error: "Pick a network from the list" };

  const shape = checkAddress(net.id, address);
  if (!shape.ok) return { ok: false, error: shape.reason };

  const res = await assignAddress({
    user_id: userId,
    asset: net.asset,
    network: net.id,
    address: address.trim().slice(0, 120),
    memo: memo.trim() ? memo.trim().slice(0, 60) : null,
    assigned_by: admin.email,
  });
  if (!res.ok) return { ok: false, error: res.error };

  await pushNotification({
    userId,
    kind: "address_assigned",
    title: `Deposit address issued for ${net.label} (${net.chain})`,
    body: `Send only ${net.label} on ${net.chain}. A cross-chain send is unrecoverable.`,
    href: "/dashboard/transfer",
  });

  await logActivity({
    userId,
    actor: `admin:${admin.email}`,
    action: "address.assigned",
    entity: "deposit_address",
    entityId: res.row.id,
    detail: { network: net.id, address: res.row.address },
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `Issued to ${target.email}` };
}
