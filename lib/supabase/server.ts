import { cookies } from "next/headers";

/**
 * Supabase is OPTIONAL.
 *
 * The packages are imported dynamically, inside the functions, so the module
 * graph doesn't require them at build time. That means the app builds and runs
 * with `@supabase/ssr` absent entirely — which matters because the dashboard,
 * the landing page and demo mode don't need a database, and a static import
 * here would drag one in and fail the build for everyone not using it.
 *
 * Check supabaseConfigured() before calling supabaseServer().
 */

export function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Request-scoped client carrying the user's session, so RLS applies. */
export async function supabaseServer() {
  if (!supabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY, and check supabaseConfigured() first.",
    );
  }

  const { createServerClient } = await import("@supabase/ssr");
  const jar = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => jar.set(name, value, options));
          } catch {
            // Called from a Server Component — middleware refreshes instead.
          }
        },
      },
    },
  );
}
