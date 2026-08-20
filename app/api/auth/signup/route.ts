import { NextResponse } from "next/server";
import { signupSchema, fieldErrors } from "@/lib/validate";
import { createChallenge } from "@/lib/auth-store";
import {
  OTP_TTL_MS,
  clientIp,
  generateOtp,
  hashOtp,
  newId,
  setChallengeCookie,
} from "@/lib/auth";
import { sendOtpEmail } from "@/lib/email";
import { LIMITS, hit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = clientIp(req.headers);

  const rl = hit(`signup:${ip}`, LIMITS.signup);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many sign-up attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields", fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const { firstName, lastName, email, password, state } = parsed.data;
  const cleanEmail = email.toLowerCase().trim();

  const admin = await supabaseAdmin();

  // Create user with email NOT confirmed yet
  const { data, error } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: false, // still needs OTP
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      us_state: state,
    },
  });

  if (error) {
    const isDuplicate =
      error.message?.toLowerCase().includes("already") ||
      error.message?.toLowerCase().includes("registered") ||
      error.status === 422;

    if (isDuplicate) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please sign in." },
        { status: 409 },
      );
    }

    console.error("Supabase createUser error:", error);
    return NextResponse.json(
      { error: "Could not create account. Please try again." },
      { status: 500 },
    );
  }

  if (!data.user) {
    return NextResponse.json(
      { error: "Could not create account. Please try again." },
      { status: 500 },
    );
  }

  const userId = data.user.id;

  // Create OTP challenge
  const challengeId = newId();
  const code = generateOtp();

  // Awaited and guarded: the code goes out by email in the next few lines, so
  // a challenge that failed to persist means an email nobody can act on.
  try {
    await createChallenge({
      id: challengeId,
      userId,
      purpose: "signup",
      codeHash: hashOtp(code, challengeId),
      expiresAt: Date.now() + OTP_TTL_MS,
    });
  } catch (err) {
    console.error("[signup] challenge write failed:", err);
    return NextResponse.json(
      { error: "Could not start verification. Please try again." },
      { status: 500 },
    );
  }

  // Send the OTP email
  const sent = await sendOtpEmail(cleanEmail, code, "signup", OTP_TTL_MS / 60000);
  if (!sent.ok) {
    return NextResponse.json(
      { error: "We couldn't send your code. Try again in a moment." },
      { status: 502 },
    );
  }

  // Set the cookie so /verify page can find the challenge
  await setChallengeCookie(challengeId);

  return NextResponse.json({ ok: true, email: cleanEmail });
}