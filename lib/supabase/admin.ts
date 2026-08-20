/**
 * Service-role client. BYPASSES RLS — never import into anything that runs in
 * the browser.
 *
 * Dynamically imported like the others so `@supabase/supabase-js` is not a
 * build-time requirement.
 *
 * Note what it still cannot do: ledger_entries has BEFORE UPDATE and BEFORE
 * DELETE triggers that raise unconditionally, so even this key can append but
 * never rewrite financial history.
 */
export async function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin client needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function supabaseAdminConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
