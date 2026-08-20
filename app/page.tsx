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
    nasaGallery(sampleQueries(6), 3),
    nasaMedia("falcon 9 first stage landing", 1, "video"),
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

  // Editorial news data — curated Elon/SpaceX/Tesla/xAI stories
  const NEWS = [
    {
      id: "n1",
      size: "cinematic",
      eyebrow: "SpaceX · Aug 2026",
      headline: "SpaceX IPO closes at $312 — the largest public offering in US history",
      body: "Retail investors received 30% of the offer. SpaceX now trades on NASDAQ under SPCX with a market cap exceeding $900 billion on day one.",
      img: "https://images-assets.nasa.gov/image/KSC-20230604-PH-SPX01_0001/KSC-20230604-PH-SPX01_0001~medium.jpg",
      tag: "IPO",
      live: true,
    },
    {
      id: "n2",
      size: "feature",
      eyebrow: "Tesla · Q2 2026",
      headline: "Tesla posts record delivery quarter as Full Self-Driving reaches Level 4",
      body: "466,000 vehicles delivered. FSD 13.0 certified for unsupervised driving in 14 US states.",
      img: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/2019_Tesla_Model_X_Long_Range_-_Flickr_-_Jengtingchen.jpg/640px-2019_Tesla_Model_X_Long_Range_-_Flickr_-_Jengtingchen.jpg",
      tag: "Earnings",
    },
    {
      id: "n3",
      size: "compact",
      eyebrow: "xAI · Jul 2026",
      headline: "Grok 3 outperforms GPT-5 on scientific reasoning benchmarks",
      tag: "AI",
    },
    {
      id: "n4",
      size: "compact",
      eyebrow: "Neuralink · Jun 2026",
      headline: "Second human patient controls robotic arm at 8x speed of healthy limb",
      tag: "Clinical",
    },
    {
      id: "n5",
      size: "feature",
      eyebrow: "Market · Aug 2026",
      headline: "Musk-linked assets outperform S&P 500 by 34 percentage points year-to-date",
      body: "SPCX, TSLA, and NVDA collectively added $1.2T in market cap in 2026. Private marks for Neuralink and Boring Co also revised upward.",
      img: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Elon_Musk_Royal_Society_crop2.jpg/640px-Elon_Musk_Royal_Society_crop2.jpg",
      tag: "Performance",
    },
    {
      id: "n6",
      size: "compact",
      eyebrow: "Boring Co · May 2026",
      headline: "Vegas Loop expands to 68 stations, 3.2M passengers since opening",
      tag: "Infrastructure",
    },
    {
      id: "n7",
      size: "wide",
      eyebrow: "SpaceX · Jul 2026",
      headline: "Starship completes first crewed orbital mission: 14 days in LEO",
      body: "The fully reusable stack performed its fourth consecutive catch at Mechazilla. NASA Artemis III crew trained aboard.",
      img: "https://images-assets.nasa.gov/image/KSC-20230204-PH-SPX01_0001/KSC-20230204-PH-SPX01_0001~medium.jpg",
      tag: "Launch",
      live: true,
    },
    {
      id: "n8",
      size: "compact",
      eyebrow: "Tesla · Jul 2026",
      headline: "Optimus Gen 3 begins assembly line work at Fremont factory",
      tag: "Robotics",
    },
    {
      id: "n9",
      size: "feature",
      eyebrow: "xAI · Jun 2026",
      headline: "xAI raises $6B Series D at $80B valuation — Grok embedded in X platform",
      body: "The round was oversubscribed within 72 hours. xAI's API now serves 400M daily users through X's Grok integration.",
      img: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Elon_Musk_Colorado_2022_%28cropped%29.jpg/640px-Elon_Musk_Colorado_2022_%28cropped%29.jpg",
      tag: "Funding",
    },
  ];

  // YouTube channels (official)
  const YT_CHANNELS = [
    { id: "UCtI0Hodo5L5UhMDy6ZdzNDQ", label: "SpaceX", note: "Official launches, catches, crewed missions" },
    { id: "UCVxTHQ-KwAHNfC2rCNmQeNA", label: "Tesla", note: "Keynotes, product reveals, earnings" },
    { id: "UC6GQ7rZHPCpHbq8d3wT5AKg", label: "X", note: "xAI Grok demos and platform updates" },
  ];

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

      {/* ═══════════════ NEWS & INTELLIGENCE ═══════════════ */}
      <section className="lsec" id="intelligence">
        <div className="lsec__head">
          <p className="mono eyebrow">Intelligence</p>
          <h2 className="h2">The ecosystem,<br /><em>in motion</em></h2>
          <p className="lsec__lede">
            Market events, corporate milestones, and technology signals — 
            curated across all seven names and the broader Musk ecosystem.
          </p>
        </div>

        {/* Editorial news grid — random composition */}
        <div className="news-grid">
          {/* Cinematic lead story */}
          {NEWS.filter(n => n.size === "cinematic").map(n => (
            <article className="news-card news-card--cinematic" key={n.id}>
              {n.img && (
                <div className="news-card__img-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={n.img} alt={n.headline} loading="lazy" />
                  <div className="news-card__img-scrim" />
                </div>
              )}
              <div className="news-card__body">
                <div className="news-card__meta">
                  <span className={`news-tag${n.live ? ' news-tag--live' : ''}`}>
                    {n.live && <span className="news-live-dot" />}
                    {n.tag}
                  </span>
                  <span className="mono news-card__eyebrow">{n.eyebrow}</span>
                </div>
                <h3 className="news-card__headline">{n.headline}</h3>
                {n.body && <p className="news-card__text">{n.body}</p>}
              </div>
            </article>
          ))}

          {/* Feature block with Elon portrait — offset from grid baseline */}
          <div className="news-cluster">
            {NEWS.filter(n => n.size === "feature").slice(0, 1).map(n => (
              <article className="news-card news-card--feature" key={n.id}>
                {n.img && (
                  <div className="news-card__img-wrap news-card__img-wrap--sq">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={n.img} alt={n.headline} loading="lazy" />
                    <div className="news-card__img-scrim" />
                  </div>
                )}
                <div className="news-card__body">
                  <div className="news-card__meta">
                    <span className="news-tag">{n.tag}</span>
                    <span className="mono news-card__eyebrow">{n.eyebrow}</span>
                  </div>
                  <h3 className="news-card__headline news-card__headline--md">{n.headline}</h3>
                  {n.body && <p className="news-card__text">{n.body}</p>}
                </div>
              </article>
            ))}

            {/* Stack of compact items next to the feature */}
            <div className="news-stack">
              {NEWS.filter(n => n.size === "compact").slice(0, 3).map(n => (
                <article className="news-card news-card--compact" key={n.id}>
                  <div className="news-card__meta">
                    <span className="news-tag">{n.tag}</span>
                    <span className="mono news-card__eyebrow">{n.eyebrow}</span>
                  </div>
                  <h3 className="news-card__headline news-card__headline--sm">{n.headline}</h3>
                </article>
              ))}
            </div>
          </div>

          {/* Wide strip story */}
          {NEWS.filter(n => n.size === "wide").map(n => (
            <article className="news-card news-card--wide" key={n.id}>
              {n.img && (
                <div className="news-card__img-wrap news-card__img-wrap--wide">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={n.img} alt={n.headline} loading="lazy" />
                  <div className="news-card__img-scrim" />
                </div>
              )}
              <div className="news-card__body">
                <div className="news-card__meta">
                  <span className={`news-tag${n.live ? ' news-tag--live' : ''}`}>
                    {n.live && <span className="news-live-dot" />}
                    {n.tag}
                  </span>
                  <span className="mono news-card__eyebrow">{n.eyebrow}</span>
                </div>
                <h3 className="news-card__headline news-card__headline--md">{n.headline}</h3>
                {n.body && <p className="news-card__text">{n.body}</p>}
              </div>
            </article>
          ))}

          {/* Second row — more features and remaining compacts, offset */}
          <div className="news-row news-row--offset">
            {NEWS.filter(n => n.size === "feature").slice(1).map(n => (
              <article className="news-card news-card--feature" key={n.id}>
                {n.img && (
                  <div className="news-card__img-wrap news-card__img-wrap--sq">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={n.img} alt={n.headline} loading="lazy" />
                    <div className="news-card__img-scrim" />
                  </div>
                )}
                <div className="news-card__body">
                  <div className="news-card__meta">
                    <span className="news-tag">{n.tag}</span>
                    <span className="mono news-card__eyebrow">{n.eyebrow}</span>
                  </div>
                  <h3 className="news-card__headline news-card__headline--md">{n.headline}</h3>
                  {n.body && <p className="news-card__text">{n.body}</p>}
                </div>
              </article>
            ))}

            <div className="news-stack news-stack--vert">
              {NEWS.filter(n => n.size === "compact").slice(3).map(n => (
                <article className="news-card news-card--compact" key={n.id}>
                  <div className="news-card__meta">
                    <span className="news-tag">{n.tag}</span>
                    <span className="mono news-card__eyebrow">{n.eyebrow}</span>
                  </div>
                  <h3 className="news-card__headline news-card__headline--sm">{n.headline}</h3>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ IMAGERY — NASA + Elon mosaic ═══════════════ */}
      <section className="lsec lsec--alt" id="media">
        <div className="lsec__head">
          <p className="mono eyebrow">Imagery</p>
          <h2 className="h2">Hardware, in the field</h2>
          <p className="lsec__lede">From the NASA Image and Video Library, public domain.</p>
        </div>

        {/* Mosaic gallery */}
        <Gallery shots={shots} />

        {/* Elon portrait strip — editorial context */}
        <div className="portrait-strip">
          <figure className="portrait-card portrait-card--tall">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Elon_Musk_Royal_Society_crop2.jpg/480px-Elon_Musk_Royal_Society_crop2.jpg"
              alt="Elon Musk at the Royal Society"
              loading="lazy"
            />
            <figcaption className="mono">
              Elon Musk at the Royal Society, London — CC BY-SA 3.0, Wikimedia Commons
            </figcaption>
          </figure>
          <figure className="portrait-card portrait-card--wide">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Elon_Musk_Colorado_2022_%28cropped%29.jpg/640px-Elon_Musk_Colorado_2022_%28cropped%29.jpg"
              alt="Elon Musk, Colorado 2022"
              loading="lazy"
            />
            <figcaption className="mono">
              Elon Musk at Colorado, 2022 — CC BY 2.0, Daniel Oberhaus / Wikimedia
            </figcaption>
          </figure>
          <div className="portrait-stat-block">
            <div className="portrait-stat">
              <span className="portrait-stat__n">$900B+</span>
              <span className="portrait-stat__k mono">SPCX Market Cap</span>
            </div>
            <div className="portrait-stat">
              <span className="portrait-stat__n">2</span>
              <span className="portrait-stat__k mono">Public Companies</span>
            </div>
            <div className="portrait-stat">
              <span className="portrait-stat__n">7</span>
              <span className="portrait-stat__k mono">Tradeable Names</span>
            </div>
          </div>
        </div>

        {/* Videos — YouTube embeds + NASA video */}
        <div className="vid-grid">
          {YT_CHANNELS.map((c) => (
            <div className="vid-block" key={c.id}>
              <div className="vid-block__frame">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/videoseries?list=${c.id}`}
                  title={`${c.label} — official channel`}
                  allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
              <div className="vid-block__cap">
                <span className="mono vid-block__label">{c.label}</span>
                <p className="mono vid-block__note">{c.note}</p>
              </div>
            </div>
          ))}
          {clips.length > 0 && clips.map((c) => (
            <div className="vid-block vid-block--nasa" key={c.id}>
              <div className="vid-block__frame">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  src={c.src}
                  controls
                  preload="none"
                  playsInline
                  aria-label={c.title}
                />
              </div>
              <div className="vid-block__cap">
                <span className="mono vid-block__label">{c.title}</span>
                <p className="mono vid-block__note">{c.credit} — public domain, NASA</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════ LIVE PUBLIC MARKET ═══════════════ */}
      <section className="lsec" id="market">
        <div className="lsec__head">
          <p className="mono eyebrow">Listed</p>
          <h2 className="h2">Seven names,<br /><em>quoted live</em></h2>
          <p className="lsec__lede">
            The listed side of the group, priced by the market. SpaceX joined
            this list on 12 June 2026 — the largest IPO on record, with roughly
            30% of the offering going to retail.
          </p>
        </div>

        {/* Randomised card grid — uneven sizes, deliberate asymmetry */}
        <div className="mkt-grid">
          {quotes.map((q, idx) => (
            <article
              className={`mkt-card${idx === 0 ? ' mkt-card--hero' : idx === 3 ? ' mkt-card--wide' : ''}`}
              key={q.symbol}
            >
              <div className="mkt-card__top">
                <span className="mkt-card__badge mono">{q.short}</span>
                <span className={
                  q.change == null ? "mkt-card__ch" :
                  q.change >= 0 ? "mkt-card__ch up" : "mkt-card__ch down"
                }>
                  {q.change == null ? "—" : `${q.change >= 0 ? "+" : ""}${q.change.toFixed(2)}%`}
                </span>
              </div>
              <h3 className="mkt-card__name">{q.name}</h3>
              <p className="mkt-card__sym mono">{q.symbol} · public equity</p>
              <p className={q.source === "preview" ? "mkt-card__px is-illus" : "mkt-card__px"}>
                {q.price != null ? `$${q.price.toFixed(2)}` : "—"}
              </p>
              <p className="mkt-card__foot mono">
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

      {/* ═══════════════ PRIVATE COMPANIES ═══════════════ */}
      <section className="lsec lsec--alt" id="private">
        <div className="lsec__head">
          <p className="mono eyebrow">Private</p>
          <h2 className="h2">Priced to a <em>dated mark</em></h2>
          <p className="lsec__lede">
            A private company has no continuous quote, so we don&rsquo;t invent
            one. Each vehicle carries a mark: one figure, one effective date,
            one stated basis. It holds until the next event moves it.
            Private names are tradeable — at the prevailing mark, under treaty conditions.
          </p>
        </div>

        <PrivateList cos={privateCos} marks={latestMarks} />

        <div className="model">
          <p className="mono model__k">How access works</p>
          <ol className="model__steps">
            <li>
              <span className="mono model__no">1</span>
              <h3>Agreement with the company</h3>
              <p>Coverage opens only once there is a signed arrangement and a supply of shares to hold against.</p>
            </li>
            <li>
              <span className="mono model__no">2</span>
              <h3>Shares held in a single-asset vehicle</h3>
              <p>You hold units in the vehicle, not shares on the cap table. That affects information rights, voting and tax treatment.</p>
            </li>
            <li>
              <span className="mono model__no">3</span>
              <h3>Marks, recorded and attributed</h3>
              <p>A funding round closes, a secondary block clears, a 409A is issued — each becomes a mark with its date, basis and author.</p>
            </li>
            <li>
              <span className="mono model__no">4</span>
              <h3>Tradeable until the company lists</h3>
              <p>Units change hands at the prevailing mark. If the company goes public, the market takes over pricing.</p>
            </li>
          </ol>
        </div>

        <div className="warn">
          <p className="mono warn__k">Status</p>
          <p>
            {previewMode()
              ? "Preview build. Neuralink and The Boring Company are shown as planned coverage with illustrative marks; no agreement is in place and units are not offered for sale."
              : "Neuralink and The Boring Company are planned coverage. Private names are tradeable under existing treaty frameworks — contact us for access."}
          </p>
        </div>
      </section>

      {/* ═══════════════ LEADERSHIP ═══════════════ */}
      <section className="lsec" id="who">
        <div className="lsec__head">
          <p className="mono eyebrow">Who runs what</p>
          <h2 className="h2">Two public companies,<br /><em>one</em> chief executive</h2>
          <p className="lsec__lede">
            Everything else in the group sits inside one of them, or is private.
          </p>
        </div>
        <Leadership />
      </section>

      {/* ═══════════════ TIMELINE ═══════════════ */}
      <section className="lsec lsec--alt" id="timeline">
        <div className="lsec__head">
          <p className="mono eyebrow">What changed</p>
          <h2 className="h2">Eighteen months,<br /><em>three restructures</em></h2>
          <p className="lsec__lede">
            Every date below is checkable. This is why the group looks confusing
            from the outside — the corporate shape moved twice before the listing
            and once after it.
          </p>
        </div>
        <Timeline />
      </section>

      {/* ═══════════════ THE ARGUMENT ═══════════════ */}
      <section className="lsec" id="argument">
        <div className="lsec__head">
          <p className="mono eyebrow">The argument</p>
          <h2 className="h2">What the market is<br /><em>actually</em> arguing about</h2>
          <p className="lsec__lede">
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

      {/* ═══════════════ FAQ ═══════════════ */}
      <section className="lsec" id="questions">
        <div className="lsec__head">
          <p className="mono eyebrow">Questions</p>
          <h2 className="h2">The ones worth asking</h2>
        </div>
        <Faq items={faqs} />
      </section>

      {/* ═══════════════ CTA ═══════════════ */}
      <section className="cta" id="cta">
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
