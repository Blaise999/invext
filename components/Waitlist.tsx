"use client";

import { useState } from "react";

/**
 * Email updates — simple opt-in.
 * Wire the submit handler to your CRM or list endpoint when ready.
 */
export default function Waitlist() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value.includes("@") || !value.includes(".")) {
      setStatus("error");
      return;
    }

    setStatus("sending");

    // Replace with your real endpoint when ready.
    // await fetch("/api/subscribe", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ email: value }),
    // });
    await new Promise((r) => setTimeout(r, 500));

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="wl wl--done">
        <p className="wl__done mono">You’re on the list</p>
        <p className="wl__note">
          Updates will go to <strong>{email.trim().toLowerCase()}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="wl">
      <form className="wl__row" onSubmit={onSubmit} noValidate>
        <input
          className="wl__input"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          placeholder="you@email.com"
          aria-label="Email address"
          disabled={status === "sending"}
        />
        <button
          className="btn btn--solid"
          type="submit"
          disabled={status === "sending"}
        >
          {status === "sending" ? "Sending…" : "Get updates"}
        </button>
      </form>

      <p className="wl__note mono">
        {status === "error"
          ? "Enter a valid email address."
          : "Occasional updates on listings, structure and market events. Unsubscribe anytime."}
      </p>
    </div>
  );
}