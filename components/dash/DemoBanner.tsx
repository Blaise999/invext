"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Undismissable by design. The whole risk of a demo mode is someone seeing a
 * balance and believing it, so the label is not optional and not collapsible.
 */
export default function DemoBanner({ explicit = true }: { explicit?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="demo" role="status">
      <div className="demo__in">
        <span className="mono demo__tag">Demo data</span>
        <p className="demo__txt">
          Fictional account. These holdings and balances are sample figures —
          nothing here was deposited and nothing can be withdrawn. Live market
          prices are real; the position sizes are not.
        </p>
        <button
          className="demo__exit mono"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            if (explicit) await fetch("/api/demo", { method: "DELETE" });
            router.push("/login");
            router.refresh();
          }}
        >
          {busy ? "…" : explicit ? "Exit demo" : "Sign in"}
        </button>
      </div>
    </div>
  );
}
