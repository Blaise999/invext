"use client";

import { useEffect, useRef } from "react";

/**
 * Six boxes that behave like one field: paste fills all six, backspace walks
 * left, arrows navigate. autoComplete="one-time-code" lets iOS and Android
 * offer the code straight from the SMS/mail notification.
 */
export default function OtpInput({
  value, onChange, onComplete, disabled, invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const cells = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const write = (i: number, ch: string) => {
    const arr = [...cells];
    arr[i] = ch;
    const next = arr.join("").replace(/\s/g, "");
    onChange(next);
    if (ch && i < 5) refs.current[i + 1]?.focus();
    if (next.length === 6) onComplete?.(next);
  };

  return (
    <div className={invalid ? "otp otp--err" : "otp"}>
      {cells.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="otp__box"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of 6`}
          aria-invalid={invalid}
          value={d}
          onChange={(e) => write(i, e.target.value.replace(/\D/g, "").slice(-1))}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !cells[i] && i > 0) {
              e.preventDefault();
              refs.current[i - 1]?.focus();
              write(i - 1, "");
            }
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (!p) return;
            onChange(p);
            refs.current[Math.min(p.length, 5)]?.focus();
            if (p.length === 6) onComplete?.(p);
          }}
        />
      ))}
    </div>
  );
}
