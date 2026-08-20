"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, FormError } from "@/components/auth/Field";
import DemoEntry from "@/components/auth/DemoEntry";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    setErrors({});
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(data.fields ?? {});
        setFormError(data.error ?? "Something went wrong");
        return;
      }
      router.push("/verify");
    } catch {
      setFormError("No connection. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="mono auth__step">Step 1 of 2 · Sign in</p>
      <h1 className="auth__h1">Welcome back</h1>
      <p className="auth__lede">
        Your password, then a fresh six-digit code by email. Both, every time.
      </p>

      <form className="form" onSubmit={submit} noValidate>
        <FormError message={formError} />

        <Field label="Email address" error={errors.email}>
          {(p) => (
            <input
              {...p}
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@email.com"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          )}
        </Field>

        <Field label="Password" error={errors.password}>
          {(p) => (
            <div className="input__wrap">
              <input
                {...p}
                className="input"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
              />
              <button
                type="button"
                className="input__toggle mono"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          )}
        </Field>

        <button className="btn btn--solid btn--wide" disabled={busy}>
          {busy ? "Sending code…" : "Continue"}
        </button>

        <p className="form__hint mono">
          Next: we email a code to that address.
        </p>

        <p className="form__alt">
          New here? <Link href="/signup">Open an account</Link>
        </p>
      </form>

      <DemoEntry />
    </>
  );
}
