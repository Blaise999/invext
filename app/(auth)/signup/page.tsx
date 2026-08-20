"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, FormError } from "@/components/auth/Field";
import { US_STATES } from "@/lib/validate";

/**
 * Two steps rather than one wall of fields.
 *
 * The old form asked for name, email, state, password and consent at once,
 * then reported every problem at the end after a round trip. Splitting it puts
 * the low-friction identity fields first and the security decision second, and
 * each step validates locally before it advances — so a typo in the email is
 * caught before the account is created rather than after a code has been sent
 * somewhere unreachable.
 *
 * The server contract is unchanged: one POST to /api/auth/signup with the same
 * body, sent when the second step completes.
 */

type Errors = Record<string, string>;

function strength(pw: string) {
  if (!pw) return { score: 0, label: "" };
  let s = 0;
  if (pw.length >= 12) s++;
  if (pw.length >= 16) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (/\d/.test(pw) && /[A-Za-z]/.test(pw)) s++;
  const labels = ["Too short", "Weak", "Fair", "Strong", "Very strong"];
  return { score: s, label: labels[Math.min(s, 4)] };
}

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    state: "",
    terms: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const set = (k: string, v: string | boolean) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const pw = strength(form.password);

  /** Caught here so a fixable typo never costs a round trip or a wasted code. */
  function checkStepOne(): boolean {
    const e: Errors = {};
    if (form.firstName.trim().length < 1) e.firstName = "Required";
    if (form.lastName.trim().length < 1) e.lastName = "Required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
      e.email = "Check this address — the code goes here";
    }
    if (!form.state) e.state = "Pick your state";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (step === 1) {
      setFormError(null);
      if (checkStepOne()) setStep(2);
      return;
    }

    const local: Errors = {};
    if (form.password.length < 12) local.password = "At least 12 characters";
    if (!form.terms) local.terms = "Required to open an account";
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }

    setBusy(true);
    setFormError(null);
    setErrors({});

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        const fields: Errors = data.fields ?? {};
        setErrors(fields);
        setFormError(data.error ?? "That didn't go through. Try again.");
        // Send them back to whichever step actually holds the problem.
        if (fields.firstName || fields.lastName || fields.email || fields.state) {
          setStep(1);
        }
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
      <div className="steps" aria-hidden="true">
        <span className={step >= 1 ? "steps__b is-on" : "steps__b"} />
        <span className={step >= 2 ? "steps__b is-on" : "steps__b"} />
      </div>

      <p className="mono auth__step">
        Step {step} of 2 · {step === 1 ? "Your details" : "Secure the account"}
      </p>

      {step === 1 ? (
        <>
          <h1 className="auth__h1">Open your account</h1>
          <p className="auth__lede">
            Two short steps. We email a six-digit code to confirm the address
            before anything opens.
          </p>
        </>
      ) : (
        <>
          <h1 className="auth__h1">One password</h1>
          <p className="auth__lede">
            You&rsquo;ll use it with a fresh emailed code every time you sign
            in, so it never works on its own.
          </p>
        </>
      )}

      <form className="form" onSubmit={submit} noValidate>
        <FormError message={formError} />

        {step === 1 ? (
          <>
            <div className="form__row">
              <Field label="Legal first name" error={errors.firstName}>
                {(p) => (
                  <input
                    {...p}
                    className="input"
                    autoComplete="given-name"
                    value={form.firstName}
                    onChange={(e) => set("firstName", e.target.value)}
                  />
                )}
              </Field>
              <Field label="Legal last name" error={errors.lastName}>
                {(p) => (
                  <input
                    {...p}
                    className="input"
                    autoComplete="family-name"
                    value={form.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                  />
                )}
              </Field>
            </div>

            <Field
              label="Email address"
              error={errors.email}
              hint={errors.email ? undefined : "Your verification code goes here"}
            >
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

            <Field
              label="State of residence"
              error={errors.state}
              hint={errors.state ? undefined : "Accounts are open to US residents"}
            >
              {(p) => (
                <select
                  {...p}
                  className="input input--select"
                  autoComplete="address-level1"
                  value={form.state}
                  onChange={(e) => set("state", e.target.value)}
                >
                  <option value="">Select a state</option>
                  {US_STATES.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <button type="submit" className="btn btn--solid btn--wide">
              Continue
            </button>
          </>
        ) : (
          <>
            <div className="recap">
              <span className="mono recap__k">Account</span>
              <span className="recap__v">
                {form.firstName} {form.lastName} · {form.email}
              </span>
              <button
                type="button"
                className="linkbtn recap__edit"
                onClick={() => setStep(1)}
              >
                Change
              </button>
            </div>

            <Field
              label="Password"
              error={errors.password}
              hint={errors.password ? undefined : "12 characters minimum"}
            >
              {(p) => (
                <div className="input__wrap">
                  <input
                    {...p}
                    className="input"
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                  />
                  <button
                    type="button"
                    className="input__toggle mono"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
              )}
            </Field>

            <div className="pwmeter" aria-hidden="true">
              <div className="pwmeter__bars">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={i < pw.score ? `on s${pw.score}` : ""} />
                ))}
              </div>
              <span className="pwmeter__label mono">{pw.label || "Not set"}</span>
            </div>

            <label className="check">
              <input
                type="checkbox"
                checked={form.terms}
                onChange={(e) => set("terms", e.target.checked)}
              />
              <span>
                I&rsquo;m a US resident, I&rsquo;m 18 or older, and I accept the{" "}
                <Link href="/terms">Terms</Link> and{" "}
                <Link href="/privacy">Privacy Policy</Link>.
              </span>
            </label>
            {errors.terms && (
              <p className="fld__msg fld__msg--loud" role="alert">
                {errors.terms}
              </p>
            )}

            <div className="form__pair">
              <button
                type="button"
                className="btn"
                onClick={() => setStep(1)}
                disabled={busy}
              >
                Back
              </button>
              <button className="btn btn--solid" disabled={busy}>
                {busy ? "Sending code…" : "Create account"}
              </button>
            </div>
          </>
        )}

        <p className="form__alt">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </>
  );
}
