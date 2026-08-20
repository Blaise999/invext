import { spcxDebate, spcxNumbers } from "@/lib/facts";

/**
 * Both sides of the SPCX argument, attributed. A page carrying only the bull
 * case is marketing; one carrying only the bear case is useless.
 */
export default function Debate() {
  return (
    <>
      <dl className="nums">
        {spcxNumbers.map((n) => (
          <div key={n.k}>
            <dt className="mono">{n.k}</dt>
            <dd>{n.v}</dd>
            <p className="mono nums__note">{n.note}</p>
          </div>
        ))}
      </dl>

      <div className="deb">
        <section className="deb__col deb__col--bull">
          <h3 className="mono deb__h">The case for</h3>
          <ul>
            {spcxDebate.bull.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </section>
        <section className="deb__col deb__col--bear">
          <h3 className="mono deb__h">The case against</h3>
          <ul>
            {spcxDebate.bear.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
