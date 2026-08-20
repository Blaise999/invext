# Dev OTP bypass

Sign in without working email delivery.

## Turn it on

`.env.local`:

```
DEV_OTP_CODE=123456
```

Then `123456` is accepted at the verify step. The real emailed code still works
alongside it — this adds an accepted value, it doesn't replace the mechanism.

## Turn it off

Delete the variable. There is no default, so if `DEV_OTP_CODE` is absent the
bypass does not exist.

## Guardrails

1. **No default.** Unset means off. It cannot ship on by accident.
2. **Refuses in production.** With `NODE_ENV=production` the bypass is inert
   unless you also set `ALLOW_DEV_OTP_IN_PROD=1`. Verified: `next start` with
   only `DEV_OTP_CODE` set rejects `123456` outright.
3. **Logs every use** — `[auth] DEV OTP BYPASS USED` on the server.
4. **Visible in the UI.** The verify screen shows a dashed amber notice
   whenever the bypass is live, so it is never quietly on.
5. **Must be 6 digits**, or it is ignored.

Everything else is untouched: rate limits, the 5-attempt lockout, single use,
10-minute expiry. This only substitutes for knowing the emailed digits.

Comparison is `timingSafeEqual`, so the bypass can't be used to time-probe the
real code.

## Verified

| Case | Result |
|---|---|
| Wrong code `999999` | Rejected, attempts decremented |
| Bypass `123456` on signup | Session opened |
| Bypass on login | Session opened |
| Real emailed code | Still works |
| Production without override | **Rejected** |

## Files

```
lib/auth.ts                        devOtpCode / devOtpEnabled / isDevOtp
app/api/auth/verify/route.ts       accepts it, logs the warning
app/(auth)/verify/page.tsx         passes the flag through
app/(auth)/verify/VerifyForm.tsx   renders the notice
.env.example                       documents both variables
```

Delete `DEV_OTP_CODE` the moment Resend is verified.
