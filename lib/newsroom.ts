import type { Shot } from "@/lib/media";

/**
 * THE INTELLIGENCE LAYER
 *
 * Stories are typed by the shape they occupy, not by importance, because the
 * grid is asymmetric on purpose: a compact card and an oversized feature carry
 * the same editorial weight, they just sit differently on the page.
 *
 * On sourcing. Every line below is desk copy for this platform — it is not
 * attributed to a wire service, and it does not put words in the mouth of any
 * publication or any named person. Figures trace back to lib/facts.ts so the
 * newsroom and the rest of the site cannot drift apart. `stamp` is visible on
 * every card for the same reason: a market story with no date on it is a
 * liability, not a feature.
 */

export type Shape =
  | "lead" // oversized cinematic feature — dominates its zone
  | "tall" // tall vertical module
  | "wide" // wide cinematic strip
  | "half" // medium horizontal module
  | "compact" // small card, small image
  | "data" // compact data card, no image
  | "quote"; // typographic block, no image — this is the breathing space

export interface NewsItem {
  id: string;
  shape: Shape;
  /** Grid columns out of twelve. */
  col: number;
  /** Composition modifiers — vertical offset and edge-breaking. */
  mod?: string;
  kicker: string;
  stamp: string;
  headline: string;
  standfirst?: string;
  tag: string;
  live?: boolean;
  /** Which image pool this card draws from. */
  pool?: "wiki" | "nasa";
  /** Data cards carry a figure instead of a picture. */
  figure?: string;
  figureNote?: string;
}

/* ------------------------------------------------------------------ copy -- */

export const NEWS: NewsItem[] = [
  /* ---- band A: the dominant cluster ---- */
  {
    id: "spcx-q2",
    shape: "lead",
    col: 7,
    kicker: "SPCX · Earnings",
    stamp: "17 Aug 2026",
    headline: "First results as a public company beat, and the stock was already below issue",
    standfirst:
      "Q2 revenue of $7.81bn, up 92% year on year against a consensus near $6.93bn, with adjusted EBITDA of $3.5bn on a $541m net loss. The shares had closed as low as $108.27 earlier in the month, against a $135 IPO price. Both of those things are true at once, and the gap between them is the whole argument.",
    tag: "Earnings",
    live: true,
    pool: "nasa",
  },
  {
    id: "starship-cadence",
    shape: "tall",
    col: 5,
    mod: "is-drop-lg",
    kicker: "SPCX · Launch",
    stamp: "Aug 2026",
    headline: "Reuse economics are now the launch business, not a line item in it",
    standfirst:
      "Booster recovery moved from demonstration to routine years ago. What changed this cycle is that the recovered hardware is being turned around fast enough that cadence, not vehicle cost, is the binding constraint.",
    tag: "Hardware",
    pool: "nasa",
  },

  /* ---- band B: scattered, uneven, with space left open ---- */
  {
    id: "unlock",
    shape: "data",
    col: 3,
    mod: "is-rise",
    kicker: "Supply",
    stamp: "to Jun 2027",
    headline: "Shares coming free of lock-up before June 2027",
    figure: "≈6bn",
    figureNote:
      "On the order of $116bn of stock. Supply that size can move a price regardless of what the business does.",
    tag: "Flow",
  },
  {
    id: "institutional",
    shape: "compact",
    col: 4,
    mod: "is-drop-lg",
    kicker: "Ownership",
    stamp: "Aug 2026",
    headline: "Quarterly filings show large new institutional positions",
    standfirst:
      "Nvidia disclosed a position around $21bn, Harvard roughly $2.2bn, alongside Norway's sovereign wealth fund.",
    tag: "Filings",
    pool: "wiki",
  },
  {
    id: "grok",
    shape: "compact",
    col: 3,
    mod: "is-drop-sm",
    kicker: "AI segment",
    stamp: "Q2 2026",
    headline: "AI segment revenue up 247% year on year",
    standfirst: "$2.6bn in the quarter. Fastest-growing line, and the most capital-hungry.",
    tag: "AI",
    pool: "wiki",
  },

  /* ---- band C: full-width strip that breaks the page edge ---- */
  {
    id: "structure",
    shape: "wide",
    col: 12,
    mod: "is-bleed-r",
    kicker: "Structure",
    stamp: "2 Feb 2026",
    headline: "The acquisition that explains why Grok, X and Starlink have no tickers",
    standfirst:
      "SpaceX bought xAI outright in an all-stock deal valuing it near $250bn, folding the model family, the social platform and the Colossus compute cluster into one segment of one listed company. Starlink was never separate to begin with. Three of the most heavily branded names in the group are divisions — which is exactly why they keep being mistaken for listings.",
    tag: "Corporate",
    pool: "wiki",
  },

  /* ---- band D: cluster, then a gap ---- */
  {
    id: "starlink",
    shape: "half",
    col: 5,
    mod: "is-drop-sm",
    kicker: "Connectivity",
    stamp: "Q2 2026",
    headline: "The subscription line is now the largest single source of revenue",
    standfirst:
      "$4.3bn in the quarter and 1.7m net adds. Billed monthly to consumers, enterprise and government — it behaves like a subscription business rather than a lumpy launch contractor, and it is wholly owned.",
    tag: "Starlink",
    pool: "nasa",
  },
  {
    id: "neuralink",
    shape: "compact",
    col: 3,
    kicker: "Private · Neuralink",
    stamp: "Jun 2025",
    headline: "Still no announced listing, and still no round since the Series E",
    standfirst: "$650m raised at roughly a $9bn valuation. That remains the last disclosed primary.",
    tag: "Private",
    pool: "wiki",
  },
  {
    id: "tesla",
    shape: "tall",
    col: 4,
    mod: "is-rise-lg is-bleed-r",
    kicker: "TSLA · Separate company",
    stamp: "Aug 2026",
    headline: "Tesla and SpaceX share a chief executive and nothing else",
    standfirst:
      "Neither holds equity in the other. They report separately, they are owned by different registers, and they move independently — which is worth saying plainly, because the single most common assumption about this group is the opposite.",
    tag: "TSLA",
    pool: "wiki",
  },

  /* ---- band E: pull quote as deliberate breathing space ---- */
  {
    id: "pull",
    shape: "quote",
    col: 6,
    mod: "is-drop-lg",
    kicker: "Desk view",
    stamp: "Aug 2026",
    headline:
      "A listing is not a one-way move. The stock went through its IPO price inside a month, then recovered sharply, and nothing about the underlying business changed in either direction.",
    tag: "Comment",
  },
  {
    id: "boring",
    shape: "half",
    col: 6,
    kicker: "Private · Boring Co",
    stamp: "2026",
    headline: "Tunnelling is a permitting business wearing an engineering costume",
    standfirst:
      "The machine is the easy part. Timelines are set by municipalities, and secondary liquidity in the private units is thin enough that a mark can sit unchanged for quarters.",
    tag: "Private",
    pool: "wiki",
  },

  /* ---- band F: uneven closing row ---- */
  {
    id: "compute",
    shape: "compact",
    col: 4,
    mod: "is-drop-sm",
    kicker: "Infrastructure",
    stamp: "2026",
    headline: "Gigawatt-scale compute is now a capital line, not an IT line",
    standfirst: "Colossus sits inside the AI segment and is the reason its margins look the way they do.",
    tag: "Compute",
    pool: "wiki",
  },
  {
    id: "guidance",
    shape: "data",
    col: 3,
    mod: "is-rise",
    kicker: "Guidance",
    stamp: "end 2026",
    headline: "Company-targeted revenue run rate",
    figure: "$100bn",
    figureNote:
      "With a $1T revenue goal pulled forward to 2030. Management ambition and likely outcome are not the same number.",
    tag: "Outlook",
  },
  {
    id: "range",
    shape: "data",
    col: 2,
    mod: "is-drop-sm",
    kicker: "SPCX",
    stamp: "52 weeks",
    headline: "Trading range since listing",
    figure: "$104 – $225",
    figureNote: "A 2.1x spread inside a single year of trading.",
    tag: "Volatility",
  },
  {
    id: "retail",
    shape: "compact",
    col: 3,
    mod: "is-drop-lg",
    kicker: "Distribution",
    stamp: "12 Jun 2026",
    headline: "An unusually large share of the offering went to retail",
    standfirst: "Which is why the register behaves differently to a comparable institutional listing.",
    tag: "IPO",
    pool: "nasa",
  },
];

/* ------------------------------------------------------- image assignment -- */

export interface Placed extends NewsItem {
  shot?: Shot;
}

/**
 * Give every card that wants a picture its own picture.
 *
 * Two pools go in — Wikimedia for people, vehicles and buildings, NASA for
 * flight hardware — and each is drawn down with its own cursor so the same
 * frame never appears twice on the page. If a pool runs dry we fall through to
 * the other one rather than leaving a hole, because a card designed around an
 * image looks broken without one. If both are dry the card renders as type,
 * which the CSS is built to handle.
 */
export function placeImages(
  items: NewsItem[],
  wiki: Shot[],
  nasa: Shot[],
): Placed[] {
  const cursors = { wiki: 0, nasa: 0 };
  const used = new Set<string>();

  const draw = (pool: "wiki" | "nasa"): Shot | undefined => {
    const order: ("wiki" | "nasa")[] = pool === "wiki" ? ["wiki", "nasa"] : ["nasa", "wiki"];
    for (const p of order) {
      const list = p === "wiki" ? wiki : nasa;
      while (cursors[p] < list.length) {
        const s = list[cursors[p]++];
        if (s && !used.has(s.id)) {
          used.add(s.id);
          return s;
        }
      }
    }
    return undefined;
  };

  return items.map((n) => (n.pool ? { ...n, shot: draw(n.pool) } : { ...n }));
}

/** Subjects to fetch, ordered so the most editorially useful land first. */
export const WIKI_SUBJECTS = [
  "musk",
  "tesla",
  "muskPress",
  "cybertruck",
  "starlink",
  "gigafactory",
  "muskFactory",
  "datacentre",
  "optimus",
  "boring",
  "neuralink",
  "nasdaq",
];
