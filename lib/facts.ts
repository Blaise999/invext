/**
 * Verified facts, with dates and sources.
 *
 * Everything here is checkable. When you update it, keep the `source` field
 * honest — the whole value of this file is that a reader can go and confirm it.
 * Figures are point-in-time and will go stale; the `asOf` line tells the reader
 * that rather than pretending otherwise.
 *
 * Live prices are NOT here. Those come from lib/market.ts at request time.
 */

export const FACTS_AS_OF = "17 August 2026";

/* ---------------- SPCX: what the company actually reported ---------------- */

export const spcxSegments = [
  {
    name: "Launch & Starship",
    metric: "Falcon 9 · Falcon Heavy · Starship",
    detail:
      "The original business. Reusable boosters carry a large share of the mass reaching orbit each year, for commercial and government customers.",
  },
  {
    name: "Connectivity (Starlink)",
    metric: "$4.3bn Q2 revenue · 1.7m net adds",
    detail:
      "Satellite broadband billed monthly to consumers, enterprise and government. The largest revenue line, and the one that behaves like a subscription business. Wholly owned — no separate ticker has ever existed.",
  },
  {
    name: "AI (Grok, X, Colossus)",
    metric: "$2.6bn Q2 revenue · +247% YoY",
    detail:
      "Formerly xAI, bought outright in early 2026. Spans the Grok model family, the X platform, and the gigawatt-scale Colossus compute cluster. Fastest-growing segment and the most capital-hungry.",
  },
];

export const spcxNumbers = [
  { k: "IPO", v: "$135 · 12 Jun 2026", note: "Nasdaq, largest IPO on record" },
  { k: "Q2 2026 revenue", v: "$7.81bn", note: "+92% YoY, ahead of the ~$6.93bn consensus" },
  { k: "Adjusted EBITDA", v: "$3.5bn", note: "+191% YoY, against a $541m net loss" },
  { k: "52-week range", v: "$104.83 – $225.64", note: "Closed as low as $108.27 in early August" },
  { k: "Company guidance", v: "$100bn run rate", note: "Targeted by end-2026; $1T revenue goal pulled to 2030" },
];

/**
 * Both sides, attributed. A page that only carries the bull case is marketing;
 * a page that only carries the bear case is useless. Paraphrased from published
 * analyst notes and coverage — go read the originals.
 */
export const spcxDebate = {
  bull: [
    "Citi reiterated a buy after Q2, holding a $200 price target and sketching a far higher long-run figure contingent on Starship milestones landing.",
    "Institutional buying has been heavy: Nvidia disclosed a roughly $21bn position, Harvard around $2.2bn, alongside Norway's sovereign wealth fund.",
    "The Starlink line already looks like a compounding subscription business rather than a lumpy launch contractor.",
  ],
  bear: [
    "Phillip Securities has a sell rating on the stock.",
    "Wolfe Research cautioned that management's ambitions and the likely outcomes are not the same thing, even after a strong first report.",
    "S3 Partners has described it as the frothiest trade around, with the valuation implying investors wait a long time for earnings to catch up.",
    "Roughly 6bn shares unlock before June 2027 — on the order of $116bn of stock — and supply that size can move a price regardless of fundamentals.",
  ],
};

/* ---------------- Dated timeline ---------------- */

export interface Event {
  date: string;
  iso: string;
  title: string;
  detail: string;
  tag: "structure" | "market" | "funding" | "product";
}

export const timeline: Event[] = [
  {
    date: "Mar 2025",
    iso: "2025-03",
    title: "xAI acquires X",
    detail:
      "The social platform folds into the AI company in an all-stock deal, putting model and distribution under one roof.",
    tag: "structure",
  },
  {
    date: "Jun 2025",
    iso: "2025-06",
    title: "Neuralink raises $650m",
    detail:
      "Series E at roughly a $9bn valuation. Still the last disclosed primary round, and still no announced listing.",
    tag: "funding",
  },
  {
    date: "2 Feb 2026",
    iso: "2026-02-02",
    title: "SpaceX acquires xAI outright",
    detail:
      "All-stock deal valuing xAI near $250bn. Grok, X and the Colossus cluster become a SpaceX segment — which is why none of them has its own ticker.",
    tag: "structure",
  },
  {
    date: "12 Jun 2026",
    iso: "2026-06-12",
    title: "SpaceX lists on Nasdaq at $135",
    detail:
      "The largest IPO on record, with an unusually high share of the offering allocated to retail. Ticker SPCX.",
    tag: "market",
  },
  {
    date: "Jul 2026",
    iso: "2026-07",
    title: "Post-IPO drawdown",
    detail:
      "The stock falls through its IPO price, closing as low as $108.27 in early August before recovering sharply. A reminder that a listing is not a one-way move.",
    tag: "market",
  },
  {
    date: "Aug 2026",
    iso: "2026-08",
    title: "First earnings report as a public company",
    detail:
      "Q2 revenue of $7.81bn beat expectations, up 92% year on year, with adjusted EBITDA of $3.5bn against a $541m net loss.",
    tag: "market",
  },
  {
    date: "Aug 2026",
    iso: "2026-08-14",
    title: "Anysphere acquisition and institutional filings",
    detail:
      "SpaceX completes its acquisition of Anysphere, while quarterly filings reveal large new positions from Nvidia, Harvard and others.",
    tag: "structure",
  },
];

/* ---------------- Company identity, from env ----------------
   No invented entity names or registration numbers. Set these and they render;
   leave them unset and the line is omitted rather than showing a placeholder.
   A fabricated registration number on a financial site is worse than a blank.  */

export const company = {
  name: process.env.COMPANY_LEGAL_NAME || null,
  registration: process.env.COMPANY_REGISTRATION || null,
  email: process.env.COMPANY_EMAIL || null,
  address: process.env.COMPANY_ADDRESS || null,
  brand: "InveXt",
};
