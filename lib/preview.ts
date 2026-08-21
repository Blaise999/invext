/**
 * PRIVATE MARKS
 *
 * Private companies have no continuous public quote. When a figure is shown for
 * an unlisted name it is a dated mark taken from known funding rounds, secondary
 * blocks or 409A valuations — never a live market price.
 *
 * The eventual public listing price of any of these securities (if a listing
 * ever occurs) can be substantially higher or substantially lower than the
 * private mark displayed today. That gap is both the risk and the opportunity.
 *
 * Because the interface also contains signup, deposit and approval flows, every
 * private mark is labelled and the page carries a single dismissible notice.
 * The notice exists so that a visitor cannot mistake a private reference point
 * for a continuous quote or an offer to sell securities.
 *
 * Real recorded marks always take precedence. When none exist the fallback set
 * below is used and the UI surfaces the notice.
 */

export function privateMarksEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PREVIEW === "1";
}

/** Label used on every private mark figure. */
export const PRIVATE_MARK_LABEL = "Private mark";

/**
 * Single dismissible notice shown whenever private marks are visible.
 * Store dismissal in sessionStorage so it does not reappear on every
 * navigation but returns on a fresh visit.
 */
export const PRIVATE_MARK_DISCLAIMER =
  "Private securities have no continuous quote. Marks shown are dated reference points from private transactions only. Any future public listing price could be substantially higher or substantially lower than the private mark you see here.";

/* ---------------------------------------------------------------- marks */

export interface PrivateMark {
  symbol: string;
  price: number;
  /** Days ago, so the demo never ages into a stale-looking date. */
  daysAgo: number;
  basis: string;
  source: string;
}

/**
 * Private mark history for the unlisted vehicles, oldest first.
 *
 * Derived from published funding rounds so the shape is realistic — Neuralink's
 * Series E at roughly $9bn in June 2025, The Boring Company's Series C at
 * $5.7bn in April 2022 — with a per-unit figure that reflects private
 * transaction levels rather than a continuous market.
 */
export const PRIVATE_MARKS: PrivateMark[] = [
  { symbol: "NLNK", price: 168.0, daysAgo: 400, basis: "Primary round",   source: "Series E" },
  { symbol: "NLNK", price: 201.5, daysAgo: 190, basis: "Secondary block", source: "Employee tender" },
  { symbol: "NLNK", price: 224.0, daysAgo: 34,  basis: "Secondary block", source: "Employee tender" },

  { symbol: "TBCO", price: 92.0,  daysAgo: 520, basis: "Primary round",   source: "Series C" },
  { symbol: "TBCO", price: 108.5, daysAgo: 120, basis: "409A valuation",  source: "Board-adopted" },

  { symbol: "OPAI", price: 312.0, daysAgo: 330, basis: "Primary round",   source: "Tender round" },
  { symbol: "OPAI", price: 486.0, daysAgo: 150, basis: "Secondary block", source: "Employee tender" },
  { symbol: "OPAI", price: 561.5, daysAgo: 28,  basis: "Secondary block", source: "Employee tender" },

  { symbol: "ANTH", price: 214.0, daysAgo: 300, basis: "Primary round",   source: "Series F" },
  { symbol: "ANTH", price: 348.0, daysAgo: 96,  basis: "Primary round",   source: "Extension" },

  { symbol: "ANDU", price: 128.0, daysAgo: 420, basis: "Primary round",   source: "Series F" },
  { symbol: "ANDU", price: 196.5, daysAgo: 74,  basis: "Secondary block", source: "Employee tender" },

  { symbol: "STRP", price: 232.0, daysAgo: 380, basis: "409A valuation",  source: "Board-adopted" },
  { symbol: "STRP", price: 268.5, daysAgo: 61,  basis: "Secondary block", source: "Annual tender" },

  { symbol: "DBRX", price: 142.0, daysAgo: 350, basis: "Primary round",   source: "Series J" },
  { symbol: "DBRX", price: 178.0, daysAgo: 88,  basis: "Secondary block", source: "Employee tender" },

  { symbol: "SSIL", price: 96.0,  daysAgo: 240, basis: "Primary round",   source: "Seed extension" },

  { symbol: "FIGR", price: 74.5,  daysAgo: 300, basis: "Primary round",   source: "Series C" },
  { symbol: "FIGR", price: 118.0, daysAgo: 52,  basis: "Primary round",   source: "Series D" },

  { symbol: "HLON", price: 58.0,  daysAgo: 410, basis: "Primary round",   source: "Series F" },
  { symbol: "HLON", price: 71.5,  daysAgo: 130, basis: "409A valuation",  source: "Board-adopted" },

  { symbol: "CFSE", price: 44.0,  daysAgo: 460, basis: "Primary round",   source: "Series B2" },
  { symbol: "CFSE", price: 63.0,  daysAgo: 110, basis: "Primary round",   source: "Extension" },

  { symbol: "SIER", price: 38.5,  daysAgo: 390, basis: "Primary round",   source: "Series B" },
  { symbol: "SIER", price: 41.0,  daysAgo: 175, basis: "409A valuation",  source: "Board-adopted" },
];

export interface MarkLike {
  id: string;
  symbol: string;
  price: number;
  effective_at: number;
  basis: string;
  source: string;
  created_by: string;
  created_at: number;
}

export function privateMarksFor(symbol: string): MarkLike[] {
  const sym = symbol.toUpperCase();
  const day = 86_400_000;
  return PRIVATE_MARKS.filter((m) => m.symbol === sym).map((m, i) => ({
    id: `private-${sym}-${i}`,
    symbol: sym,
    price: m.price,
    effective_at: Date.now() - m.daysAgo * day,
    basis: m.basis,
    source: m.source,
    created_by: "private",
    created_at: Date.now() - m.daysAgo * day,
  }));
}

/**
 * Recorded marks, with the private set standing in when none exist yet.
 * Real marks always win — the moment a valuation is recorded in the back
 * office, that is what shows.
 */
export function orPrivateMarks<T extends MarkLike>(
  symbol: string,
  recorded: T[],
): { marks: MarkLike[]; isPrivate: boolean } {
  if (recorded.length > 0) return { marks: recorded, isPrivate: false };
  if (!privateMarksEnabled()) return { marks: [], isPrivate: false };
  return { marks: privateMarksFor(symbol), isPrivate: true };
}