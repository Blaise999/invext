"use client";

import { usePathname } from "next/navigation";

/**
 * The panel beside the form.
 *
 * It replaces a static caption with the thing people actually want to know
 * before typing their details in: what this is going to ask of them, and how
 * far through they are. The stages are the real route — /signup, /verify, then
 * the account — so the rail is accurate rather than decorative.
 *
 * Styled as a receipt: mono type, hairline rules, a torn edge. That is the
 * product's own vernacular — this is a platform whose whole argument is that
 * every figure carries a date, a basis and an author — so the sign-up flow is
 * presented as an entry being written rather than a funnel being completed.
 */

const STAGES = [
  {
    match: (p: string) => p.startsWith("/signup"),
    k: "Account",
    title: "Your details",
    body: "Legal name, email and state of residence. Two minutes.",
  },
  {
    match: (p: string) => p.startsWith("/verify"),
    k: "Verify",
    title: "A code by email",
    body: "Six digits, valid for ten minutes. Required on every sign-in, not just the first.",
  },
  {
    match: () => false,
    k: "Open",
    title: "Account opens",
    body: "Fund it when you're ready. Nothing is held until you deposit.",
  },
];

export default function AuthAside() {
  const path = usePathname() ?? "";
  const activeIndex = STAGES.findIndex((s) => s.match(path));
  const signingIn = path.startsWith("/login");

  return (
    <aside className="auth__aside">
      <div className="auth__asideInner">
        <div className="receipt">
          <p className="mono receipt__head">
            {signingIn ? "Signing in" : "Opening an account"}
          </p>

          <ol className="receipt__rail">
            {STAGES.map((s, i) => {
              const state =
                signingIn
                  ? i === 0
                    ? "done"
                    : i === 1
                      ? "now"
                      : "next"
                  : i < activeIndex
                    ? "done"
                    : i === activeIndex
                      ? "now"
                      : "next";

              return (
                <li key={s.k} className={`receipt__stage is-${state}`}>
                  <span className="mono receipt__k">{s.k}</span>
                  <span className="receipt__title">{s.title}</span>
                  <span className="receipt__body">{s.body}</span>
                </li>
              );
            })}
          </ol>

          <div className="receipt__tear" aria-hidden="true" />

          <dl className="receipt__facts">
            <div>
              <dt className="mono">Listed names</dt>
              <dd>Quoted live, end-of-day</dd>
            </div>
            <div>
              <dt className="mono">Private names</dt>
              <dd>Priced to a dated mark</dd>
            </div>
            <div>
              <dt className="mono">Every sign-in</dt>
              <dd>Password, then a code</dd>
            </div>
          </dl>
        </div>
      </div>
    </aside>
  );
}
