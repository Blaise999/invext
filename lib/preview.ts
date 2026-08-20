/**
 * PREVIEW MODE
 *
 * A proof of concept has to demonstrate. An empty grid reading "No data" in
 * seven cards demonstrates nothing, and it isn't even accurate — most of those
 * blanks are a rate-limited quote provider, not an absence of information.
 *
 * So: with NEXT_PUBLIC_PREVIEW=1, anything that would render blank renders an
 * illustrative figure instead, and the interface says so — a strip at the top
 * of the page, and a `preview` source on every figure that came from here so
 * individual components can label themselves.
 *
 * The labelling is the whole point, and it is worth being blunt about why.
 * This site has a signup, a deposit form and an admin approval queue attached
 * to it. An invented number rendered next to a Buy button, with nothing marking
 * it as invented, is indistinguishable from a real quote to the person reading
 * it — including to a partner or investor you are trying to impress, who will
 * assume the integration is live. Labelled, it reads as a working prototype,
 * which is what it is and what wins the meeting. Unlabelled, it reads as a
 * live offering in securities you don't yet have an agreement to sell.
 *
 * Turn it off (unset the variable) and everything falls back to real data
 * only, exactly as before.
 */

export function previewMode(): boolean {
  return process.env.NEXT_PUBLIC_PREVIEW === "1";
}

/** Copy used wherever a preview figure is on screen. One wording everywhere. */
export const PREVIEW_LABEL = "Illustrative";
export const PREVIEW_NOTE =
  "Preview build. Figures shown for private companies are illustrative and " +
  "for demonstration only — coverage is not live and no agreement is in place.";

/* ---------------------------------------------------------------- marks */

export interface PreviewMark {
  symbol: string;
  price: number;
  /** Days ago, so the demo never ages into a stale-looking date. */
  daysAgo: number;
  basis: string;
  source: string;
}

/**
 * Illustrative mark history for the private vehicles, oldest first.
 *
 * Derived from published funding rounds so the shape is realistic — Neuralink's
 * Series E at roughly $9bn in June 2025, The Boring Company's Series C at
 * $5.7bn in April 2022 — with a per-unit figure that is a demonstration
 * number, not a valuation.
 */
export const PREVIEW_MARKS: PreviewMark[] = [
  { symbol: "NLNK", price: 168.0, daysAgo: 400, basis: "Primary round",   source: "Series E, illustrative" },
  { symbol: "NLNK", price: 201.5, daysAgo: 190, basis: "Secondary block", source: "Employee tender, illustrative" },
  { symbol: "NLNK", price: 224.0, daysAgo: 34,  basis: "Secondary block", source: "Employee tender, illustrative" },

  { symbol: "TBCO", price: 92.0,  daysAgo: 520, basis: "Primary round",   source: "Series C, illustrative" },
  { symbol: "TBCO", price: 108.5, daysAgo: 120, basis: "409A valuation",  source: "Board-adopted, illustrative" },

  { symbol: "OPAI", price: 312.0, daysAgo: 330, basis: "Primary round",   source: "Tender round, illustrative" },
  { symbol: "OPAI", price: 486.0, daysAgo: 150, basis: "Secondary block", source: "Employee tender, illustrative" },
  { symbol: "OPAI", price: 561.5, daysAgo: 28,  basis: "Secondary block", source: "Employee tender, illustrative" },

  { symbol: "ANTH", price: 214.0, daysAgo: 300, basis: "Primary round",   source: "Series F, illustrative" },
  { symbol: "ANTH", price: 348.0, daysAgo: 96,  basis: "Primary round",   source: "Extension, illustrative" },

  { symbol: "ANDU", price: 128.0, daysAgo: 420, basis: "Primary round",   source: "Series F, illustrative" },
  { symbol: "ANDU", price: 196.5, daysAgo: 74,  basis: "Secondary block", source: "Employee tender, illustrative" },

  { symbol: "STRP", price: 232.0, daysAgo: 380, basis: "409A valuation",  source: "Board-adopted, illustrative" },
  { symbol: "STRP", price: 268.5, daysAgo: 61,  basis: "Secondary block", source: "Annual tender, illustrative" },

  { symbol: "DBRX", price: 142.0, daysAgo: 350, basis: "Primary round",   source: "Series J, illustrative" },
  { symbol: "DBRX", price: 178.0, daysAgo: 88,  basis: "Secondary block", source: "Employee tender, illustrative" },

  { symbol: "SSIL", price: 96.0,  daysAgo: 240, basis: "Primary round",   source: "Seed extension, illustrative" },

  { symbol: "FIGR", price: 74.5,  daysAgo: 300, basis: "Primary round",   source: "Series C, illustrative" },
  { symbol: "FIGR", price: 118.0, daysAgo: 52,  basis: "Primary round",   source: "Series D, illustrative" },

  { symbol: "HLON", price: 58.0,  daysAgo: 410, basis: "Primary round",   source: "Series F, illustrative" },
  { symbol: "HLON", price: 71.5,  daysAgo: 130, basis: "409A valuation",  source: "Board-adopted, illustrative" },

  { symbol: "CFSE", price: 44.0,  daysAgo: 460, basis: "Primary round",   source: "Series B2, illustrative" },
  { symbol: "CFSE", price: 63.0,  daysAgo: 110, basis: "Primary round",   source: "Extension, illustrative" },

  { symbol: "SIER", price: 38.5,  daysAgo: 390, basis: "Primary round",   source: "Series B, illustrative" },
  { symbol: "SIER", price: 41.0,  daysAgo: 175, basis: "409A valuation",  source: "Board-adopted, illustrative" },
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

export function previewMarksFor(symbol: string): MarkLike[] {
  const sym = symbol.toUpperCase();
  const day = 86_400_000;
  return PREVIEW_MARKS.filter((m) => m.symbol === sym).map((m, i) => ({
    id: `preview-${sym}-${i}`,
    symbol: sym,
    price: m.price,
    effective_at: Date.now() - m.daysAgo * day,
    basis: m.basis,
    source: m.source,
    created_by: "preview",
    created_at: Date.now() - m.daysAgo * day,
  }));
}

/**
 * Recorded marks, with the illustrative set standing in when none exist yet.
 * Real marks always win — the moment a valuation is recorded in the back
 * office, that is what shows.
 */
export function orPreviewMarks<T extends MarkLike>(
  symbol: string,
  recorded: T[],
): { marks: MarkLike[]; illustrative: boolean } {
  if (recorded.length > 0) return { marks: recorded, illustrative: false };
  if (!previewMode()) return { marks: [], illustrative: false };
  return { marks: previewMarksFor(symbol), illustrative: true };
}
