# InveXt — this round of fixes

Eight items, what was actually wrong with each, and what changed.
`npx tsc --noEmit` is clean (823 files) and `next build` succeeds.

---

## 1. Buying a stock said "Order not placed"

**Cause.** `TradeTicket` POSTed to `/api/orders`, which was a hardcoded stub
returning **501** with exactly the text you saw. Meanwhile `placeOrder()` in
`lib/orders.ts` — the real implementation, with a server-side quote re-fetch,
buying-power and holdings checks, and a position + ledger write in one locked
transaction — was sitting there **unused**. The working code was never on the
path the button took.

**Fix.**
- `components/dash/TradeTicket.tsx` calls the `placeOrder` server action
  directly. The client still sends only an intent (symbol, side, mode, size)
  and never a price — the server re-derives every number.
- `app/api/orders/route.ts` rewritten to delegate to the same function, so the
  HTTP path and the in-app path can't diverge. Refusals return **422** (a
  business outcome) rather than 501, so a caller can tell "you can't afford
  this" from "we broke".
- The confirmation overlay now shows the **executed** fill (quantity, price,
  notional as returned by the server), not what was typed into the box.
- `router.refresh()` fires immediately instead of after a 2.2s delay, so cash
  and holdings are already correct if the overlay is dismissed early.

**Still true, and important:** nothing reaches an exchange or a broker-dealer.
A fill is a bookkeeping entry against a live quote. That is right for a proof
of concept and wrong for real customer money — wire an executing broker before
a real dollar goes near it. Both files say so at the top.

---

## 2. Charts

Three separate faults.

**a. Flat series drew along the bottom edge.** When every value is identical
the span is zero; the old code divided by a fudged `1`, so every point landed
at `y = H`. On your cash-only $45,000 account that is a line welded to the
floor of a tall empty box — which reads as a crash, not as "nothing moved".
That is the screenshot. Verified numerically: old `y = 174` of `H = 190`; new
`y = 95`, the exact vertical middle. Vertical scale labels are suppressed when
flat, because an axis reading `$45,000` twice is worse than no axis.

**b. One holding without history blanked the whole portfolio chart.**
`lib/viewer.ts` required *every* position to have a series or it returned `[]`.
Now the longest available series sets the span and anything without one is held
flat at its current mark. The right-hand edge — the number people actually read
off — stays exactly correct. Verified: cash 45,000 + 10×103 + 5×50 = **46,280**.

**c. A live price could arrive with no history at all.** Finnhub's free tier
serves quotes but not candles, so the chart had nothing to draw even with a key
set. `lib/market.ts` now guarantees a series: if a provider gives a price and
no history, a deterministic shape is derived from the price and previous close,
tagged `seriesSource: "derived"`, and the panel prints a line under the plot
saying the shape is illustrative. A provider series always wins. **No price is
ever invented** — `price: null` stays `null`.

Also: `1D` intraday range (when the provider serves minute bars), plate-backed
scale labels so they stop colliding with the line, wrapped range tabs and
reduced chart height on mobile.

---

## 3. Logos, and a more Robinhood-leaning market view

**Logos.** The source chain was **Clearbit only** — which is being wound down —
so most of the board fell through to grey two-letter monograms. Now:
Wikimedia (where a verified file exists) → **ticker-keyed** services → logo.dev
→ Clearbit → favicon services. Private vehicles skip the ticker services (they
have no ticker) via a `private: true` flag, so they don't burn two failed image
loads first. `Logo` also resets its source cursor when the symbol changes — it
was reusing an exhausted index across client-side navigations, drawing a
monogram for names that had a perfectly good mark available.

**Market view.** `MarketBoard` rebuilt: a horizontally-scrolled **movers rail**
at the top (logo, sparkline, price, tinted change pill, snap-scrolling, bleeds
to the pane edge on mobile), then one dense sortable list. Held rows now show
the actual share count rather than a generic "Held" tag. Works on both
breakpoints.

---

## 4. Shares held on the detail page

The old page had a small `12 sh held` chip in the header and buried cost basis
in a sidebar list. Now there is a **Your position** block directly under the
chart — shares, average cost, market value, cost basis, total return with
percentage, today's move on the position, and weight as a share of portfolio.
Directly under the chart on purpose: in the sidebar it fell below the trade
ticket on every phone.

---

## 5. Real market data — Alpaca wired in

`lib/market.ts` rewritten around a provider chain:

1. **Alpaca** (`ALPACA_KEY_ID` + `ALPACA_SECRET_KEY`) — **set this one.**
   Free Basic plan, no card. Serves quotes *and* daily bars, and it **batches**:
   all 40 symbols resolve in two requests via `/v2/stocks/snapshots` and
   `/v2/stocks/bars`, instead of forty. Includes 5-minute bars for the 1D range,
   pagination, and `BRK-B → BRK.B` symbol mapping.
2. **Finnhub** — quotes only on free; candles attempted and allowed to fail.
3. **Yahoo** (two edges) — keyless, unofficial, 429s hard from datacentre IPs.
4. **Stooq** — keyless EOD, no series.

Your `.env` had `FINNHUB_API_KEY=` **empty**, which is why nothing was quoting.
`.env` now documents where to get Alpaca keys and why they're the right choice.

---

## 6. All 12 private names, Wall Street–style, with listing outlook

Two bugs first: every card linked to `/dashboard/stock/{c.short}` where `short`
is `"Anduril"`, `"CFS"` — **every link 404'd**. The same key was passed to
`Logo`, which is why all twelve rendered as grey monograms. Both now use
`symbol`.

New `lib/listing.ts` carries, per company: listing window, confidence band,
likely venue, the catalyst that would trigger it, what would delay it, the
route (IPO / direct listing / carve-out), and listed comparables. The page
shows these as cards with a four-step confidence meter, a stepped mark
sparkline, and a summary strip. `MarkHistory` — a good panel that was orphaned
in the codebase — is now wired into the private stock page.

**On the framing:** every window is labelled *desk estimate* on the card, on
the stock page, and in a disclaimer below the grid. They are ranges of years,
never quarters, never dates. No private company here has announced an intention
to list. "Expected Q3 2027" sitting next to a Buy button reads, to whoever is
holding the phone, as something the issuer said — and it isn't. The reasoning
is written into the header comment of `lib/listing.ts` so it survives the next
edit. It still looks like a Wall Street research page; it just isn't claiming
something nobody said.

---

## 7. Activity page

**Cause.** The `KIND` map had four entries — deposit, withdrawal, buy, sell —
and the ledger writes **five**. A `correction` row (how the desk adjusts a
balance, so most real accounts have one) hit `KIND[t.kind]` → `undefined` →
`k.label` → `TypeError`. Rendering inside the page body, that took the whole
route down rather than dropping one line. `rejected` status had no badge style
either.

**Fix.** Every kind mapped, and `metaFor()` **cannot** return undefined —
unknown kinds get a generic badge. A page whose entire job is "show me
everything that happened" must not be able to crash on an unfamiliar row.
Also added: filter tabs (All / Trades / Transfers / Pending), realised P/L per
trade row, share count and fill price on trades, network on transfers, trade
rows link to the instrument, and the page now pulls **full** history —
`loadViewer` only carries the most recent 25.

---

## 8. Dashboard arrangement and the greeting

**The density you flagged.** The header packed brand, greeting, value and
account into one row with ~12px between each, so "INVEXT" and "Good afternoon,
Chimdilim" ran together as one line of text with nothing separating them.

**The greeting was also in the wrong place entirely** — pinned to a sticky bar,
it followed you into Market, Activity and Account, where it's noise, and it
competed with the portfolio value, which is the one thing that *does* belong in
a persistent bar.

**Now:** brand hard left, everything else hard right, and the gap between them
does the work. The value gets its own vertical stack — label over figure — the
way a brokerage header reads. Account controls are grouped behind a divider and
drop on mobile (they live on the Account tab). The greeting moved to the top of
Home as a proper welcome block with the date and today's move.

---

## Also removed

`/dashboard/asset/[symbol]` was a near-duplicate instrument page with its own
header, key-data list and **its own trade ticket** (`OrderTicket`) posting to
the old 501 stub — a second buy button that could never fill. Nothing in the
app linked to it. It now redirects to `/dashboard/stock/[symbol]` so bookmarks
still work, and `OrderTicket`, `StockView`, `StockChart` and `PortfolioChart`
(all orphaned duplicates) are gone. One page owns an instrument.
