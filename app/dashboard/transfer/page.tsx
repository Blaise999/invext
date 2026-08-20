import { loadViewer } from "@/lib/viewer";
import { NETWORKS } from "@/lib/networks";
import { resolveDepositAddress } from "@/lib/ledger";
import TransferPanel from "@/components/dash/TransferPanel";
import BalanceHead from "@/components/dash/BalanceHead";
import QRCode from "qrcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Addresses and their QR codes are resolved on the server and passed down.
 *
 * Two reasons. The QR is rendered here rather than in the browser, so an
 * address never depends on client JS to be correct — and a customer never sees
 * a rail whose address hasn't been set, because it simply isn't in the list
 * that reaches them.
 */
export default async function Transfer() {
  const v = await loadViewer();

  const rails = await Promise.all(
    NETWORKS.map(async (n) => {
      const addr = v.demo
        ? { address: "TDemoOnly000000000000000000000000", memo: null, source: "global" as const }
        : await resolveDepositAddress(v.user.id, n.id).catch(() => null);

      return {
        id: n.id,
        label: n.label,
        chain: n.chain,
        mark: n.mark,
        min: n.min,
        confirmations: n.confirmations,
        fastest: Boolean(n.fastest),
        patternHint: n.patternHint,
        address: addr?.address ?? null,
        memo: addr?.memo ?? null,
        qr: addr?.address
          ? await QRCode.toDataURL(addr.address, {
              margin: 1,
              width: 480,
              color: { dark: "#0b0b0d", light: "#ffffff" },
            }).catch(() => null)
          : null,
      };
    }),
  );

  const invested = v.positions.reduce((sum, p) => {
    const q = v.quotes.find((x) => x.symbol === p.symbol);
    return sum + (q?.price != null ? q.price * p.quantity : p.cost_basis);
  }, 0);

  const pending = v.transactions
    .filter((t) => t.status === "pending")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return (
    <>
      <BalanceHead
        label="Available to trade"
        value={v.cash}
        chip="Cash"
        cards={[
          {
            k: "Invested",
            v: invested,
            hint: `${v.positions.length} position${v.positions.length === 1 ? "" : "s"}`,
          },
          {
            k: "In review",
            v: pending,
            hint: pending > 0 ? "Held until decided" : "Nothing pending",
          },
        ]}
      />

      <TransferPanel available={v.cash} rails={rails} demo={v.demo} />
    </>
  );
}
