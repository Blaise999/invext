/**
 * Issuer identity.
 *
 * Filenames verified against Commons: SpaceX-Logo.svg, Tesla Motors Logo -
 * White.svg, NVIDIA logo.svg, Amazon logo.svg, Rivian logo.svg. Apple and
 * Palantir are best-guess names — if either 404s the monogram takes over, so
 * a wrong filename degrades instead of breaking.
 *
 * Logos come from Wikimedia Commons via Special:FilePath, a stable redirect
 * that serves a rasterised PNG at any width. The files used are tagged
 * PD-textlogo — simple shapes or text, below the threshold of originality, so
 * not copyrightable. They remain trademarks, and showing an issuer's mark next
 * to its own ticker is nominative use: identifying the actual company whose
 * stock this is. That's what every brokerage does.
 *
 * `Logo` falls back to a brand-coloured monogram if a file 404s or the network
 * is unavailable, so nothing ever renders broken.
 */

export interface Brand {
  bg: string;
  fg: string;
  accent: string;
  mark: string;
  /** Primary domain — used to resolve a real logo. */
  domain?: string;
  file?: string;
  /** Some marks are dark-on-transparent and need inverting on a dark surface. */
  invert?: boolean;
  pad?: number;
}

const commons = (file: string, w = 160) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${w}`;

export const BRANDS: Record<string, Brand> = {
  SPCX: { bg: "#0D1B2E", fg: "#EAF2FF", accent: "#4C8DFF", mark: "SX", file: "SpaceX-Logo.svg", invert: true, pad: 5, domain: "spacex.com" },
  TSLA: { bg: "#1F0A0D", fg: "#FF5364", accent: "#E82127", mark: "T",  file: "Tesla Motors Logo - White.svg", pad: 7, domain: "tesla.com" },
  NVDA: { bg: "#131F06", fg: "#9BDB2E", accent: "#76B900", mark: "N",  file: "NVIDIA logo.svg", invert: true, pad: 6, domain: "nvidia.com" },
  AAPL: { bg: "#18181C", fg: "#E8E8ED", accent: "#B4B4BC", mark: "A",  file: "Apple logo white.svg", pad: 7, domain: "apple.com" },
  AMZN: { bg: "#241705", fg: "#FFA724", accent: "#FF9900", mark: "AZ", file: "Amazon logo.svg", invert: true, pad: 5, domain: "amazon.com" },
  PLTR: { bg: "#131A22", fg: "#8FA6C4", accent: "#6E8BB5", mark: "P",  file: "Palantir Technologies logo.svg", invert: true, pad: 5, domain: "palantir.com" },
  RIVN: { bg: "#1F1C04", fg: "#F2DE4A", accent: "#FEDA00", mark: "R",  file: "Rivian logo.svg", invert: true, pad: 6, domain: "rivian.com" },

  /* added with the 40-name board. Where a Commons filename isn't verified the
     monogram takes over, which is why every entry has one. */
  MSFT: { bg: "#0E1B12", fg: "#7FD18F", accent: "#7FBA00", mark: "MS", domain: "microsoft.com" },
  GOOGL: { bg: "#0F1521", fg: "#8AB4F8", accent: "#4285F4", mark: "GO", domain: "abc.xyz" },
  META: { bg: "#0C1626", fg: "#77A7FF", accent: "#0866FF", mark: "ME", domain: "meta.com" },
  AVGO: { bg: "#1D0F12", fg: "#E37D8B", accent: "#CC092F", mark: "AV", domain: "broadcom.com" },
  NFLX: { bg: "#1C0708", fg: "#F0555C", accent: "#E50914", mark: "NF", domain: "netflix.com" },
  AMD:  { bg: "#0D1710", fg: "#79D18C", accent: "#00A650", mark: "AD", domain: "amd.com" },
  INTC: { bg: "#0A1420", fg: "#6DAEE8", accent: "#0071C5", mark: "IN", domain: "intel.com" },
  QCOM: { bg: "#0C1424", fg: "#7EA6E8", accent: "#3253DC", mark: "QC", domain: "qualcomm.com" },
  MU:   { bg: "#0A1622", fg: "#6FB0DA", accent: "#0066B3", mark: "MU", domain: "micron.com" },
  TSM:  { bg: "#1B1408", fg: "#D9B063", accent: "#C8102E", mark: "TM", domain: "tsmc.com" },
  ARM:  { bg: "#12161B", fg: "#9BB0C4", accent: "#0091BD", mark: "AR", domain: "arm.com" },
  SMCI: { bg: "#141018", fg: "#A88FC4", accent: "#6E3FA3", mark: "SM", domain: "supermicro.com" },
  CRM:  { bg: "#0A1622", fg: "#63B3E8", accent: "#00A1E0", mark: "CR", domain: "salesforce.com" },
  ORCL: { bg: "#1B0B0C", fg: "#E0757A", accent: "#C74634", mark: "OR", domain: "oracle.com" },
  ADBE: { bg: "#1C0A0B", fg: "#E86A6F", accent: "#FA0F00", mark: "AB", domain: "adobe.com" },
  NOW:  { bg: "#0B1713", fg: "#6FCBA8", accent: "#62D84E", mark: "NW", domain: "servicenow.com" },
  SNOW: { bg: "#0A1723", fg: "#6FC3E8", accent: "#29B5E8", mark: "SN", domain: "snowflake.com" },
  SHOP: { bg: "#0D1710", fg: "#8CC96F", accent: "#95BF47", mark: "SH", domain: "shopify.com" },
  UBER: { bg: "#131316", fg: "#D6D6DB", accent: "#9E9EA5", mark: "UB", domain: "uber.com" },
  ABNB: { bg: "#1D0D13", fg: "#F0768C", accent: "#FF5A5F", mark: "AN", domain: "airbnb.com" },
  COIN: { bg: "#0A1424", fg: "#6E97F0", accent: "#0052FF", mark: "CO", domain: "coinbase.com" },
  SPOT: { bg: "#0A1710", fg: "#5FD07E", accent: "#1DB954", mark: "SP", domain: "spotify.com" },
  LCID: { bg: "#101318", fg: "#A9B6C6", accent: "#8899AA", mark: "LC", domain: "lucidmotors.com" },
  RKLB: { bg: "#120C1C", fg: "#9E85D6", accent: "#6B3FCC", mark: "RK", domain: "rocketlabusa.com" },
  LMT:  { bg: "#0C1220", fg: "#7E9AC4", accent: "#22568F", mark: "LM", domain: "lockheedmartin.com" },
  BA:   { bg: "#0A1424", fg: "#6E9BD6", accent: "#0039A6", mark: "BO", domain: "boeing.com" },
  JPM:  { bg: "#170F08", fg: "#C9A06B", accent: "#8B6F3E", mark: "JP", domain: "jpmorganchase.com" },
  V:    { bg: "#0D1226", fg: "#8290DB", accent: "#1A1F71", mark: "VI", domain: "visa.com" },
  "BRK-B": { bg: "#121319", fg: "#A8ADBC", accent: "#7A8093", mark: "BR", domain: "berkshirehathaway.com" },
  UNH:  { bg: "#0A1526", fg: "#6EA2DB", accent: "#0058A6", mark: "UN", domain: "unitedhealthgroup.com" },
  LLY:  { bg: "#1A0F0A", fg: "#DB9269", accent: "#D52B1E", mark: "LL", domain: "lilly.com" },
  XOM:  { bg: "#1A0B0D", fg: "#DB7079", accent: "#CE1126", mark: "XO", domain: "exxonmobil.com" },
  CAT:  { bg: "#1C1606", fg: "#E8C450", accent: "#FFCD11", mark: "CA", domain: "caterpillar.com" },

  /* private vehicles — no exchange mark to borrow, so these are all monogram */
  NLNK: { bg: "#0F1418", fg: "#B9C6D1", accent: "#7E93A6", mark: "NL", domain: "neuralink.com" },
  TBCO: { bg: "#151208", fg: "#D6BE7E", accent: "#A88C45", mark: "TB", domain: "boringcompany.com" },
  OPAI: { bg: "#0C1614", fg: "#7EC9BC", accent: "#10A37F", mark: "OA", domain: "openai.com" },
  ANTH: { bg: "#1A130C", fg: "#D6A277", accent: "#C1682B", mark: "AN", domain: "anthropic.com" },
  ANDU: { bg: "#101317", fg: "#A6B4C4", accent: "#6E8296", mark: "AD", domain: "anduril.com" },
  STRP: { bg: "#131029", fg: "#9E93E8", accent: "#635BFF", mark: "ST", domain: "stripe.com" },
  DBRX: { bg: "#1C0D0B", fg: "#E88070", accent: "#FF3621", mark: "DB", domain: "databricks.com" },
  SSIL: { bg: "#0E1219", fg: "#93A8C4", accent: "#5A7391", mark: "SS", domain: "ssi.inc" },
  FIGR: { bg: "#150C14", fg: "#D68FC4", accent: "#A8459B", mark: "FG", domain: "figure.ai" },
  HLON: { bg: "#0B1620", fg: "#6EB4D6", accent: "#2E8BB5", mark: "HL", domain: "helionenergy.com" },
  CFSE: { bg: "#0F1409", fg: "#A8C96F", accent: "#6E9130", mark: "CF", domain: "cfs.energy" },
  SIER: { bg: "#0C1220", fg: "#7E9AD6", accent: "#3A63B5", mark: "SI", domain: "sierraspace.com" },
};

export const brandOf = (symbol: string): Brand =>
  BRANDS[symbol] ?? {
    bg: "#16161C",
    fg: "#8b8a85",
    accent: "#8b8a85",
    mark: symbol.slice(0, 2).toUpperCase(),
  };

/**
 * Where a real logo comes from, in order of preference.
 *
 * The old version only knew about Wikimedia, so the forty names added later
 * had no `file` and every one of them rendered as a two-letter monogram — a
 * board of grey squares. These sources resolve by domain instead, which works
 * for private companies too (they have websites; they don't have Commons
 * files).
 *
 *   1. a verified Commons file, where one exists — highest quality
 *   2. Logo.dev by domain
 *   3. Clearbit by domain
 *
 * `Logo` walks the list on error and falls back to the monogram if all of them
 * miss, so a dead source degrades instead of breaking. Nothing here blocks
 * render: they're plain <img> loads.
 */
export function logoSources(b: Brand, w = 160): string[] {
  const out: string[] = [];

  // A verified Commons file is the best of the three where one exists.
  if (b.file) out.push(commons(b.file, w));

  if (b.domain) {
    // Clearbit's logo endpoint needs no key and no account. It's the one that
    // does the work for the other fifty names.
    out.push(`https://logo.clearbit.com/${b.domain}?size=${w}`);

    // Logo.dev has better coverage of private companies, but it needs a
    // publishable token. Set NEXT_PUBLIC_LOGODEV_TOKEN and it joins the chain;
    // leave it unset and nothing here changes.
    const token = process.env.NEXT_PUBLIC_LOGODEV_TOKEN;
    if (token) {
      out.push(`https://img.logo.dev/${b.domain}?token=${token}&size=${w}&format=png`);
    }
  }

  return out;
}

/** Kept for callers that only want one URL. */
export const logoUrl = (b: Brand, w = 160) => logoSources(b, w)[0] ?? null;
