import { marksFor, type Mark } from "./ledger";

/**
 * PRIVATE ASSETS
 *
 * Neuralink and The Boring Company don't trade on an exchange. What InveXt
 * offers is units in a single-asset vehicle holding shares sourced from
 * employee secondaries — so there is a position to hold and a number to value
 * it at, but that number is a *mark*, not a quote.
 *
 * The distinction runs through this whole file and it is not pedantry:
 *
 *   A QUOTE is a price you can transact at right now, because an exchange is
 *   matching buyers and sellers continuously. It changes every second and
 *   nobody sets it.
 *
 *   A MARK is a dated valuation, recorded because something happened — a
 *   funding round closed, a secondary block cleared, a 409A was issued. It
 *   holds at one value until the next event. Somebody records it, so it
 *   carries their name and their stated source.
 *
 * That is why the chart for these is a STEP function rather than a line, why
 * every mark requires a date and a written basis, and why the UI never calls
 * the resulting figure a price. A smooth curve between two marks would be
 * inventing daily values that never existed, which is the exact move that
 * makes a fake brokerage's chart look convincing.
 *
 * Marks are recorded in the back office and are visible, with their basis and
 * their author, to the holder. If you cannot say where a number came from, you
 * should not be putting it on someone's statement.
 */

export interface PrivateListing {
  symbol: string;
  name: string;
  short: string;
  what: string;
  vehicle: string;
  founded: string;
  /** Shown on the trade ticket. Private units don't settle like equities. */
  settlement: string;
  risk: string;
}

export const PRIVATE_LISTINGS: PrivateListing[] = [
  {
    symbol: "NLNK",
    name: "Neuralink Corp.",
    short: "NL",
    what: "Implantable brain–computer interface",
    vehicle: "Single-asset SPV — secondary sourced",
    founded: "2016",
    settlement:
      "Units in the vehicle, not shares on the cap table. That affects information rights, voting and tax treatment. Subscriptions are grouped and priced at the prevailing mark; there is no continuous market and no guarantee of an exit.",
    risk:
      "Pre-revenue and regulator-gated. A failed trial, an adverse event or a shifted approval pathway can take the position to zero.",
  },
  {
    symbol: "TBCO",
    name: "The Boring Company",
    short: "TB",
    what: "Tunnelling and urban transit loops",
    vehicle: "Single-asset SPV — secondary sourced",
    founded: "2016",
    settlement:
      "Units in the vehicle, not shares on the cap table. Supply is rationed and frequently zero. Expect to hold indefinitely.",
    risk:
      "Contract-dependent and municipally gated. Long stretches with no marks, no news and no way out.",
  },
  {
    symbol: "OPAI",
    name: "OpenAI",
    short: "OA",
    what: "Frontier AI research and ChatGPT",
    vehicle: "Single-asset SPV — secondary sourced",
    founded: "2015",
    settlement:
      "Units in the vehicle, not shares on the cap table. The company's capped-profit structure means the economics of a unit are not the economics of ordinary equity — read the vehicle's terms before subscribing.",
    risk:
      "Concentration in a fast-moving field, an unusual corporate structure, and transfer restrictions that can block a sale outright.",
  },
  {
    symbol: "ANTH",
    name: "Anthropic",
    short: "AN",
    what: "Frontier AI research and Claude",
    vehicle: "Single-asset SPV — secondary sourced",
    founded: "2021",
    settlement:
      "Units in the vehicle, not shares on the cap table. Secondary supply depends on company consent and is frequently unavailable.",
    risk:
      "Pre-profit, capital-intensive, and competing directly with far larger balance sheets.",
  },
  {
    symbol: "ANDU",
    name: "Anduril Industries",
    short: "AD",
    what: "Autonomous defence systems",
    vehicle: "Single-asset SPV — secondary sourced",
    founded: "2017",
    settlement:
      "Units in the vehicle, not shares on the cap table. Defence holdings can carry additional transfer and disclosure conditions.",
    risk:
      "Revenue concentrated in government programmes, which move with procurement cycles and politics rather than product.",
  },
  {
    symbol: "STRP",
    name: "Stripe, Inc.",
    short: "ST",
    what: "Payments infrastructure",
    vehicle: "Single-asset SPV — secondary sourced",
    founded: "2010",
    settlement:
      "Units in the vehicle, not shares on the cap table. Stripe runs periodic employee tenders, which is where most secondary supply comes from.",
    risk:
      "Mature and heavily valued already; much of the upside may have been priced in across a decade of private rounds.",
  },
  {
    symbol: "DBRX",
    name: "Databricks, Inc.",
    short: "DB",
    what: "Data and AI platform",
    vehicle: "Single-asset SPV — secondary sourced",
    founded: "2013",
    settlement:
      "Units in the vehicle, not shares on the cap table. Priced at the prevailing mark; no continuous market.",
    risk:
      "Competes with the cloud providers it also runs on. A listing has been discussed for years without a date.",
  },
  {
    symbol: "SSIL",
    name: "Safe Superintelligence Inc.",
    short: "SS",
    what: "AI safety research lab",
    vehicle: "Single-asset SPV — secondary sourced",
    founded: "2024",
    settlement:
      "Units in the vehicle, not shares on the cap table. Very early stage; expect long stretches with no new mark at all.",
    risk:
      "No product, no revenue, and an explicitly open-ended research timeline. The highest-variance name on the board.",
  },
  {
    symbol: "FIGR",
    name: "Figure AI",
    short: "FG",
    what: "General-purpose humanoid robotics",
    vehicle: "Single-asset SPV — secondary sourced",
    founded: "2022",
    settlement:
      "Units in the vehicle, not shares on the cap table. Subscriptions are grouped and priced at the prevailing mark.",
    risk:
      "Pre-scale hardware. Manufacturing a humanoid at cost is unproven, and pilot deployments are not contracts.",
  },
  {
    symbol: "HLON",
    name: "Helion Energy",
    short: "HL",
    what: "Fusion power development",
    vehicle: "Single-asset SPV — secondary sourced",
    founded: "2013",
    settlement:
      "Units in the vehicle, not shares on the cap table. Expect to hold across development milestones measured in years.",
    risk:
      "Net-positive fusion power has never been delivered commercially. A missed milestone can reset the timeline entirely.",
  },
  {
    symbol: "CFSE",
    name: "Commonwealth Fusion Systems",
    short: "CF",
    what: "Tokamak fusion, high-field magnets",
    vehicle: "Single-asset SPV — secondary sourced",
    founded: "2018",
    settlement:
      "Units in the vehicle, not shares on the cap table. Marks move on construction and magnet milestones, not quarters.",
    risk:
      "Capital-intensive, physics-gated, and dependent on a demonstration plant that has yet to operate.",
  },
  {
    symbol: "SIER",
    name: "Sierra Space",
    short: "SI",
    what: "Spaceplanes and orbital habitats",
    vehicle: "Single-asset SPV — secondary sourced",
    founded: "2021",
    settlement:
      "Units in the vehicle, not shares on the cap table. Supply is rationed and frequently zero.",
    risk:
      "Programme timelines depend on NASA schedules and launch availability, both of which slip routinely.",
  },
];

export const privateListingFor = (symbol: string): PrivateListing | null =>
  PRIVATE_LISTINGS.find((p) => p.symbol === symbol.toUpperCase()) ?? null;

export const isPrivate = (symbol: string): boolean =>
  PRIVATE_LISTINGS.some((p) => p.symbol === symbol.toUpperCase());

export interface PrivateQuote {
  symbol: string;
  name: string;
  short: string;
  /** The prevailing mark, or null if none has ever been recorded. */
  price: number | null;
  /** Move from the previous mark to this one — over however long that was. */
  change: number | null;
  changeAbs: number | null;
  markedAt: number | null;
  basis: string | null;
  source: string | null;
  marks: Mark[];
  /** Step series for charting, oldest first. */
  series: number[];
  listing: PrivateListing;
}

/**
 * Expand the mark history into a daily step series so the same chart component
 * can draw it. Each mark is repeated for every day it held — the line is flat
 * between events and jumps on the day of one, which is what actually happened.
 */
export function stepSeries(marks: Mark[], maxPoints = 260): number[] {
  if (marks.length === 0) return [];
  if (marks.length === 1) return [marks[0].price, marks[0].price];

  const day = 86_400_000;
  const start = marks[0].effective_at;
  const end = Math.max(marks[marks.length - 1].effective_at, Date.now());
  const days = Math.max(2, Math.min(Math.ceil((end - start) / day) + 1, 4000));
  const stride = Math.max(1, Math.ceil(days / maxPoints));

  const out: number[] = [];
  let mi = 0;
  for (let d = 0; d < days; d += stride) {
    const t = start + d * day;
    while (mi + 1 < marks.length && marks[mi + 1].effective_at <= t) mi++;
    out.push(marks[mi].price);
  }
  const last = marks[marks.length - 1].price;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Build a quote from an explicit mark history. Split out from `getPrivateQuote`
 * so demo mode can pass its own illustrative fixtures without those ever being
 * written into the real store — the two can't leak into each other.
 */
export function quoteFromMarks(symbol: string, marks: Mark[]): PrivateQuote | null {
  const listing = privateListingFor(symbol);
  if (!listing) return null;

  const sorted = [...marks].sort((a, b) => a.effective_at - b.effective_at);
  const last = sorted.length ? sorted[sorted.length - 1] : null;
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  const changeAbs = last && prev ? last.price - prev.price : null;
  const change = last && prev && prev.price ? (changeAbs! / prev.price) * 100 : null;

  return {
    symbol: listing.symbol,
    name: listing.name,
    short: listing.short,
    price: last?.price ?? null,
    change,
    changeAbs,
    markedAt: last?.effective_at ?? null,
    basis: last?.basis ?? null,
    source: last?.source ?? null,
    marks: sorted,
    series: stepSeries(sorted),
    listing,
  };
}

/**
 * Async now: marks come from Postgres rather than a file the process already
 * had in memory. `quoteFromMarks` stays pure, so demo fixtures and tests don't
 * need a database.
 */
export async function getPrivateQuote(symbol: string): Promise<PrivateQuote | null> {
  const listing = privateListingFor(symbol);
  if (!listing) return null;
  return quoteFromMarks(listing.symbol, await marksFor(listing.symbol));
}

export async function getPrivateQuotes(): Promise<PrivateQuote[]> {
  const all = await Promise.all(PRIVATE_LISTINGS.map((p) => getPrivateQuote(p.symbol)));
  return all.filter((q): q is PrivateQuote => q !== null);
}
