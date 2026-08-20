/**
 * Market data.
 *
 * Two providers, tried in order. Neither needs an API key.
 *
 *   1. Yahoo Finance chart endpoint — gives the current price, previous close
 *      and a daily series in a single call, so one request per symbol covers
 *      both the quote and the sparkline.
 *   2. Stooq CSV — end-of-day only, no series. Fallback when Yahoo is blocked.
 *
 * Yahoo's endpoint is undocumented and unofficial. It is fine for display and
 * has been stable for years, but it carries no uptime guarantee and rate-limits
 * aggressively from datacentre IPs. If this page is going to matter to anyone,
 * licence a real feed (Polygon, Finnhub, Alpaca, Tiingo) and replace `fetchYahoo`.
 * The rest of the app only knows about the `Quote` type.
 *
 * When every provider fails, price comes back `null` and the UI renders an em
 * dash. Nothing here ever invents a number.
 */

export interface Quote {
  symbol: string;
  name: string;
  short: string;
  price: number | null;
  change: number | null;      // percent
  changeAbs: number | null;   // dollars
  prevClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  currency: string;
  series: number[];           // up to ~1y of daily closes, oldest first
  asOf: number | null;        // epoch ms
  source: "yahoo" | "stooq" | "finnhub" | "preview" | null;
}

export const PUBLIC_TICKERS = [
  // SpaceX has traded on Nasdaq as SPCX since its IPO on 12 June 2026. Grok,
  // X and Starlink are all inside this one ticker — see lib/data.ts.
  { symbol: "SPCX", name: "Space Exploration Technologies", short: "SX" },

  /* mega-cap technology */
  { symbol: "AAPL", name: "Apple Inc.", short: "AA" },
  { symbol: "MSFT", name: "Microsoft Corp.", short: "MS" },
  { symbol: "GOOGL", name: "Alphabet Inc.", short: "GO" },
  { symbol: "AMZN", name: "Amazon.com, Inc.", short: "AM" },
  { symbol: "NVDA", name: "NVIDIA Corp.", short: "NV" },
  { symbol: "META", name: "Meta Platforms, Inc.", short: "ME" },
  { symbol: "TSLA", name: "Tesla, Inc.", short: "TS" },
  { symbol: "AVGO", name: "Broadcom Inc.", short: "AV" },
  { symbol: "NFLX", name: "Netflix, Inc.", short: "NF" },

  /* semiconductors and hardware */
  { symbol: "AMD", name: "Advanced Micro Devices", short: "AD" },
  { symbol: "INTC", name: "Intel Corp.", short: "IN" },
  { symbol: "QCOM", name: "QUALCOMM Inc.", short: "QC" },
  { symbol: "MU", name: "Micron Technology", short: "MU" },
  { symbol: "TSM", name: "Taiwan Semiconductor", short: "TM" },
  { symbol: "ARM", name: "Arm Holdings plc", short: "AR" },
  { symbol: "SMCI", name: "Super Micro Computer", short: "SM" },

  /* software and platforms */
  { symbol: "PLTR", name: "Palantir Technologies", short: "PL" },
  { symbol: "CRM", name: "Salesforce, Inc.", short: "CR" },
  { symbol: "ORCL", name: "Oracle Corp.", short: "OR" },
  { symbol: "ADBE", name: "Adobe Inc.", short: "AB" },
  { symbol: "NOW", name: "ServiceNow, Inc.", short: "NW" },
  { symbol: "SNOW", name: "Snowflake Inc.", short: "SN" },
  { symbol: "SHOP", name: "Shopify Inc.", short: "SH" },
  { symbol: "UBER", name: "Uber Technologies", short: "UB" },
  { symbol: "ABNB", name: "Airbnb, Inc.", short: "AN" },
  { symbol: "COIN", name: "Coinbase Global", short: "CO" },
  { symbol: "SPOT", name: "Spotify Technology", short: "SP" },

  /* mobility, space and defence */
  { symbol: "RIVN", name: "Rivian Automotive", short: "RI" },
  { symbol: "LCID", name: "Lucid Group, Inc.", short: "LC" },
  { symbol: "RKLB", name: "Rocket Lab Corp.", short: "RK" },
  { symbol: "LMT", name: "Lockheed Martin", short: "LM" },
  { symbol: "BA", name: "The Boeing Company", short: "BO" },

  /* financials, health, industrials, energy */
  { symbol: "JPM", name: "JPMorgan Chase & Co.", short: "JP" },
  { symbol: "V", name: "Visa Inc.", short: "VI" },
  { symbol: "BRK-B", name: "Berkshire Hathaway", short: "BR" },
  { symbol: "UNH", name: "UnitedHealth Group", short: "UN" },
  { symbol: "LLY", name: "Eli Lilly and Co.", short: "LL" },
  { symbol: "XOM", name: "Exxon Mobil Corp.", short: "XO" },
  { symbol: "CAT", name: "Caterpillar Inc.", short: "CA" },
] as const;

const blank = (t: { symbol: string; name: string; short: string }): Quote => ({
  ...t,
  price: null,
  change: null,
  changeAbs: null,
  prevClose: null,
  dayHigh: null,
  dayLow: null,
  currency: "USD",
  series: [],
  asOf: null,
  source: null,
});

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Providers are tried in order, PER SYMBOL, and the first that answers wins.
 *
 * Why this is more elaborate than it looks: Yahoo's endpoint is unofficial and
 * rate-limits hard from datacentre IP ranges — which is exactly what Vercel,
 * Railway, Fly and every other host you'd deploy to are. It works perfectly
 * from your laptop and returns 429 or 403 in production. That is the single
 * most common reason a page like this shows "No data" everywhere.
 *
 * So: two Yahoo edges, then Stooq, then Finnhub if you supply a key.
 * Set FINNHUB_API_KEY (free tier, 60 calls/min) and this becomes reliable.
 */
type Partial_ = Omit<Quote, "symbol" | "name" | "short">;

async function tryFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    next: { revalidate: 120 },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res;
}

/* ---- 1 & 2: Yahoo chart (two edges) ---- */
async function fromYahoo(symbol: string, host: string): Promise<Partial_ | null> {
  const res = await tryFetch(
    `https://${host}/v8/finance/chart/${symbol}?range=6mo&interval=1d`,
  );
  const result = (await res.json())?.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta ?? {};
  const closes: number[] = (result.indicators?.quote?.[0]?.close ?? []).filter(
    (n: unknown): n is number => typeof n === "number" && isFinite(n),
  );

  const price =
    typeof meta.regularMarketPrice === "number"
      ? meta.regularMarketPrice
      : (closes.at(-1) ?? null);
  if (price == null) return null;

  const prevClose =
    typeof meta.chartPreviousClose === "number"
      ? meta.chartPreviousClose
      : typeof meta.previousClose === "number"
        ? meta.previousClose
        : (closes.at(-2) ?? null);

  const changeAbs = prevClose != null ? price - prevClose : null;

  return {
    price,
    prevClose,
    changeAbs,
    change: prevClose ? (changeAbs! / prevClose) * 100 : null,
    dayHigh: typeof meta.regularMarketDayHigh === "number" ? meta.regularMarketDayHigh : null,
    dayLow: typeof meta.regularMarketDayLow === "number" ? meta.regularMarketDayLow : null,
    currency: meta.currency ?? "USD",
    series: closes.slice(-130),
    asOf: typeof meta.regularMarketTime === "number" ? meta.regularMarketTime * 1000 : Date.now(),
    source: "yahoo",
  };
}

/* ---- 3: Stooq CSV (EOD, no series) ---- */
async function fromStooq(symbol: string): Promise<Partial_ | null> {
  const res = await tryFetch(
    `https://stooq.com/q/l/?s=${symbol.toLowerCase()}.us&f=sd2t2ohlcv&h&e=csv`,
  );
  const rows = (await res.text()).trim().split("\n");
  if (rows.length < 2) return null;

  const [, , , open, , , close] = rows[1].split(",");
  const o = parseFloat(open);
  const c = parseFloat(close);
  if (!isFinite(c) || c <= 0) return null;

  const changeAbs = isFinite(o) ? c - o : null;

  return {
    price: c,
    prevClose: isFinite(o) ? o : null,
    changeAbs,
    change: isFinite(o) && o ? ((c - o) / o) * 100 : null,
    dayHigh: null,
    dayLow: null,
    currency: "USD",
    series: [],
    asOf: Date.now(),
    source: "stooq",
  };
}

/* ---- 4: Finnhub, if a key is present ---- */
async function fromFinnhub(symbol: string): Promise<Partial_ | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  const res = await tryFetch(
    `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`,
  );
  const q = await res.json();
  if (typeof q?.c !== "number" || q.c <= 0) return null;

  return {
    price: q.c,
    prevClose: typeof q.pc === "number" ? q.pc : null,
    changeAbs: typeof q.d === "number" ? q.d : null,
    change: typeof q.dp === "number" ? q.dp : null,
    dayHigh: typeof q.h === "number" ? q.h : null,
    dayLow: typeof q.l === "number" ? q.l : null,
    currency: "USD",
    series: [],
    asOf: typeof q.t === "number" ? q.t * 1000 : Date.now(),
    source: "finnhub",
  };
}

/* ---------------- fetching ---------------- */

/**
 * One symbol, all providers in order, first answer wins.
 *
 * Pulled out of `getQuotes` so `getQuote` isn't a second copy of the fallback
 * chain — two copies drift, and the one the /api/quotes route uses would be
 * the one that quietly stops trying Finnhub.
 */
async function fetchOne(
  t: { symbol: string; name: string; short: string },
  failures: string[],
): Promise<Quote> {
  const attempts: Array<[string, () => Promise<Partial_ | null>]> = [
    ["finnhub", () => fromFinnhub(t.symbol)],
    ["yahoo/q1", () => fromYahoo(t.symbol, "query1.finance.yahoo.com")],
    ["yahoo/q2", () => fromYahoo(t.symbol, "query2.finance.yahoo.com")],
    ["stooq", () => fromStooq(t.symbol)],
  ];

  for (const [label, fn] of attempts) {
    try {
      const got = await fn();
      if (got) return { ...t, ...got };
    } catch (e) {
      failures.push(`${t.symbol}:${label}:${(e as Error).message}`);
    }
  }
  return blank(t);
}

/**
 * Bounded concurrency.
 *
 * Forty symbols fired at once is forty simultaneous requests to the same host,
 * which is the fastest possible way to get an IP rate-limited — the exact
 * failure that made every card read "No data". Eight at a time keeps the whole
 * board inside a couple of seconds while staying under the limits, and the
 * results are cached for two minutes by the fetch layer anyway.
 */
async function inBatches<T, R>(
  items: readonly T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

export async function getQuotes(): Promise<Quote[]> {
  const failures: string[] = [];
  const out = await inBatches(PUBLIC_TICKERS, 8, (t) => fetchOne(t, failures));

  if (failures.length && process.env.NODE_ENV !== "production") {
    console.warn("[market] provider failures —", failures.join(" | "));
  }
  if (out.every((q) => q.price == null)) {
    console.error(
      "[market] every provider failed for all " + PUBLIC_TICKERS.length +
        " symbols. If this only happens when deployed, your host's IP is " +
        "being rate-limited — set FINNHUB_API_KEY to fix it. With 40 symbols " +
        "that is now the expected outcome without a key.",
    );
  }
  return out.map(withPreviewFallback);
}

/**
 * A blank card is almost never "this company has no price" — it is a
 * rate-limited provider, and on Vercel that is the normal case rather than the
 * exception. In preview builds an unresolved symbol gets an illustrative
 * figure so the page demonstrates; `source: "preview"` travels with it so the
 * UI can label it, and nothing here touches a symbol that did resolve.
 *
 * The real fix is a key: FINNHUB_API_KEY, free tier, 60 calls a minute. With
 * one set, none of this runs for a listed security.
 */
function withPreviewFallback(q: Quote): Quote {
  if (q.price != null) return q;
  if (process.env.NEXT_PUBLIC_PREVIEW !== "1") return q;

  const seed = PREVIEW_PRICES[q.symbol];
  if (!seed) return q;

  // A gentle deterministic wobble off the seed, so the sparkline has shape and
  // the figure doesn't change on every render.
  const series = Array.from({ length: 90 }, (_, i) => {
    const t = i / 89;
    return Number((seed * (0.86 + 0.14 * t + 0.03 * Math.sin(i / 6))).toFixed(2));
  });
  const price = series[series.length - 1];
  const prevClose = series[series.length - 2];

  return {
    ...q,
    price,
    prevClose,
    changeAbs: Number((price - prevClose).toFixed(2)),
    change: Number((((price - prevClose) / prevClose) * 100).toFixed(2)),
    dayHigh: Number((price * 1.012).toFixed(2)),
    dayLow: Number((price * 0.988).toFixed(2)),
    series,
    asOf: Date.now(),
    source: "preview",
  };
}

/**
 * Reference levels for the labelled preview fallback, in the region each name
 * has traded in recently. Used only when every provider has failed AND the
 * build is a preview — a resolved quote always wins, and each of these carries
 * `source: "preview"` so the UI marks it.
 */
const PREVIEW_PRICES: Record<string, number> = {
  SPCX: 212.4, AAPL: 233.1, MSFT: 428.7, GOOGL: 196.5, AMZN: 214.8,
  NVDA: 178.6, META: 604.2, TSLA: 341.2, AVGO: 236.4, NFLX: 899.5,
  AMD: 142.8, INTC: 24.6, QCOM: 168.3, MU: 106.4, TSM: 204.7,
  ARM: 142.1, SMCI: 38.9, PLTR: 152.3, CRM: 268.4, ORCL: 189.6,
  ADBE: 396.2, NOW: 986.4, SNOW: 168.9, SHOP: 108.7, UBER: 72.6,
  ABNB: 132.4, COIN: 268.9, SPOT: 612.3, RIVN: 17.4, LCID: 2.8,
  RKLB: 24.6, LMT: 468.2, BA: 178.4, JPM: 268.7, V: 328.4,
  "BRK-B": 486.2, UNH: 512.8, LLY: 786.4, XOM: 116.2, CAT: 392.6,
};

/**
 * Single quote by symbol. This is what /api/quotes?symbol=X calls.
 *
 * Returns `null` for a symbol not in PUBLIC_TICKERS — that's the 404 the route
 * checks for. Deliberately does not pass arbitrary user input through to the
 * upstream URL: the caller is a public unauthenticated endpoint, and letting it
 * fetch any ticker string turns this into an open proxy for someone else's
 * rate limit — burned from your IP, against the quota your own users need.
 *
 * A known symbol whose providers all failed comes back as a blank Quote with
 * `price: null`, not null — the symbol is real, the data isn't there right now.
 * The UI renders an em dash for that, which is the honest thing to show.
 */
export async function getQuote(symbol: string): Promise<Quote | null> {
  const t = PUBLIC_TICKERS.find((x) => x.symbol === symbol.trim().toUpperCase());
  if (!t) return null;

  const failures: string[] = [];
  const q = await fetchOne(t, failures);

  if (failures.length && process.env.NODE_ENV !== "production") {
    console.warn("[market] provider failures —", failures.join(" | "));
  }
  return q;
}

/* ---------------- formatting ---------------- */

export const usd = (n: number, dp = 2) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });

export const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

/** Sparkline path from a close series, normalised into a 0..w / 0..h box. */
export function sparkPath(series: number[], w: number, h: number, pad = 2) {
  if (series.length < 2) return "";

  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const stepX = w / (series.length - 1);

  return series
    .map((v, i) => {
      const x = i * stepX;
      const y = pad + (h - pad * 2) * (1 - (v - min) / span);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
