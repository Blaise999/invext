import {
  randomBytes,
  randomInt,
  scrypt as _scrypt,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import {
  createSession,
  deleteSessionByTokenHash,
  findSessionByTokenHash,
  findPersonById,
} from "./auth-store";

const scrypt = promisify(_scrypt) as (
  pw: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = "invext_session";
export const CHALLENGE_COOKIE = "invext_challenge";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS = 4;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "AUTH_SECRET missing or too short. Generate one with: openssl rand -hex 32",
    );
  }
  return s;
}

/* ---------------- passwords ---------------- */

/** scrypt with a per-user random salt. Format: scrypt$N$salt$key (hex). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64);
  return `scrypt$1$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const [scheme, , saltHex, keyHex] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const key = await scrypt(
      password.normalize("NFKC"),
      Buffer.from(saltHex, "hex"),
      64,
    );
    const expected = Buffer.from(keyHex, "hex");
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/**
 * Constant-ish work even when the email doesn't exist, so response timing
 * doesn't reveal which addresses are registered.
 */
export async function burnPasswordTime() {
  await scrypt("decoy", randomBytes(16), 64);
}

/* ---------------- OTP ---------------- */

/** 6 digits, uniformly random. randomInt is rejection-sampled, unlike % 1000000. */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Codes are never stored in plaintext. HMAC keyed with AUTH_SECRET. */
export function hashOtp(code: string, challengeId: string): string {
  return createHmac("sha256", secret())
    .update(`${challengeId}:${code}`)
    .digest("hex");
}

export function otpMatches(
  code: string,
  challengeId: string,
  storedHash: string,
): boolean {
  const a = Buffer.from(hashOtp(code, challengeId), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const newId = () => randomBytes(16).toString("hex");

/* ---------------- dev OTP bypass ---------------- */

export function devOtpCode(): string | null {
  const code = process.env.DEV_OTP_CODE?.trim();
  if (!code || !/^\d{6}$/.test(code)) return null;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_OTP_IN_PROD !== "1") {
    return null;
  }
  return code;
}

export const devOtpEnabled = () => devOtpCode() !== null;

/** Timing-safe so the bypass does not become an oracle for the real code. */
export function isDevOtp(input: string): boolean {
  const code = devOtpCode();
  if (!code) return false;
  const a = Buffer.from(input.padEnd(6, "\0").slice(0, 6));
  const b = Buffer.from(code.padEnd(6, "\0").slice(0, 6));
  return timingSafeEqual(a, b);
}

/* ---------------- sessions ---------------- */

const sha256 = (v: string) =>
  createHmac("sha256", secret()).update(v).digest("hex");

export async function startSession(
  userId: string,
  meta: { userAgent: string | null; ip: string | null },
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_MS;

  // Awaited, and allowed to throw: if the row didn't land there is no session,
  // and handing the browser a cookie that resolves to nothing sends the user
  // to a dashboard that immediately bounces them back to /login.
  await createSession({
    id: newId(),
    userId,
    tokenHash: sha256(token),
    userAgent: meta.userAgent?.slice(0, 250) ?? null,
    ip: meta.ip,
    expiresAt,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function currentUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const session = await findSessionByTokenHash(sha256(token));
    if (!session) return null;

    // A session only exists after a verified OTP, so email_verified is implied
    // by holding one — no second round trip to the Auth admin API for it.
    const person = await findPersonById(session.user_id);
    if (!person) return null;

    return {
      id: person.id,
      email: person.email,
      first_name: person.first_name,
      last_name: person.last_name,
      state: person.state,
      email_verified: 1,
      is_admin: 0,
      is_suspended: person.is_suspended ? 1 : 0,
      suspended_reason: person.suspended_reason,
      created_at: person.created_at,
      last_login_at: null,
    };
  } catch (err) {
    console.error("currentUser error:", err);
    return null;
  }
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSessionByTokenHash(sha256(token));
  jar.delete(SESSION_COOKIE);
}

/* ---------------- challenge cookie ---------------- */

export async function setChallengeCookie(id: string) {
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + OTP_TTL_MS * 2),
  });
}

export async function getChallengeCookie() {
  return (await cookies()).get(CHALLENGE_COOKIE)?.value ?? null;
}

export async function clearChallengeCookie() {
  (await cookies()).delete(CHALLENGE_COOKIE);
}

/* ---------------- misc ---------------- */

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
}