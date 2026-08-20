"use client";

import { useId } from "react";

export function Field({
  label, error, hint, children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (p: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby"?: string;
  }) => React.ReactNode;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={error ? "fld fld--err" : "fld"}>
      <label className="fld__label" htmlFor={id}>{label}</label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": error || hint ? msgId : undefined,
      })}
      {(error || hint) && (
        <p className="fld__msg" id={msgId} role={error ? "alert" : undefined}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <div className="formerr" role="alert">{message}</div>;
}
