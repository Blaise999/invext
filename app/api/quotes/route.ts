import { NextResponse } from "next/server";
import { getQuote, getQuotes } from "@/lib/market";
import { hit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only quote endpoint.
 *
 *   GET /api/quotes           → all seven listings
 *   GET /api/quotes?symbol=X  → one
 *
 * Exists so the client can poll for a fresh price without re-rendering a whole
 * server route — a stock page left open for ten minutes shouldn't show a
 * ten-minute-old number. Cached for 30s at the edge and rate-limited per IP,
 * because this proxies an upstream that will happily rate-limit *us* if it's
 * hammered.
 *
 * Deliberately unauthenticated: it exposes public market data and nothing
 * about any account. Do not add account data to it — put that behind a route
 * that checks a session.
 */
export async function GET(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon";

  const gate = hit(`quotes:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!gate.ok) {
    return NextResponse.json(
      { error: "rate_limited", retry_after: gate.retryAfter },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const symbol = new URL(req.url).searchParams.get("symbol");

  try {
    const data = symbol ? await getQuote(symbol) : await getQuotes();
    if (!data) {
      return NextResponse.json({ error: "unknown_symbol" }, { status: 404 });
    }
    return NextResponse.json(
      { data, as_of: Date.now() },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
    );
  } catch (e) {
    // Upstream failure is not our failure to report as a 500 lie — say so.
    return NextResponse.json(
      { error: "provider_unavailable", detail: (e as Error).message },
      { status: 503 },
    );
  }
}
