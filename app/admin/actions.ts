"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * NOT WIRED. AdminTabs now imports ./desk-actions instead.
 *
 * Two reasons it was switched:
 *
 *  1. It writes a different ledger from the one the app reads. /admin renders
 *     rows from public.app_* (migration 0006), which is also what
 *     lib/orders.ts writes and what the customer's balance is summed from.
 *     These functions post into the 0001 crypto schema, so an approval here
 *     changed nothing the customer would ever see.
 *
 *  2. Several of the tables it queries don't exist. `withdrawals` (the schema
 *     defines `withdrawal_requests`), `private_marks` and `private_prices`
 *     are not in any migration, and `deposit_addresses` has no `network`
 *     column — so those calls error at runtime rather than doing nothing.
 *
 * Kept rather than deleted because the crypto-custody flow it targets is a
 * real one you may want later; it needs the table names reconciled against
 * 0001 before it's usable. Everything below is unreachable until something
 * imports it.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Every action re-checks admin server-side. Never rely on the UI hiding a
 * button — the button is not the boundary.
 *
 * Note what is absent: there is no setBalance action. Balances are a view over
 * an append-only ledger, so there is no column to write. `postCorrection`
 * appends a signed, attributed, customer-visible entry instead.
 */

type Result = { ok: true; message?: string } | { ok: false; error: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ==========================================================================
   WITHDRAWALS
   ========================================================================== */

export async function reviewWithdrawal(
  id: string,
  approve: boolean,
  note: string,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };
  if (!approve && note.trim().length < 10) {
    return { ok: false, error: "Rejections need a reason of at least 10 characters" };
  }

  const sb = await supabaseAdmin();
  const { error } = await sb.rpc("review_withdrawal", {
    p_id: id,
    p_approve: approve,
    p_note: note || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}

/* ==========================================================================
   ASSETS
   ========================================================================== */

export async function updateAsset(
  symbol: string,
  patch: {
    is_deposit_enabled?: boolean;
    is_withdrawal_enabled?: boolean;
    min_deposit?: number | null;
    min_withdrawal?: number | null;
    withdrawal_fee?: number;
    required_confirmations?: number;
  },
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };

  if (
    patch.required_confirmations != null &&
    (patch.required_confirmations < 1 || patch.required_confirmations > 200)
  ) {
    return { ok: false, error: "Confirmations must be between 1 and 200" };
  }

  const sb = await supabaseAdmin();
  const { error } = await sb.from("assets").update(patch).eq("symbol", symbol);
  if (error) return { ok: false, error: error.message };

  await sb.from("activity_log").insert({
    actor_id: null,
    action: "asset.updated",
    entity: "asset",
    entity_id: symbol,
    detail: { ...patch, by: admin.email },
  });

  revalidatePath("/admin");
  return { ok: true };
}

/* ==========================================================================
   ACCOUNTS
   ========================================================================== */

export async function setSuspended(
  userId: string,
  suspended: boolean,
  reason: string,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };
  if (suspended && reason.trim().length < 5) {
    return { ok: false, error: "A reason is required to suspend an account" };
  }

  const sb = await supabaseAdmin();
  const { error } = await sb
    .from("profiles")
    .update({ is_suspended: suspended, suspended_reason: suspended ? reason : null })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };

  await sb.from("activity_log").insert({
    user_id: userId,
    action: suspended ? "account.suspended" : "account.reinstated",
    entity: "profile",
    entity_id: userId,
    detail: { reason, by: admin.email },
  });

  revalidatePath("/admin");
  return { ok: true };
}

/* ==========================================================================
   CORRECTIONS
   ========================================================================== */

export async function postCorrection(
  userId: string,
  asset: string,
  direction: "credit" | "debit",
  amount: string,
  reason: string,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };
  if (reason.trim().length < 20) {
    return { ok: false, error: "A written reason of at least 20 characters is required" };
  }
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
    return { ok: false, error: "Amount must be a positive decimal" };
  }

  const sb = await supabaseAdmin();
  const { error } = await sb.rpc("post_correction", {
    p_user: userId,
    p_asset: asset,
    p_direction: direction,
    p_amount: amount,
    p_reason: `${reason} — by ${admin.email}`,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/**
 * What AdminTabs calls. Thin adapter over `postCorrection` — the component
 * has no asset selector on the balances tab, so cash corrections are USD.
 *
 * Returns a before → after message because an operator who can't see the
 * effect of the entry they just posted will post it twice.
 */
export async function adjustBalance(
  userId: string,
  direction: "credit" | "debit",
  amount: string,
  reason: string,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };

  const sb = await supabaseAdmin();
  const { data: before } = await sb
    .rpc("cash_for_user", { p_user: userId, p_asset: "USD" })
    .maybeSingle?.() ?? { data: null };

  const res = await postCorrection(userId, "USD", direction, amount, reason);
  if (!res.ok) return res;

  const n = r2(Number(amount));
  const delta = direction === "credit" ? n : -n;

  await sb.from("notifications").insert({
    user_id: userId,
    kind: "balance_adjusted",
    title: `Balance ${direction === "credit" ? "credited" : "debited"} $${n.toFixed(2)}`,
    body: reason.trim(),
    href: "/dashboard/activity",
  });

  const b = Number(before ?? NaN);
  return {
    ok: true,
    message: Number.isFinite(b)
      ? `$${b.toFixed(2)} → $${(b + delta).toFixed(2)}`
      : `${direction === "credit" ? "+" : "-"}$${n.toFixed(2)} posted`,
  };
}

/* ==========================================================================
   DEPOSITS
   Admin can approve or reject a deposit the chain-watcher already DETECTED.
   It cannot create one: `chain_deposits` rows are written by the webhook from
   a real txid, and approval only settles a row that already exists.
   ========================================================================== */

export async function reviewDeposit(
  id: string,
  approve: boolean,
  note: string,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };
  if (!approve && note.trim().length < 10) {
    return { ok: false, error: "Rejections need a reason of at least 10 characters" };
  }

  const sb = await supabaseAdmin();

  const { data: dep, error: readErr } = await sb
    .from("chain_deposits")
    .select("id, user_id, asset_symbol, amount, txid, status, confirmations")
    .eq("id", id)
    .maybeSingle();

  if (readErr) return { ok: false, error: readErr.message };
  if (!dep) return { ok: false, error: "Deposit not found" };
  if (dep.status === "confirmed") return { ok: false, error: "Already credited" };

  if (approve) {
    const { data: asset } = await sb
      .from("assets")
      .select("required_confirmations")
      .eq("symbol", dep.asset_symbol)
      .maybeSingle();

    const { error } = await sb
      .from("chain_deposits")
      .update({ confirmations: asset?.required_confirmations ?? 3 })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await sb
      .from("chain_deposits")
      .update({ status: "orphaned" })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  }

  await sb.from("activity_log").insert({
    user_id: dep.user_id,
    action: approve ? "deposit.approved" : "deposit.rejected",
    entity: "chain_deposit",
    entity_id: id,
    detail: { txid: dep.txid, asset: dep.asset_symbol, amount: dep.amount, note, by: admin.email },
  });

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * What AdminTabs calls. The funding queue mixes deposits and withdrawals in
 * one table, so this dispatches on where the id actually lives rather than
 * trusting a `kind` string the client sent us.
 */
export async function reviewTransfer(
  id: string,
  approve: boolean,
  note: string,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };

  const sb = await supabaseAdmin();

  const { data: wd } = await sb
    .from("withdrawals")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (wd) return reviewWithdrawal(id, approve, note);

  const { data: dep } = await sb
    .from("chain_deposits")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (dep) return reviewDeposit(id, approve, note);

  return { ok: false, error: "No such request" };
}

/* ==========================================================================
   DEPOSIT ADDRESSES
   ========================================================================== */

/**
 * Signature now takes `network` — that's the "Expected 4 arguments, but got 5"
 * error. It isn't cosmetic: the customer notification has to name the network,
 * because a USDC-on-Ethereum address sent USDC on Tron loses the funds and
 * there is no recovery path.
 */
export async function setDepositAddress(
  userId: string,
  asset: string,
  network: string,
  address: string,
  memo: string | null,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };
  if (network.trim().length < 3) return { ok: false, error: "Name the network" };
  if (address.trim().length < 20) {
    return { ok: false, error: "That does not look like a valid address" };
  }

  const sb = await supabaseAdmin();

  // Refuse an address already issued to someone else. Two people paying into
  // one address makes deposits unattributable, and matching by amount fails
  // the first time two of them send the same figure.
  const { data: clash } = await sb
    .from("deposit_addresses")
    .select("user_id")
    .eq("address", address.trim())
    .neq("user_id", userId)
    .maybeSingle();
  if (clash) {
    return {
      ok: false,
      error: "That address is already assigned to another account.",
    };
  }

  // Retire any existing active address for this user+asset. The partial unique
  // index allows one active row, so this must happen first.
  await sb
    .from("deposit_addresses")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("asset_symbol", asset)
    .eq("is_active", true);

  const { error } = await sb.from("deposit_addresses").insert({
    user_id: userId,
    asset_symbol: asset,
    network: network.trim(),
    address: address.trim(),
    memo: memo?.trim() || null,
    provider: "manual",
    is_active: true,
  });
  if (error) return { ok: false, error: error.message };

  await sb.from("notifications").insert({
    user_id: userId,
    kind: "address_assigned",
    title: `Deposit address issued for ${asset}`,
    body: `On ${network.trim()}. Send only ${asset} on that network — cross-chain sends are unrecoverable.`,
    href: "/dashboard/transfer",
  });

  await sb.from("activity_log").insert({
    user_id: userId,
    action: "deposit_address.set",
    entity: "deposit_address",
    entity_id: asset,
    detail: { asset, network: network.trim(), address: address.trim(), by: admin.email },
  });

  revalidatePath("/admin");
  return { ok: true };
}

/* ==========================================================================
   PRIVATE VALUATION MARKS
   ========================================================================== */

/**
 * `updatePrivatePrice` upserted a bare number onto one row per symbol: no
 * date, no basis, no source, previous value gone. That's the shape AdminTabs
 * stopped calling, and the reason it stopped is worth keeping in the file.
 *
 * A figure with no effective date isn't a valuation, it's an assertion — and
 * in six months, when somebody asks where it came from, it will be
 * indistinguishable from a guess. Marks are appended, not overwritten, and
 * carry the three fields that make them defensible.
 *
 * `private_prices` is still upserted at the end so existing read paths (chart,
 * TradeTicket, portfolio) keep working unchanged — it's now a cache of the
 * latest mark rather than the source of truth.
 */
export async function recordMark(
  symbol: string,
  price: string,
  effectiveDate: string, // yyyy-mm-dd
  basis: string,
  source: string,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };

  const sym = symbol.toUpperCase();
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

  const sb = await supabaseAdmin();

  const { data: mark, error } = await sb
    .from("private_marks")
    .insert({
      symbol: sym,
      price: r2(n),
      effective_at: new Date(at).toISOString(),
      basis: basis.trim().slice(0, 80),
      source: source.trim().slice(0, 160),
      created_by: admin.id,
      created_by_email: admin.email,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // Keep the read-path cache in step with the mark just recorded.
  await sb.from("private_prices").upsert(
    {
      symbol: sym,
      price: r2(n),
      updated_at: new Date().toISOString(),
      updated_by: admin.id,
    },
    { onConflict: "symbol" },
  );

  // Tell everyone whose position just got revalued.
  const { data: holders } = await sb
    .from("positions")
    .select("user_id")
    .eq("symbol", sym);

  const unique = [...new Set((holders ?? []).map((h) => h.user_id))];
  if (unique.length) {
    await sb.from("notifications").insert(
      unique.map((user_id) => ({
        user_id,
        kind: "mark_recorded",
        title: `New mark recorded for ${sym}`,
        body: `${basis.trim()} at $${r2(n).toFixed(2)} per unit, effective ${new Date(at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}.`,
        href: `/dashboard/stock/${sym.toLowerCase()}`,
      })),
    );
  }

  await sb.from("activity_log").insert({
    actor_id: admin.id,
    action: "mark.recorded",
    entity: "private_mark",
    entity_id: mark.id,
    detail: { symbol: sym, price: r2(n), effective_at: at, basis: basis.trim(), source: source.trim() },
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/market");
  revalidatePath("/dashboard/watchlist");
  revalidatePath("/dashboard/stock/[symbol]", "page");

  return { ok: true, message: `${sym} marked at $${r2(n).toFixed(2)}` };
}

/** Undo a mark you recorded today. Anything older is history and stands. */
export async function deleteMark(id: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorised" };

  const sb = await supabaseAdmin();

  const { data: mark } = await sb
    .from("private_marks")
    .select("id, symbol, created_by, created_at")
    .eq("id", id)
    .maybeSingle();

  if (
    !mark ||
    mark.created_by !== admin.id ||
    Date.now() - Date.parse(mark.created_at) > 86_400_000
  ) {
    return {
      ok: false,
      error:
        "Only the admin who recorded a mark can remove it, and only within 24 hours. Record a superseding mark instead.",
    };
  }

  const { error } = await sb.from("private_marks").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Roll the cache back to whatever mark is now latest.
  const { data: prev } = await sb
    .from("private_marks")
    .select("price")
    .eq("symbol", mark.symbol)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prev) {
    await sb
      .from("private_prices")
      .upsert(
        { symbol: mark.symbol, price: prev.price, updated_at: new Date().toISOString(), updated_by: admin.id },
        { onConflict: "symbol" },
      );
  } else {
    await sb.from("private_prices").delete().eq("symbol", mark.symbol);
  }

  await sb.from("activity_log").insert({
    actor_id: admin.id,
    action: "mark.removed",
    entity: "private_mark",
    entity_id: id,
    detail: { symbol: mark.symbol },
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/stock/[symbol]", "page");

  return { ok: true };
}
