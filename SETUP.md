# Auth setup — 3 minutes

## 1. Environment

```bash
cp .env.example .env.local
openssl rand -hex 32        # paste into AUTH_SECRET
```

Then add your Resend key and a **verified sender domain**:

```
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM="InveXt <security@yourdomain.com>"
```

The From domain must be verified at resend.com/domains. If it isn't, the API
returns success and the mail never arrives — the most common way this silently
breaks.

## 2. Run

```bash
npm install
npm run dev
```

**Without `RESEND_API_KEY` the whole flow still works** — codes print to the
server console instead of sending, so you can test locally without burning
sends. You'll see:

```
[email:otp-signup] RESEND_API_KEY not set — not sending.
  to: you@email.com
  561735
```

## 3. Flow

```
/signup   name, email, password, US state
             │  POST /api/auth/signup  → user created (unverified), code emailed
             ▼
/verify    6-digit code
             │  POST /api/auth/verify  → marks verified, opens session,
             ▼                            fires the welcome email
/dashboard

/login    email + password
             │  POST /api/auth/login   → password checked, then code emailed
             ▼
/verify   → /dashboard
```

OTP is required on **both** signup and login. A password alone never opens a
session.

## What's enforced

| Area | Implementation |
|---|---|
| Password storage | scrypt, 64-byte key, per-user random salt, via `node:crypto` |
| Dependencies | `next`, `react`, `zod`, `resend`. No native modules, so `npm install` can't fail on a missing compiler |
| Password policy | 12 character minimum, common-password blocklist, no composition rules (NIST SP 800-63B dropped them — they push people toward `P@ssw0rd!`) |
| OTP storage | Never plaintext. HMAC-SHA256 keyed with `AUTH_SECRET` and scoped to the challenge id |
| OTP generation | `crypto.randomInt` — rejection-sampled, not `% 1000000`, which biases the low digits |
| OTP lifetime | 10 minutes, single use, burned the moment it succeeds |
| Wrong codes | 5 attempts, then the challenge dies and the user restarts |
| Resend | 60s cooldown, 4 sends maximum per challenge |
| Enumeration | Signing up with an existing verified email returns the *success* shape and sends nothing. Login returns one message for both wrong-password and unknown-email, and burns equivalent scrypt time on unknown addresses so response timing doesn't leak either |
| Sessions | 32-byte opaque token, HMAC-hashed at rest, HttpOnly + SameSite=Lax + Secure in production, 7 day expiry |
| Challenge id | HttpOnly cookie, never in the URL — can't leak through Referer, browser history or a shared link |
| Comparisons | `timingSafeEqual` for both passwords and codes |
| Rate limits | Per-IP and per-email, fixed window |

Verified end to end before shipping: wrong codes decrement and lock out at five,
a used code cannot be replayed, an existing verified email triggers no second
email, resend refuses inside the cooldown, and wrong-password and unknown-email
return byte-identical responses.

## The emails

Two templates in `lib/email.ts`, both table-based with inline styles and plain
text alternates — that's what survives Outlook and avoids Gmail clipping.

- **OTP** — large spaced code, expiry stated, plus a line saying staff will
  never ask for the code by phone or reply.
- **Welcome** — fires once, on first successful verification. Explains which
  companies actually trade and which don't, that quotes are delayed, and that
  InveXt will never ask for funds by crypto, Zelle or gift card. Sent
  fire-and-forget so a mail failure can't roll back a successful signup.

## Before production

1. **Swap the store for Postgres.** `lib/db.ts` holds everything in memory and
   flushes to one JSON file. Every query is a named export, so it's a
   single-file change. It is single-process by design and needs a persistent
   disk — on Vercel or Lambda it loses data between invocations.
2. **Swap the rate limiter for Redis.** `lib/rate-limit.ts` uses an in-process
   Map: it resets on deploy and doesn't coordinate across instances.
3. **Add a cron** calling `purgeExpired()` from `lib/db.ts`.
4. **Add Turnstile or hCaptcha** on signup. Rate limiting alone won't stop a
   distributed signup flood.
5. Write real `/terms` and `/privacy` pages — the signup checkbox links to both.
6. `middleware.ts` only checks that a session cookie *exists*. That's a cheap
   redirect, not the authorisation boundary — `/dashboard` revalidates
   server-side on every render. Keep it that way; middleware runs on the edge
   runtime and cannot open the database.

## Files

```
app/(auth)/layout.tsx           split auth shell
app/(auth)/signup/page.tsx      name, email, password, US state, terms
app/(auth)/login/page.tsx       email + password
app/(auth)/verify/page.tsx      server: reads challenge cookie, masks the email
app/(auth)/verify/VerifyForm.tsx  client: OTP entry, countdown, resend
app/dashboard/page.tsx          session-gated
app/api/auth/{signup,login,verify,resend,logout}/route.ts
lib/auth.ts                     hashing, OTP, sessions, cookies
lib/db.ts                       store — users, challenges, sessions, positions, transactions
lib/market.ts                   live quotes + 30d series, Yahoo then Stooq
lib/email.ts                    Resend client, OTP + welcome templates
lib/rate-limit.ts               fixed-window limiter
lib/validate.ts                 zod schemas, US states
components/auth/                Field, OtpInput, LogoutButton
middleware.ts                   cookie-presence redirects only
```

## Why there's no SQLite any more

The first cut used `better-sqlite3`. It's a native C++ addon: it needs node-gyp,
Python and a working compiler, and when that build fails **npm aborts the entire
install** — leaving unrelated packages missing. That is what produced
`Module not found: Can't resolve 'zod'`. Zod was fine; it just never got
installed, because a different package's postinstall blew up first.

`lib/db.ts` is now plain Node — in memory with an atomic JSON flush (temp file
plus rename, so a crash mid-write can't corrupt it). Same exported API, no
compiler, installs anywhere. Verified: users and sessions survive a full server
restart.

If a partial install bites you again on any project, the tell is that the
missing module is one you never touched. Run `npm install` on its own and read
the *first* error, not the last.

## Market data

`lib/market.ts`. Two providers, tried in order, neither needing a key:

1. **Yahoo Finance chart endpoint** — current price, previous close, day range
   and a 30-day daily series in a single call per symbol. That one call feeds
   both the quote and the sparkline.
2. **Stooq CSV** — end of day only, no series. Fills anything Yahoo misses.

If both fail, `price` comes back `null` and the UI renders an em dash. Nothing
in the codebase invents a number.

Yahoo's endpoint is undocumented. It has been stable for years and is fine for
display, but it rate-limits hard from datacentre IPs and carries no uptime
guarantee. If this page starts mattering to anyone, licence a real feed —
Polygon, Finnhub, Alpaca, Tiingo — and replace `fetchYahoo`. Nothing outside
that function knows where quotes come from.
