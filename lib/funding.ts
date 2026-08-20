/**
 * Funding rails, as configuration rather than code.
 *
 * These are the rails a *regulated* operation uses: ACH, wire, debit card —
 * all reversible or traceable, all settling into a titled custody account.
 * Crypto transfer, Zelle, CashApp and gift cards are deliberately absent.
 * They're irreversible, which is precisely why fraudulent brokerages insist
 * on them, and the landing page tells users to treat that as a red flag. It
 * would be a poor look to then offer it here.
 *
 * `min` is enforced server-side in lib/orders.ts. The values here also drive
 * the labels, so the two can't drift apart.
 */

export interface Rail {
  id: string;
  label: string;
  detail: string;
  min: number;
  /** Free text shown under the amount field once this rail is picked. */
  hint: string;
}

export const DEPOSIT_METHODS: Rail[] = [
  {
    id: "ach",
    label: "Bank transfer",
    detail: "ACH · 1–3 business days · no fee",
    min: 10,
    hint: "Funds show as pending until the transfer clears. Nothing is buyable until then.",
  },
  {
    id: "wire",
    label: "Domestic wire",
    detail: "Same business day · your bank's fee applies",
    min: 500,
    hint: "Use the reference on your wire instructions so the credit can be matched to your account.",
  },
  {
    id: "card",
    label: "Debit card",
    detail: "Instant · 1.5% processor fee",
    min: 10,
    hint: "Debit only. Credit-card funding of a brokerage account is a cash advance and we don't accept it.",
  },
];

export const WITHDRAW_METHODS: Rail[] = [
  {
    id: "ach",
    label: "Bank transfer",
    detail: "ACH · 1–3 business days · no fee",
    min: 10,
    hint: "Paid to a bank account in your own name. Third-party payouts are refused.",
  },
  {
    id: "wire",
    label: "Domestic wire",
    detail: "Same business day · $25",
    min: 1000,
    hint: "Cut-off is 2:00pm ET. Requests after that go out the next business day.",
  },
];

export const railFor = (kind: "deposit" | "withdrawal", id: string): Rail | null =>
  (kind === "deposit" ? DEPOSIT_METHODS : WITHDRAW_METHODS).find((m) => m.id === id) ?? null;
