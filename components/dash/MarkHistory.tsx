import type { PrivateQuote } from "@/lib/private";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const on = (t: number) =>
  new Date(t).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

/**
 * The mark history.
 *
 * This panel is the reason a private asset can be shown at all. A number on
 * someone's statement needs a provenance, so every mark carries the date it
 * is as of, what kind of event produced it, where that came from, and who
 * recorded it. If any of those is missing, the number shouldn't be there.
 *
 * Showing the whole history rather than just the current figure also makes the
 * shape of the thing obvious: three or four marks over four years, not a price
 * that moves. That's what holding a private position is actually like.
 */
export default function MarkHistory({ quote }: { quote: PrivateQuote }) {
  return (
    <div className="panel">
      <div className="panel__head">
        <h2 className="panel__h">Valuation marks</h2>
        <span className="mono panel__meta">{quote.marks.length} recorded</span>
      </div>

      {quote.marks.length === 0 ? (
        <div className="blank">
          <p className="blank__lead">No mark recorded.</p>
          <p className="blank__body">
            Nothing has been recorded for {quote.symbol}, so there is no value to
            show and nothing to transact at. Marks are entered in the back office
            with a date, a basis and a source.
          </p>
        </div>
      ) : (
        <ol className="marks">
          {[...quote.marks].reverse().map((m, i) => (
            <li className={i === 0 ? "marks__r is-current" : "marks__r"} key={m.id}>
              <div className="marks__l">
                <span className="mono marks__px">{usd(m.price)}</span>
                <span className="marks__basis">{m.basis}</span>
              </div>
              <div className="marks__r2">
                <span className="mono marks__when">{on(m.effective_at)}</span>
                <span className="marks__src">{m.source}</span>
              </div>
              {i === 0 && <span className="mono marks__tag">Prevailing</span>}
            </li>
          ))}
        </ol>
      )}

      <p className="mono panel__note marks__note">
        A mark is a dated valuation, not a quote — it holds at one value until
        the next event, which is why the chart steps rather than curves. It is
        not a price you can necessarily transact at, and it is not evidence that
        a buyer exists.
      </p>
    </div>
  );
}
