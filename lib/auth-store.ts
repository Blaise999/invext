import { supabaseAdmin } from "./supabase/admin";

/**
 * Durable auth state — OTP challenges and sessions — in Postgres.
 *
 * This file exists because lib/db.ts (JSON on local disk) cannot hold auth
 * state on Vercel: the filesystem is read-only apart from /tmp, /tmp is not
 * shared between serverless instances, and instances are recycled constantly.
 * A challenge written during POST /api/auth/signup was routinely gone by the
 * time GET /verify ran on another instance, which is what produced the bounce
 * back to /login.
 *
 * Everything here is async and hits Supabase with the service-role key, so it
 * must only ever be imported from server code.
 *
 * Timestamps cross this boundary as epoch milliseconds, matching what the old
 * store returned, so call sites keep comparing plain numbers.
 */

const ms = (t: string | null | undefined): number =>
  t ? new Date(t).getTime() : 0;

const msOrNull = (t: string | null | undefined): number | null =>
  t ? new Date(t).getTime() : null;

const iso = (n: number) => new Date(n).toISOString();

/* ------------------------------------------------------------------ types */

export interface Challenge {
  id: string;
  user_id: string;
  purpose: "signup" | "login";
  code_hash: string;
  attempts: number;
  sends: number;
  last_sent_at: number;
  expires_at: number;
  consumed_at: number | null;
  created_at: number;
}

export interface Session {
  id: string;
  user_id: string;
  token_hash: string;
  user_agent: string | null;
  ip: string | null;
  expires_at: number;
  created_at: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toChallenge(row: any): Challenge {
  return {
    id: row.id,
    user_id: row.user_id,
    purpose: row.purpose,
    code_hash: row.code_hash,
    attempts: row.attempts ?? 0,
    sends: row.sends ?? 1,
    last_sent_at: ms(row.last_sent_at),
    expires_at: ms(row.expires_at),
    consumed_at: msOrNull(row.consumed_at),
    created_at: ms(row.created_at),
  };
}

function toSession(row: any): Session {
  return {
    id: row.id,
    user_id: row.user_id,
    token_hash: row.token_hash,
    user_agent: row.user_agent ?? null,
    ip: row.ip ?? null,
    expires_at: ms(row.expires_at),
    created_at: ms(row.created_at),
  };
}

/* ------------------------------------------------------------- challenges */

/**
 * Issue a challenge, burning any live one for the same user and purpose first
 * so a resend-then-signup sequence can't leave two valid codes outstanding.
 *
 * Throws on failure rather than returning quietly: a challenge that wasn't
 * written means the emailed code can never be verified, and the caller needs
 * to surface that instead of sending mail into a dead end.
 */
export async function createChallenge(c: {
  id: string;
  userId: string;
  purpose: "signup" | "login";
  codeHash: string;
  expiresAt: number;
}): Promise<void> {
  const db = await supabaseAdmin();

  await db
    .from("auth_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", c.userId)
    .eq("purpose", c.purpose)
    .is("consumed_at", null);

  const { error } = await db.from("auth_challenges").insert({
    id: c.id,
    user_id: c.userId,
    purpose: c.purpose,
    code_hash: c.codeHash,
    expires_at: iso(c.expiresAt),
  });

  if (error) {
    console.error("[auth-store] createChallenge failed", error);
    throw new Error("challenge_write_failed");
  }
}

export async function getChallenge(id: string): Promise<Challenge | null> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("auth_challenges")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[auth-store] getChallenge failed", error);
    return null;
  }
  return data ? toChallenge(data) : null;
}

/** Returns the new attempt count. Atomic — see otp_bump_attempts in 0005. */
export async function bumpAttempts(id: string): Promise<number> {
  const db = await supabaseAdmin();
  const { data, error } = await db.rpc("otp_bump_attempts", { cid: id });
  if (error) {
    console.error("[auth-store] bumpAttempts failed", error);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

/**
 * Compare-and-set. Returns true only for the caller that actually flipped it,
 * so two requests carrying the same correct code can't both open a session.
 */
export async function consumeChallenge(id: string): Promise<boolean> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("auth_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[auth-store] consumeChallenge failed", error);
    return false;
  }
  return Boolean(data);
}

/** New code on the same challenge id: extends expiry, resets the attempt count. */
export async function rotateChallengeCode(
  id: string,
  codeHash: string,
  expiresAt: number,
  sends: number,
): Promise<void> {
  const db = await supabaseAdmin();
  const { error } = await db
    .from("auth_challenges")
    .update({
      code_hash: codeHash,
      expires_at: iso(expiresAt),
      last_sent_at: new Date().toISOString(),
      sends,
      attempts: 0,
    })
    .eq("id", id)
    .is("consumed_at", null);

  if (error) {
    console.error("[auth-store] rotateChallengeCode failed", error);
    throw new Error("challenge_rotate_failed");
  }
}

/* ---------------------------------------------------------------- sessions */

export async function createSession(s: {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: number;
}): Promise<void> {
  const db = await supabaseAdmin();
  const { error } = await db.from("auth_sessions").insert({
    id: s.id,
    user_id: s.userId,
    token_hash: s.tokenHash,
    user_agent: s.userAgent,
    ip: s.ip,
    expires_at: iso(s.expiresAt),
  });

  if (error) {
    console.error("[auth-store] createSession failed", error);
    throw new Error("session_write_failed");
  }
}

export async function findSessionByTokenHash(
  hash: string,
): Promise<Session | null> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("auth_sessions")
    .select("*")
    .eq("token_hash", hash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error("[auth-store] findSessionByTokenHash failed", error);
    return null;
  }
  return data ? toSession(data) : null;
}

export async function deleteSessionByTokenHash(hash: string): Promise<void> {
  const db = await supabaseAdmin();
  const { error } = await db
    .from("auth_sessions")
    .delete()
    .eq("token_hash", hash);
  if (error) console.error("[auth-store] deleteSessionByTokenHash failed", error);
}

export async function sessionsForUser(userId: string): Promise<Session[]> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("auth_sessions")
    .select("*")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[auth-store] sessionsForUser failed", error);
    return [];
  }
  return (data ?? []).map(toSession);
}

/* ------------------------------------------------------------------ people */

export interface AuthPerson {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  state: string;
  is_suspended: boolean;
  suspended_reason: string | null;
  created_at: number;
}

/**
 * Identity by id, from `profiles` (populated by the on_auth_user_created
 * trigger) with a fall back to the Auth admin API for accounts created before
 * that trigger existed, or if the profile insert failed.
 *
 * This replaces findUserById() from the JSON store, which had been left behind
 * by the move to Supabase Auth: signup writes the user to Supabase and nothing
 * to the JSON store, so the lookup returned undefined every time and /verify
 * redirected to /login even on a warm instance.
 */
export async function findPersonById(id: string): Promise<AuthPerson | null> {
  const db = await supabaseAdmin();

  const { data: profile } = await db
    .from("profiles")
    .select(
      "id, email, first_name, last_name, us_state, is_suspended, suspended_reason, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (profile) {
    return {
      id: profile.id,
      email: profile.email,
      first_name: profile.first_name ?? "",
      last_name: profile.last_name ?? "",
      state: profile.us_state ?? "",
      is_suspended: Boolean(profile.is_suspended),
      suspended_reason: profile.suspended_reason ?? null,
      created_at: ms(profile.created_at),
    };
  }

  const { data, error } = await db.auth.admin.getUserById(id);
  const u = data?.user;
  if (error || !u?.email) return null;

  return {
    id: u.id,
    email: u.email,
    first_name: (u.user_metadata?.first_name as string) ?? "",
    last_name: (u.user_metadata?.last_name as string) ?? "",
    state: (u.user_metadata?.us_state as string) ?? "",
    is_suspended: false,
    suspended_reason: null,
    created_at: ms(u.created_at),
  };
}

/**
 * Identity by email. Used by the login route to resolve an unconfirmed
 * account — the old code paged through listUsers({ perPage: 200 }) and would
 * have started silently failing for user 201.
 */export async function findPersonByEmail(
  email: string,
): Promise<AuthPerson | null> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("profiles")
    .select(
      "id, email, first_name, last_name, us_state, is_suspended, suspended_reason, created_at",
    )
    .ilike("email", email.toLowerCase())
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email,
    first_name: data.first_name ?? "",
    last_name: data.last_name ?? "",
    state: data.us_state ?? "",
    is_suspended: Boolean(data.is_suspended),
    suspended_reason: data.suspended_reason ?? null,
    created_at: ms(data.created_at),
  };
}

/** Every account, newest first. Feeds the back-office list. */
export async function allPeople(): Promise<AuthPerson[]> {
  const db = await supabaseAdmin();
  const { data, error } = await db
    .from("profiles")
    .select(
      "id, email, first_name, last_name, us_state, is_suspended, suspended_reason, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[auth-store] allPeople failed", error);
    return [];
  }

  return (data ?? []).map((p: any) => ({
    id: p.id,
    email: p.email,
    first_name: p.first_name ?? "",
    last_name: p.last_name ?? "",
    state: p.us_state ?? "",
    is_suspended: Boolean(p.is_suspended),
    suspended_reason: p.suspended_reason ?? null,
    created_at: ms(p.created_at),
  }));
}
