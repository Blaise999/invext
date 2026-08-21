"use client";

import { useEffect, useState } from "react";
import { PRIVATE_MARK_DISCLAIMER } from "@/lib/preview";

const KEY = "invext-private-mark-dismissed";

export default function PrivateMarkBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY) !== "1") setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="pvbar" role="status">
      <span className="mono pvbar__tag">Private</span>
      <p className="pvbar__copy">{PRIVATE_MARK_DISCLAIMER}</p>
      <button
        type="button"
        className="pvbar__dismiss mono"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}