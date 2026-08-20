import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { clientIp, burnPasswordTime, startSession } from "@/lib/auth";
import { hasAdminRole } from "@/lib/admin";
import { findPersonByEmail } from "@/lib/auth-store";
import { logActivity } from "@/lib/ledger";
import { LIMITS, hit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Staff sign-in. Password only — no code, no email, nothing to configure.
 *
 * Separate from /api/auth/login on purpose. That route serves customers and
 * always sends a code; this one never does. Keeping them apart means the
 * customer path can't be weakened by a flag meant for the back office, and
 * this route's rules are readable in one file instead of being a branch
 * halfway down someone else's.
 *
 * What it still enforces:
 *   · both rate limiters, before anything else — this is the one account worth
 *     brute-forcing, so it gets the same ceiling as everyone
 *   · the password, checked by Supabase
 *   · the admin role, checked after the password and before any session exists
 *   · suspension
 *
 * A non-admin who finds this URL and types a correct password gets 403 and no
 * session. The route grants nothing the account doesn't already hold.
 *
 * An unconfirmed email is NOT a blocker here. Supabase verifies the password
 * before it reports "email not confirmed", so reaching that branch already
 * means the credentials were right — and an operator shouldn't be locked out
 * of the back office because outbound mail isn't wired up yet. That is exactly
 * the situation this route exists for.
 */

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

const GENERIC = "Email or password is incorrect";

export async function POST(req: Request) {
  const ip = clientIp(req.headers);

  const byIp = hit(`admin:ip:${ip}`, LIMITS.loginIp);
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

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields" },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  const { password } = parsed.data;

  const byEmail = hit(`admin:email:${email}`, LIMITS.loginEmail);
  if (!byEmail.ok) {
    return NextResponse.json(
      { error: "Too many attempts for this account. Try again later." },
      { status: 429, headers: { "Retry-After": String(byEmail.retryAfter) } },
    );
  }

  /* ---- 1. the password ---------------------------------------------- */

  const temp = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );

  const { data, error } = await temp.auth.signInWithPassword({ email, password });

  const unconfirmed =
    error?.message?.toLowerCase().includes("email not confirmed") ||
    error?.message?.toLowerCase().includes("email_not_confirmed") ||
    (error as { code?: string } | null)?.code === "email_not_confirmed";

  if (error && !unconfirmed) {
    await burnPasswordTime();
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  let userId = data?.user?.id ?? null;

  if (unconfirmed) {
    const person = await findPersonByEmail(email);
    if (!person) {
      await burnPasswordTime();
      return NextResponse.json({ error: GENERIC }, { status: 401 });
    }
    userId = person.id;
  } else if (data?.user) {
    await temp.auth.signOut();
  }

  if (!userId) {
    await burnPasswordTime();
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  /* ---- 2. the role --------------------------------------------------- */

  if (!(await hasAdminRole(userId, email))) {
    await burnPasswordTime();
    // Same message as a wrong password: whether an address is staff isn't
    // something an unauthenticated caller should be able to probe for.
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  const person = await findPersonByEmail(email);
  if (person?.is_suspended) {
    return NextResponse.json(
      { error: "This account is suspended." },
      { status: 403 },
    );
  }

  /* ---- 3. session ---------------------------------------------------- */

  try {
    await startSession(userId, {
      userAgent: req.headers.get("user-agent"),
      ip,
    });
  } catch (err) {
    console.error("[admin-login] session failed:", err);
    return NextResponse.json(
      { error: "Could not start your session. Try again." },
      { status: 500 },
    );
  }

  // Every operator sign-in lands in the audit log, which nothing can edit or
  // delete. Without a code in the flow, this is the only record of who was in.
  await logActivity({
    userId,
    actor: `admin:${email}`,
    action: "admin.signin",
    entity: "session",
    detail: { ip, ua: req.headers.get("user-agent") ?? null },
  });

  return NextResponse.json({ ok: true, redirect: "/admin" });
}
