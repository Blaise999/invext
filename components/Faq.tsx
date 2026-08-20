"use client";

import { useState } from "react";

export default function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="faq">
      {items.map((f, i) => (
        <div className="faq__item" key={f.q}>
          <button
            className="faq__q"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
          >
            <span className="faq__qt">{f.q}</span>
            <span className="faq__sign" aria-hidden="true">
              {open === i ? "\u2212" : "+"}
            </span>
          </button>
          {open === i && <p className="faq__a">{f.a}</p>}
        </div>
      ))}
    </div>
  );
}
