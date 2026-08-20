import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Order intake stub.
 *
 * Returns 501 deliberately. Accepting an order without a broker-dealer behind it
 * would mean showing a customer a filled position that does not exist anywhere —
 * the same class of problem as an admin-writable balance.
 *
 * TO WIRE UP: route to your executing broker's API (Alpaca, DriveWealth, Apex),
 * persist the order, and only write a ledger entry when the broker confirms a
 * fill with a quantity and price. Never on submit.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  console.info("[orders] intent received (not executed)", body);

  return NextResponse.json(
    {
      error:
        "Order not placed. No broker-dealer is connected to this build — see app/api/orders/route.ts to wire execution.",
      received: {
        symbol: body.symbol ?? null,
        side: body.side ?? null,
        amount: body.amount ?? null,
      },
    },
    { status: 501 },
  );
}
