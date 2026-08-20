import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loginSchema, fieldErrors } from "@/lib/validate";
import { createChallenge, findPersonByEmail } from "@/lib/auth-store";
import {
  OTP_TTL_MS,
  burnPasswordTime,
  clientIp,
  generateOtp,
  hashOtp,
  newId,
  setChallengeCookie,
} from "@/lib/auth";
import { sendOtpEmail } from "@/lib/email";
import { LIMITS, hit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const GENERIC = "Email or password is incorrect";

export async function POST(req: Request) {
  const ip = clientIp(req.headers);

  const byIp = hit(`login:ip:${ip}`, LIMITS.loginIp);
  if (!byIp.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(byIp.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields", fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;
  const cleanEmail = email.toLowerCase().trim();

  const byEmail = hit(`login:email:${cleanEmail}`, LIMITS.loginEmail);
  if (!byEmail.ok) {
    return NextResponse.json(
      { error: "Too many attempts for this account. Try again later." },
      { status: 429, headers: { "Retry-After": String(byEmail.retryAfter) } },
    );
  }

  // Temporary client – no session is ever persisted
  const tempClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  const { data: signInData, error: signInError } =
    await tempClient.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

  // Supabase checks the password before it reports this, so reaching here still
  // means the credentials were right — the address just isn't confirmed yet.
  const isEmailNotConfirmed =
    signInError?.message?.toLowerCase().includes("email not confirmed") ||
    signInError?.message?.toLowerCase().includes("email_not_confirmed") ||
    (signInError as { code?: string } | null)?.code === "email_not_confirmed";

  // Wrong credentials (not the "email not confirmed" case)
  if (signInError && !isEmailNotConfirmed) {
    await burnPasswordTime();
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  let userId: string | null = signInData?.user?.id ?? null;
  let purpose: "login" | "signup" = "login";

  if (isEmailNotConfirmed) {
    // Direct lookup against profiles. The previous version paged through
    // listUsers({ perPage: 200 }) and would have quietly stopped finding
    // anyone past the first page.
    const person = await findPersonByEmail(cleanEmail);
    if (!person) {
      await burnPasswordTime();
      return NextResponse.json({ error: GENERIC }, { status: 401 });
    }
    userId = person.id;
    purpose = "signup";
  } else if (signInData?.user) {
    purpose = signInData.user.email_confirmed_at ? "login" : "signup";
    await tempClient.auth.signOut();
  } else {
    await burnPasswordTime();
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  if (!userId) {
    await burnPasswordTime();
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  // Create OTP challenge
  const challengeId = newId();
  const code = generateOtp();

  try {
    await createChallenge({
      id: challengeId,
      userId,
      purpose,
      codeHash: hashOtp(code, challengeId),
      expiresAt: Date.now() + OTP_TTL_MS,
    });
  } catch (err) {
    console.error("[login] challenge write failed:", err);
    return NextResponse.json(
      { error: "Could not start verification. Please try again." },
      { status: 500 },
    );
  }

  const sent = await sendOtpEmail(
    cleanEmail,
    code,
    purpose,
    OTP_TTL_MS / 60000,
  );

  if (!sent.ok) {
    return NextResponse.json(
      { error: "We couldn't send your code. Try again in a moment." },
      { status: 502 },
    );
  }

  await setChallengeCookie(challengeId);

  return NextResponse.json({ ok: true, email: cleanEmail });
}
