/**
 * PRIVATE MARKET — how it trades, and why the price works differently.
 *
 * Both sides of this platform are tradeable. They are not tradeable the same
 * way. The difference is the point of early access: a private unit can change
 * hands under treaty before any continuous market exists.
 */

const LEDGER: { k: string; listed: string; private: string }[] = [
  {
    k: "What sets the price",
    listed: "A continuous auction. Thousands of participants, every second the market is open.",
    private:
      "A dated mark, struck when something real happens — a round closes, a block clears, a 409A is issued.",
  },
  {
    k: "How often it moves",
    listed: "Continuously, and visibly, including when nothing has changed.",
    private: "When an event moves it. A mark can stand for quarters — that stability is the structure.",
  },
  {
    k: "What you hold",
    listed: "The security itself, in your name, with the rights attached to it.",
    private:
      "Units in a single-asset vehicle that holds the shares. Exposure to the company, without a seat on the cap table.",
  },
  {
    k: "How it settles",
    listed: "Exchange clearing, on the exchange's timetable.",
    private: "Transfer of units on the register, at the prevailing mark, under the treaty.",
  },
  {
    k: "Getting out",
    listed: "Sell into the book. Size permitting, immediately.",
    private:
      "Matched against standing interest. Liquidity arrives with events and with new demand — plan for the horizon.",
  },
  {
    k: "What you are told",
    listed: "Whatever the issuer files publicly, on the filing calendar.",
    private: "Whatever the treaty obliges the issuer to pass through. Material, dated, and checkable.",
  },
];

const CLAUSES = [
  {
    h: "A standing agreement, before anything is offered",
    p: "Coverage opens only where there is a signed arrangement with the company and a supply of shares held against it. Names under planned coverage are labelled as such. When both the agreement and the supply are in place, the vehicle becomes available.",
  },
  {
    h: "Transfer is permitted by treaty",
    p: "The treaty is what makes the units transferable between holders without an exchange. It is the instrument that creates access before a public market exists. The same arrangement that enables the transfer also defines what may be published — so the mark lives inside the account, not as a continuous public quote.",
  },
  {
    h: "Trades clear at the prevailing mark",
    p: "You submit an indication rather than a limit order. It rests against standing interest on the other side, and when it matches, it settles at the mark in force on the settlement date. The mark is the contractual price for that transfer.",
  },
  {
    h: "Every mark is attributed",
    p: "A mark carries its figure, its effective date, its basis and the name of whoever struck it. It appears on your statement exactly as recorded. The chart steps between marks; it never slopes, because a sloping line between two events would invent daily prices that never existed.",
  },
  {
    h: "A listing is the intended exit",
    p: "If the company lists, the market takes over pricing, the vehicle resolves into the listed security, and the position becomes a public one. That is the designed outcome of early access — and the reason the private mark and the eventual public price can diverge, sometimes substantially, in either direction.",
  },
];

export default function TreatyDesk() {
  return (
    <div className="treaty">
      {/* ---- the argument, up front ---- */}
      <div className="treaty__open">
        <p className="treaty__lead">
          Both sides of this platform are tradeable. A listed share and a
          private unit can both change hands here. What differs is the
          machinery — and that difference is exactly why private access exists
          before a company reaches a public market.
        </p>
        <p className="treaty__body">
          A listed company has an exchange behind it: a continuous auction, a
          clearing house, a filing calendar. A private company has a register,
          a set of agreements, and events that occur irregularly. Access is
          granted by treaty — a standing arrangement between the company, the
          custodian holding the shares, and this platform. That treaty is what
          lets units transfer while the company is still private.
        </p>
        <p className="treaty__body">
          You will not see a continuous price for a private name on a public
          page. Inside your account, against a signed arrangement, a dated mark
          is the contractual reference for settlement. The eventual public
          listing price — when it arrives — can move substantially higher or
          lower than the private mark. That gap is the nature of early access,
          and the reason the private book is here.
        </p>
      </div>

      {/* ---- side by side ---- */}
      <div className="treaty__ledger">
        <div className="treaty__lhead">
          <span className="mono" />
          <span className="mono treaty__lk treaty__lk--pub">Listed</span>
          <span className="mono treaty__lk treaty__lk--pri">Private</span>
        </div>
        {LEDGER.map((r) => (
          <div className="treaty__lrow" key={r.k}>
            <span className="mono treaty__rk">{r.k}</span>
            <span className="treaty__rv">{r.listed}</span>
            <span className="treaty__rv treaty__rv--pri">{r.private}</span>
          </div>
        ))}
      </div>

      {/* ---- the clauses. Numbered because it is a sequence. ---- */}
      <ol className="treaty__clauses">
        {CLAUSES.map((c, i) => (
          <li key={c.h}>
            <span className="mono treaty__no">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h3>{c.h}</h3>
              <p>{c.p}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="treaty__foot mono">
        Private units settle under treaty at the prevailing mark. Liquidity is
        event-driven. The intended path is toward a public listing, at which
        point the market takes over pricing.
      </p>
    </div>
  );
}