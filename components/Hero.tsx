'use client';

import { useEffect, useRef, useState } from 'react';
import ScrollSequence from './ScrollSequence';

const DESKTOP = {
  src: (i: number) => `/seq/iris_${String(i).padStart(4, '0')}.webp`,
  frameCount: 96,
  width: 1920,
  height: 1080,
};

const MOBILE = {
  src: (i: number) => `/seq-m/iris_${String(i).padStart(4, '0')}.webp`,
  frameCount: 64,
  width: 1080,
  height: 1350,
};

// Three hero panels — each owns a third of the scroll range
const PANELS = [
  {
    id: 'p1',
    eyebrow: 'Public Markets · Live',
    headline: ['Own the', 'infrastructure', 'of tomorrow.'],
    accentLine: 1,
    lede: 'Seven tickers. Quoted live. One account.',
    ctas: [
      { label: 'Start Trading', href: '/dashboard', solid: true },
      { label: 'View markets', href: '/dashboard/market', solid: false },
    ],
    readout: ['SPCX · $312.40', 'TSLA · $248.20', 'NVDA · $135.90'],
  },
  {
    id: 'p2',
    eyebrow: 'Private Ventures · Marked',
    headline: ['Private access,', 'properly', 'priced.'],
    accentLine: 1,
    lede: 'Neuralink. Boring Co. Marked to a dated event — not invented.',
    ctas: [
      { label: 'See private names', href: '#private', solid: true },
      { label: 'How marks work', href: '#private', solid: false },
    ],
    readout: ['No continuous quote', 'One figure · one date', 'One basis'],
  },
  {
    id: 'p3',
    eyebrow: 'The Elon Ecosystem',
    headline: ['One chief', 'executive.', 'Seven names.'],
    accentLine: 0,
    lede: 'Two public companies. Two private. Three divisions. All in one view.',
    ctas: [
      { label: 'Join waitlist', href: '#cta', solid: true },
      { label: 'Read the argument', href: '#argument', solid: false },
    ],
    readout: ['SpaceX IPO · Jun 2026', 'Tesla · NASDAQ', 'xAI · Private'],
  },
];

export default function Hero() {
  const [progress, setProgress] = useState(0);

  // Which panel is active (0, 1, 2)
  const panel = Math.min(2, Math.floor(progress * 3));
  // Local progress within this panel (0–1)
  const local = Math.min(1, (progress * 3) - panel);

  // Fade: in for first 0–0.2 of local, out for last 0.8–1.0 of local
  const opacity = local < 0.15
    ? local / 0.15
    : local > 0.82
      ? Math.max(0, (1 - local) / 0.18)
      : 1;

  const ty = local < 0.15 ? (1 - local / 0.15) * 28 : local > 0.82 ? -(local - 0.82) / 0.18 * 28 : 0;

  const p = PANELS[panel];

  return (
    <ScrollSequence
      desktop={DESKTOP}
      mobile={MOBILE}
      scrollLength={4.2}
      mobileScrollLength={3.2}
      damping={0.13}
      onProgress={setProgress}
    >
      {/* ── overlay ── */}
      <div className="hero">
        {/* nav */}
        <header className="hero__nav">
          <div className="wordmark">
            InveX<span>t</span>
          </div>
          <nav aria-label="Primary">
            <a href="#market">Markets</a>
            <a href="#private">Private</a>
            <a href="#argument">Thesis</a>
            <a href="/dashboard">Dashboard</a>
          </nav>
        </header>

        {/* version tag */}
        <p className="hero__ver mono">v2 · Aug 2026</p>

        {/* panels */}
        <div className="hero__stage">
          <div
            className="hero__panel"
            style={{
              opacity,
              transform: `translateY(${ty}px)`,
              transition: 'none',
            }}
            key={p.id}
          >
            <p className="mono hero__eyebrow">{p.eyebrow}</p>

            <h1>
              {p.headline.map((line, i) => (
                <span key={i} className={i === p.accentLine ? 'accent-word' : ''}>
                  {line}
                  {i < p.headline.length - 1 && <br />}
                </span>
              ))}
            </h1>

            <p className="hero__lede">{p.lede}</p>

            <div className="hero__actions">
              {p.ctas.map((c) => (
                <a
                  key={c.label}
                  href={c.href}
                  className={c.solid ? 'btn btn--solid' : 'btn'}
                >
                  {c.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* right readout */}
        <div className="hero__readout" style={{ opacity, transition: 'none' }}>
          {p.readout.map((r) => (
            <span key={r} className="mono">{r}</span>
          ))}
        </div>

        {/* panel pip indicator */}
        <div className="hero__pips">
          {PANELS.map((_, i) => (
            <span key={i} className={`hero__pip${i === panel ? ' is-on' : ''}`} />
          ))}
        </div>
      </div>
    </ScrollSequence>
  );
}
