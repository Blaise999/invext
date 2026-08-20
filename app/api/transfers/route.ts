import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Transfer intake stub — 501 by design.
 *
 * TO WIRE UP: connect a licensed provider (Stripe Treasury, Dwolla, Increase,
 * Column) and only credit the ledger on a settled webhook carrying a provider
 * reference. Never on submit, and never from an admin form.
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  console.info("[transfers] intent received (not executed)", b);

  return NextResponse.json(
    {
      error:
        "Transfer not initiated. No licensed payment provider is connected — see app/api/transfers/route.ts.",
      received: { kind: b.kind ?? null, rail: b.rail ?? null, amount: b.amount ?? null },
    },
    { status: 501 },
  );
}
