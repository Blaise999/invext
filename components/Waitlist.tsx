"use client";

import { useState } from "react";

/**
 * Contact capture only. No payment rails, no wallet address, no deposit flow.
 * Wire to your CRM in submit(); nothing is transmitted in this build.
 */
export default function Waitlist() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <div className="wl">
      <form
        className="wl__row"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.includes("@")) setSent(true);
        }}
        noValidate
      >
        <input
          className="wl__input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          aria-label="Email address"
        />
        <button className="btn btn--solid" type="submit">
          Request access
        </button>
      </form>
      <p className="wl__note mono">
        {sent
          ? "Logged. Nothing was sent anywhere — this build has no backend."
          : "We will never ask you to send funds by crypto transfer, Zelle or gift card."}
      </p>
    </div>
  );
}
