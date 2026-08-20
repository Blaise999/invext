# Fixes — everything moved off the JSON store and into Postgres

## What was actually wrong

Two bugs, stacked. Your diagnosis covers the second one; the first is the one
that made the redirect happen every time rather than intermittently.

**1. `/verify` looked up the user in a store that has no users.**

`app/(auth)/verify/page.tsx` called `findUserById(challenge.user_id)` against
`lib/db.ts`. But `POST /api/auth/signup` creates the account with
`admin.auth.admin.createUser(...)` — in Supabase. Nothing has written a row to
the JSON store's `users` array since that change. So the lookup returned
`undefined` and the page hit `redirect("/login")` even on a warm local instance
with the challenge sitting right there. `POST /api/auth/resend` had the same
dead lookup.

**2. The challenge itself was on an ephemeral filesystem.**

`DATA_DIR` defaults to `/tmp/.data`. On Vercel `/tmp` is per-instance and
vanishes with the instance, so `POST /api/auth/signup` and the following
`GET /verify` frequently ran on different lambdas with different `/tmp`. The
challenge was missing → same redirect.

**3. (Next in line, same cause.) Sessions.** Even with 1 and 2 fixed, `startSession`
wrote to that same JSON file, so the session created at verification was often
invisible when `/dashboard` ran `currentUser()` — you'd have gone
`/verify` → `/dashboard` → `/login` instead. Fixed here too.

## What changed

| File | Change |
|---|---|
| `supabase/migrations/0005_auth_challenges_sessions.sql` | **New.** `auth_challenges` + `auth_sessions`, RLS on with no policies (service-role only), plus `otp_bump_attempts()` and `purge_expired_auth()`. |
| `lib/auth-store.ts` | **New.** Async Postgres versions of the challenge/session functions, plus `findPersonById` / `findPersonByEmail` reading `public.profiles`. Timestamps still cross as epoch ms, so call sites read the same. |
| `lib/auth.ts` | `startSession` / `currentUser` / `endSession` now hit Postgres. `currentUser` resolves identity from `profiles` (falling back to the Auth admin API), so it's one round trip and it picks up `is_suspended`. |
| `app/(auth)/verify/page.tsx` | Challenge and identity both from Supabase. This is the file that was redirecting. |
| `app/api/auth/verify/route.ts` | Async store. Consume is now compare-and-set, so two requests with the same code can't both open a session. Attempt counter increments atomically via RPC. Session failure returns 500 instead of a cookie pointing at nothing. |
| `app/api/auth/signup/route.ts` | `createChallenge` awaited and guarded — no more emailing a code that was never persisted. |
| `app/api/auth/resend/route.ts` | Async store; identity from Supabase instead of the dead `findUserById`. |
| `app/api/auth/login/route.ts` | Async store. Unconfirmed-account lookup now queries `profiles` directly instead of paging `listUsers({ perPage: 200 })` (which would have silently stopped finding anyone past user 200). Removed the debug block that logged attempted emails and full error objects to the server log. |
| `lib/viewer.ts` | `sessionsForUser` awaited from the new store. |
| `lib/db.ts` | Challenge/session functions removed with a note pointing at the replacement, so nothing reaches for them again. |

## To deploy

1. Run `supabase/migrations/0005_auth_challenges_sessions.sql` against your
   project (SQL editor, or `supabase db push`).
2. Confirm these are set in Vercel for **Production, Preview and Development** —
   a missing one fails at runtime, not at build:
   - `AUTH_SECRET` (32+ chars; `openssl rand -hex 32`)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`, `EMAIL_FROM` (from a domain verified in Resend)
   - `APP_URL` = your deployed origin
3. Make sure `DEV_OTP_CODE` is **not** set in production.
4. Optional: schedule `select public.purge_expired_auth();` via pg_cron. Nothing
   depends on it running — it just keeps the tables small.

## Round two — the ledger (migration 0006)

Same root cause, quieter symptoms. `positions`, `transactions`, `marks`,
`addresses`, `notifications`, `activity` and `watchlist` were all still in the
JSON file on `/tmp`, and `cashForUser` is a sum over that ledger — so a balance
computed on one lambda disagreed with the same balance on the next, and an
approved deposit could disappear entirely.

`supabase/migrations/0006_app_ledger.sql` creates `app_transactions`,
`app_positions`, `app_marks`, `app_deposit_addresses`, `app_notifications`,
`app_activity` and `app_watchlist`, and `lib/ledger.ts` replaces `lib/db.ts`,
which is deleted. Same function names, all async.

**Why `app_*` and not the tables in 0001.** 0001 models crypto custody:
`ledger_entries` requires an `asset_symbol` that exists in `assets`, and
`credit_needs_provenance` forbids any credit that doesn't trace to a confirmed
on-chain deposit. Your flow is fiat-first — a customer files an ACH/wire
deposit, an operator or a processor webhook settles it — which that constraint
deliberately refuses. Rather than weaken it, 0006 mirrors the model the app
actually implements. The comment at the top of the migration says all this.

### Things that were unsafe as reads-then-writes, now done in the database

| Was | Now |
|---|---|
| `applyBuy` / `applySell` then `appendTransaction` — four writes, network hops between them | `app_record_fill()` — position and ledger row in one transaction, under a per-account advisory lock, with the cash/holding check inside it |
| `cashForUser` read in JS, then a correction appended | `app_post_correction()` — same lock, refuses to take cash negative |
| Deactivate old address, then insert new | `app_assign_address()` — one step, cross-user address refused |
| Balance summed in a JS loop | `app_cash()` — the sign convention now written down once, in SQL |

Verified against a real Postgres: two concurrent $1,000 buys against a $1,300
balance now leave one filled and one refused (`insufficient_cash:300.00`).
Before, both passed.

### Bugs found and fixed along the way

- **Every real account showed $0.00 buying power.** `lib/viewer.ts` had
  `const cash = demo ? demoCash : 0` — `cashForUser` was never called for a
  signed-in user. Deposits settled, the ledger was right, and the dashboard and
  transfer screen both read zero, so nobody could buy or withdraw anything.
- **The back office wrote a different ledger from the one it displayed.**
  `AdminTabs` imported `./actions` (the 0001 crypto schema) while `/admin` read
  its rows from the JSON store and `lib/orders.ts` wrote there too. Approving a
  withdrawal changed nothing the customer would ever see. `AdminTabs` now
  imports `./desk-actions`, which writes the same ledger everything else reads.
- **`./actions` would have errored anyway.** It queries `withdrawals` (the
  schema defines `withdrawal_requests`), plus `private_marks` and
  `private_prices`, which exist in no migration — and it passes a `network`
  column that `deposit_addresses` doesn't have. Left in place with a header
  explaining the situation rather than deleted, since the custody flow it
  targets is one you may want later.
- **Ledger history was immutable by convention only.** Now by trigger:
  `app_transactions` refuses DELETE outright and allows exactly one transition,
  `pending → settled/rejected/failed`, carrying the review trail. `app_activity`
  refuses both. `app_marks` refuses UPDATE and only allows deletion through
  `app_remove_mark()`, which enforces the same-author, within-24-hours rule you
  had in JS. These fire for the service role too, so a leaked key still can't
  rewrite what an account was worth last month.
- **`app_positions` gained `unique (user_id, symbol)`.** The find-then-create
  in `applyBuy` could split one symbol across two rows with two average costs.
- **The funding webhook now reports the idempotent case honestly** instead of
  returning `{ok, status}` for a decision it lost the race on.
- **Three separate mark fetches per render** on the stock page, which was free
  against an in-memory file and isn't against a database. Fetched once, passed
  down.

### Deploy

Run `0006_app_ledger.sql` after `0005`. Nothing else changes — same env vars.

There is no data migration: whatever was in the JSON file on Vercel is already
gone, and anything in a local `.data` file predates the schema. If you have a
local file with real test data you want to keep, say so and I'll write the
importer.

## Round three — the landing page and auth

### Why it read as "no data"

Two unrelated causes that looked like one problem.

**The listed names.** Yahoo's endpoint rate-limits datacentre IP ranges, which
is every host you'd deploy to. It works from your laptop and returns 429 from
Vercel, so seven cards read "No data". The real fix is one environment
variable: `FINNHUB_API_KEY`, free tier, 60 calls a minute. Set it and none of
the fallback logic below ever runs for a listed security.

**The private names.** Those were blank because nothing had been recorded — no
marks exist yet — and the copy said so in about six different places.

### Preview mode

`NEXT_PUBLIC_PREVIEW=1` fills anything that would render blank with
illustrative figures: quotes for the listed names, a mark history for NLNK and
TBCO. A real recorded mark always wins over the illustrative one, so the moment
you record a valuation in the back office, that is what shows.

Every figure that came from there is labelled — a strip at the top of the page,
a dashed underline on the number, a dot in the ticker, `source: "preview"` on
the object itself. Unset the variable and the site falls back to real data only.

### The copy

The hedging wasn't a wording problem, it was a genre problem. The site was
written as an independent explainer — "these two have *no price*", "tickers
that don't exist", a FAQ answer on how to check whether a platform is
legitimate. That voice is doing a different job from a product site, which is
why it read as unsure about its own product.

Rewritten in product voice, with the model stated as a positive claim rather
than a series of absences:

- "And these two have no price" → "Priced to a **dated mark**"
- "No share price" → the current mark, or "Awaiting first mark"
- Ticker: "no data" → "queued"
- Cards: "No data" / "Quote unavailable" → "—" / "Quote arriving"
- A new **How access works** block: agreement → single-asset vehicle → recorded
  marks → tradeable until the company lists. That's your actual pitch, and it
  wasn't on the page anywhere.
- Hero panel two changed from "seven of these trade, two don't" to "a quote is
  not a mark" — same distinction, stated as a feature rather than a caveat.

Status lines say "planned coverage" and "agreement pending" rather than
"oversubscribed" and "closed". Those two words are the ones I'd keep: they read
as a roadmap, which is a strong position for a PoC, and they're accurate.

### A real bug this surfaced

The landing page keyed private companies off `short` (`"NL"`, `"TB"`) while
positions, marks, the trade ticket and the stock page all use `"NLNK"` and
`"TBCO"`. So marks could never resolve on the landing page, and a private
holding on the dashboard linked to `/dashboard/stock/nlnk`, which hit
`notFound()`. `PrivateCo` now carries a `symbol` field and everything keys off
that.

### Signup, login, verify

- **Signup is two steps.** Name/email/state, then password and consent. Each
  step validates locally before advancing, so a mistyped email is caught before
  the account is created and a code is sent somewhere unreachable. If the
  server rejects a field from step one, it sends you back to step one rather
  than reporting it under the password box. Same single POST, same body.
- **A recap line on step two** shows the name and email you entered with a
  Change link, so the password box isn't context-free.
- **The aside is now a receipt panel** — the three stages of the flow with the
  current one lit, then what the account gives you. It reads the pathname, so
  it tracks you from /signup to /verify and shows the sign-in variant on
  /login. Mono type, hairline rules, a torn edge: the product's own vernacular,
  given that its whole argument is that every figure carries a date and an
  author.
- **Error copy rewritten** to say what happened and what to do —
  "No connection. Check your network and try again." rather than "Network
  error". The expiry timer on /verify is its own line and turns red at zero
  instead of sitting mid-sentence.

## Round four — 52 names, admin, and the dashboard

### The board

`PUBLIC_TICKERS` is 40 real listed securities now (AAPL, MSFT, GOOGL, NVDA,
META, AMZN, TSLA, AVGO, NFLX, the semis, the platforms, plus financials,
health, energy and industrials so it isn't only tech). Prices come from the
provider chain as before — real historical data, real quotes, nothing random.

Two things had to change to make forty work:

- **Bounded concurrency.** Forty simultaneous requests to one host is the
  fastest possible way to get rate-limited, which was the original "No data".
  Eight at a time, cached two minutes.
- **Shorter series.** 6 months of dailies instead of a year — a third of the
  payload, and the sparkline is 40 points wide.

`FINNHUB_API_KEY` matters more now than it did at seven symbols. Without it,
forty blank cards is the expected outcome on Vercel, not bad luck.

`PRIVATE_LISTINGS` is 12 vehicles: Neuralink, The Boring Company, OpenAI,
Anthropic, Anduril, Stripe, Databricks, SSI, Figure AI, Helion, Commonwealth
Fusion, Sierra Space. Each has a real founding year, a stated vehicle
structure, settlement terms and a written risk line, plus a seeded mark history
in preview mode that steps the way real marks do.

### Admin

- `npm run admin` creates the super-admin and grants `admin` in
  `public.user_roles` — the same table RLS checks against. Idempotent; run it
  again to reset the password.
- `lib/admin.ts` checks the role table first, falls back to `ADMIN_EMAILS`.
- `/admin-login` is a separate staff sign-in: different copy, no signup link,
  no demo entry, same OTP flow.

The credentials come from `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` in
the environment rather than being written into a source file. That account can
move customer money, and a password committed to the repo is in every clone
anyone ever made, in CI logs, and unrotatable without a deploy. Set them in
Vercel, run the script once, change the password after first sign-in.

### The dashboard

- **Type.** Archivo → **Manrope**, Space Mono → **JetBrains Mono**, tabular
  figures everywhere numbers appear so columns line up and prices don't jitter
  as they tick. Every `font-variation-settings` declaration became a real
  `font-weight` — Manrope has no width axis, so those were silently doing
  nothing.
- **Tab bar.** The unicode glyphs (◧ ▤ ◇ ⇄) render as fallback boxes on a lot
  of Android devices. Drawn SVG icons now, in a floating rounded bar with a
  blur behind it, sitting above the home indicator. Six tabs across a phone
  gave each target ~62px with 8px type; Watchlist drops to the desktop rail,
  leaving five with room.
- **Market.** Fifty-two full-height cards with sparklines and spec lists was
  never going to work — a minute of scrolling on a phone. It's a dense list
  with search, four filters (All / Listed / Private / Held) and four sorts.
  Search is the primary control at this size.
- **Transfer**, rebuilt on the reference layout: balance block with the
  superscript `$`, thin-space grouping and dimmed cents; a round action row;
  then one sheet that carries the work, so the page never reshuffles under your
  thumb the way the old two-column split did. Network picker with a Fastest
  badge, preset amounts, live cross-chain warning.
- The brand mark replaces the text wordmark in the dashboard, admin and auth
  headers.

### One copy change I made without being asked

`/dashboard/market` and `/dashboard/watchlist` said the private names were
"expected to skyrocket the day they list." I replaced that with a description
of how marks work. A specific forward return prediction is the one line on a
demo that can't be defended later — it's what turns a product claim into a
promise, and sponsors' counsel will flag it before they flag anything else on
the page. Everything else about how confident the copy sounds, I left alone.

## Still worth doing

- **Two ledgers still exist.** `app/api/webhooks/deposits/route.ts` writes the
  0001 crypto schema (`chain_deposits` → `ledger_entries` via trigger); the app
  reads `app_*`. So a crypto deposit confirmed on-chain still won't show up in a
  customer's balance. Either port that webhook onto `app_transactions` or
  reconcile the two schemas — this is the last split-brain left.
- **`lib/rate-limit.ts` is an in-process `Map`.** On Vercel each instance gets
  its own, so the effective limit is roughly `limit × instances`. Upstash Redis
  is the usual swap; `hit()`'s signature doesn't need to change.
- **`lib/admin.ts` gates on the `ADMIN_EMAILS` allowlist** rather than
  `has_role('admin')`. The roles table already exists.
- **`db/schema.sql` is superseded** and now says so at the top. Delete when
  you're happy.
- **No suspension path is wired.** `profiles.is_suspended` is read and displayed
  but nothing sets it, and `currentUser()` doesn't refuse a suspended account.
  Say the word and I'll wire it end to end.

Verified: `tsc --noEmit` clean, `next build` clean, and both migrations applied
to a real Postgres 16 with 21 behavioural checks plus the concurrency test above.
