import Link from "next/link";

/**
 * A short tour, shown only in demo mode.
 *
 * It points at the four things worth actually clicking, because an unfamiliar
 * dashboard full of numbers gives a first-time visitor nowhere obvious to
 * start, and they leave having seen a screenshot rather than used a product.
 *
 * Each item says what you'll be able to do there, not what the screen is
 * called. "See the mark history" beats "Private vehicles".
 */
const STOPS = [
  {
    href: "/dashboard/stock/spcx",
    k: "Trade a listed name",
    v: "Live quote, scrubbable chart, and an order ticket that takes dollars or shares.",
  },
  {
    href: "/dashboard/stock/nlnk",
    k: "See a private vehicle",
    v: "Neuralink, priced at dated valuation marks. The chart steps rather than curves — that's the point.",
  },
  {
    href: "/dashboard/transfer",
    k: "Move money",
    v: "Deposits stay pending until they land. Withdrawals hold the funds the moment they're filed.",
  },
  {
    href: "/dashboard/activity",
    k: "Read the ledger",
    v: "Every fill with its realised P/L, every transfer with its state.",
  },
];

export default function DemoTour() {
  return (
    <section className="tour">
      <header className="tour__top">
        <p className="mono tour__k">Start here</p>
        <p className="tour__lede">
          You&rsquo;re in a fictional account with a mixed portfolio. Everything
          works except the parts that would move real money.
        </p>
      </header>

      <ol className="tour__list">
        {STOPS.map((s, i) => (
          <li key={s.href}>
            <Link href={s.href} prefetch className="tour__i">
              <span className="mono tour__n">{String(i + 1).padStart(2, "0")}</span>
              <span className="tour__b">
                <span className="tour__t">{s.k}</span>
                <span className="tour__d">{s.v}</span>
              </span>
              <span className="tour__go mono" aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
