import { currentUser } from "./auth";
import { supabaseAdmin } from "./supabase/admin";

/**
 * Admin gate.
 *
 * Checks `public.user_roles` first — the same table RLS enforces against, so a
 * role granted in one place is a role everywhere — and falls back to the
 * ADMIN_EMAILS allowlist for a project that hasn't run the bootstrap yet.
 *
 * Grant a role with tools/create-admin.mjs rather than editing this file.
 */
export async function requireAdmin() {
  const user = await currentUser();
  if (!user) return null;
  if (user.is_suspended) return null;

  try {
    const db = await supabaseAdmin();
    const { data } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (data) return user;
  } catch (err) {
    console.error("[admin] role lookup failed:", err);
  }

  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allow.length > 0 && allow.includes(user.email.toLowerCase())) return user;
  return null;
}

/**
 * Role lookup by id, for the login route — which has verified a password but
 * has no session yet, so requireAdmin() can't be used there.
 */
export async function hasAdminRole(userId: string, email: string): Promise<boolean> {
  try {
    const db = await supabaseAdmin();
    const { data } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (data) return true;
  } catch (err) {
    console.error("[admin] role lookup failed:", err);
  }

  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

/**
 * Whether an operator signs in with a password alone.
 *
 * Off unless ADMIN_SKIP_OTP=1 is set. It's a switch rather than the built-in
 * behaviour because this account approves withdrawals and adjusts balances —
 * with the second factor gone, one leaked password is the whole system, and
 * that shouldn't be the state a deploy lands in by accident. Set it and admin
 * sign-in is password-only, with no email involved anywhere.
 */
export function adminSkipsOtp(): boolean {
  return process.env.ADMIN_SKIP_OTP === "1";
}

/** True when the signed-in account can reach /admin. Used by the shell. */
export async function isAdmin(): Promise<boolean> {
  return (await requireAdmin()) !== null;
}
