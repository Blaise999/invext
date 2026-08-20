import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Deposit webhook — the ONLY path by which a crypto deposit becomes balance.
 *
 * Flow:
 *   processor sees a payment -> POSTs here -> we upsert chain_deposits ->
 *   the DB trigger credits ledger_entries once confirmations >= threshold ->
 *   public.balances (a view) reflects it -> the user sees it.
 *
 * Note what this handler does NOT do: set a balance. It cannot. There is no
 * balance column in the schema. It records what the chain did, and the database
 * decides when that becomes spendable.
 *
 * ── WIRE THIS UP BEFORE ENABLING DEPOSITS ─────────────────────────────────
 * The signature check below is a generic HMAC-SHA256 over the raw body. Every
 * provider differs — Coinbase Commerce uses X-CC-Webhook-Signature, BitPay
 * signs with an ECDSA identity, Fireblocks uses RSA. Replace `verify()` with
 * your provider's documented scheme and test it with a deliberately bad
 * signature before going near real money.
 *
 * An unauthenticated version of this endpoint is a hole straight into your
 * ledger: anyone who can POST to it could mint credits. The signature is not
 * optional.
 */

interface Payload {
  user_id: string;         // your reference, echoed back by the processor
  asset: string;           // must match assets.symbol, e.g. 'USDT-TRC20'
  address: string;
  txid: string;
  amount: string;          // decimal string — never a float
  confirmations: number;
  block_height?: number;
}

function verify(raw: string, header: string | null): boolean {
  const secret = process.env.DEPOSIT_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(header.replace(/^sha256=/, ""), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const raw = await req.text();

  if (!verify(raw, req.headers.get("x-webhook-signature"))) {
    // Deliberately terse — don't tell a prober which part failed.
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: Payload;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "malformed" }, { status: 400 });
  }

  const { user_id, asset, address, txid, amount, confirmations } = body;
  if (!user_id || !asset || !txid || !amount || confirmations == null) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
    return NextResponse.json({ error: "bad amount" }, { status: 400 });
  }

  const sb = await supabaseAdmin();

  // The address must already be assigned to this user. Without this check a
  // spoofed user_id could route someone else's deposit into the wrong account.
  const { data: addr } = await sb
    .from("deposit_addresses")
    .select("id, user_id")
    .eq("address", address)
    .eq("asset_symbol", asset)
    .eq("is_active", true)
    .maybeSingle();

  if (!addr || addr.user_id !== user_id) {
    console.error("[deposits] address/user mismatch", { asset, address });
    return NextResponse.json({ error: "unknown address" }, { status: 409 });
  }

  /**
   * Idempotent on (asset_symbol, txid) — the unique constraint means a replayed
   * webhook updates the confirmation count instead of creating a second
   * deposit. Combined with the unique chain_deposit_id on ledger_entries, one
   * on-chain transaction can never be credited twice.
   */
  const { error } = await sb
    .from("chain_deposits")
    .upsert(
      {
        user_id,
        asset_symbol: asset,
        deposit_address_id: addr.id,
        txid,
        amount,
        confirmations,
        block_height: body.block_height ?? null,
        raw: body as unknown as Record<string, unknown>,
      },
      { onConflict: "asset_symbol,txid" },
    );

  if (error) {
    console.error("[deposits] upsert failed", error);
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }

  // 200 tells the processor to stop retrying. Crediting, notifying and
  // journalling all already happened inside the database triggers.
  return NextResponse.json({ ok: true });
}
