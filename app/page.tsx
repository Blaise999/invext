import Hero from "@/components/Hero";
import Ticker from "@/components/Ticker";
import PrivateList from "@/components/PrivateList";
import Faq from "@/components/Faq";
import Waitlist from "@/components/Waitlist";
import { getQuotes, privateCos, faqs, channels } from "@/lib/data";
import { nasaGallery, nasaMedia, sampleQueries } from "@/lib/media";
import { company, FACTS_AS_OF } from "@/lib/facts";
import { marksFor } from "@/lib/ledger";
import { orPreviewMarks, previewMode, PREVIEW_NOTE } from "@/lib/preview";
import Timeline from "@/components/Timeline";
import Debate from "@/components/Debate";
import Gallery from "@/components/Gallery";
import Leadership from "@/components/Leadership";

export const revalidate = 300;

export default async function Page() {
  const [quotes, shots, clips, markRows] = await Promise.all([
    getQuotes(),
    // Several queries rather than one — a single query returns near-identical
    // frames from the same launch.
    nasaGallery(sampleQueries(6), 3),
    nasaMedia("falcon 9 first stage landing", 1, "video"),
    // Recorded marks if any exist; the illustrative set stands in only in a
    // preview build, and a real mark always wins.
    Promise.all(
      privateCos.map(async (c) => {
        const recorded = await marksFor(c.symbol).catch(() => []);
        return [c.symbol, orPreviewMarks(c.symbol, recorded)] as const;
      }),
    ),
  ]);

  const live = quotes.filter((q) => q.price != null).length;
  const illustrative = quotes.some((q) => q.source === "preview");

  const latestMarks = Object.fromEntries(
    markRows.map(([symbol, { marks, illustrative: illus }]) => {
      const last = marks[marks.length - 1];
      return [
        symbol,
        last
          ? {
              symbol,
              price: last.price,
              effective_at: last.effective_at,
              basis: last.basis,
              illustrative: illus,
            }
          : undefined,
      ];
    }),
  );

  return (
    <>
      {previewMode() && (
        <div className="pvbar" role="status">
          <span className="mono pvbar__tag">Preview</span>
          <p className="pvbar__copy">{PREVIEW_NOTE}</p>
        </div>
      )}

      <Hero />

      <Ticker quotes={quotes} />

      {/* ---------------- LIVE PUBLIC MARKET ---------------- */}
      <section className="sec" id="market">
        <div className="sec__head">
          <p className="mono eyebrow">Listed</p>
          <h2 className="h2">Seven names, quoted live</h2>
          <p className="sec__lede">
            The listed side of the group, priced by the market. SpaceX joined
            this list on 12 June 2026 — the largest IPO on record, with roughly
            30% of the offering going to retail.
          </p>
        </div>

        <div className="grid">
          {quotes.map((q) => (
            <article className="card" key={q.symbol}>
              <div className="card__top">
                <span className="card__badge mono">{q.short}</span>
                <span
                  className={
                    q.change == null
                      ? "card__ch"
                      : q.change >= 0
                        ? "card__ch up"
                        : "card__ch down"
                  }
                >
                  {q.change == null
                    ? "—"
                    : `${q.change >= 0 ? "+" : ""}${q.change.toFixed(2)}%`}
                </span>
              </div>
              <h3 className="card__name">{q.name}</h3>
              <p className="card__sym mono">{q.symbol} · public equity</p>
              <p className={q.source === "preview" ? "card__px is-illus" : "card__px"}>
                {q.price != null ? `$${q.price.toFixed(2)}` : "—"}
              </p>
              <p className="card__foot mono">
                {q.source === "preview"
                  ? "Illustrative · preview build"
                  : q.asOf
                    ? `Close ${q.asOf} · delayed`
                    : "Quote arriving"}
              </p>
            </article>
          ))}
        </div>

        <p className="note mono">
          {illustrative
            ? "Figures marked illustrative are placeholders in this preview build. Live quotes are end-of-day and delayed."
            : `${live}/${quotes.length} quotes resolved · end-of-day, delayed.`}{" "}
          Nothing here is a recommendation to buy.
        </p>
      </section>

      {/* ---------------- PRIVATE COMPANIES ---------------- */}
      <section className="sec sec--alt" id="private">
        <div className="sec__head">
          <p className="mono eyebrow">Private</p>
          <h2 className="h2">
            Priced to a <em>dated mark</em>
          </h2>
          <p className="sec__lede">
            A private company has no continuous quote, so we don&rsquo;t invent
            one. Each vehicle carries a mark: one figure, one effective date,
            one stated basis, one named author. It holds until the next event
            moves it, and it appears on your statement exactly as recorded.
          </p>
        </div>

        <PrivateList cos={privateCos} marks={latestMarks} />

        <div className="model">
          <p className="mono model__k">How access works</p>
          <ol className="model__steps">
            <li>
              <span className="mono model__no">1</span>
              <h3>Agreement with the company</h3>
              <p>
                Coverage opens only once there is a signed arrangement and a
                supply of shares to hold against. Until then a name is listed
                here as planned coverage, not as something you can buy.
              </p>
            </li>
            <li>
              <span className="mono model__no">2</span>
              <h3>Shares held in a single-asset vehicle</h3>
              <p>
                You hold units in the vehicle, not shares on the cap table.
                That affects information rights, voting and tax treatment, and
                it is the part most platforms leave you to discover later.
              </p>
            </li>
            <li>
              <span className="mono model__no">3</span>
              <h3>Marks, recorded and attributed</h3>
              <p>
                A funding round closes, a secondary block clears, a 409A is
                issued — each becomes a mark with its date, basis and author on
                the record. The chart steps; it never slopes between two points
                to imply days that didn&rsquo;t happen.
              </p>
            </li>
            <li>
              <span className="mono model__no">4</span>
              <h3>Tradeable until the company lists</h3>
              <p>
                Units change hands at the prevailing mark. If the company goes
                public, the market takes over pricing and the vehicle resolves
                into the listed security.
              </p>
            </li>
          </ol>
        </div>

        <div className="warn">
          <p className="mono warn__k">Status</p>
          <p>
            {previewMode()
              ? "Preview build. Neuralink and The Boring Company are shown as planned coverage with illustrative marks; no agreement is in place and units are not offered for sale. Grok, X and Starlink are divisions of SPCX and have no separate ticker."
              : "Neuralink and The Boring Company are planned coverage. Grok, X and Starlink are divisions of SPCX and have no separate ticker."}
          </p>
        </div>
      </section>

      {/* ---------------- LEADERSHIP (EDITORIAL) ---------------- */}
      <section className="sec" id="who">
        <div className="sec__head">
          <p className="mono eyebrow">03 — Who runs what</p>
          <h2 className="h2">
            Two public companies, <em>one</em> chief executive
          </h2>
          <p className="sec__lede">
            Two listed companies, one chief executive. Everything else in the
            group sits inside one of them, or is private.
          </p>
        </div>
        <Leadership />
      </section>

      {/* ---------------- IMAGERY ---------------- */}
      <section className="sec sec--alt" id="media">
        <div className="sec__head">
          <p className="mono eyebrow">04 — Imagery</p>
          <h2 className="h2">Hardware, in the field</h2>
          <p className="sec__lede">
            From the NASA Image and Video Library.
          </p>
        </div>

        <Gallery shots={shots} />

        {clips.length > 0 && (
          <div className="vids">
            {clips.map((c) => (
              <figure className="vid" key={c.id}>
                <div className="vid__frame">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={c.src}
                    controls
                    preload="none"
                    playsInline
                    aria-label={c.title}
                  />
                </div>
                <figcaption className="mono vid__cap">
                  {c.title} — {c.credit}, public domain.
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        <div className="vids">
          {channels.map((c) => (
            <div className="vid" key={c.label}>
              <div className="vid__frame">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/videoseries?list=${c.uploads}`}
                  title={`${c.label} — official channel`}
                  allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
              <p className="mono vid__cap">
                {c.label} — {c.note}. Embedded via YouTube&rsquo;s player; not an
                endorsement, and no affiliation is implied.
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- WHAT CHANGED ---------------- */}
      <section className="sec sec--alt" id="timeline">
        <div className="sec__head">
          <p className="mono eyebrow">05 — What changed</p>
          <h2 className="h2">Eighteen months, three restructures</h2>
          <p className="sec__lede">
            Every date below is checkable. This is why the group looks confusing
            from the outside — the corporate shape moved twice before the listing
            and once after it.
          </p>
        </div>
        <Timeline />
      </section>

      {/* ---------------- THE ARGUMENT ---------------- */}
      <section className="sec" id="argument">
        <div className="sec__head">
          <p className="mono eyebrow">06 — The argument</p>
          <h2 className="h2">
            What the market is <em>actually</em> arguing about
          </h2>
          <p className="sec__lede">
            SPCX reported its first results as a public company in August 2026.
            The numbers were strong and the stock had already been below its
            issue price. Both of those things are true at once.
          </p>
        </div>
        <Debate />
        <p className="note mono">
          Figures as of {FACTS_AS_OF} and point-in-time. Analyst views are
          paraphrased from published notes — read the originals before acting on
          any of it.
        </p>
      </section>

      {/* ---------------- FAQ ---------------- */}
      <section className="sec" id="questions">
        <div className="sec__head">
          <p className="mono eyebrow">07 — Questions</p>
          <h2 className="h2">The ones worth asking</h2>
        </div>
        <Faq items={faqs} />
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="cta">
        <h2 className="cta__h">
          Seven tickers.
          <br />
          Two <em>private</em> names.
        </h2>
        <Waitlist />
        <p className="cta__alt mono">
          Verify any firm yourself on SEC IAPD and FINRA BrokerCheck before
          sending money anywhere. Including here.
        </p>
      </section>

      <footer className="foot">
        <div className="foot__disc">
          <h3 className="mono">Required disclosure</h3>
          <p>
            {company.name ?? company.brand} is not affiliated with, sponsored
            by, endorsed by, or acting as agent for Tesla, Inc., Space
            Exploration Technologies Corp., Neuralink Corp., The Boring Company,
            NVIDIA, Apple, Amazon, Palantir, Rivian, or any officer or founder of
            those companies.
            Company names and marks are used for identification only. None of
            them has reviewed or approved this page.
          </p>
          <p>
            Nothing here is an offer to sell or a solicitation to buy any
            security, and nothing here is investment, legal or tax advice.
            Quotes shown are end-of-day and delayed, sourced from a third party,
            and may be inaccurate or unavailable — do not trade on them. The
            private companies described do not have publicly traded shares and
            no price is quoted for them anywhere on this site. Investments in
            private companies are speculative and illiquid; you should be
            prepared to lose the entire amount invested and to hold for an
            indefinite period.
          </p>

        </div>
        <div className="foot__bar mono">
          <span>{company.name ?? company.brand}</span>
          {company.registration && <span>Reg. {company.registration}</span>}
          {company.address && <span>{company.address}</span>}
          {company.email && (
            <a href={`mailto:${company.email}`}>{company.email}</a>
          )}
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </>
  );
}
