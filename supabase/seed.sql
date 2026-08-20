-- ============================================================================
-- InveXt — seed.sql
-- Asset configuration. Everything here is admin-editable at runtime.
-- Deposits ship DISABLED. Enable them only once a real payment processor is
-- wired to the webhook and you have tested a confirmed deposit end to end.
-- ============================================================================

insert into public.assets
  (symbol, kind, display_name, network, contract_address, decimals,
   is_deposit_enabled, is_withdrawal_enabled,
   min_deposit, min_withdrawal, withdrawal_fee, required_confirmations, sort_order)
values
  -- Crypto funding rails
  ('BTC',       'crypto', 'Bitcoin',            'bitcoin',  null, 8,  false, false, 0.0005, 0.001,  0.00005, 2,  10),
  ('ETH',       'crypto', 'Ethereum',           'ethereum', null, 18, false, false, 0.005,  0.01,   0.0015,  12, 20),
  ('SOL',       'crypto', 'Solana',             'solana',   null, 9,  false, false, 0.05,   0.1,    0.001,   32, 30),
  ('USDT-ERC20','crypto', 'Tether (Ethereum)',  'ethereum',
     '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6, false, false, 20, 25, 3, 12, 40),
  ('USDT-TRC20','crypto', 'Tether (Tron)',      'tron',
     'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',         6, false, false, 20, 25, 1, 20, 50),
  ('USDT-SPL',  'crypto', 'Tether (Solana)',    'solana',
     'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 6, false, false, 20, 25, 1, 32, 60),

  -- Public equities. No price column — quotes come from the market data
  -- provider at request time and are never stored here.
  -- SpaceX has traded on Nasdaq as SPCX since its IPO on 12 June 2026. Grok, X
  -- and Starlink are divisions/subsidiaries inside it, not separate tickers.
  ('SPCX', 'public_equity', 'Space Exploration Technologies (SPCX)', null, null, 2, false, false, null, null, 0, 1, 90),
  ('TSLA', 'public_equity', 'Tesla, Inc.',            null, null, 2, false, false, null, null, 0, 1, 100),
  ('NVDA', 'public_equity', 'NVIDIA Corp.',           null, null, 2, false, false, null, null, 0, 1, 110),
  ('AAPL', 'public_equity', 'Apple Inc.',             null, null, 2, false, false, null, null, 0, 1, 120),
  ('AMZN', 'public_equity', 'Amazon.com, Inc.',       null, null, 2, false, false, null, null, 0, 1, 130),
  ('PLTR', 'public_equity', 'Palantir Technologies',  null, null, 2, false, false, null, null, 0, 1, 140),
  ('RIVN', 'public_equity', 'Rivian Automotive',      null, null, 2, false, false, null, null, 0, 1, 150),

  -- Still private. Tracked for information only. No price exists to store, and
  -- there is deliberately no price column to store one in.
  ('NEURALINK','private_company', 'Neuralink',            null, null, 0, false, false, null, null, 0, 1, 220),
  ('BORING',   'private_company', 'The Boring Company',   null, null, 0, false, false, null, null, 0, 1, 230)
on conflict (symbol) do nothing;

-- Grant yourself admin AFTER signing up through the app:
--   insert into public.user_roles (user_id, role)
--   select id, 'admin' from public.profiles where email = 'you@yourdomain.com'
--   on conflict do nothing;
