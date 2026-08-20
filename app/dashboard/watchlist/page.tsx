// app/dashboard/watchlist/page.tsx
import Link from "next/link";
import { loadViewer } from "@/lib/viewer";
import { privateCos } from "@/lib/data";
import Logo from "@/components/dash/Logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Watchlist() {
  await loadViewer();

  return (
    <>
      <div className="block__head block__head--page">
        <div>
          <h1 className="page__h">Private watchlist</h1>
          <p className="page__sub">
            Single-asset vehicles, priced to their most recent recorded mark.
            Each mark carries its date, its basis and the name of whoever
            recorded it.
          </p>
        </div>
        <span className="mono page__meta">{privateCos.length} companies</span>
      </div>

      <div className="pgrid">
        {privateCos.map((c) => (
          <Link
            className="pcard"
            key={c.name}
            href={`/dashboard/stock/${c.short}`}
          >
            <header className="pcard__top">
              <Logo symbol={c.short} size={44} />
              <span className="mono pcard__tag">Treaty-enabled</span>
            </header>
            <h2 className="pcard__name">{c.name}</h2>
            <p className="pcard__what">{c.what}</p>
            <p className="pcard__detail">{c.detail}</p>
            <dl className="pcard__meta">
              <div>
                <dt>Founded</dt>
                <dd>{c.founded}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{c.stage}</dd>
              </div>
              <div>
                <dt>Last price</dt>
                <dd className="pcard__none">Synthetic · watch public</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>

      <div className="warn">
        <p className="mono warn__k">Why there's no ticking price</p>
        <p>
          These companies are private, so no exchange is matching buyers and
          sellers minute by minute. Units are priced to a dated mark instead,
          which holds until the next event moves it — that&rsquo;s why the
          chart steps rather than slopes. SpaceX left this list in June 2026
          when it listed as SPCX. Grok, X and Starlink were never on it; they
          are divisions inside SPCX.{" "}
          <Link href="/#private">Full breakdown</Link>.
        </p>
      </div>
    </>
  );
}