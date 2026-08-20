'use client';

import { useState, useEffect } from 'react';
import { ArrowRight, ShieldCheck, Zap, Activity } from 'lucide-react';

// --- Types ---
interface QuoteData {
  ticker: string;
  price: number;
  change: number;
}

// --- Mock Data (replace with real feed later) ---
const MOCK_QUOTES: QuoteData[] = [
  { ticker: 'SPXC', price: 124.5, change: 2.4 },
  { ticker: 'SNLK', price: 88.2, change: -1.2 },
  { ticker: 'TBCO', price: 45.0, change: 0.8 },
];

export default function Hero() {
  const [quotes, setQuotes] = useState<QuoteData[]>(MOCK_QUOTES);
  const [isClient, setIsClient] = useState(false);

  // Simulate live ticker updates
  useEffect(() => {
    setIsClient(true);

    const interval = setInterval(() => {
      setQuotes((prev) =>
        prev.map((q) => ({
          ...q,
          price: +(q.price + (Math.random() - 0.5) * 0.12).toFixed(2),
          change: +(q.change + (Math.random() - 0.5) * 0.06).toFixed(2),
        }))
      );
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  if (!isClient) return null;

  return (
    <div className="relative w-full min-h-screen bg-black text-white overflow-hidden font-sans selection:bg-green-500/30 selection:text-green-200">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,#1a1a1a_0%,#000000_100%)] z-0" />
      <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] bg-[size:20px_20px] opacity-[0.03] z-0 pointer-events-none" />

      {/* Top bar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-mono text-gray-400 tracking-widest uppercase">
            Apex Terminal
          </span>
        </div>

        <div className="flex items-center gap-6 text-xs font-mono text-gray-500">
          {quotes.map((q) => (
            <span key={q.ticker} className="hidden sm:inline">
              {q.ticker}: {q.price.toFixed(2)} (
              {q.change > 0 ? '+' : ''}
              {q.change.toFixed(2)}%)
            </span>
          ))}
          <a
            href="/dashboard"
            className="text-white hover:text-green-400 transition-colors flex items-center gap-1"
          >
            Launch <ArrowRight size={12} />
          </a>
        </div>
      </nav>

      {/* Main content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32 grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left – Narrative */}
        <div className="lg:col-span-7 flex flex-col justify-center space-y-10">
          {/* Eyebrow */}
          <div className="flex items-center gap-3">
            <div className="h-px w-8 bg-green-500/50" />
            <span className="text-xs font-mono text-green-400 tracking-[0.2em] uppercase">
              Elon Ecosystem · Pre-IPO Access
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] text-white">
            Own the{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600">
              infrastructure
            </span>{' '}
            of tomorrow.
          </h1>

          {/* Lede */}
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl leading-relaxed border-l-2 border-white/10 pl-6">
            Public markets, live. Private ventures, marked. One account.
            <span className="block text-sm text-gray-500 mt-2 font-mono">
              No guesswork. Just equity.
            </span>
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap gap-4 pt-2">
            <button className="group relative px-8 py-3 bg-white text-black font-semibold text-sm tracking-wide hover:bg-gray-200 transition-colors flex items-center gap-2">
              <Zap size={16} className="text-yellow-500" />
              Start Trading
              <ArrowRight
                size={16}
                className="opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0"
              />
            </button>
            <button className="px-8 py-3 border border-white/20 text-gray-300 font-mono text-sm hover:border-white/50 hover:text-white transition-colors">
              View SPV Structure
            </button>
          </div>

          {/* Differentiator cards */}
          <div className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="p-4 border border-white/5 bg-white/[0.02] rounded-sm">
              <div className="flex items-center gap-2 mb-2 text-xs font-mono text-gray-500 uppercase tracking-wider">
                <Activity size={12} />
                <span>Live Quote</span>
              </div>
              <p className="text-sm text-gray-300">
                Price of the last trade. Real-time, exchange-driven.
              </p>
            </div>
            <div className="p-4 border border-white/5 bg-white/[0.02] rounded-sm">
              <div className="flex items-center gap-2 mb-2 text-xs font-mono text-gray-500 uppercase tracking-wider">
                <ShieldCheck size={12} />
                <span>Independent Mark</span>
              </div>
              <p className="text-sm text-gray-300">
                True value. Updated quarterly by independent auditors.
              </p>
            </div>
          </div>
        </div>

        {/* Right – Terminal cards */}
        <div className="lg:col-span-5 hidden lg:flex flex-col justify-center space-y-5">
          <TerminalCard
            ticker="SPXC"
            name="SpaceX (Indirect)"
            price={quotes[0]?.price}
            change={quotes[0]?.change}
            type="public"
          />
          <TerminalCard
            ticker="SNLK"
            name="Symbotic"
            price={quotes[1]?.price}
            change={quotes[1]?.change}
            type="public"
          />
          <TerminalCard
            ticker="TBCO"
            name="The Bionic Co."
            price={quotes[2]?.price}
            change={quotes[2]?.change}
            type="private"
          />

          <div className="mt-2 flex items-center justify-between text-xs font-mono text-gray-600 border-t border-white/5 pt-4">
            <span>LIVE FEED · NASDAQ / PRIVATE MARKS</span>
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              CONNECTED
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Terminal Card ---
function TerminalCard({
  ticker,
  name,
  price,
  change,
  type,
}: {
  ticker: string;
  name: string;
  price?: number;
  change?: number;
  type: 'public' | 'private';
}) {
  const isPositive = (change ?? 0) >= 0;
  const colorClass = isPositive ? 'text-green-400' : 'text-red-400';
  const bgClass =
    type === 'private'
      ? 'border-blue-500/20 bg-blue-500/5'
      : 'border-white/5 bg-white/[0.02]';

  return (
    <div
      className={`p-4 border ${bgClass} rounded-sm group hover:border-white/20 transition-all cursor-pointer`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm text-white tracking-wide">
            {ticker}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border ${
              type === 'private'
                ? 'border-blue-500/30 text-blue-400'
                : 'border-white/10 text-gray-500'
            }`}
          >
            {type === 'private' ? 'PRIVATE' : 'PUBLIC'}
          </span>
        </div>
        <div className="font-mono text-lg text-white">
          {price !== undefined ? `$${price.toFixed(2)}` : '---'}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-mono">{name}</span>
        <div className={`flex items-center gap-1 text-xs font-mono ${colorClass}`}>
          {isPositive ? '+' : ''}
          {(change ?? 0).toFixed(2)}%
        </div>
      </div>
    </div>
  );
}