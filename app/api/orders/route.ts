import { NextResponse } from "next/server";
import { placeOrder } from "@/lib/orders";

export const runtime = "nodejs";

/**
 * Order intake.
 *
 * This used to return 501 unconditionally — "No broker-dealer is connected to
 * this build" — which is the message every Buy button in the app produced,
 * because the ticket posted here while the working implementation sat unused
 * in lib/orders.ts. The ticket now calls that server action directly; this
 * route exists for anything outside the browser session and delegates to the
 * same code path, so the two can't diverge.
 *
 * What "executes" means here, stated plainly: nothing reaches an exchange, a
 * broker-dealer or a clearing firm. A fill is a bookkeeping entry against a
 * live quote re-fetched server-side. That is correct for a proof of concept
 * and NOT correct for real customer money — wire an executing broker (Alpaca
 * Trading API, DriveWealth, Apex) before a real dollar goes near it, and only
 * write a ledger entry when the broker confirms a fill.
 *
 * Body:  { symbol, side: "buy"|"sell", mode?: "shares"|"dollars", size|shares|amount }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Send a JSON body." }, { status: 400 });
  }

  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  const side = body.side === "sell" ? "sell" : "buy";

  // Accept the three shapes callers have historically sent rather than making
  // an integration guess which one this build wants.
  const mode: "shares" | "dollars" =
    body.mode === "dollars" || body.amount != null ? "dollars" : "shares";
  const size = Number(body.size ?? body.shares ?? body.amount ?? 0);

  if (!symbol) {
    return NextResponse.json({ ok: false, error: "Symbol is required." }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json(
      { ok: false, error: "Send a size greater than zero." },
      { status: 400 },
    );
  }

  const result = await placeOrder(symbol, side, mode, size);

  // A refused order is a business outcome, not a server fault: 422, so a
  // caller's error handling can tell "you can't afford this" from "we broke".
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
