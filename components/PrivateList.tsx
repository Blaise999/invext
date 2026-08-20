"use client";

import { useState } from "react";
import type { PrivateCo } from "@/lib/data";

export interface ListMark {
  symbol: string;
  price: number;
  effective_at: number;
  basis: string;
  illustrative: boolean;
}

const basisOf = (m: ListMark) => m.basis.toLowerCase();

/**
 * The price cell states the model rather than an absence. A private company
 * doesn't have a quote — it has a dated mark — so "Awaiting first mark" is the
 * accurate empty state, and it reads as a stage in a process rather than a
 * missing feature.
 */
function PriceCell({ mark }: { mark?: ListMark }) {
  if (!mark) {
    return <span className="plist__price mono plist__price--none">Awaiting first mark</span>;
  }
  return (
    <span className={mark.illustrative ? "plist__price mono is-illus" : "plist__price mono"}>
      ${mark.price.toFixed(2)}
      <span className="plist__unit">/unit</span>
    </span>
  );
}

export default function PrivateList({
  cos,
  marks = {},
}: {
  cos: PrivateCo[];
  marks?: Record<string, ListMark | undefined>;
}) {
  const [open, setOpen] = useState<string | null>(cos[0]?.name ?? null);

  return (
    <div className="plist">
      {cos.map((c) => {
        const isOpen = open === c.name;
        return (
          <article className="plist__row" key={c.name}>
            <button
              className="plist__btn"
              onClick={() => setOpen(isOpen ? null : c.name)}
              aria-expanded={isOpen}
            >
              <span className="plist__short mono">{c.short}</span>
              <span className="plist__name">{c.name}</span>
              <span className="plist__what">{c.what}</span>
              <PriceCell mark={marks[c.symbol]} />
              <span className="plist__sign" aria-hidden="true">
                {isOpen ? "\u2212" : "+"}
              </span>
            </button>

            {isOpen && (
              <div className="plist__open">
                <p className="plist__detail">{c.detail}</p>
                {marks[c.symbol] && (
                  <p className="plist__mark mono">
                    Marked {basisOf(marks[c.symbol]!)} ·{" "}
                    {new Date(marks[c.symbol]!.effective_at).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {marks[c.symbol]!.illustrative && " · illustrative"}
                  </p>
                )}
                <dl className="plist__specs">
                  <div>
                    <dt>Founded</dt>
                    <dd>{c.founded}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{c.stage}</dd>
                  </div>
                  <div>
                    <dt>Access route</dt>
                    <dd>{c.route}</dd>
                  </div>
                </dl>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
