"use client";

/**
 * Browser client, dynamically imported so `@supabase/ssr` isn't a build-time
 * requirement. Used by the realtime notification bell and activity feed, which
 * only run once a database is connected.
 */
export async function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const { createBrowserClient } = await import("@supabase/ssr");
  return createBrowserClient(url, key);
}
