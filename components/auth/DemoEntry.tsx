"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DemoEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="dentry">
      <p className="mono dentry__k">Preview with sample data</p>
      <form
        className="dentry__row"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          const res = await fetch("/api/demo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          });
          const data = await res.json();
          if (!res.ok) {
            setErr(data.error ?? "Failed");
            setBusy(false);
            return;
          }
          router.push(data.redirect);
          router.refresh();
        }}
      >
        <input
          className="input dentry__input"
          placeholder="Access code"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Demo access code"
        />
        <button className="btn" disabled={busy || !code}>
          {busy ? "…" : "View"}
        </button>
      </form>
      {err && <p className="fld__msg fld__msg--loud">{err}</p>}
      <p className="dentry__hint mono">
        Loads a fictional account so you can see the dashboard populated. No
        sign-up required.
      </p>
    </div>
  );
}
