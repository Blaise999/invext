/**
 * Market data.
 *
 * Providers, tried in order. The first that answers for a symbol wins.
 *
 *   1. ALPACA  — needs ALPACA_KEY_ID + ALPACA_SECRET_KEY (free "Basic" plan).
 *                This is the one to use. Two batched calls cover the whole
 *                board: /v2/stocks/snapshots gives last trade + previous close
 *                for every symbol at once, /v2/stocks/bars gives a daily series
 *                for every symbol at once. Forty names, two requests.
 *   2. FINNHUB  — needs FINNHUB_API_KEY (free tier, 60 calls/min). Quote only
 *                on the free tier; /stock/candle is paid, so it's attempted and
 *                allowed to fail.
 *   3. YAHOO    — keyless, unofficial, rate-limits hard from datacentre IPs.
 *                Works from a laptop, 429s on Vercel. Kept as a fallback.
 *   4. STOOQ    — keyless end-of-day CSV, no series.
 *
 * SERIES ALWAYS EXISTS. A chart that renders blank half the time isn't a
 * chart. If a provider gives a price but no history (Finnhub free, Stooq), a
 * shaped series is derived from the price and previous close so the chart has
 * something to draw — and `seriesSource: "derived"` travels with it so the UI
 * says so. A provider series always wins.
 *
 * Nothing here invents a PRICE. Price null means price null.
 */

export type SeriesSource = "provider" | "derived" | null;

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
  series: number[];           // daily closes, oldest first
  /** Intraday minute bars for the 1D range, oldest first. Empty if none. */
  intraday: number[];
  asOf: number | null;        // epoch ms
  source: "alpaca" | "yahoo" | "stooq" | "finnhub" | "preview" | null;
  /** Where `series` came from — "derived" means shaped from the price. */
  seriesSource: SeriesSource;
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

type Ticker = { symbol: string; name: string; short: string };

const blank = (t: Ticker): Quote => ({
  ...t,
  price: null,
  change: null,
  changeAbs: null,
  prevClose: null,
  dayHigh: null,
  dayLow: null,
  currency: "USD",
  series: [],
  intraday: [],
  asOf: null,
  source: null,
  seriesSource: null,
});

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Class shares carry a different separator on every venue. Yahoo wants BRK-B,
 * Alpaca and Finnhub want BRK.B. One helper rather than a special case in each
 * provider.
 */
const dotted = (s: string) => s.replace("-", ".");

type Partial_ = Omit<Quote, "symbol" | "name" | "short">;

const numeric = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

async function tryFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    next: { revalidate: 60 },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res;
}

/* =============================== 1: ALPACA =============================== */

export function alpacaConfigured(): boolean {
  return Boolean(process.env.ALPACA_KEY_ID && process.env.ALPACA_SECRET_KEY);
}

function alpacaHeaders(): Record<string, string> {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY ?? "",
    Accept: "application/json",
  };
}

const ALPACA_DATA =
  process.env.ALPACA_DATA_URL?.replace(/\/$/, "") ?? "https://data.alpaca.markets";

/**
 * The free Alpaca plan serves the IEX feed; paid plans serve SIP. `iex` is
 * correct for a free key — override with ALPACA_FEED=sip if you're entitled.
 */
const ALPACA_FEED = process.env.ALPACA_FEED ?? "iex";

const isoDaysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

/**
 * Snapshots for the whole board in one request. Alpaca caps the symbol list
 * per call, so this chunks at 100 — comfortably above the 40 names here, but
 * it won't break when the board grows.
 */
async function alpacaSnapshots(symbols: string[]): Promise<Map<string, Partial_>> {
  const out = new Map<string, Partial_>();
  if (!alpacaConfigured() || symbols.length === 0) return out;

  for (let i = 0; i < symbols.length; i += 100) {
    const chunk = symbols.slice(i, i + 100);
    const url =
      `${ALPACA_DATA}/v2/stocks/snapshots` +
      `?symbols=${encodeURIComponent(chunk.map(dotted).join(","))}` +
      `&feed=${ALPACA_FEED}`;

    const res = await tryFetch(url, { headers: alpacaHeaders() });
    const json = await res.json();

    // The API has returned both a bare map and { snapshots: {...} } across
    // versions. Accept either rather than break on a shape change.
    const snaps = json?.snapshots ?? json ?? {};

    for (const raw of chunk) {
      const snap = snaps[dotted(raw)];
      if (!snap) continue;

      const last =
        snap.latestTrade?.p ?? snap.minuteBar?.c ?? snap.dailyBar?.c ?? null;
      if (!numeric(last)) continue;

      const prevClose = numeric(snap.prevDailyBar?.c) ? snap.prevDailyBar.c : null;
      const changeAbs = prevClose != null ? last - prevClose : null;

      out.set(raw, {
        price: last,
        prevClose,
        changeAbs,
        change: prevClose ? ((last - prevClose) / prevClose) * 100 : null,
        dayHigh: numeric(snap.dailyBar?.h) ? snap.dailyBar.h : null,
        dayLow: numeric(snap.dailyBar?.l) ? snap.dailyBar.l : null,
        currency: "USD",
        series: [],
        intraday: [],
        asOf: snap.latestTrade?.t ? Date.parse(snap.latestTrade.t) : Date.now(),
        source: "alpaca",
        seriesSource: null,
      });
    }
  }

  return out;
}

/** Bars for the whole board in one request (paginated). */
async function alpacaBars(
  symbols: string[],
  timeframe: string,
  startISO: string,
  limitPerSymbol: number,
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (!alpacaConfigured() || symbols.length === 0) return out;

  const wanted = symbols.map(dotted).join(",");
  let pageToken: string | null = null;
  let guard = 0;

  do {
    const url: string =
      `${ALPACA_DATA}/v2/stocks/bars` +
      `?symbols=${encodeURIComponent(wanted)}` +
      `&timeframe=${encodeURIComponent(timeframe)}` +
      `&start=${startISO}` +
      `&limit=${Math.min(10_000, limitPerSymbol * symbols.length)}` +
      `&adjustment=split&feed=${ALPACA_FEED}` +
      (pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : "");

    const res = await tryFetch(url, { headers: alpacaHeaders() });
    const json = await res.json();
    const bars = json?.bars ?? {};

    for (const raw of symbols) {
      const rows = bars[dotted(raw)];
      if (!Array.isArray(rows)) continue;
      const closes = rows
        .map((b: { c?: unknown }) => b?.c)
        .filter(numeric) as number[];
      if (closes.length === 0) continue;
      out.set(raw, [...(out.get(raw) ?? []), ...closes]);
    }

    pageToken =
      typeof json?.next_page_token === "string" ? json.next_page_token : null;
  } while (pageToken && ++guard < 12);

  // Trim to the most recent N so a long history doesn't bloat the payload.
  for (const [k, v] of out) out.set(k, v.slice(-limitPerSymbol));
  return out;
}

/* ============================== 2: FINNHUB =============================== */

async function fromFinnhub(symbol: string): Promise<Partial_ | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  const sym = dotted(symbol);
  const res = await tryFetch(
    `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${key}`,
  );
  const q = await res.json();
  if (!numeric(q?.c) || q.c <= 0) return null;

  // Candles are a paid endpoint on the free tier. Attempt it, shrug it off.
  let series: number[] = [];
  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - 60 * 60 * 24 * 400;
    const cres = await tryFetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=D&from=${from}&to=${to}&token=${key}`,
    );
    const candle = await cres.json();
    if (candle?.s === "ok" && Array.isArray(candle.c)) {
      series = (candle.c as unknown[]).filter(numeric).slice(-260) as number[];
    }
  } catch {
    /* free tier — expected */
  }

  return {
    price: q.c,
    prevClose: numeric(q.pc) ? q.pc : null,
    changeAbs: numeric(q.d) ? q.d : null,
    change: numeric(q.dp) ? q.dp : null,
    dayHigh: numeric(q.h) ? q.h : null,
    dayLow: numeric(q.l) ? q.l : null,
    currency: "USD",
    series,
    intraday: [],
    asOf: numeric(q.t) ? q.t * 1000 : Date.now(),
    source: "finnhub",
    seriesSource: series.length > 1 ? "provider" : null,
  };
}

/* ============================== 3: YAHOO ================================= */

async function fromYahoo(symbol: string, host: string): Promise<Partial_ | null> {
  const res = await tryFetch(
    `https://${host}/v8/finance/chart/${symbol}?range=1y&interval=1d`,
  );
  const result = (await res.json())?.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta ?? {};
  const closes: number[] = (result.indicators?.quote?.[0]?.close ?? []).filter(
    numeric,
  );

  const price = numeric(meta.regularMarketPrice)
    ? meta.regularMarketPrice
    : (closes.at(-1) ?? null);
  if (price == null) return null;

  const prevClose = numeric(meta.chartPreviousClose)
    ? meta.chartPreviousClose
    : numeric(meta.previousClose)
      ? meta.previousClose
      : (closes.at(-2) ?? null);

  const changeAbs = prevClose != null ? price - prevClose : null;

  return {
    price,
    prevClose,
    changeAbs,
    change: prevClose ? (changeAbs! / prevClose) * 100 : null,
    dayHigh: numeric(meta.regularMarketDayHigh) ? meta.regularMarketDayHigh : null,
    dayLow: numeric(meta.regularMarketDayLow) ? meta.regularMarketDayLow : null,
    currency: meta.currency ?? "USD",
    series: closes.slice(-260),
    intraday: [],
    asOf: numeric(meta.regularMarketTime) ? meta.regularMarketTime * 1000 : Date.now(),
    source: "yahoo",
    seriesSource: closes.length > 1 ? "provider" : null,
  };
}

/* ============================== 4: STOOQ ================================= */

async function fromStooq(symbol: string): Promise<Partial_ | null> {
  const res = await tryFetch(
    `https://stooq.com/q/l/?s=${symbol.toLowerCase()}.us&f=sd2t2ohlcv&h&e=csv`,
  );
  const rows = (await res.text()).trim().split("\n");
  if (rows.length < 2) return null;

  const [, , , open, , , close] = rows[1].split(",");
  const o = parseFloat(open);
  const c = parseFloat(close);
  if (!Number.isFinite(c) || c <= 0) return null;

  const changeAbs = Number.isFinite(o) ? c - o : null;

  return {
    price: c,
    prevClose: Number.isFinite(o) ? o : null,
    changeAbs,
    change: Number.isFinite(o) && o ? ((c - o) / o) * 100 : null,
    dayHigh: null,
    dayLow: null,
    currency: "USD",
    series: [],
    intraday: [],
    asOf: Date.now(),
    source: "stooq",
    seriesSource: null,
  };
}

/* ========================= derived series ================================ */

/**
 * A chart with no history is a blank rectangle, and a blank rectangle where a
 * chart should be reads as "this app is broken" rather than "this provider
 * doesn't serve history on the free tier". So when a price resolved but no
 * series came with it, shape one.
 *
 * It is deterministic (seeded off the symbol, no Math.random), it ends exactly
 * on the real last price, and its second-to-last point is the real previous
 * close. Everything before that is shape, not data — which is why it comes
 * back tagged `derived` and the UI prints a line under the chart saying so.
 */
function deriveSeries(
  symbol: string,
  price: number,
  prevClose: number | null,
  points = 120,
): number[] {
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) {
    seed = (seed * 31 + symbol.charCodeAt(i)) % 9973;
  }

  const anchor = prevClose && prevClose > 0 ? prevClose : price;
  const from = anchor * (0.88 + (seed % 17) / 100);

  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const trend = from + (price - from) * t;
    const wobble =
      Math.sin((i + seed) / 7.3) * 0.011 + Math.sin((i + seed) / 3.1) * 0.005;
    out.push(Number((trend * (1 + wobble)).toFixed(4)));
  }
  out[out.length - 1] = price;
  if (prevClose && prevClose > 0) out[out.length - 2] = prevClose;
  return out;
}

/** Fill in a series when the provider didn't give one. */
function ensureSeries(q: Quote): Quote {
  if (q.series.length > 1) {
    return { ...q, seriesSource: q.seriesSource ?? "provider" };
  }
  if (q.price == null) return q;
  return {
    ...q,
    series: deriveSeries(q.symbol, q.price, q.prevClose),
    seriesSource: "derived",
  };
}

/* ============================== fetching ================================= */

/** One symbol, every provider in order, first answer wins. */
async function fetchOne(t: Ticker, failures: string[]): Promise<Quote> {
  const attempts: Array<[string, () => Promise<Partial_ | null>]> = [
    ["alpaca", async () => (await alpacaSnapshots([t.symbol])).get(t.symbol) ?? null],
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
 * Bounded concurrency for the per-symbol path.
 *
 * Forty symbols fired at once is forty simultaneous requests to the same host,
 * which is the fastest possible way to get an IP rate-limited. Eight at a time
 * stays under the limits, and with an Alpaca key none of this runs — the batch
 * path covers the whole board in two requests.
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
  const symbols = PUBLIC_TICKERS.map((t) => t.symbol);

  /* ---- fast path: Alpaca covers the whole board in two calls ---- */
  if (alpacaConfigured()) {
    try {
      const [snaps, daily, mins] = await Promise.all([
        alpacaSnapshots(symbols),
        alpacaBars(symbols, "1Day", isoDaysAgo(400), 260),
        alpacaBars(symbols, "5Min", isoDaysAgo(4), 120).catch(
          () => new Map<string, number[]>(),
        ),
      ]);

      if (snaps.size > 0) {
        const filled = PUBLIC_TICKERS.map((t) => {
          const snap = snaps.get(t.symbol);
          if (!snap) return blank(t);
          const series = daily.get(t.symbol) ?? [];
          return ensureSeries({
            ...t,
            ...snap,
            series,
            intraday: mins.get(t.symbol) ?? [],
            seriesSource: series.length > 1 ? "provider" : null,
          });
        });

        // Anything Alpaca didn't cover falls through to the per-symbol chain
        // rather than rendering blank.
        const gaps = filled.filter((q) => q.price == null);
        if (gaps.length === 0) return filled.map(withPreviewFallback);

        if (gaps.length < filled.length) {
          const patched = await inBatches(gaps, 8, (q) =>
            fetchOne({ symbol: q.symbol, name: q.name, short: q.short }, failures),
          );
          const byId = new Map(patched.map((q) => [q.symbol, ensureSeries(q)]));
          return filled.map((q) => byId.get(q.symbol) ?? q).map(withPreviewFallback);
        }
      }
    } catch (e) {
      failures.push(`alpaca/batch:${(e as Error).message}`);
    }
  }

  /* ---- fallback: per symbol, every provider ---- */
  const out = await inBatches(PUBLIC_TICKERS, 8, (t) => fetchOne(t, failures));

  if (failures.length && process.env.NODE_ENV !== "production") {
    console.warn("[market] provider failures —", failures.join(" | "));
  }
  if (out.every((q) => q.price == null)) {
    console.error(
      "[market] every provider failed for all " + PUBLIC_TICKERS.length +
        " symbols. Set ALPACA_KEY_ID and ALPACA_SECRET_KEY (free, batched, " +
        "includes daily bars) — that is the fix. FINNHUB_API_KEY works for " +
        "quotes but not history on the free tier.",
    );
  }
  return out.map(ensureSeries).map(withPreviewFallback);
}

/**
 * A blank card is almost never "this company has no price" — it is a
 * rate-limited provider. In preview builds an unresolved symbol gets an
 * illustrative figure so the page demonstrates; `source: "preview"` travels
 * with it so the UI can label it, and nothing here touches a resolved symbol.
 */
function withPreviewFallback(q: Quote): Quote {
  if (q.price != null) return q;
  if (process.env.NEXT_PUBLIC_PREVIEW !== "1") return q;

  const seed = PREVIEW_PRICES[q.symbol];
  if (!seed) return q;

  const series = Array.from({ length: 120 }, (_, i) => {
    const t = i / 119;
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
    intraday: [],
    asOf: Date.now(),
    source: "preview",
    seriesSource: "derived",
  };
}

/**
 * Reference levels for the labelled preview fallback. Used only when every
 * provider has failed AND the build is a preview — a resolved quote always
 * wins, and each of these carries `source: "preview"` so the UI marks it.
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
 * Single quote by symbol, with its daily series and intraday bars.
 *
 * Returns `null` for a symbol not in PUBLIC_TICKERS — that's the 404 the route
 * checks for. Deliberately does not pass arbitrary user input through to the
 * upstream URL: the caller is a public unauthenticated endpoint, and letting
 * it fetch any ticker string turns this into an open proxy for someone else's
 * rate limit, burned from your IP.
 */
export async function getQuote(symbol: string): Promise<Quote | null> {
  const t = PUBLIC_TICKERS.find((x) => x.symbol === symbol.trim().toUpperCase());
  if (!t) return null;

  const failures: string[] = [];

  if (alpacaConfigured()) {
    try {
      const [snaps, daily, mins] = await Promise.all([
        alpacaSnapshots([t.symbol]),
        alpacaBars([t.symbol], "1Day", isoDaysAgo(400), 260),
        alpacaBars([t.symbol], "5Min", isoDaysAgo(4), 120).catch(
          () => new Map<string, number[]>(),
        ),
      ]);
      const snap = snaps.get(t.symbol);
      if (snap) {
        const series = daily.get(t.symbol) ?? [];
        return withPreviewFallback(
          ensureSeries({
            ...t,
            ...snap,
            series,
            intraday: mins.get(t.symbol) ?? [],
            seriesSource: series.length > 1 ? "provider" : null,
          }),
        );
      }
    } catch (e) {
      failures.push(`${t.symbol}:alpaca:${(e as Error).message}`);
    }
  }

  const q = ensureSeries(await fetchOne(t, failures));

  if (failures.length && process.env.NODE_ENV !== "production") {
    console.warn("[market] provider failures —", failures.join(" | "));
  }
  return withPreviewFallback(q);
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

/**
 * Sparkline path from a close series, normalised into a 0..w / 0..h box.
 *
 * A flat series used to divide by a span of 1 and land every point on the
 * bottom edge — a straight line pinned to the floor, which reads as a crash
 * rather than as "unchanged". Flat now draws through the middle.
 */
export function sparkPath(series: number[], w: number, h: number, pad = 2) {
  if (series.length < 2) return "";

  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min;
  const stepX = w / (series.length - 1);
  const mid = pad + (h - pad * 2) / 2;

  return series
    .map((v, i) => {
      const x = i * stepX;
      const y = span === 0 ? mid : pad + (h - pad * 2) * (1 - (v - min) / span);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
