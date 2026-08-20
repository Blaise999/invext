import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Legacy route. Collapsed into /dashboard/stock/[symbol].
 *
 * This used to be a near-duplicate instrument page with its own copy of the
 * header, the key-data list and — the actual problem — its own trade ticket
 * (`OrderTicket`) which posted to the old 501 stub and could never fill. Two
 * instrument pages meant two places to fix every bug and two different answers
 * to "can I buy this", and nothing in the app linked here anyway.
 *
 * One page owns an instrument now. This just forwards, so any bookmark or
 * external link still lands somewhere correct.
 */
export default async function AssetRedirect({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  redirect(`/dashboard/stock/${symbol.toUpperCase()}`);
}
