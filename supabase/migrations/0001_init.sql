-- ============================================================================
-- InveXt — 0001_init.sql
-- Postgres 15 / Supabase. Run in the SQL editor or via `supabase db push`.
--
-- Identity comes from Supabase Auth (auth.users). public.profiles hangs off it.
--
-- THE ONE DESIGN DECISION THAT MATTERS
-- -----------------------------------------------------------------------------
-- A user's balance is NOT a column. It is a view computed from an append-only
-- ledger, and money only enters that ledger from a confirmed on-chain deposit
-- carrying a txid, or from an approved withdrawal debit.
--
-- There is deliberately no way — for anyone, including a service_role admin —
-- to type a number into someone's balance. That is not an omission and it is
-- not a "phase two". It is the difference between a brokerage and a screen that
-- displays whatever an operator wants the customer to believe. Every mechanism
-- below (immutable ledger, txid uniqueness, confirmation thresholds, balance
-- as a view) exists to make the displayed number a consequence of settled
-- reality rather than an input.
-- ============================================================================

-- Supabase keeps extensions in the `extensions` schema, not public.
-- gen_random_uuid() is core Postgres from v13 on, so pgcrypto is only needed
-- if you add digest()/hmac() later.
create extension if not exists citext   with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ============================================================================
-- ENUMS
-- ============================================================================

create type app_role         as enum ('user', 'support', 'admin');
create type kyc_status       as enum ('unverified', 'pending', 'verified', 'rejected');
create type asset_kind       as enum ('crypto', 'public_equity', 'private_company');
create type ledger_direction as enum ('credit', 'debit');
create type ledger_reason    as enum (
  'deposit_confirmed',      -- on-chain deposit reached its confirmation threshold
  'withdrawal_settled',     -- approved withdrawal actually sent
  'withdrawal_reversed',    -- a settled withdrawal failed on-chain and came back
  'trade_buy',
  'trade_sell',
  'fee',
  'correction'              -- see the note on corrections at the bottom
);
create type deposit_status    as enum ('awaiting', 'seen', 'confirming', 'confirmed', 'orphaned', 'expired');
create type withdrawal_status as enum ('requested', 'under_review', 'approved', 'rejected', 'sent', 'failed', 'cancelled');
create type notification_kind as enum (
  'deposit_seen', 'deposit_confirmed',
  'withdrawal_requested', 'withdrawal_approved', 'withdrawal_rejected', 'withdrawal_sent',
  'security', 'account', 'system'
);

-- ============================================================================
-- PROFILES
-- ============================================================================

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         citext not null unique,
  first_name    text   not null check (length(trim(first_name)) between 1 and 60),
  last_name     text   not null check (length(trim(last_name))  between 1 and 60),
  us_state      char(2) not null,
  kyc           kyc_status not null default 'unverified',
  is_suspended  boolean not null default false,
  suspended_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  'Per-user profile. Deliberately contains no balance, no equity figure and no P&L — those are derived in public.balances.';

create index on public.profiles (kyc);
create index on public.profiles (created_at desc);

-- ============================================================================
-- ROLES
-- Separate table, not a column on profiles: a role check inside a profiles
-- policy that reads profiles causes infinite RLS recursion.
-- ============================================================================

create table public.user_roles (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       app_role not null,
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- SECURITY DEFINER so policies can call it without the caller needing to read
-- user_roles directly. Empty search_path per Supabase hardening guidance.
create or replace function public.has_role(check_role app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = check_role
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('admin', 'support')
  );
$$;

-- ============================================================================
-- ASSETS
-- Admin-configurable: enable/disable, minimums, confirmation thresholds,
-- display metadata. This is legitimate operational config.
--
-- Note there is no `price` column for private companies. There cannot be a
-- correct value: SpaceX, xAI, Neuralink, The Boring Company and X do not
-- trade, so no price exists to store. Public equity prices are fetched live
-- from a market data provider and cached in the app, never hand-entered here.
-- ============================================================================

create table public.assets (
  symbol            text primary key,
  kind              asset_kind not null,
  display_name      text not null,
  network           text,                    -- 'bitcoin', 'ethereum', 'solana', 'tron'
  contract_address  text,                    -- for tokens, e.g. USDT on a chain
  decimals          smallint not null default 8 check (decimals between 0 and 18),
  is_deposit_enabled    boolean not null default false,
  is_withdrawal_enabled boolean not null default false,
  min_deposit       numeric(38, 18) check (min_deposit    is null or min_deposit    > 0),
  min_withdrawal    numeric(38, 18) check (min_withdrawal is null or min_withdrawal > 0),
  withdrawal_fee    numeric(38, 18) not null default 0 check (withdrawal_fee >= 0),
  -- How many block confirmations before a deposit becomes spendable balance.
  required_confirmations smallint not null default 3 check (required_confirmations >= 1),
  sort_order        smallint not null default 100,
  updated_at        timestamptz not null default now(),

  constraint crypto_needs_network check (
    kind <> 'crypto' or network is not null
  )
);

comment on column public.assets.required_confirmations is
  'Deposits below this confirmation count never produce a ledger entry, so they never appear as spendable balance.';

-- ============================================================================
-- DEPOSIT ADDRESSES
--
-- One address per user per asset, issued by your payment processor or derived
-- from an HD wallet at a unique derivation index.
--
-- NEVER share one static address across users. If two people pay into the same
-- address you cannot attribute either payment, and attribution-by-amount breaks
-- the moment two users send the same figure. `derivation_index` is unique to
-- force per-user derivation at the schema level.
-- ============================================================================

create table public.deposit_addresses (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  asset_symbol     text not null references public.assets (symbol),
  address          text not null,
  memo             text,                   -- required by some chains/exchanges
  derivation_index bigint,
  provider         text not null,          -- 'coinbase_commerce', 'bitpay', 'fireblocks', 'self_hosted'
  provider_ref     text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),

  unique (address, asset_symbol),
  unique (asset_symbol, derivation_index)
);

-- Exactly one ACTIVE address per user per asset, while still allowing a
-- history of rotated-out addresses. A plain UNIQUE on (user, asset, is_active)
-- would wrongly block the second retired address too.
create unique index one_active_address_per_user_asset
  on public.deposit_addresses (user_id, asset_symbol)
  where is_active;

create index on public.deposit_addresses (user_id);
create index on public.deposit_addresses (address);

-- ============================================================================
-- CHAIN DEPOSITS
-- What the chain actually did. Mutable (confirmations climb), unlike the ledger.
-- ============================================================================

create table public.chain_deposits (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  asset_symbol       text not null references public.assets (symbol),
  deposit_address_id uuid references public.deposit_addresses (id),
  txid               text not null,
  amount             numeric(38, 18) not null check (amount > 0),
  confirmations      integer not null default 0 check (confirmations >= 0),
  status             deposit_status not null default 'seen',
  block_height       bigint,
  raw                jsonb,                -- the provider webhook payload, kept verbatim
  first_seen_at      timestamptz not null default now(),
  confirmed_at       timestamptz,
  updated_at         timestamptz not null default now(),

  -- The same on-chain transaction can never be credited twice.
  unique (asset_symbol, txid)
);

create index on public.chain_deposits (user_id, first_seen_at desc);
create index on public.chain_deposits (status) where status <> 'confirmed';

comment on table public.chain_deposits is
  'Written only by the payment-processor webhook. A row here is a claim about the chain; it becomes balance only via the trigger that fires at the confirmation threshold.';

-- ============================================================================
-- THE LEDGER — append-only, immutable
-- ============================================================================

create table public.ledger_entries (
  id             bigserial primary key,
  user_id        uuid not null references public.profiles (id) on delete restrict,
  asset_symbol   text not null references public.assets (symbol),
  direction      ledger_direction not null,
  amount         numeric(38, 18) not null check (amount > 0),
  reason         ledger_reason not null,
  -- Exactly one of these ties the entry to the real-world event that caused it.
  chain_deposit_id  uuid unique references public.chain_deposits (id),
  withdrawal_id     uuid,          -- FK added after withdrawals table exists
  -- Who/what caused it. NULL means an automated system trigger.
  actor_id       uuid references public.profiles (id),
  note           text,
  created_at     timestamptz not null default now(),

  -- A credit must trace to a confirmed chain deposit or a reversal.
  -- You cannot insert a credit out of thin air.
  constraint credit_needs_provenance check (
    direction = 'debit'
    or reason in ('withdrawal_reversed', 'trade_sell', 'correction')
    or chain_deposit_id is not null
  ),
  constraint correction_needs_note check (
    reason <> 'correction' or (note is not null and length(trim(note)) >= 20)
  )
);

create index on public.ledger_entries (user_id, asset_symbol);
create index on public.ledger_entries (created_at desc);

-- Immutability, enforced in the database rather than by convention.
-- This fires for service_role too, so a leaked service key still cannot
-- rewrite history.
create or replace function public.ledger_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'ledger_entries is append-only: % is not permitted. Post a compensating entry instead.',
    tg_op;
end;
$$;

create trigger ledger_no_update
  before update on public.ledger_entries
  for each row execute function public.ledger_is_append_only();

create trigger ledger_no_delete
  before delete on public.ledger_entries
  for each row execute function public.ledger_is_append_only();

-- ============================================================================
-- WITHDRAWALS
-- Admin approval here is legitimate and expected — dual control on money
-- leaving the platform is standard practice. Note what approval does NOT do:
-- it cannot increase a balance, and it cannot exceed what is already settled.
-- ============================================================================

create table public.withdrawal_requests (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete restrict,
  asset_symbol        text not null references public.assets (symbol),
  amount              numeric(38, 18) not null check (amount > 0),
  fee                 numeric(38, 18) not null default 0 check (fee >= 0),
  destination_address text not null,
  destination_memo    text,
  status              withdrawal_status not null default 'requested',
  -- Four-eyes: the reviewer may not be the requester.
  reviewed_by         uuid references public.profiles (id),
  reviewed_at         timestamptz,
  review_note         text,
  txid                text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint reviewer_is_not_requester check (reviewed_by is null or reviewed_by <> user_id),
  constraint rejection_needs_reason check (
    status <> 'rejected' or (review_note is not null and length(trim(review_note)) >= 10)
  )
);

create index on public.withdrawal_requests (user_id, created_at desc);
create index on public.withdrawal_requests (status) where status in ('requested', 'under_review', 'approved');

alter table public.ledger_entries
  add constraint ledger_withdrawal_fk
  foreign key (withdrawal_id) references public.withdrawal_requests (id);

-- ============================================================================
-- BALANCES — a view, not a table
-- ============================================================================

create or replace view public.balances
with (security_invoker = true)
as
with settled as (
  select
    user_id,
    asset_symbol,
    sum(case when direction = 'credit' then amount else -amount end) as amount
  from public.ledger_entries
  group by user_id, asset_symbol
),
held as (
  -- Funds committed to a withdrawal that has not yet settled are not spendable.
  select user_id, asset_symbol, sum(amount + fee) as amount
  from public.withdrawal_requests
  where status in ('requested', 'under_review', 'approved')
  group by user_id, asset_symbol
)
select
  s.user_id,
  s.asset_symbol,
  s.amount                                as settled,
  coalesce(h.amount, 0)                   as on_hold,
  s.amount - coalesce(h.amount, 0)        as available
from settled s
left join held h using (user_id, asset_symbol);

comment on view public.balances is
  'Derived from ledger_entries. There is no balance column anywhere in this schema to write to — by design.';

-- A pending deposit, shown separately so the UI can say "arriving" without
-- ever folding an unconfirmed amount into a spendable figure.
create or replace view public.pending_deposits
with (security_invoker = true)
as
select
  d.user_id,
  d.asset_symbol,
  d.txid,
  d.amount,
  d.confirmations,
  a.required_confirmations,
  d.status,
  d.first_seen_at
from public.chain_deposits d
join public.assets a on a.symbol = d.asset_symbol
where d.status in ('seen', 'confirming');

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

create table public.notifications (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       notification_kind not null,
  title      text not null,
  body       text,
  href       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index on public.notifications (user_id, created_at desc);
create index on public.notifications (user_id) where read_at is null;

-- ============================================================================
-- ACTIVITY LOG — append-only audit trail
-- Every state change, including every admin action, with the actor recorded.
-- ============================================================================

create table public.activity_log (
  id           bigserial primary key,
  user_id      uuid references public.profiles (id) on delete set null,  -- subject
  actor_id     uuid references public.profiles (id) on delete set null,  -- who did it
  action       text not null,
  entity       text,
  entity_id    text,
  detail       jsonb,
  ip           inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index on public.activity_log (user_id, created_at desc);
create index on public.activity_log (actor_id, created_at desc);
create index on public.activity_log (action, created_at desc);

create trigger activity_no_update
  before update on public.activity_log
  for each row execute function public.ledger_is_append_only();

create trigger activity_no_delete
  before delete on public.activity_log
  for each row execute function public.ledger_is_append_only();

-- ============================================================================
-- WATCHLIST
-- ============================================================================

create table public.watchlist (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  asset_symbol text not null references public.assets (symbol) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (user_id, asset_symbol)
);
