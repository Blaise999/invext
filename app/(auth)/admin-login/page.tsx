"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, FormError } from "@/components/auth/Field";

/**
 * Staff sign-in.
 *
 * Deliberately a separate screen from /login — different copy, no signup link,
 * no demo entry — but the same backend flow, so an admin still gets the
 * emailed code like everyone else. An admin session can move customer money;
 * it is the last account that should have a weaker sign-in than a customer's.
 *
 * The route is unlisted rather than protected: anyone can open it, and it only
 * grants what the account's role already allows. /admin checks the role again
 * server-side on every request.
 */
export default function AdminLogin() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);

    try {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrors(data.fields ?? {});
        setFormError(data.error ?? "That didn't go through. Try again.");
        return;
      }
      // With ADMIN_SKIP_OTP=1 the API returns a session and sends us straight
      // to the back office; otherwise it's the usual code screen.
      router.push(data.redirect ?? "/admin");
      router.refresh();
    } catch {
      setFormError("No connection. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="mono auth__step">Staff access</p>
      <h1 className="auth__h1">Back office</h1>
      <p className="auth__lede">
        Operator sign-in. Everything you do in here is logged against your
        name, on a record that can&rsquo;t be edited or deleted.
      </p>

      <form className="form" onSubmit={submit} noValidate>
        <FormError message={formError} />

        <Field label="Work email" error={errors.email}>
          {(p) => (
            <input
              {...p}
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          )}
        </Field>

        <Field label="Password" error={errors.password}>
          {(p) => (
            <input
              {...p}
              className="input"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
            />
          )}
        </Field>

        <button className="btn btn--solid btn--wide" disabled={busy}>
          {busy ? "Sending code…" : "Continue"}
        </button>

        <p className="form__alt">
          Not staff? <Link href="/login">Customer sign-in</Link>
        </p>
      </form>
    </>
  );
}
