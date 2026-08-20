/**
 * LISTING OUTLOOK
 *
 * A desk view on when each private name might reach the public market, and on
 * what would have to be true first.
 *
 * Read the shape of this data before using it. Every figure here is an
 * ESTIMATE PRODUCED BY THIS APPLICATION. None of it is guidance from the
 * company, a filed S-1, a banker's mandate, or a date anyone has committed
 * to. `confidence` is a subjective band, not a modelled probability. `window`
 * is a range of years, deliberately — a company that has never filed does not
 * have a quarter.
 *
 * That framing is load-bearing rather than decorative. "Expected Q3 2027" on a
 * screen with a Buy button next to it reads, to the person holding the phone,
 * as something the issuer said. It isn't. So the copy says "desk estimate"
 * everywhere it appears, the disclaimer sits under the grid rather than behind
 * a tooltip, and nothing here is ever phrased as a date.
 *
 * If a company actually files, replace its entry with the filing and drop the
 * estimate. A real S-1 outranks anything in this file.
 */

export interface ListingOutlook {
  /** Range of years. Never a quarter, never a date. */
  window: string;
  /** Subjective band — Low / Moderate / Elevated / High. */
  confidence: "Low" | "Moderate" | "Elevated" | "High";
  /** Where it would most plausibly list. */
  venue: string;
  /** What has to happen first. This is the useful part. */
  catalyst: string;
  /** What would push it out. */
  drag: string;
  /** Listed comparables a desk would price it against. */
  comps: string[];
  /** One-line structural note on the route to a listing. */
  route: string;
}

export const LISTING_OUTLOOK: Record<string, ListingOutlook> = {
  STRP: {
    window: "2027 – 2028",
    confidence: "Elevated",
    venue: "NYSE or Nasdaq, US domestic",
    catalyst:
      "Annual employee tenders already function as a shadow listing — the price discovery problem is solved. What's missing is a reason to accept quarterly reporting.",
    drag:
      "No capital need. A company that doesn't want the money can wait indefinitely, and this one has for over a decade.",
    comps: ["ADYEN.AS", "V", "MA", "FI"],
    route: "Direct listing is at least as likely as a book-built IPO.",
  },
  DBRX: {
    window: "2026 – 2028",
    confidence: "Elevated",
    venue: "Nasdaq",
    catalyst:
      "Late-stage rounds have been priced at IPO-adjacent multiples and the revenue disclosure cadence already resembles a public issuer's.",
    drag:
      "Every deferral has been voluntary. Management has repeatedly signalled no urgency, and the private market keeps clearing.",
    comps: ["SNOW", "MDB", "MSFT", "ORCL"],
    route: "Conventional book-built IPO, large float.",
  },
  ANDU: {
    window: "2027 – 2029",
    confidence: "Moderate",
    venue: "NYSE",
    catalyst:
      "Programme wins converting into multi-year recognised revenue rather than announced awards — that's the number a defence primes comp set is priced on.",
    drag:
      "Defence contracting is lumpy and politically exposed. A procurement cycle can move a whole year of revenue.",
    comps: ["LMT", "RTX", "PLTR", "NOC"],
    route: "IPO. A defence prime acquisition is the competing outcome.",
  },
  OPAI: {
    window: "2028 – 2031",
    confidence: "Low",
    venue: "Undetermined",
    catalyst:
      "A corporate restructuring that produces ordinary listable equity. Until the capped-profit structure resolves, there is nothing conventional to list.",
    drag:
      "Structure, governance and regulatory scrutiny all point the same way: later.",
    comps: ["MSFT", "GOOGL", "NVDA"],
    route:
      "Structural reorganisation would have to precede any listing. Treat the window as a guess about corporate law, not markets.",
  },
  ANTH: {
    window: "2028 – 2031",
    confidence: "Low",
    venue: "Undetermined",
    catalyst:
      "Sustained enterprise revenue at a scale that no longer needs primary capital from strategic partners.",
    drag:
      "Public benefit corporation governance and a stated safety-first mandate both cut against the quarterly cycle.",
    comps: ["MSFT", "GOOGL", "NOW"],
    route: "No route has been signalled. This window is the least certain here.",
  },
  NLNK: {
    window: "2029 – 2032",
    confidence: "Low",
    venue: "Nasdaq, likely a medical-device listing",
    catalyst:
      "A pivotal trial reading out, then a marketing authorisation. Device companies list on approval, not on promise.",
    drag:
      "Regulator-gated and pre-revenue. One adverse event resets the clock entirely.",
    comps: ["ISRG", "BSX", "MDT", "DXCM"],
    route: "IPO after approval. Nothing before it would price.",
  },
  FIGR: {
    window: "2028 – 2031",
    confidence: "Low",
    venue: "Nasdaq",
    catalyst:
      "Unit economics on a manufactured humanoid — a bill of materials below the sale price, at volume, with paying customers rather than pilots.",
    drag:
      "Hardware at scale is where this category has historically died. Pilot deployments are not contracts.",
    comps: ["TSLA", "ABB", "ROK", "SYM"],
    route: "IPO if manufacturing converts. Acquisition if it doesn't.",
  },
  SSIL: {
    window: "2032+",
    confidence: "Low",
    venue: "Undetermined",
    catalyst:
      "A product. There is currently no revenue line for a public market to price.",
    drag:
      "An explicitly open-ended research mandate is incompatible with quarterly reporting by design, not by accident.",
    comps: ["—"],
    route:
      "No realistic near-term route. The highest-variance name on the board, and the window reflects that.",
  },
  HLON: {
    window: "2029 – 2033",
    confidence: "Low",
    venue: "Nasdaq",
    catalyst:
      "Net electricity delivered to a grid under a commercial offtake agreement.",
    drag:
      "Commercial fusion has never been delivered. Every milestone to date has slipped.",
    comps: ["CEG", "VST", "BWXT", "OKLO"],
    route: "IPO on first commercial delivery. SPAC route is the alternative.",
  },
  CFSE: {
    window: "2029 – 2033",
    confidence: "Low",
    venue: "Nasdaq",
    catalyst:
      "SPARC achieving net energy gain, then demonstration-plant construction reaching a financeable milestone.",
    drag: "Physics-gated and capital-intensive. Timelines here move in years.",
    comps: ["CEG", "BWXT", "GEV", "OKLO"],
    route: "IPO tied to the demonstration plant, not to the science.",
  },
  SIER: {
    window: "2027 – 2030",
    confidence: "Moderate",
    venue: "NYSE or Nasdaq",
    catalyst:
      "Dream Chaser flying an operational cargo mission, converting a programme into recognised revenue.",
    drag:
      "Schedules depend on NASA manifests and launch availability, both of which slip routinely.",
    comps: ["RKLB", "LMT", "BA", "SPCX"],
    route: "IPO, potentially as a carve-out from its parent.",
  },
  TBCO: {
    window: "2030+",
    confidence: "Low",
    venue: "Undetermined",
    catalyst:
      "A tunnel network operating at revenue-generating scale in more than one city.",
    drag:
      "Municipally gated, contract-dependent, and long stretches with no news at all.",
    comps: ["CAT", "MTZ", "PWR"],
    route: "No signalled route. Included for completeness.",
  },
};

export const outlookFor = (symbol: string): ListingOutlook | null =>
  LISTING_OUTLOOK[symbol.toUpperCase()] ?? null;

/** One wording for the disclaimer, used everywhere an estimate appears. */
export const OUTLOOK_DISCLAIMER =
  "Listing windows on this page are InveXt desk estimates. They are not " +
  "guidance from any company, not drawn from a filed registration statement, " +
  "and not a date anyone has committed to. No private company here has " +
  "announced an intention to list. Treat every window as a view that could " +
  "be wrong by years, and note that most private companies never list at all.";
