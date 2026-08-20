/**
 * PRIVATE MARKET — how it trades, and why no price appears here.
 *
 * Both sides of this platform are tradeable. They are not tradeable the same
 * way, and the difference is the entire content of this section. Deliberately
 * no figure appears anywhere below: a published price on a security with no
 * exchange behind it is a claim nobody can settle against, and putting one on
 * a marketing page is how this sector gets itself into trouble.
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
    private: "When an event moves it, and not otherwise. A mark can stand for quarters.",
  },
  {
    k: "What you hold",
    listed: "The security itself, in your name, with the rights attached to it.",
    private:
      "Units in a single-asset vehicle that holds the shares. You are not on the cap table.",
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
      "Matched against standing interest. There may be none for a while, and you should plan on that.",
  },
  {
    k: "What you are told",
    listed: "Whatever the issuer files publicly, on the filing calendar.",
    private: "Whatever the treaty obliges the issuer to pass through. Usually less, always later.",
  },
];

const CLAUSES = [
  {
    h: "A standing agreement, before anything is offered",
    p: "Coverage opens only where there is a signed arrangement with the company and a supply of shares held against it. Until both exist, a name appears here as planned coverage — it is not something you can buy, and it is labelled that way rather than left ambiguous.",
  },
  {
    h: "Transfer is permitted, publication is not",
    p: "The treaty is what makes the units transferable between holders without an exchange. It also constrains what may be published about them. Those two things travel together: the same instrument that lets a private position change hands is the one that keeps a price off a public page. This is not us being coy — it is the condition on which access exists at all.",
  },
  {
    h: "Trades clear at the prevailing mark",
    p: "You submit an indication rather than a limit order. It rests against standing interest on the other side, and when it matches, it settles at the mark in force on the settlement date. No spread is quoted to you because there is no continuous two-sided market to quote one from.",
  },
  {
    h: "Every mark is attributed",
    p: "A mark carries its figure, its effective date, its basis and the name of whoever struck it. It appears on your statement exactly as recorded. The chart steps between marks; it never slopes, because a sloping line between two events implies daily prices that never existed.",
  },
  {
    h: "A listing dissolves the arrangement",
    p: "If the company lists, the market takes over pricing, the vehicle resolves into the listed security, and the position stops being a private one. That is the intended exit, and it is the only one with a timetable attached.",
  },
];

export default function TreatyDesk() {
  return (
    <div className="treaty">
      {/* ---- the argument, up front ---- */}
      <div className="treaty__open">
        <p className="treaty__lead">
          Both sides of this platform are tradeable. A listed share and a
          private unit are equally capable of changing hands here — what differs
          is the machinery underneath, and pretending otherwise is the single
          most common way retail investors get hurt in this asset class.
        </p>
        <p className="treaty__body">
          A listed company has an exchange behind it: a continuous auction, a
          clearing house, a filing calendar. A private company has none of
          those. It has a register, a set of agreements, and events that occur
          irregularly. Access to it is granted by treaty — a standing
          arrangement between the company, the custodian holding the shares, and
          this platform — and that treaty permits units to transfer while
          expressly restricting what may be published about their value.
        </p>
        <p className="treaty__body">
          So you will not find a price for a private name anywhere on this page.
          Not because the figure is unknown to us, but because a price published
          outside an exchange is an assertion no one can settle against. Inside
          your account, against a signed arrangement, a mark is a contractual
          fact. On a public marketing page it is decoration, and decoration on a
          number is how people end up wiring money to strangers.
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

      {/* ---- the clauses. Numbered because it genuinely is a sequence. ---- */}
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
        Units in private vehicles are speculative and illiquid. You should be
        prepared to lose the entire amount invested and to hold for an
        indefinite period. Nothing on this page is an offer to sell or a
        solicitation to buy any security.
      </p>
    </div>
  );
}
