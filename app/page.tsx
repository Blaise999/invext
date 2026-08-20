import Hero from "@/components/Hero";
import Reveal from "@/components/Reveal";
import { readSequences } from "@/lib/sequence-server";
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
import { nasaGallery, nasaMedia, sampleQueries, subjectPool } from "@/lib/media";
import { NEWS, WIKI_SUBJECTS, placeImages } from "@/lib/newsroom";
import { company, FACTS_AS_OF } from "@/lib/facts";
import { marksFor } from "@/lib/ledger";
import { orPreviewMarks, previewMode, PREVIEW_NOTE } from "@/lib/preview";
import ReadingProgress from "@/components/ReadingProgress";

export const revalidate = 300;

export default async function Page() {
  const [seq, quotes, mosaic, newsNasa, wiki, clips, markRows] = await Promise.all([
    // Resolved on the server so the hero has its frames before hydration.
    readSequences(),
    getQuotes(),
    // Mosaic and newsroom draw from separate NASA queries so the same frame
    // never turns up in both.
    nasaGallery(sampleQueries(6), 3),
    nasaGallery(
      ["Falcon 9 launch night", "Dragon capsule berthing", "Starlink satellite deployment", "rocket booster landing"],
      3,
    ),
    subjectPool(WIKI_SUBJECTS, 3),
    nasaMedia("Falcon 9 launch and landing", 3, "video"),
    Promise.all(
      privateCos.map(async (c) => {
        const recorded = await marksFor(c.symbol).catch(() => []);
        return [c.symbol, orPreviewMarks(c.symbol, recorded)] as const;
      }),
    ),
  ]);

  const live = quotes.filter((q) => q.price != null).length;
  const illustrative = quotes.some((q) => q.source === "preview");

  // Every card that wants a picture gets its own, drawn from the two pools.
  const stories = placeImages(NEWS, wiki, newsNasa);

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
      <ReadingProgress />
      {previewMode() && (
        <div className="pvbar" role="status">
          <span className="mono pvbar__tag">Preview</span>
          <p className="pvbar__copy">{PREVIEW_NOTE}</p>
        </div>
      )}

      <Hero seq={seq} />
      <Ticker quotes={quotes} />

      {/* ═══════════ INTELLIGENCE ═══════════ */}
      <Reveal><section className="zone" id="intelligence">
        <header className="zone__head">
          <p className="mono eyebrow">Intelligence</p>
          <h2 className="zone__h">
            The group,
            <br />
            <em>as it actually is</em>
          </h2>
          <p className="zone__lede">
            Market events, corporate structure and the things that get mistaken
            for each other. Every item is dated, and every figure traces to a
            filing or a disclosed round.
          </p>
        </header>

        <NewsRoom items={stories} />
      </section></Reveal>

      {/* ═══════════ LISTED MARKET ═══════════ */}
      <Reveal>
      <section className="zone zone--alt" id="market">
        <div className="zone__in">
          <header className="zone__head zone__head--split">
            <div>
              <p className="mono eyebrow">Listed</p>
              <h2 className="zone__h">
                Priced by
                <br />
                <em>the market</em>
              </h2>
            </div>
            <p className="zone__lede">
              The listed side of the group. Quotes are end-of-day and delayed,
              sourced from a third party — do not trade on them.
            </p>
          </header>

          {/* Irregular by design: the lead name takes a double cell and a
              heavier surface, the rest fall where the grid puts them. */}
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
                <p className={q.source === "preview" ? "bd__px is-illus" : "bd__px"}>
                  {q.price != null ? `$${q.price.toFixed(2)}` : "—"}
                </p>
                <p className="bd__foot mono">
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
              ? "Figures marked illustrative are placeholders in this preview build."
              : `${live}/${quotes.length} quotes resolved · end-of-day, delayed.`}{" "}
            Nothing here is a recommendation to buy.
          </p>
        </div>
      </section></Reveal>


      {/* ═══════════ PRIVATE — TREATY ═══════════ */}
      <Reveal>
      <section className="zone" id="private">
        <header className="zone__head">
          <p className="mono eyebrow">Private</p>
          <h2 className="zone__h">
            Tradeable.
            <br />
            <em>Not quoted.</em>
          </h2>
        </header>

        <TreatyDesk />

        <div className="zone__sub">
          <p className="mono eyebrow">Coverage</p>
          <h3 className="zone__h3">Names under arrangement or planned</h3>
        </div>

        <PrivateList cos={privateCos} marks={latestMarks} />

        <div className="warn">
          <p className="mono warn__k">Status</p>
          <p>
            {previewMode()
              ? "Preview build. Names shown as planned coverage carry illustrative marks; no agreement is in place and units are not offered for sale. Starlink, Grok and X are divisions of SPCX and have no separate ticker."
              : "Names marked as planned coverage are not yet available. Starlink, Grok and X are divisions of SPCX and have no separate ticker."}
          </p>
        </div>
      </section></Reveal>


      {/* ═══════════ IMAGERY ═══════════ */}
      <Reveal>
      <section className="zone zone--alt" id="media">
        <div className="zone__in">
          <header className="zone__head zone__head--split">
            <div>
              <p className="mono eyebrow">Imagery</p>
              <h2 className="zone__h">
                Hardware,
                <br />
                <em>in the field</em>
              </h2>
            </div>
            <p className="zone__lede">
              From the NASA Image and Video Library — public domain, and shown
              because NASA missions fly on this hardware, not as an endorsement
              of anything on this page.
            </p>
          </header>

          <Gallery shots={mosaic} />

          <div className="zone__sub zone__sub--pad">
            <p className="mono eyebrow">Video</p>
            <h3 className="zone__h3">Flight footage and operator channels</h3>
          </div>

          <VideoWall clips={clips} />
        </div>
      </section></Reveal>


      {/* ═══════════ LEADERSHIP ═══════════ */}
      <Reveal>
      <section className="zone" id="who">
        <header className="zone__head">
          <p className="mono eyebrow">Who runs what</p>
          <h2 className="zone__h">
            Two companies,
            <br />
            <em>one</em> chief executive
          </h2>
          <p className="zone__lede">
            Everything else in the group sits inside one of them, or is private.
          </p>
        </header>
        <Leadership />
      </section></Reveal>


      {/* ═══════════ TIMELINE ═══════════ */}
      <Reveal>
      <section className="zone zone--alt" id="timeline">
        <div className="zone__in">
          <header className="zone__head">
            <p className="mono eyebrow">What changed</p>
            <h2 className="zone__h">
              Eighteen months,
              <br />
              <em>three restructures</em>
            </h2>
            <p className="zone__lede">
              Every date below is checkable. This is why the group looks
              confusing from the outside — the corporate shape moved twice
              before the listing and once after it.
            </p>
          </header>
          <Timeline />
        </div>
      </section></Reveal>


      {/* ═══════════ THE ARGUMENT ═══════════ */}
      <Reveal>
      <section className="zone" id="argument">
        <header className="zone__head">
          <p className="mono eyebrow">The argument</p>
          <h2 className="zone__h">
            What the market is
            <br />
            <em>actually</em> arguing about
          </h2>
          <p className="zone__lede">
            SPCX reported its first results as a public company in August 2026.
            The numbers were strong and the stock had already been below its
            issue price. Both of those things are true at once.
          </p>
        </header>
        <Debate />
        <p className="note mono">
          Figures as of {FACTS_AS_OF} and point-in-time. Analyst views are
          paraphrased from published notes — read the originals before acting on
          any of it.
        </p>
      </section></Reveal>


      {/* ═══════════ FAQ ═══════════ */}
      <Reveal>
      <section className="zone zone--alt" id="questions">
        <div className="zone__in">
          <header className="zone__head">
            <p className="mono eyebrow">Questions</p>
            <h2 className="zone__h">The ones worth asking</h2>
          </header>
          <Faq items={faqs} />
        </div>
      </section></Reveal>


      {/* ═══════════ CTA ═══════════ */}
      <section className="cta" id="access">
        <h2 className="cta__h">
          Two listed names.
          <br />
          A <em>private</em> book.
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
            NVIDIA, or any officer or founder of those companies. Company names
            and marks are used for identification only. None of them has
            reviewed or approved this page.
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
          <p>
            Imagery from the NASA Image and Video Library is public domain.
            Imagery from Wikimedia Commons is used under the licence stated
            beside each file; a licence is verified programmatically before a
            file renders, and no file is shown whose terms cannot be confirmed.
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
