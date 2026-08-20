#!/usr/bin/env node
/**
 * Create (or promote) a super-admin.
 *
 *   node tools/create-admin.mjs
 *   node tools/create-admin.mjs --email benneth@yourdomain.com --name Benneth
 *
 * Reads from the environment, falling back to flags:
 *   ADMIN_EMAIL       the login address
 *   ADMIN_PASSWORD    the initial password
 *   ADMIN_NAME        display name (default: Benneth)
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * The credentials live in the environment rather than in a source file on
 * purpose. A password committed to the repo is in the clone every contractor
 * ever made, in CI logs, and in the fork someone pushed to GitHub — and it
 * can't be rotated without a deploy. This account can adjust customer
 * balances and approve withdrawals, which makes it the single most valuable
 * credential in the system. Put it in your Vercel project settings, change it
 * after the first sign-in, and don't reuse it anywhere else.
 *
 * Idempotent: run it again to reset the password or re-grant the role.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

/**
 * Load .env.local ourselves.
 *
 * Next.js reads .env.local automatically; plain `node` does not. Running this
 * script with the file sitting right there and getting "Set SUPABASE_URL" is
 * confusing enough that it's worth the twenty lines.
 *
 * Real environment variables win over the file, so CI and `$env:` overrides in
 * PowerShell still work.
 */
function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;

      const eq = line.indexOf("=");
      if (eq === -1) continue;

      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();

      // strip an inline "# comment" that isn't inside quotes
      if (!/^["']/.test(value)) value = value.split(/\s+#/)[0].trim();
      // strip wrapping quotes
      value = value.replace(/^(["'])([\s\S]*)\1$/, "$2");

      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadEnvFiles();

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const email = (arg("--email") ?? process.env.ADMIN_EMAIL ?? "").toLowerCase().trim();
const password = arg("--password") ?? process.env.ADMIN_PASSWORD ?? "";
const name = arg("--name") ?? process.env.ADMIN_NAME ?? "Benneth";
const state = arg("--state") ?? process.env.ADMIN_STATE ?? "DE";

function die(msg) {
  console.error(`\n  ✕ ${msg}\n`);
  process.exit(1);
}

const missing = [];
if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (!email) missing.push("ADMIN_EMAIL");
if (!password) missing.push("ADMIN_PASSWORD");

if (missing.length) {
  die(
    `Missing: ${missing.join(", ")}\n` +
      `    Looked in the environment, then .env.local, then .env,\n` +
      `    relative to ${process.cwd()}\n\n` +
      `    Run this from the project root, or pass values as flags:\n` +
      `      node tools/create-admin.mjs --email you@domain.com --password '...'`,
  );
}

// A value copied straight out of the example still wrapped in <angle brackets>
// would become part of the password, and you'd never be able to sign in.
if (/^<.*>$/.test(password) || /^<.*>$/.test(email)) {
  die(
    "ADMIN_PASSWORD or ADMIN_EMAIL still has the <angle brackets> from the\n" +
      "    example around it. Those are placeholder markers, not part of the value.",
  );
}

if (password.length < 12) {
  die("ADMIN_PASSWORD must be at least 12 characters.");
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const [first, ...rest] = name.split(" ");
const last = rest.join(" ") || "Admin";

/* 1 — create the auth user, or update the existing one --------------------- */

let userId;
const created = await db.auth.admin.createUser({
  email,
  password,
  email_confirm: true, // skip the OTP for the bootstrap account's first sign-in
  user_metadata: { first_name: first, last_name: last, us_state: state },
});

if (created.error) {
  const already = /already|exists|registered/i.test(created.error.message ?? "");
  if (!already) die(`Could not create the account: ${created.error.message}`);

  const { data: profile, error } = await db
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (error || !profile) {
    die("That address exists in auth but has no profile row. Check the trigger in 0001.");
  }

  userId = profile.id;
  const upd = await db.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: { first_name: first, last_name: last, us_state: state },
  });
  if (upd.error) die(`Could not reset the password: ${upd.error.message}`);
  console.log(`  · existing account found — password reset`);
} else {
  userId = created.data.user.id;
  console.log(`  · account created`);
}

/* 2 — grant the admin role ------------------------------------------------- */

const { error: roleErr } = await db
  .from("user_roles")
  .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });

if (roleErr) die(`Account exists but the role grant failed: ${roleErr.message}`);

/* 3 — done ----------------------------------------------------------------- */

console.log(`
  ✓ Super-admin ready

    Name      ${name}
    Email     ${email}
    Sign in   /admin/login
    Role      admin (public.user_roles)

  Change the password after the first sign-in. This account can adjust
  balances and approve withdrawals — every action it takes is written to
  public.app_activity with its email attached, and that log cannot be edited
  or deleted by anyone, including this account.
`);
