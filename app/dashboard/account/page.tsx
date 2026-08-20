import { loadViewer } from "@/lib/viewer";
import { US_STATES } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Account() {
  const v = await loadViewer();
  const stateName =
    US_STATES.find(([c]) => c === v.user.state)?.[1] ?? v.user.state;

  return (
    <>
      <div className="block__head block__head--page">
        <div>
          <h1 className="page__h">Account</h1>
          <p className="page__sub">Identity, security and active sessions.</p>
        </div>
        <span className="mono page__meta">
          {v.sessions.length} session{v.sessions.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="split">
        <section className="block">
          <div className="block__head">
            <h2 className="block__h">Security</h2>
          </div>
          <dl className="dspecs">
            <div>
              <dt>Name</dt>
              <dd>{v.user.first_name} {v.user.last_name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{v.user.email} <span className="chip chip--ok">Verified</span></dd>
            </div>
            <div>
              <dt>Residence</dt>
              <dd>{stateName}</dd>
            </div>
            <div>
              <dt>Two-step verification</dt>
              <dd><span className="chip chip--ok">On</span> Required at every sign-in.</dd>
            </div>
            <div>
              <dt>Opened</dt>
              <dd className="mono">
                {new Date(v.user.created_at).toLocaleDateString("en-US", {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </dd>
            </div>
            <div>
              <dt>Funding</dt>
              <dd><span className="chip">Not connected</span></dd>
            </div>
          </dl>
        </section>

        <aside className="side">
          <div className="panel">
            <div className="panel__head">
              <h2 className="panel__h">Sessions</h2>
              <span className="mono panel__meta">{v.sessions.length}</span>
            </div>
            <ul className="mini2">
              {v.sessions.map((s) => (
                <li key={s.id}>
                  <span className="mini2__n">{s.user_agent ?? "Unknown device"}</span>
                  <span className="mono mini2__v">
                    {new Date(s.created_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel panel--quiet">
            <p className="mono panel__note">
              Funding settles through a licensed provider to a titled custody
              account. We never accept crypto transfer, Zelle, CashApp or gift
              cards, and never ask for your sign-in code.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
