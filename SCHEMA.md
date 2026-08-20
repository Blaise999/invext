# Supabase schema

**Fastest route — one paste:**

```
supabase/FULL_SCHEMA.sql
```

Open the Supabase SQL editor, paste the whole file, run once. Safe to re-run:
enums are guarded, tables use IF NOT EXISTS, triggers and policies are dropped
before creation, and Realtime adds are wrapped. It ends with a verification
block you can run to confirm the install.

**Or the migration route:**

```bash
supabase db push
psql "$DB_URL" -f supabase/seed.sql
```

```
supabase/migrations/0001_init.sql       tables, enums, views, immutability triggers
supabase/migrations/0002_logic.sql      triggers, RPCs, all RLS policies, grants
supabase/migrations/0003_spacex_ipo.sql moves SPCX to public, retires the merged tickers
supabase/seed.sql                       asset config (deposits ship disabled)
```

Then grant yourself admin **after** signing up through the app:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from public.profiles where email = 'you@yourdomain.com';
```

## What you asked for, and what's here

| Ask | Status |
|---|---|
| Full Supabase SQL schema | ✅ Two migrations + seed, RLS on every table |
| Deposit USDT / BTC / ETH / SOL by QR | ✅ Per-user addresses, server-rendered QR, 6 rails incl. USDT on ERC20/TRC20/SPL |
| Reflect the SpaceX IPO | ✅ Migration 0003 — see below |
| Deposit shows in balance | ✅ On confirmation, via the ledger. See below |
| Notification bar wired to all activity | ✅ Realtime, RLS-scoped |
| History bar wired to all activity | ✅ Append-only `activity_log`, filterable |
| Admin sees users | ✅ `is_staff()` read policies |
| Admin edits each crypto coin | ✅ Full `assets` config — enable/disable, minimums, fees, confirmation thresholds |
| Admin approves withdrawals | ✅ `review_withdrawal()` with four-eyes enforcement |
| Admin edits user balance | ❌ Not built. Read the next section |

## Why there's no balance column

`public.balances` is a **view**, computed from an append-only ledger:

```
chain_deposits (what the chain did, confirmations climb)
      │  trigger fires at required_confirmations
      ▼
ledger_entries (immutable, one row per settled movement)
      │  sum(credits) − sum(debits)
      ▼
balances (view)  →  what the user sees
```

There is no column anywhere in this schema that holds a balance, so there is
nothing to UPDATE. That is the single most important line in the design, and
it's what I built instead of `admin_set_balance()`.

The reason is not squeamishness about the feature name. An admin-writable
balance combined with crypto deposit addresses and admin-approved withdrawals
is not a brokerage with a shortcut in it — it's a different machine entirely.
It's the mechanism behind fake investment platforms: show the customer a number
that has no relationship to any settled transaction, let it "grow", collect
further deposits against the illusion, then decline the withdrawal. Crypto,
Zelle and wire rails are chosen for these because the payments can't be
reversed. It's among the highest-loss fraud categories there is, and the
schema is the part that makes it possible.

In a real brokerage the operator *can't* set a balance, because the balance is
a projection of settled transactions rather than an input. That's not a
constraint I invented for you — it's what makes the number mean anything.

So the deposit flow works exactly as you described from the user's side: scan
the QR, send USDT or BTC or ETH or SOL, watch it appear in the balance. The
only difference is *what* makes it appear — a confirmed on-chain transaction
with a txid, not a keystroke.

## The honest version of "edit user balance"

`post_correction(user, asset, direction, amount, reason)` exists for genuine
operational mistakes — a fee charged twice, a deposit credited to the wrong
account. Differences that matter:

- Posts a **signed, attributed ledger entry**; never overwrites a figure
- Requires a written reason of 20+ characters, stored permanently
- **Notifies the customer** and appears in their own history
- Cannot be edited or deleted afterwards, by anyone
- Cannot overdraw the account
- Cannot be applied to your own account

It leaves a trail on purpose. If you ever need to explain a balance to a
regulator, an auditor or a customer's lawyer, the trail *is* the defence.

## Immutability is enforced in the database, not by convention

`ledger_entries` and `activity_log` have `BEFORE UPDATE` and `BEFORE DELETE`
triggers that raise unconditionally. Triggers fire for `service_role` too, so
**a leaked service key still cannot rewrite financial history** — it can insert,
not revise. To reverse something, you post a compensating entry, and both rows
stay visible forever.

That's also why the service-role client lives in its own file with a warning
at the top: only the deposit webhook and back-office jobs should ever import it.

## Double-credit protection

Three independent guards, because webhook replays are routine:

1. `unique (asset_symbol, txid)` on `chain_deposits` — one row per on-chain tx
2. `unique` on `ledger_entries.chain_deposit_id` — one credit per deposit
3. The apply trigger re-checks for an existing entry before inserting

## Deposit addresses

`deposit_addresses` has a partial unique index giving **exactly one active
address per user per asset**, while keeping rotated-out addresses for history.

Never share one static address across users. If two people pay into the same
address you cannot attribute either payment, and matching by amount breaks the
first time two users send the same figure. `derivation_index` is uniquely
constrained to push you toward per-user HD derivation.

The webhook additionally verifies the address is already assigned to the
claimed user before recording anything — otherwise a spoofed `user_id` could
route someone else's deposit into the wrong account.

## Before you enable deposits

`seed.sql` ships every asset with `is_deposit_enabled = false`. Leave it that
way until all of these are true:

1. **A real processor is connected** — Coinbase Commerce, BitPay or Fireblocks,
   or your own indexer. `app/api/webhooks/deposits/route.ts` is a template: the
   HMAC check is generic and every provider signs differently. Replace
   `verify()` with your provider's documented scheme and **test it with a
   deliberately bad signature**. An unauthenticated version of that endpoint is
   a hole straight into your ledger.
2. **You've watched one real deposit confirm end to end** on a testnet, then
   with a small mainnet amount.
3. **`required_confirmations` is sane per chain.** The seed uses BTC 2, ETH 12,
   SOL 32, TRC20 20. Too low and you'll credit a transaction that later
   reorgs out.
4. **Withdrawals have a payout job.** `review_withdrawal()` debits and marks
   `approved`; something still has to broadcast and flip it to `sent`.
5. **You've taken legal advice.** Custodying customer crypto in the US
   generally means money-transmitter registration — FinCEN MSB federally, plus
   state licensing (New York's BitLicense being the strict one). This is
   licensing law, not a disclaimer you can write your way out of, and it
   applies the moment you hold someone else's funds.

## Auth

The schema assumes **Supabase Auth** (`auth.users`), with `handle_new_user()`
creating the profile, the default role, a welcome notification and the first
audit row.

That replaces the custom auth in `lib/auth.ts`. Keep the OTP design though —
Supabase Auth supports email OTP natively, so wire the same two-step flow with
`signInWithOtp`. Sign-up metadata needs to carry `first_name`, `last_name` and
`us_state` for the trigger to read:

```ts
await supabase.auth.signUp({
  email, password,
  options: { data: { first_name, last_name, us_state } },
});
```

## Numbers

Every monetary column is `numeric(38,18)`. Never `float` or `double precision`
for money — `0.1 + 0.2 !== 0.3` in binary floating point, and on a ledger that
compounds into balances that don't reconcile. Pass amounts as **decimal
strings** from JS, never as `number`: `Number("0.000000000000000001")` already
loses precision, and JS integers stop being exact above 2^53, which 18-decimal
wei amounts exceed easily.

## Not built

- **Trading.** `trade_buy` / `trade_sell` reasons exist in the enum, but there's
  no matching engine, no order table, no execution path. You cannot sell a
  customer exposure to a public equity without a broker-dealer relationship, and
  you cannot sell exposure to SpaceX or Neuralink at all through a retail flow.
- **Admin UI.** The SQL side is complete — `is_staff()` read policies,
  `review_withdrawal()`, `post_correction()`, `assets` write policies. Ask and
  I'll build the screens on top.
- **KYC provider.** `profiles.kyc` is a status field with nothing driving it.
  Wire Persona, Alloy or Sumsub.

## The 2026 corporate changes

I had this wrong initially and you were right to push back. My reliable
knowledge runs to roughly May 2026; the listing happened after that.

| Company | Status | Notes |
|---|---|---|
| **SpaceX** | **Public — Nasdaq: SPCX** | IPO 12 June 2026 at $135/share. Largest IPO on record |
| **Grok / xAI** | Inside SPCX | SpaceX acquired xAI outright 2 Feb 2026, all-stock. Now branded SpaceXAI |
| **X** | Inside SPCX | xAI acquired X in March 2025, so it came across with the xAI deal |
| **Starlink** | Inside SPCX | Always a SpaceX subsidiary. Never had its own shares |
| **Tesla** | Public — Nasdaq: TSLA | Separate company. Linked by shared leadership, not ownership |
| **Neuralink** | Still private | No ticker, no announced listing. Last primary round Series E, June 2025 |
| **The Boring Company** | Still private | No ticker. Last confirmed round Series C, April 2022 |

So the split is now **seven public, two private** — it was six and five.

`0003_spacex_ipo.sql` handles the migration:

1. Renames the `SPACEX` asset row to `SPCX` and reclassifies it as
   `public_equity`, so existing watchlist rows and any ledger history survive.
2. Retires `XAI`, `GROK`, `X` and `STARLINK`. Deletes them where nothing
   references them; otherwise renames them `— merged into SPCX` and disables
   them. **No ledger row is ever rewritten** — the append-only triggers would
   reject that anyway.
3. Normalises Neuralink and The Boring Company as private.

### Why this cost almost nothing to fix

There were no prices to update, because there is no price column. SPCX became
correct the moment it was added to `PUBLIC_TICKERS` in `lib/market.ts` — the
quote is fetched live. Had the original spec's approach been used, with
`SPACEX $185.00 +1.87%` hardcoded, this event would have silently turned every
number on the site into a lie with no error and no failing test.

That is the practical argument for never storing a price you don't own: the
world changes underneath you, and derived data follows while hardcoded data
rots. Same reason balances are a view.

### One thing worth flagging

SPCX being liquid and retail-accessible changes the honest pitch. Roughly 30% of
the IPO was reserved for retail, and it trades in fractional shares through
Robinhood, Fidelity, Schwab, SoFi and E*TRADE. Anyone can buy it for a few
dollars with no minimum.

So there is now no access story to sell around SpaceX at all — charging a
premium for "access" to SPCX would be charging for something free. The only
genuine access problem left in this group is Neuralink and The Boring Company,
and those are accredited-investor SPVs at best.

## Imagery and attribution

`lib/media.ts` handles all sourcing. Two providers, both free for commercial
use, both fetched server-side and cached:

- **NASA Image and Video Library** — public domain, images *and* video. The
  gallery runs six separate queries and dedupes, because a single query returns
  near-identical frames from the same launch.
- **Wikimedia Commons** — the API returns the licence short name and artist
  string, so attribution is generated from the file's own metadata rather than
  typed once and left to rot. `commonsFile()` checks the machine-readable
  licence field against an allowlist and returns `null` when a file is not
  demonstrably free, so a non-free file gets dropped instead of shipped with a
  hopeful caption.

Portraits of Musk **are** freely licensed on Commons (CC BY 2.0 / CC BY-SA 4.0),
so they're usable — with two conditions that come from the licences themselves
rather than from taste. CC-BY requires visible attribution, and it requires the
credit not suggest the licensor endorses your use. Commons additionally tags
portraits of living people with a personality-rights warning.

So the portrait sits in an editorial "who runs what" section explaining the
corporate structure, credit and licence visible, and nowhere near a price, a
return figure or a call to invest. That specific pairing — a real person's face
beside a performance number — is what turns a photograph into an implied
endorsement, and it's the load-bearing element of the impersonation scams in
this sector.

Still excluded: SpaceX's own Flickr (CC0 until December 2019, then
retroactively narrowed), Tesla press images (all rights reserved), and anything
from Getty, AP or Reuters.

## Admin panel

`/admin`, gated by `requireAdmin()` in `lib/admin.ts`.

Four tabs: **Withdrawals** (approve/reject via `review_withdrawal`, four-eyes
enforced in the database), **Accounts** (suspend/reinstate, ledger corrections),
**Assets** (deposit/withdrawal toggles, confirmation thresholds), **Audit log**.

Every server action in `app/admin/actions.ts` re-checks admin status
server-side. The hidden button is never the boundary.

Two things absent by design:

- **No `setBalance` action.** There is no balance column to write to.
  `postCorrection` appends a signed, attributed, customer-visible ledger entry
  instead, and refuses without a 20-character written reason.
- **No price fields on assets.** Quotes are fetched, never entered.

### The auth bridge

The app currently ships its own auth while the database uses Supabase roles, so
`requireAdmin()` takes the session from the local store and admin status from
`ADMIN_EMAILS`. That's a bridge, not the destination. When you move auth to
Supabase, delete `lib/admin.ts` and gate on `has_role('admin')` — that puts the
check in the same place RLS enforces it, which is the whole point.

## Quotes showing "No data"

If the market section renders "No data" for every ticker in production but works
locally, the cause is almost always that **Yahoo rate-limits datacentre IPs** —
which is what every host you'd deploy to has. It works from your laptop and
returns 429 or 403 from Vercel.

`lib/market.ts` now tries four providers per symbol and takes the first answer:
Finnhub (if keyed), two Yahoo edges, then Stooq. The reliable fix is a key:

```
FINNHUB_API_KEY=...    # free tier, 60 calls/min, finnhub.io/register
```

With that set the section stops being a lottery. When every provider fails for
every symbol, the server logs an explicit diagnostic rather than leaving you to
guess.
