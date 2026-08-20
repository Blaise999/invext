/**
 * In-process fixed-window limiter.
 *
 * Good enough for a single Node instance. Behind more than one instance or on
 * serverless, swap the Map for Redis/Upstash — the signature stays the same.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
}

export interface Limit {
  limit: number;
  windowMs: number;
}

export const LIMITS = {
  signup: { limit: 5, windowMs: 60 * 60 * 1000 },
  loginIp: { limit: 20, windowMs: 15 * 60 * 1000 },
  loginEmail: { limit: 6, windowMs: 15 * 60 * 1000 },
  verifyIp: { limit: 30, windowMs: 60 * 60 * 1000 },
  resendIp: { limit: 10, windowMs: 60 * 60 * 1000 },
} satisfies Record<string, Limit>;

export function hit(
  key: string,
  { limit, windowMs }: Limit,
): { ok: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  sweep(now);

  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  b.count++;
  const ok = b.count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - b.count),
    retryAfter: ok ? 0 : Math.ceil((b.resetAt - now) / 1000),
  };
}
