"use client";

import { useState } from "react";

/** Deposit addresses are unusable on a phone without this. */
export default function CopyButton({
  value,
  label = "Copy address",
}: {
  value: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);

  return (
    <button
      className={done ? "copy is-done mono" : "copy mono"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          // Older iOS Safari without clipboard permission — select instead.
          const ta = document.createElement("textarea");
          ta.value = value;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
