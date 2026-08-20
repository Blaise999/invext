import { NextResponse } from "next/server";
import { getChallenge, findPersonById, rotateChallengeCode } from "@/lib/auth-store";
import {
  OTP_MAX_SENDS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS, clearChallengeCookie,
  clientIp, generateOtp, getChallengeCookie, hashOtp,
} from "@/lib/auth";
import { sendOtpEmail } from "@/lib/email";
import { LIMITS, hit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = clientIp(req.headers);

  const rl = hit(`resend:${ip}`, LIMITS.resendIp);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const challengeId = await getChallengeCookie();
  const challenge = challengeId ? await getChallenge(challengeId) : null;

  if (!challenge || challenge.consumed_at) {
    await clearChallengeCookie();
    return NextResponse.json(
      { error: "This verification has expired. Start again.", restart: true },
      { status: 400 },
    );
  }

  const since = Date.now() - challenge.last_sent_at;
  if (since < OTP_RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - since) / 1000);
    return NextResponse.json(
      { error: `Wait ${wait}s before requesting another code.`, retryAfter: wait },
      { status: 429 },
    );
  }

  if (challenge.sends >= OTP_MAX_SENDS) {
    return NextResponse.json(
      { error: "Code limit reached. Start again.", restart: true },
      { status: 429 },
    );
  }

  // Identity comes from Supabase now — the JSON store has no users in it.
  const person = await findPersonById(challenge.user_id);
  if (!person) {
    return NextResponse.json({ error: "Account not found", restart: true }, { status: 400 });
  }

  const code = generateOtp();
  try {
    await rotateChallengeCode(
      challenge.id,
      hashOtp(code, challenge.id),
      Date.now() + OTP_TTL_MS,
      challenge.sends + 1,
    );
  } catch (err) {
    console.error("[resend] rotate failed:", err);
    return NextResponse.json(
      { error: "We couldn't send your code. Try again in a moment." },
      { status: 500 },
    );
  }

  const sent = await sendOtpEmail(
    person.email, code, challenge.purpose, OTP_TTL_MS / 60000,
  );
  if (!sent.ok) {
    return NextResponse.json(
      { error: "We couldn't send your code. Try again in a moment." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, cooldown: OTP_RESEND_COOLDOWN_MS / 1000 });
}
