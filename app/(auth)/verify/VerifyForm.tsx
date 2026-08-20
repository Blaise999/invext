"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import OtpInput from "@/components/auth/OtpInput";
import { FormError } from "@/components/auth/Field";

export default function VerifyForm({
  masked, purpose, expiresAt, devBypass = false,
}: {
  masked: string;
  purpose: "signup" | "login";
  expiresAt: number;
  devBypass?: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [left, setLeft] = useState(() =>
    Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
  );

  useEffect(() => {
    const t = setInterval(() => {
      setLeft((s) => Math.max(0, s - 1));
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const mmss = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;

  async function verify(value?: string) {
    const c = value ?? code;
    if (c.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That code didn't go through. Try again.");
        setCode("");
        if (data.restart) setTimeout(() => router.push("/login"), 1800);
        return;
      }
      router.push(data.redirect ?? "/dashboard");
    } catch {
      setError("No connection. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/resend", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't resend");
        setCooldown(data.retryAfter ?? 60);
        if (data.restart) setTimeout(() => router.push("/login"), 1800);
        return;
      }
      setCooldown(data.cooldown ?? 60);
      setLeft(600);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="mono auth__step">
        Step 2 of 2 · {purpose === "signup" ? "Confirm your email" : "Confirm sign-in"}
      </p>
      <h1 className="auth__h1">Enter your code</h1>
      <p className="auth__lede">
        We sent a six-digit code to <strong>{masked}</strong>.
      </p>

      <p className={left === 0 ? "expiry expiry--out mono" : "expiry mono"}>
        {left === 0 ? (
          "Code expired — send a new one"
        ) : (
          <>
            Expires in <span className="nowrap">{mmss}</span>
          </>
        )}
      </p>

      <div className="form">
        <FormError message={error} />

        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={verify}
          disabled={busy || left === 0}
          invalid={Boolean(error)}
        />

        <button
          className="btn btn--solid btn--wide"
          onClick={() => verify()}
          disabled={busy || code.length !== 6 || left === 0}
        >
          {busy ? "Checking…" : purpose === "signup" ? "Confirm and continue" : "Sign in"}
        </button>

        <div className="verify__foot">
          <button className="linkbtn" onClick={resend} disabled={cooldown > 0 || busy}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Send a new code"}
          </button>
          <span className="mono verify__hint">
            Check spam before requesting another
          </span>
        </div>

        {devBypass && (
          <p className="verify__dev mono">
            Dev bypass active — the code in DEV_OTP_CODE is accepted alongside
            the emailed one. Unset it before this goes anywhere public.
          </p>
        )}

        <p className="verify__warn mono">
          This code is for you alone. No one at InveXt will ever ask for it.
        </p>
      </div>
    </>
  );
}
