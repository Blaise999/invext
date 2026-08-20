import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { decideTransfer, getTransaction } from "@/lib/ledger";

export const runtime = "nodejs";

/**
 * Fiat funding webhook — the path by which an ACH, wire or card deposit
 * becomes buying power.
 *
 *   processor confirms settlement -> POSTs here -> the pending row flips to
 *   settled -> cashForUser() starts counting it.
 *
 * The counterpart to app/api/webhooks/deposits/route.ts, which handles the
 * crypto rails through the 0001 schema. This one drives the app ledger
 * (public.app_transactions), so the approval flow works before any of that is
 * set up.
 *
 * ── THREE THINGS THAT ARE NOT NEGOTIABLE ───────────────────────────────────
 *
 * 1. THE SIGNATURE. Without DEPOSIT_WEBHOOK_SECRET set, every request is
 *    rejected. An unauthenticated version of this endpoint is a mint: anyone
 *    who can POST to it can create money. Replace `verify()` with your
 *    processor's documented scheme (Stripe's is `Stripe-Signature` with a
 *    timestamped payload; Plaid, Dwolla and Modern Treasury each differ) and
 *    test it with a deliberately wrong signature before going live.
 *
 * 2. IDEMPOTENCE. Processors retry. `decideTransfer` refuses to act on a row
 *    that isn't still pending, so a replayed webhook is a no-op rather than a
 *    double credit. Keep that property if you rewrite this.
 *
 * 3. IT ONLY SETTLES WHAT ALREADY EXISTS. The handler flips the state of a
 *    request the user filed. It cannot create a ledger row from thin air, so a
 *    compromised processor account can't invent a deposit for an account that
 *    never asked for one.
 */

interface Payload {
  /** The id returned to the client when the request was filed. */
  transfer_id: string;
  status: "settled" | "failed";
  /** Processor's own reference, stored for reconciliation. */
  reference?: string;
  reason?: string;
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
    // Terse on purpose — don't tell a prober which part failed.
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: Payload;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "malformed" }, { status: 400 });
  }

  if (!body.transfer_id || !["settled", "failed"].includes(body.status)) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const row = await getTransaction(body.transfer_id);
  if (!row) return NextResponse.json({ error: "unknown transfer" }, { status: 404 });

  // Already decided: acknowledge and do nothing. Retries must be harmless.
  if (row.status !== "pending") {
    return NextResponse.json({ ok: true, idempotent: true, status: row.status });
  }

  const decided = await decideTransfer(
    body.transfer_id,
    body.status === "settled" ? "settled" : "rejected",
    "webhook",
    body.reason ?? body.reference ?? "processor confirmation",
  );

  // Lost the race to a concurrent retry or an operator. Still a success from
  // the processor's point of view — the row is decided either way.
  if (!decided) {
    const now = await getTransaction(body.transfer_id);
    return NextResponse.json({ ok: true, idempotent: true, status: now?.status ?? "unknown" });
  }

  return NextResponse.json({ ok: true, status: body.status });
}
