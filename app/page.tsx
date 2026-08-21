import Hero from "@/components/Hero";
import Reveal from "@/components/Reveal";
import Ticker from "@/components/Ticker";
import PrivateList from "@/components/PrivateList";
import Faq from "@/components/Faq";
import Waitlist from "@/components/Waitlist";
import Timeline from "@/components/Timeline";
import Debate from "@/components/Debate";
import Gallery from "@/components/Gallery";
import Leadership from "@/components/Leadership";
import NewsRoom from "@/components/NewsRoom";
import VideoWall from "@/components/VideoWall";
import TreatyDesk from "@/components/TreatyDesk";

import { getQuotes, privateCos, faqs } from "@/lib/data";
import { nasaClips, nasaGallery, sampleQueries, subjectPool } from "@/lib/media";
import { NEWS, WIKI_SUBJECTS, placeImages } from "@/lib/newsroom";
import { company, FACTS_AS_OF } from "@/lib/facts";
import { marksFor } from "@/lib/ledger";
import { orPrivateMarks, privateMarksEnabled, PRIVATE_MARK_DISCLAIMER } from "@/lib/preview";
import ReadingProgress from "@/components/ReadingProgress";

export const revalidate = 300;

export default async function Page() {
  const [quotes, mosaic, newsNasa, wiki, clips, markRows] = await Promise.all([
    getQuotes(),
    nasaGallery(sampleQueries(6), 3),
    nasaGallery(
      ["Falcon 9 launch night", "Dragon capsule berthing", "Starlink satellite deployment", "rocket booster landing"],
      3,
    ),
    subjectPool(WIKI_SUBJECTS, 3),
    nasaClips(["Falcon 9 launch", "Crew Dragon mission", "SpaceX booster landing"], 3),
    Promise.all(
      privateCos.map(async (c) => {
        const recorded = await marksFor(c.symbol).catch(() => []);
        return [c.symbol, orPrivateMarks(c.symbol, recorded)] as const;
      }),
    ),
  ]);

  const live = quotes.filter((q) => q.price != null).length;
  const hasPrivateMarks = markRows.some(([, { isPrivate }]) => isPrivate);

  const stories = placeImages(NEWS, wiki, newsNasa);

  const latestMarks = Object.fromEntries(
    markRows.map(([symbol, { marks, isPrivate }]) => {
      const last = marks[marks.length - 1];
      return [
        symbol,
        last
          ? {
              symbol,
              price: last.price,
              effective_at: last.effective_at,
              basis: last.basis,
              isPrivate,
            }
          : undefined,
      ];
    }),
  );

  return (
    <>
      <ReadingProgress />

      {privateMarksEnabled() && hasPrivateMarks && (
        <div className="pvbar" role="status">
          <span className="mono pvbar__tag">Private</span>
          <p className="pvbar__copy">{PRIVATE_MARK_DISCLAIMER}</p>
        </div>
      )}

      <Hero />
      <Ticker quotes={quotes} />

      {/* ═══════════ INTELLIGENCE ═══════════ */}
      <Reveal>
        <section className="zone" id="intelligence">
          <header className="zone__head">
            <p className="mono eyebrow">Intelligence</p>
            <h2 className="zone__h">
              The group
              <br />
              <em>as it stands</em>
            </h2>
            <p className="zone__lede">
              Structure, events and the distinctions that matter. Every date is
              sourced. Every figure traces to a filing or a disclosed round.
            </p>
          </header>
          <NewsRoom items={stories} />
        </section>
      </Reveal>

      {/* ═══════════ LISTED MARKET ═══════════ */}
      <Reveal>
        <section className="zone zone--alt" id="market">
          <div className="zone__in">
            <header className="zone__head zone__head--split">
              <div>
                <p className="mono eyebrow">Listed</p>
                <h2 className="zone__h">
                  Continuous
                  <br />
                  <em>market prices</em>
                </h2>
              </div>
              <p className="zone__lede">
                Public equity. End-of-day quotes, delayed, third-party sourced.
              </p>
            </header>

            <div className="board2">
              {quotes.map((q, i) => (
                <article
                  className={i === 0 ? "bd bd--lead" : i === 3 ? "bd bd--wide" : "bd"}
                  key={q.symbol}
                >
                  <div className="bd__top">
                    <span className="bd__badge mono">{q.short}</span>
                    <span
                      className={
                        q.change == null
                          ? "bd__ch"
                          : q.change >= 0
                            ? "bd__ch up"
                            : "bd__ch down"
                      }
                    >
                      {q.change == null
                        ? "—"
                        : `${q.change >= 0 ? "+" : ""}${q.change.toFixed(2)}%`}
                    </span>
                  </div>
                  <h3 className="bd__name">{q.name}</h3>
                  <p className="bd__sym mono">{q.symbol} · public equity</p>
                  <p className="bd__px">
                    {q.price != null ? `$${q.price.toFixed(2)}` : "—"}
                  </p>
                  <p className="bd__foot mono">
                    {q.asOf ? `Close ${q.asOf} · delayed` : "Quote pending"}
                  </p>
                </article>
              ))}
            </div>

            <p className="note mono">
              {live}/{quotes.length} quotes resolved · end-of-day, delayed.
            </p>
          </div>
        </section>
      </Reveal>

      {/* ═══════════ PRIVATE — TREATY ═══════════ */}
      <Reveal>
        <section className="zone" id="private">
          <header className="zone__head">
            <p className="mono eyebrow">Private</p>
            <h2 className="zone__h">
              Access before
              <br />
              <em>the listing.</em>
            </h2>
          </header>

          <TreatyDesk />

          <div className="zone__sub">
            <p className="mono eyebrow">Coverage</p>
            <h3 className="zone__h3">Names under arrangement or planned</h3>
          </div>

          <PrivateList cos={privateCos} marks={latestMarks} />

          <div className="warn">
            <p className="mono warn__k">How it works</p>
            <p>
              Private securities have no continuous public quote. Marks shown are
              dated reference points from private transactions. The eventual
              public listing price — when it arrives — can move substantially
              higher or lower than the private mark. That is the point of early
              access. Starlink, Grok and X remain divisions of SPCX and carry no
              separate ticker.
            </p>
          </div>
        </section>
      </Reveal>

      {/* ═══════════ IMAGERY ═══════════ */}
      <Reveal>
        <section className="zone zone--alt" id="media">
          <div className="zone__in">
            <header className="zone__head zone__head--split">
              <div>
                <p className="mono eyebrow">Imagery</p>
                <h2 className="zone__h">
                  Hardware
                  <br />
                  <em>in operation</em>
                </h2>
              </div>
              <p className="zone__lede">
                NASA Image and Video Library. Public domain. Shown because NASA
                missions fly on this hardware.
              </p>
            </header>

            <Gallery shots={mosaic} />

            <div className="zone__sub zone__sub--pad">
              <p className="mono eyebrow">Video</p>
              <h3 className="zone__h3">Flight footage and operator channels</h3>
            </div>

            <VideoWall clips={clips} />
          </div>
        </section>
      </Reveal>

      {/* ═══════════ LEADERSHIP ═══════════ */}
      <Reveal>
        <section className="zone" id="who">
          <header className="zone__head">
            <p className="mono eyebrow">Leadership</p>
            <h2 className="zone__h">
              Two companies.
              <br />
              <em>One</em> chief executive.
            </h2>
            <p className="zone__lede">
              Everything else sits inside one of them, or remains private.
            </p>
          </header>
          <Leadership />
        </section>
      </Reveal>

      {/* ═══════════ TIMELINE ═══════════ */}
      <Reveal>
        <section className="zone zone--alt" id="timeline">
          <div className="zone__in">
            <header className="zone__head">
              <p className="mono eyebrow">Timeline</p>
              <h2 className="zone__h">
                Eighteen months.
                <br />
                <em>Three restructures.</em>
              </h2>
              <p className="zone__lede">
                Every date is verifiable. The corporate shape moved twice before
                the listing and once after it. That is why the group still reads
                as opaque from the outside.
              </p>
            </header>
            <Timeline />
          </div>
        </section>
      </Reveal>

      {/* ═══════════ THE ARGUMENT ═══════════ */}
      <Reveal>
        <section className="zone" id="argument">
          <header className="zone__head">
            <p className="mono eyebrow">The argument</p>
            <h2 className="zone__h">
              What the market is
              <br />
              <em>actually</em> pricing
            </h2>
            <p className="zone__lede">
              SPCX reported its first results as a public company in August 2026.
              The numbers were strong. The stock had already traded below issue
              price. Both statements are true at the same time.
            </p>
          </header>
          <Debate />
          <p className="note mono">
            Figures as of {FACTS_AS_OF}. Analyst views paraphrased from published
            notes.
          </p>
        </section>
      </Reveal>

      {/* ═══════════ FAQ ═══════════ */}
      <Reveal>
        <section className="zone zone--alt" id="questions">
          <div className="zone__in">
            <header className="zone__head">
              <p className="mono eyebrow">Questions</p>
              <h2 className="zone__h">The ones that matter</h2>
            </header>
            <Faq items={faqs} />
          </div>
        </section>
      </Reveal>

      {/* ═══════════ CTA ═══════════ */}
      <section className="cta" id="access">
        <h2 className="cta__h">
          Two listed names.
          <br />
          A <em>private</em> book.
        </h2>
        <Waitlist />
        <p className="cta__alt mono">
          Access opens by application. Verify any firm on SEC IAPD and FINRA
          BrokerCheck.
        </p>
      </section>

      <footer className="foot">
        <div className="foot__disc">
          <h3 className="mono">Required disclosure</h3>
          <p>
            {company.name ?? company.brand} is not affiliated with, sponsored by,
            endorsed by, or acting as agent for Tesla, Inc., Space Exploration
            Technologies Corp., Neuralink Corp., The Boring Company, NVIDIA, or
            any officer or founder of those companies. Names and marks are used
            for identification only.
          </p>
          <p>
            Public quotes are end-of-day and delayed, sourced from a third party.
            Private company securities have no continuous public market. Marks
            shown are dated reference points from private transactions. A future
            public listing price can move substantially higher or lower than any
            private mark displayed — that is the nature of early access.
            Investments in private companies are speculative and can be illiquid.
          </p>
          <p>
            Imagery from the NASA Image and Video Library is public domain.
            Imagery from Wikimedia Commons is used under the licence stated beside
            each file. Licences are verified before render.
          </p>
        </div>
        <div className="foot__bar mono">
          <span>{company.name ?? company.brand}</span>
          {company.registration && <span>Reg. {company.registration}</span>}
          {company.address && <span>{company.address}</span>}
          {company.email && <a href={`mailto:${company.email}`}>{company.email}</a>}
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </>
  );
}