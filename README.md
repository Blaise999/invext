# InveXt — landing page

Next.js 16, App Router, TypeScript. One hand-written stylesheet, no UI kit.

```bash
npm install
npm run dev     # http://localhost:3000 — scroll slowly through the hero
```

## Mobile

Phone is treated as the primary surface, not an afterthought.

- **Two rendered sequences.** A 900x630 landscape frame letterboxes badly in
  portrait, so narrow viewports get a dedicated 560x700 portrait render — 64
  frames instead of 96, ~2.2 MB instead of 3.5 MB, and fewer but thicker
  strands so the shape still reads at phone size. The variant resolves on mount
  and on breakpoint crossing, never mid-scroll: swapping sequences under a
  moving scrubber reads as a glitch.
- **Resize-on-decode.** `createImageBitmap` is called with `resizeWidth` /
  `resizeHeight`, so frames decode near their painted size rather than at native
  resolution. That plus the smaller portrait sequence and frame-skipping under
  420px takes decoded memory well down from the ~218 MB a naive implementation
  holds. Decode memory, not download size, is what gets a mobile Safari tab
  reaped mid-scroll.
- **Tables restack as cards** under 760px, driven by `data-label` on each cell,
  with the sparkline promoted to its own full-width row.
- **Bottom tab bar** in the thumb zone, tracking the on-screen section via
  IntersectionObserver, clearing the iOS home indicator with
  `env(safe-area-inset-bottom)`.
- **Notifications become a bottom sheet** under 640px instead of a dropdown.
- **16px minimum on inputs**, because anything smaller makes iOS zoom the
  viewport on focus and the layout never quite recovers.
- 44px minimum tap targets, `svh` for the pinned stage (so the URL bar
  collapsing doesn't resize it), safe-area insets on the horizontal axis for
  landscape, `min()` caps on every fixed max-width, and a copy button on deposit
  addresses — unusable on a phone without one.

## The hero motion

Same technique as the reference clip you sent: **96 pre-rendered frames scrubbed
by scroll position on a canvas**, not real-time 3D. A bundle of filaments falls,
shatters, and reassembles into a corona/aperture.

`components/ScrollSequence.tsx` is the reusable piece. Two details carry it:

```js
current += (target - current) * 0.15;   // damping — this is the whole feel
```

Scroll only writes `target`; a rAF loop eases `current` toward it. Drawing the
frame index straight off scroll feels notched and cheap.

And the constraint nobody warns you about: the download is 4 MB, but the
**decoded** cost is `96 × 900 × 630 × 4 ≈ 218 MB of RAM`. That is what blanks
these out on mobile Safari. The component loads every other frame under 760px.
Budget `frames × w × h × 4` under ~150 MB.

Regenerate or restyle the sequence with `tools/render_frames.py`, or drop
Blender renders into `public/seq/` using the same filenames — no code changes.

## Data

**Public equities are real.** TSLA, NVDA, AAPL, AMZN, PLTR, RIVN quote live from
Stooq (free, no API key), server-side, cached 5 minutes. If the fetch fails the
UI renders `—`. It never invents a number.

**Seven tickers are real and quote live:** SPCX, TSLA, NVDA, AAPL, AMZN, PLTR,
RIVN. SpaceX has traded on Nasdaq as SPCX since its IPO on 12 June 2026.

**Two companies are still private and show no price:** Neuralink and The Boring
Company. No ticker, no quote, no daily percentage — they're profile cards
instead.

**Grok, X and Starlink are not separate tickers and never were.** SpaceX
acquired xAI outright in February 2026 (xAI having acquired X in March 2025),
and Starlink has always been a SpaceX subsidiary. All three are inside SPCX. A
site offering you a GROK or STARLINK ticker is offering one that doesn't exist.

## Media

- **NASA Image and Video Library** — fetched live in `lib/nasa.ts`. Public
  domain, commercial use fine. This is your best free source by a distance.
- **SpaceX's own Flickr is not free.** It was CC0 until December 2019, when the
  licence was retroactively narrowed. Don't build on the old assumption.
- **Tesla press images are all-rights-reserved.**
- **YouTube** embeds via the official player, using the channel's *uploads
  playlist* (`UU` + channel ID minus `UC`), so it never goes stale.
  ⚠️ **Verify the channel ID resolves before launch** — I sourced it from a
  public listing, not YouTube directly.

## What I changed from the spec, and why

Five things in the original spec I didn't build. Each has a working substitute:

| Spec | Why not | What's there instead |
|---|---|---|
| `SPACEX $185 +1.87%`, `GROK $62.4`, `NLINK $38.75` | These don't trade. There is no price to placeholder. | Profile cards, "No share price", explanation of why |
| Testimonials with `+71% return` / `$328,000 invested` | Performance claims in testimonials are restricted almost everywhere securities are regulated | Dashed placeholder cards, no returns field, no amount field |
| "SEC Compliant" badge | Not a real certification | Prompt to verify on IAPD / BrokerCheck |
| `$2.4B+ AUM`, `48,000 investors`, `94.7% satisfaction` | Unverifiable | Removed; the live quote count is real |
| Hardcoded BTC address + Zelle/PayPal | Irreversible rails; nothing in this build should take money | Email capture only, no payment processing |

Also removed: Musk's photo with "+247% 5yr return" beside it. Using a real
person's likeness to imply endorsement of a financial product is a
right-of-publicity problem independent of copyright.

The page is, I think, better for it — "six of these trade, five of these don't"
is a sharper hook than a wall of identical green percentages, and it's the one
thing a visitor genuinely doesn't know walking in.

## Before launch

1. `lib/data.ts` — replace placeholder testimonials, verify the YouTube channel ID.
2. Footer entity name, registration number and email are placeholders.
3. `components/Waitlist.tsx` — `submit()` sets local state only; wire to your CRM.
4. Stooq is fine for display but is delayed EOD data. For anything real-time,
   licence a proper feed.
5. Have securities counsel read the page before it's public. The disclosure text
   is a sane starting point, not legal advice.

## Files

```
app/page.tsx                 section order, server-side data fetching
app/globals.css              entire design system
components/ScrollSequence.tsx  the scrubber
components/Hero.tsx          staged hero copy driven off scroll progress
components/{Ticker,PrivateList,Faq,Waitlist}.tsx
lib/data.ts                  quotes, private profiles, FAQ, media config
lib/nasa.ts                  NASA public-domain image fetch
tools/render_frames.py       frame generator
public/seq/                  96 frames, ~42 KB each
```

## Real content, and the one thing I couldn't fill

`lib/facts.ts` holds verified, dated, checkable data — SPCX's Q2 2026 results,
segment revenue, the 52-week range, the funding history of the two private
companies, and a dated timeline of the three corporate restructures. Each item
is confirmable against published coverage. `FACTS_AS_OF` marks the vintage,
because figures go stale and a page that hides that is lying quietly.

The empty testimonial grid is gone. In its place:

- **What changed** — a seven-entry dated timeline (xAI/X merger, SpaceX buying
  xAI, the IPO, the post-IPO drawdown, first earnings, the Anysphere deal).
- **The argument** — the real bull and bear cases, attributed. Citi's buy and
  $200 target on one side; Phillip Securities' sell, Wolfe's caution, S3's
  froth call, and the ~6bn shares unlocking before June 2027 on the other.

An empty testimonial shell is worse than no testimonials, and inventing quotes
on an investment page is the single most regulated thing you could put there.
Real market disagreement fills the space better anyway.

### Company identity

Set these and they render; leave any unset and the line is omitted rather than
showing a placeholder:

```
COMPANY_LEGAL_NAME=
COMPANY_REGISTRATION=
COMPANY_EMAIL=
COMPANY_ADDRESS=
```

I did not invent a legal entity name or a registration number. A made-up
registration number is the one detail on a financial site that turns a
presentation problem into a fraud problem — it is the first thing anyone
verifying you will check, and it fails in about ten seconds on FINRA
BrokerCheck. Fill these with your real details and the footer completes itself.

### Imagery

`sampleQueries()` draws six queries from a pool of fourteen, seeded by the hour
— so the gallery varies through the day without changing per-request and busting
the cache.

## "Module not found" after unzipping

Run `npm install`. Every time you get a new zip, the dependency list may have
changed and your existing `node_modules` will be missing whatever was added —
that's what `Can't resolve '@supabase/ssr'` means, not a broken import.

The tell is always the same: the missing module is one you never touched.
Verified from a clean unzip of this build — `npm install` then `npm run dev`
resolves everything.

Supabase clients are loaded with dynamic `import()` inside the functions, so
they're only pulled in when something actually calls them. `supabaseConfigured()`
and `supabaseAdminConfigured()` let callers check first, and the realtime
components return early when no database is connected instead of throwing.

## Demo mode — seeing the dashboard populated

Empty states tell you nothing about a design.

**Just open `/dashboard`.** No sign-up, no code, no database — in a demo-enabled
environment it renders sample data directly. (The `2304` code on `/login` still
works if you want to enter it explicitly; the difference is only the banner
button, which offers *Sign in* rather than *Exit demo*.)

Either way you get a fully rendered account:

- **James Whitfield**, New York, opened February 2026
- **$200,000.00** total — $32,087.50 cash, $167,912.50 across five positions
- SPCX 640 · TSLA 95 · NVDA 42 · PLTR 780 · AMZN 34
- Eight transactions, two active sessions, three notifications, an activity feed

Live market prices are real, so unrealised P/L computes against actual quotes.
If the quote providers are unreachable, positions display at cost (P/L zero) and
the statement line says so, rather than showing $0 and looking broken.

### Two guardrails

**1. Off in production.** `demoAllowed()` returns false when
`NODE_ENV === "production"` unless you set `ALLOW_DEMO_IN_PROD=1`. Forgetting to
disable a demo mode is an ordinary mistake; this makes the ordinary mistake
harmless. Verified: `next start` refuses the code by default.

**2. An undismissable banner** on every demo page stating the holdings are
fictional and nothing can be withdrawn.

Both matter because a hidden code that produces a six-figure balance is,
mechanically, the same thing a fake brokerage does. The difference is entirely
whether it is labelled and whether it can reach real money. This one can't:
demo data is a separate render branch returning fixtures from `lib/demo.ts`, and
there is no code path from those objects into the store, the ledger, or any
payment rail.

Change the code with `DEMO_ACCESS_CODE`. Exit via the banner button, which
clears the cookie.

## Dashboard design — 70 / 30

Roughly seventy percent trading desk, thirty percent consumer app.

**The Robinhood 30%** is confined to the top of the page:

- Time-aware greeting resolved in the *reader's* timezone, not the server's —
  `Greeting.tsx` renders from the server hour for stable markup, then corrects
  on mount. Otherwise everyone outside the deploy region gets greeted wrong.
- One large portfolio number with today's move in dollars and percent.
- A full-width portfolio line chart — the weighted sum of every position's daily
  series plus cash, drawn as server-side SVG. No charting library, no client JS.
- An allocation bar in brand colours, with a keyed breakdown underneath.
- Rounded logo tiles beside every ticker.

**The Wall Street 70%** is everything below it: tabular numerals throughout,
cost basis and open P/L stated plainly, dense rows, hairline rules, mono labels,
delayed-quote stamps. Holdings gained logos and weight percentages but stayed a
table rather than becoming cards.

### Logos

`lib/brands.ts` renders monogram tiles in each company's brand colour rather
than the real logo files. Those are trademarked, and hotlinking them breaks the
first time a CDN path moves. A monogram always renders, works offline, and stays
legible at 28px. If you licence real assets, set `logo` on the brand entry and
the component uses it with the monogram as fallback.

### Charts in demo mode

The chart needs price history. When the quote providers are unreachable, demo
mode falls back to a deterministic seeded walk ending at each position's cost
per share (`demoSeries` in `lib/demo.ts`) — otherwise the chart is blank and
there's nothing to review. A live series always wins, this only ever applies in
demo, and the banner already states the figures are fictional.

## Research behind the dashboard

Two findings changed the build.

**Timeframe selectors belong next to the chart, and must be 44px.** Trading-app
design guidance is explicit that 1D/1W/1M/1Y/ALL must sit directly adjacent to
the chart module rather than in settings, because rapid range switching is a
core behaviour and any friction breaks the analytical flow. Separately, a
published Robinhood UX audit found four of seven testers mis-tapping the range
buttons because the targets were too small, and recommended 44×44pt.

My first version had a static SVG with no range control at all. `PortfolioPanel`
now has 1W / 1M / 3M / 1Y / ALL at 44px minimum, directly beneath the chart.

**Scrubbing is the interaction, not the chart.** Robinhood's portfolio screen is
built around dragging along the line and watching the headline number follow.
The chart now supports mouse and touch scrubbing with a crosshair and a value
marker, and the big number plus the delta update to whatever point you're on —
so the number you read is always the one under your finger.

**Where this deliberately beats Robinhood:** a Pratt design critique notes their
portfolio screen has no clear signifier for asset allocation, so users can't
assess diversification without leaving the screen. The allocation bar is
directly above the fold here.

**What I refused to copy.** Trading-app research is blunt that gamified motion
in this category is not benign: flashing price trends and animated count-ups
create excitement that nudges impulsive trading. There are no count-up
animations on the balance and no flashing tickers. Motion is limited to the
scrub, which is informational.

### Other fixes from the same pass

- Quote series extended from 1 month to ~1 year, so the range tabs have data.
- Catmull-Rom smoothing on the line — a polyline reads as a chart, a curve reads
  as a product.
- A dashed line marks the opening level, so the fill has a reference.
- Surface elevation (`--surface-1`, `--surface-2`) replaces hairline borders as
  the main hierarchy device. On dark backgrounds, depth comes from surface
  value; shadows just muddy it.

## Visual system

The original dashboard was one column of hairline-separated tables. That reads
as bland regardless of typography, because there is no rhythm and no unit of
composition. What changed:

**Layout.** A two-column body — main flow plus a sticky sidebar carrying
allocation, account figures and the private watchlist. The page now has
foreground and background instead of one uniform stack.

**Spacing scale.** `--s1` through `--s6` (8 → 78px) replaces ad-hoc margins,
with section gaps roughly doubled. Most of the "bland" was uniform 46px gaps
giving every section identical weight.

**Panels.** Rounded surfaces at `--surface-1` with real padding, replacing
borders as the primary grouping device. On dark backgrounds hierarchy comes
from surface value; hairlines everywhere just make noise.

**Hero.** The portfolio panel sits on a rounded card with a warm radial wash in
the top-left corner.

**Activity** was a five-column table of dates and figures — complete and dead.
Now grouped by month with a rule and count, a logo or typed glyph per row,
colour-coded amounts, and status pills.

**Private companies** became cards with logos and metadata rather than a table
with two empty columns.

### Logos

Real marks from Wikimedia Commons via `Special:FilePath`, which serves a
rasterised PNG at any width. The files are PD-textlogo — simple shapes or text,
below the threshold of originality, so not copyrightable. They are still
trademarks, and showing an issuer's mark beside its own ticker is nominative
use: identifying the actual company whose stock it is. Every brokerage does it.

Verified filenames: SpaceX-Logo.svg, Tesla Motors Logo - White.svg,
NVIDIA logo.svg, Amazon logo.svg, Rivian logo.svg. Apple and Palantir are
best-guess names; `Logo` has an onError fallback to a brand-coloured monogram,
so a wrong filename degrades rather than breaking.

## Routes

```
/dashboard                  Overview — chart, holdings, allocation
/dashboard/market           7 quote cards (tap → asset)
/dashboard/asset/[symbol]   Detail + chart + order ticket
/dashboard/transfer         Deposit / withdraw
/dashboard/activity         Month-grouped feed
/dashboard/watchlist        Private companies
/dashboard/account          Security + sessions
```

Left rail on desktop, 6 bottom tabs on mobile. All links use `prefetch`, so
taps navigate instantly.

## Ready to connect

Two stubs, both returning **501** with the wiring note in the file:

| File | Wire to |
|---|---|
| `app/api/orders/route.ts` | Executing broker — Alpaca, DriveWealth, Apex |
| `app/api/transfers/route.ts` | Licensed payments — Stripe Treasury, Dwolla, Increase, Column |

**In both cases, only write a ledger entry when the provider confirms** — a
broker fill with quantity and price, or a settled payment webhook with a
reference. Never on submit, never from an admin form. That's the same rule the
schema enforces: `balances` is a view, and the only way in is a confirmed event.

The order ticket's maths is real — it converts dollars ↔ shares against the live
delayed quote, fractional to 6dp. Only the fill is absent, and the UI says so.

Funding rails offered are ACH, domestic wire and debit card. Crypto transfer,
Zelle, CashApp and gift cards are listed under "what we don't accept" — they're
irreversible, which is exactly why fraudulent operations prefer them.

Admin (`/admin`) is already wired to the schema: withdrawal approval via
`review_withdrawal`, asset config, ledger corrections, audit log.

## Resend — full setup

```bash
cp .env.example .env.local
openssl rand -hex 32          # → AUTH_SECRET
```

```
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM="InveXt <security@yourdomain.com>"
EMAIL_REPLY_TO=support@yourdomain.com     # optional
APP_URL=https://yourdomain.com            # welcome-email link target
```

1. **resend.com/api-keys** → create a key with Sending access.
2. **resend.com/domains** → add your domain, publish the DKIM, SPF and DMARC
   records it gives you, wait for Verified. **`EMAIL_FROM` must use a verified
   domain** — otherwise the API returns 200 and the mail silently never lands.
   That is the single most common failure here.
3. Leave `RESEND_API_KEY` unset in development and codes print to the console
   instead of sending, so you can run the whole OTP flow without burning quota.

Two templates in `lib/email.ts`, both table-based with inline styles and plain
text alternates: the OTP code, and the welcome mail sent once on first
verification (fire-and-forget, so a mail failure can't roll back a signup).

## Database

`supabase/FULL_SCHEMA.sql` — one paste into the Supabase SQL editor, safe to
re-run. 12 tables, 18 policies, RLS on everything. Now includes `orders`,
`positions` and a `holdings` view for the trade ticket.

P/L is **derived, never stored**: cost basis sits on the position, market value
comes from the live quote at request time. A stored P/L is stale the moment the
market moves.

## Admin

`/admin` — six tabs.

| Tab | Does |
|---|---|
| Withdrawals | Approve / reject, four-eyes enforced in the DB |
| **Deposits** | Approve / reject **detected** on-chain deposits |
| **Addresses** | Assign BTC / ETH / SOL / USDT deposit addresses per user |
| Accounts | Suspend, reinstate, post ledger corrections |
| Assets | Enable rails, set minimums and confirmation thresholds |
| Audit log | Append-only, includes every admin action |

Deposit approval settles a payment the watcher already saw — it bumps
confirmations to the asset threshold, which fires the DB trigger that writes the
ledger credit. There is no create path: a deposit must exist on-chain with a
txid first. Confirming a detected payment early is an ops decision; conjuring
one that never happened is inventing money, so that path doesn't exist.

For genuine errors, `post_correction` posts a signed, attributed,
customer-visible ledger entry that can't be deleted and can't overdraw.
