/**
 * NETWORKS
 *
 * The rails are fixed here in code; only the ADDRESS behind each one is
 * configurable, and that lives in the database (migration 0007).
 *
 * That split is deliberate. If an operator could add a rail from a form, an
 * "USDT (TRC20)" and a "USDT-TRC20" would eventually both exist with different
 * addresses behind them, and a customer would have no way to tell which was
 * real. The list a customer sees is code, reviewed and deployed. The address
 * is data, editable by an admin, and every change is attributed.
 *
 * `pattern` catches the commonest and costliest mistake in crypto payouts:
 * pasting an address for the wrong chain. An ERC-20 address on Tron is
 * unrecoverable, by anyone, forever — so it is checked in the browser, checked
 * again in the server action, and shown to the admin before they approve.
 */

export interface Network {
  id: string;
  asset: string;
  /** What the customer sees as the headline. */
  label: string;
  /** The chain, shown underneath. */
  chain: string;
  mark: string;
  confirmations: string;
  /** USD minimum, enforced server-side. */
  min: number;
  /** Address shape for this chain. */
  pattern: RegExp;
  patternHint: string;
  /** Some chains need a memo/tag alongside the address. */
  memo?: boolean;
  fastest?: boolean;
}

export const NETWORKS: Network[] = [
  {
    id: "USDT-TRC20",
    asset: "USDT",
    label: "USDT",
    chain: "TRC20",
    mark: "₮",
    confirmations: "20 confirmations",
    min: 100,
    pattern: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
    patternHint: "A Tron address starts with T and is 34 characters.",
    fastest: true,
  },
  {
    id: "USDT-ERC20",
    asset: "USDT",
    label: "USDT",
    chain: "ERC20",
    mark: "₮",
    confirmations: "12 confirmations",
    min: 100,
    pattern: /^0x[a-fA-F0-9]{40}$/,
    patternHint: "An Ethereum address starts with 0x and is 42 characters.",
  },
  {
    id: "USDC-ERC20",
    asset: "USDC",
    label: "USDC",
    chain: "ERC20",
    mark: "$",
    confirmations: "12 confirmations",
    min: 100,
    pattern: /^0x[a-fA-F0-9]{40}$/,
    patternHint: "An Ethereum address starts with 0x and is 42 characters.",
  },
  {
    id: "ETH",
    asset: "ETH",
    label: "Ethereum",
    chain: "ERC20",
    mark: "Ξ",
    confirmations: "12 confirmations",
    min: 100,
    pattern: /^0x[a-fA-F0-9]{40}$/,
    patternHint: "An Ethereum address starts with 0x and is 42 characters.",
  },
  {
    id: "BTC",
    asset: "BTC",
    label: "Bitcoin",
    chain: "Bitcoin",
    mark: "₿",
    confirmations: "2 confirmations",
    min: 100,
    pattern: /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
    patternHint: "A Bitcoin address starts with bc1, 1 or 3.",
  },
  {
    id: "SOL",
    asset: "SOL",
    label: "Solana",
    chain: "SPL",
    mark: "◎",
    confirmations: "32 confirmations",
    min: 100,
    pattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    patternHint: "A Solana address is 32–44 base58 characters.",
  },
];

export const networkById = (id: string): Network | null =>
  NETWORKS.find((n) => n.id === id) ?? null;

export const NETWORK_IDS = NETWORKS.map((n) => n.id);

/** Preset amounts on the deposit screen. */
export const AMOUNT_PRESETS = [100, 250, 500, 1000, 2500, 5000];

/**
 * Address validity for a given chain.
 *
 * Returns a reason rather than a boolean so the same check can drive the field
 * error, the server rejection and the admin warning with one wording.
 */
export function checkAddress(
  networkId: string,
  address: string,
): { ok: true } | { ok: false; reason: string } {
  const net = networkById(networkId);
  if (!net) return { ok: false, reason: "Unknown network." };

  const value = address.trim();
  if (value.length === 0) return { ok: false, reason: "Enter an address." };

  if (!net.pattern.test(value)) {
    return {
      ok: false,
      reason: `That doesn't look like a ${net.chain} address. ${net.patternHint}`,
    };
  }
  return { ok: true };
}

/** Short display form: first 6 and last 6, which is what people eyeball. */
export const shortAddress = (a: string) =>
  a.length > 16 ? `${a.slice(0, 6)}…${a.slice(-6)}` : a;
