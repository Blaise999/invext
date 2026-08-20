"use client";

/**
 * The balance block.
 *
 * Modelled on the reference: a small superscript currency mark, the integer
 * part large and tight, the cents dropped to a dim colour at a smaller size,
 * and thin-space grouping instead of commas so a six-figure number doesn't
 * read as noise. Tabular figures throughout, so the digits don't reflow as the
 * value ticks.
 */

const NBTHIN = "\u2009"; // thin space — narrower than a comma, no baseline clutter

function split(n: number) {
  const fixed = Math.abs(n).toFixed(2);
  const [whole, cents] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBTHIN);
  return { grouped, cents, negative: n < 0 };
}

export default function BalanceHead({
  label,
  value,
  chip,
  cards = [],
}: {
  label: string;
  value: number;
  chip?: string;
  cards?: Array<{ k: string; v: number; hint?: string; href?: string }>;
}) {
  const { grouped, cents, negative } = split(value);

  return (
    <section className="bal">
      <div className="bal__row">
        <span className="bal__label">{label}</span>
        {chip && <span className="bal__chip">{chip}</span>}
      </div>

      <p className="bal__fig num">
        {negative && <span className="bal__neg">−</span>}
        <span className="bal__cur">$</span>
        <span className="bal__int">{grouped}</span>
        <span className="bal__cents">.{cents}</span>
      </p>

      {cards.length > 0 && (
        <div className="bal__cards">
          {cards.map((c) => {
            const s = split(c.v);
            return (
              <div className="bcard" key={c.k}>
                <span className="bcard__k">{c.k}</span>
                <span className="bcard__v num">
                  <span className="bcard__cur">$</span>
                  {s.grouped}
                  <span className="bcard__cents">.{s.cents}</span>
                </span>
                {c.hint && <span className="bcard__h">{c.hint}</span>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
