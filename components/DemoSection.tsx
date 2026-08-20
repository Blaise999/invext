import DemoEntry from "@/components/auth/DemoEntry";

/**
 * The demo pitch on the landing page.
 *
 * It lists what you'll actually see rather than adjectives about it, because
 * "powerful dashboard" tells a reader nothing and "your realised and
 * unrealised P/L, kept apart" tells them whether this is for them.
 */
const SHOWS: [string, string][] = [
  ["Portfolio", "Live quotes across forty listed names, held against real cost basis."],
  ["P/L", "Realised and unrealised kept apart, with total return over what was paid in."],
  ["Private vehicles", "Neuralink and The Boring Company, priced at dated valuation marks."],
  ["Order ticket", "Buy in dollars or shares, with a review step before anything is placed."],
  ["Transfers", "Deposits that stay pending until they land; withdrawals that hold funds on request."],
  ["Alerts & activity", "Every fill, transfer and mark, logged and notified."],
];

export default function DemoSection() {
  return (
    <section className="sec sec--alt" id="demo">
      <div className="sec__head">
        <p className="mono eyebrow">The product</p>
        <h2 className="h2">
          Open the dashboard <em>right now</em>
        </h2>
        <p className="sec__lede">
          No account, no card, no code. It loads a fictional portfolio so you can
          use the thing rather than read about it — and it says so on every
          screen, permanently, because a demo balance that looks like a real one
          is how people get hurt.
        </p>
      </div>

      <div className="dgrid">
        {SHOWS.map(([k, v]) => (
          <div className="dgrid__i" key={k}>
            <span className="mono dgrid__k">{k}</span>
            <p className="dgrid__v">{v}</p>
          </div>
        ))}
      </div>

      <div className="dcta">
        {/* DemoEntry takes no props — its label lives in the component. If you
            want it configurable, add `label?: string` there rather than passing
            one in from here. */}
        <DemoEntry />
      </div>
    </section>
  );
}
