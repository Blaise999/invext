import { NextResponse } from "next/server";
import { verifySchema, fieldErrors } from "@/lib/validate";
import {
  bumpAttempts,
  consumeChallenge,
  getChallenge,
} from "@/lib/auth-store";
import {
  OTP_MAX_ATTEMPTS,
  clearChallengeCookie,
  clientIp,
  getChallengeCookie,
  otpMatches,
  startSession,
  isDevOtp,
} from "@/lib/auth";
import { sendWelcomeEmail } from "@/lib/email";
import { LIMITS, hit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BAD = "That code isn't right or has expired";

export async function POST(req: Request) {
  const ip = clientIp(req.headers);

  const rl = hit(`verify:${ip}`, LIMITS.verifyIp);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const challengeId = await getChallengeCookie();
  if (!challengeId) {
    return NextResponse.json(
      { error: "This verification has expired. Start again.", restart: true },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter the 6-digit code", fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const challenge = await getChallenge(challengeId);
  if (!challenge || challenge.consumed_at || challenge.expires_at < Date.now()) {
    await clearChallengeCookie();
    return NextResponse.json(
      { error: "This code has expired. Start again.", restart: true },
      { status: 400 },
    );
  }

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await consumeChallenge(challenge.id);
    await clearChallengeCookie();
    return NextResponse.json(
      { error: "Too many incorrect codes. Start again.", restart: true },
      { status: 429 },
    );
  }

  // Dev bypass
  const bypassed = isDevOtp(parsed.data.code);
  if (bypassed) {
    console.warn("[auth] DEV OTP BYPASS USED");
  }

  if (!bypassed && !otpMatches(parsed.data.code, challenge.id, challenge.code_hash)) {
    const attempts = await bumpAttempts(challenge.id);
    const left = Math.max(0, OTP_MAX_ATTEMPTS - attempts);
    return NextResponse.json(
      {
        error: left > 0 ? `${BAD}. ${left} attempt${left === 1 ? "" : "s"} left.` : BAD,
        fields: { code: "Incorrect code" },
      },
      { status: 401 },
    );
  }

  // Correct code → burn the challenge. This is a compare-and-set, so if two
  // requests arrive with the same code only one of them gets a session.
  const won = await consumeChallenge(challenge.id);
  if (!won) {
    await clearChallengeCookie();
    return NextResponse.json(
      { error: "This code has already been used. Start again.", restart: true },
      { status: 400 },
    );
  }
  await clearChallengeCookie();

  const admin = await supabaseAdmin();

  // Get the user from Supabase
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(
    challenge.user_id,
  );

  if (userError || !userData.user) {
    return NextResponse.json(
      { error: "Account not found", restart: true },
      { status: 400 },
    );
  }

  const user = userData.user;
  const isFirstVerification = challenge.purpose === "signup" && !user.email_confirmed_at;

  // Confirm the email in Supabase if this is the first time
  if (isFirstVerification) {
    const { error: confirmError } = await admin.auth.admin.updateUserById(user.id, {
      email_confirm: true,
    });

    if (confirmError) {
      console.error("Failed to confirm email:", confirmError);
      return NextResponse.json(
        { error: "Could not verify account. Please try again." },
        { status: 500 },
      );
    }
  }

  // Session row goes to Postgres, so the next request — on any instance —
  // can still find it.
  try {
    await startSession(user.id, {
      userAgent: req.headers.get("user-agent"),
      ip,
    });
  } catch (err) {
    console.error("[auth] could not open session:", err);
    return NextResponse.json(
      { error: "Could not start your session. Please sign in again." },
      { status: 500 },
    );
  }

  // Send welcome email only on first verification
  if (isFirstVerification) {
    const appUrl = process.env.APP_URL || new URL(req.url).origin;
    void sendWelcomeEmail(
      user.email!,
      user.user_metadata?.first_name || "there",
      appUrl,
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true, redirect: "/dashboard" });
}
