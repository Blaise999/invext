-- ============================================================================
--  InveXt — COMPLETE SCHEMA, SINGLE FILE
--
--  Paste the whole file into the Supabase SQL editor and run it once.
--  Safe to re-run against an existing database.
--
--    1. Extensions and enums
--    2. Tables, views
--    3. Functions and triggers
--    4. Row Level Security
--    5. Grants and Realtime
--    6. SpaceX IPO reconciliation
--    7. Seed data
--    8. Post-install checklist
--
--  ONE THING TO UNDERSTAND FIRST
--
--  A balance is not a column. `public.balances` is a VIEW over an append-only
--  ledger, and value only enters that ledger from a confirmed on-chain deposit
--  carrying a txid, or from an approved withdrawal debit. There is nothing here
--  for anyone — including a service_role admin — to type a balance into.
--
--  Ledger rows also cannot be updated or deleted: triggers reject both
--  unconditionally, and triggers fire for service_role too, so a leaked service
--  key can append but never rewrite history. To reverse something you post a
--  compensating entry, and both rows stay visible.
-- ============================================================================


-- ============================================================================
--  1. EXTENSIONS AND ENUMS
-- ============================================================================

do $$ begin
  create type app_role as enum ('user', 'support', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type kyc_status as enum ('unverified', 'pending', 'verified', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type asset_kind as enum ('crypto', 'public_equity', 'private_company');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ledger_direction as enum ('credit', 'debit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ledger_reason as enum ('deposit_confirmed', -- on-chain deposit reached its confirmation threshold 'withdrawal_settled', -- approved withdrawal actually sent 'withdrawal_reversed', -- a settled withdrawal failed on-chain and came back 'trade_buy', 'trade_sell', 'fee', 'correction' -- see the note on corrections at the bottom);
exception when duplicate_object then null; end $$;

do $$ begin
  create type deposit_status as enum ('awaiting', 'seen', 'confirming', 'confirmed', 'orphaned', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type withdrawal_status as enum ('requested', 'under_review', 'approved', 'rejected', 'sent', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_kind as enum ('deposit_seen', 'deposit_confirmed', 'withdrawal_requested', 'withdrawal_approved', 'withdrawal_rejected', 'withdrawal_sent', 'security', 'account', 'system');
exception when duplicate_object then null; end $$;

-- ============================================================================
--  2. TABLES AND VIEWS
-- ============================================================================
create extension if not exists citext   with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ============================================================================
-- PROFILES
-- ============================================================================

create table if not exists public.profiles (
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

create index if not exists ix_1 on public.profiles (kyc);
create index if not exists ix_2 on public.profiles (created_at desc);

-- ============================================================================
-- ROLES
-- Separate table, not a column on profiles: a role check inside a profiles
-- policy that reads profiles causes infinite RLS recursion.
-- ============================================================================

create table if not exists public.user_roles (
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

create table if not exists public.assets (
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

create table if not exists public.deposit_addresses (
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
create unique index if not exists one_active_address_per_user_asset
  on public.deposit_addresses (user_id, asset_symbol)
  where is_active;

create index if not exists ix_3 on public.deposit_addresses (user_id);
create index if not exists ix_4 on public.deposit_addresses (address);

-- ============================================================================
-- CHAIN DEPOSITS
-- What the chain actually did. Mutable (confirmations climb), unlike the ledger.
-- ============================================================================

create table if not exists public.chain_deposits (
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

create index if not exists ix_5 on public.chain_deposits (user_id, first_seen_at desc);
create index if not exists ix_6 on public.chain_deposits (status) where status <> 'confirmed';

comment on table public.chain_deposits is
  'Written only by the payment-processor webhook. A row here is a claim about the chain; it becomes balance only via the trigger that fires at the confirmation threshold.';

-- ============================================================================
-- THE LEDGER — append-only, immutable
-- ============================================================================

create table if not exists public.ledger_entries (
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

create index if not exists ix_7 on public.ledger_entries (user_id, asset_symbol);
create index if not exists ix_8 on public.ledger_entries (created_at desc);

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

create table if not exists public.withdrawal_requests (
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

create index if not exists ix_9 on public.withdrawal_requests (user_id, created_at desc);
create index if not exists ix_10 on public.withdrawal_requests (status) where status in ('requested', 'under_review', 'approved');

do $$ begin
  alter table public.ledger_entries
    add constraint ledger_withdrawal_fk
    foreign key (withdrawal_id) references public.withdrawal_requests (id);
exception when duplicate_object then null; end $$;

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

create table if not exists public.notifications (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       notification_kind not null,
  title      text not null,
  body       text,
  href       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ix_11 on public.notifications (user_id, created_at desc);
create index if not exists ix_12 on public.notifications (user_id) where read_at is null;

-- ============================================================================
-- ACTIVITY LOG — append-only audit trail
-- Every state change, including every admin action, with the actor recorded.
-- ============================================================================

create table if not exists public.activity_log (
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

create index if not exists ix_13 on public.activity_log (user_id, created_at desc);
create index if not exists ix_14 on public.activity_log (actor_id, created_at desc);
create index if not exists ix_15 on public.activity_log (action, created_at desc);

create trigger activity_no_update
  before update on public.activity_log
  for each row execute function public.ledger_is_append_only();

create trigger activity_no_delete
  before delete on public.activity_log
  for each row execute function public.ledger_is_append_only();

-- ============================================================================
-- WATCHLIST
-- ============================================================================

create table if not exists public.watchlist (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  asset_symbol text not null references public.assets (symbol) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (user_id, asset_symbol)
);


-- ---------------------------------------------------------------------------
-- Triggers and policies cannot be created twice. Dropped here so the whole
-- file is safe to re-run against an existing database.
-- ---------------------------------------------------------------------------
drop trigger if exists ledger_no_update    on public.ledger_entries;
drop trigger if exists ledger_no_delete    on public.ledger_entries;
drop trigger if exists activity_no_update  on public.activity_log;
drop trigger if exists activity_no_delete  on public.activity_log;
drop trigger if exists deposit_status_ins  on public.chain_deposits;
drop trigger if exists deposit_status_upd  on public.chain_deposits;
drop trigger if exists deposit_apply_ins   on public.chain_deposits;
drop trigger if exists deposit_apply_upd   on public.chain_deposits;
drop trigger if exists t_profiles_touch    on public.profiles;
drop trigger if exists t_assets_touch      on public.assets;
drop trigger if exists t_withdrawals_touch on public.withdrawal_requests;
drop trigger if exists t_deposits_touch    on public.chain_deposits;
drop trigger if exists on_auth_user_created on auth.users;

drop policy if exists "read own profile"              on public.profiles;
drop policy if exists "update own profile"            on public.profiles;
drop policy if exists "admin updates profiles"        on public.profiles;
drop policy if exists "read own roles"                on public.user_roles;
drop policy if exists "admin manages roles"           on public.user_roles;
drop policy if exists "anyone reads assets"           on public.assets;
drop policy if exists "admin edits assets"            on public.assets;
drop policy if exists "read own deposit addresses"    on public.deposit_addresses;
drop policy if exists "read own deposits"             on public.chain_deposits;
drop policy if exists "read own ledger"               on public.ledger_entries;
drop policy if exists "read own withdrawals"          on public.withdrawal_requests;
drop policy if exists "cancel own pending withdrawal" on public.withdrawal_requests;
drop policy if exists "read own notifications"        on public.notifications;
drop policy if exists "update own notifications"      on public.notifications;
drop policy if exists "read own activity"             on public.activity_log;
drop policy if exists "manage own watchlist"          on public.watchlist;

-- ============================================================================
--  3-5. FUNCTIONS, TRIGGERS, RLS, GRANTS
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, us_state)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.raw_user_meta_data ->> 'us_state', 'XX')
  );

  insert into public.user_roles (user_id, role) values (new.id, 'user');

  insert into public.notifications (user_id, kind, title, body, href)
  values (
    new.id,
    'account',
    'Welcome to InveXt',
    'Your account is active. Six of the companies we track are public securities '
      || 'with live quotes; five are private and have no share price at all. '
      || 'We will never ask you to send funds by Zelle, gift card, or to a personal wallet.',
    '/dashboard'
  );

  insert into public.activity_log (user_id, actor_id, action, entity, entity_id)
  values (new.id, new.id, 'account.created', 'profile', new.id::text);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 2. DEPOSIT CONFIRMATION -> LEDGER CREDIT
--
-- This is the ONLY path by which a crypto deposit becomes spendable balance.
-- It fires when the webhook raises `confirmations` to the asset's threshold.
-- The unique constraint on ledger_entries.chain_deposit_id makes a double
-- credit impossible even if the provider replays the webhook.
-- ============================================================================

-- Stage 1 (BEFORE): decide the status. Touches only NEW, writes nothing.
create or replace function public.deposit_set_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  need smallint;
begin
  select required_confirmations into need
  from public.assets where symbol = new.asset_symbol;

  if new.confirmations >= coalesce(need, 3) then
    if new.status <> 'confirmed' then
      new.status       := 'confirmed';
      new.confirmed_at := coalesce(new.confirmed_at, now());
    end if;
  elsif new.confirmations = 0 then
    new.status := 'seen';
  else
    new.status := 'confirming';
  end if;

  return new;
end;
$$;

create trigger deposit_status_ins
  before insert on public.chain_deposits
  for each row execute function public.deposit_set_status();

create trigger deposit_status_upd
  before update of confirmations on public.chain_deposits
  for each row execute function public.deposit_set_status();

-- Stage 2 (AFTER): now the chain_deposits row exists, so the ledger FK
-- resolves. This is the only path from a chain event to spendable balance.
create or replace function public.deposit_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  min_dep numeric(38, 18);
  need    smallint;
begin
  select min_deposit, required_confirmations into min_dep, need
  from public.assets where symbol = new.asset_symbol;

  -- First sighting: tell the user something is inbound, credit nothing.
  if tg_op = 'INSERT' and new.status in ('seen', 'confirming') then
    insert into public.notifications (user_id, kind, title, body, href)
    values (new.user_id, 'deposit_seen',
            new.asset_symbol || ' deposit detected',
            'Waiting for ' || need || ' confirmations before it becomes available.',
            '/dashboard#activity');

    insert into public.activity_log (user_id, action, entity, entity_id, detail)
    values (new.user_id, 'deposit.seen', 'chain_deposit', new.id::text,
            jsonb_build_object('asset', new.asset_symbol, 'amount', new.amount, 'txid', new.txid));
    return null;
  end if;

  if new.status <> 'confirmed' then
    return null;
  end if;

  -- Already credited (webhook replay, or a later confirmation bump).
  if exists (select 1 from public.ledger_entries where chain_deposit_id = new.id) then
    return null;
  end if;

  -- Under the minimum: recorded and visible, but not credited. Handle manually.
  if min_dep is not null and new.amount < min_dep then
    insert into public.notifications (user_id, kind, title, body, href)
    values (new.user_id, 'deposit_confirmed', 'Deposit below minimum',
            new.asset_symbol || ' deposit of ' || new.amount || ' is under the '
              || min_dep || ' minimum. Contact support.',
            '/dashboard#activity');
    return null;
  end if;

  insert into public.ledger_entries
    (user_id, asset_symbol, direction, amount, reason, chain_deposit_id)
  values
    (new.user_id, new.asset_symbol, 'credit', new.amount, 'deposit_confirmed', new.id)
  on conflict (chain_deposit_id) do nothing;

  insert into public.notifications (user_id, kind, title, body, href)
  values (new.user_id, 'deposit_confirmed',
          new.amount || ' ' || new.asset_symbol || ' available',
          'Confirmed on-chain and credited to your balance.',
          '/dashboard');

  insert into public.activity_log (user_id, action, entity, entity_id, detail)
  values (new.user_id, 'deposit.confirmed', 'chain_deposit', new.id::text,
          jsonb_build_object('asset', new.asset_symbol, 'amount', new.amount,
                             'txid', new.txid, 'confirmations', new.confirmations));
  return null;
end;
$$;

create trigger deposit_apply_ins
  after insert on public.chain_deposits
  for each row execute function public.deposit_apply();

create trigger deposit_apply_upd
  after update of confirmations, status on public.chain_deposits
  for each row execute function public.deposit_apply();

-- ============================================================================
-- 3. WITHDRAWAL REQUEST — cannot exceed available balance
-- ============================================================================

create or replace function public.request_withdrawal(
  p_asset  text,
  p_amount numeric,
  p_address text,
  p_memo    text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_avail  numeric(38, 18);
  v_fee    numeric(38, 18);
  v_min    numeric(38, 18);
  v_enabled boolean;
  v_id     uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from public.profiles where id = v_user and is_suspended) then
    raise exception 'account suspended';
  end if;

  select withdrawal_fee, min_withdrawal, is_withdrawal_enabled
    into v_fee, v_min, v_enabled
  from public.assets where symbol = p_asset;

  if not coalesce(v_enabled, false) then
    raise exception 'withdrawals are not enabled for %', p_asset;
  end if;

  if v_min is not null and p_amount < v_min then
    raise exception 'minimum withdrawal for % is %', p_asset, v_min;
  end if;

  -- Serialise per (user, asset). A row lock is not enough: FOR UPDATE on an
  -- empty result set locks nothing, so two concurrent first-time requests
  -- could both pass the balance check below.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_asset, 0));

  select available into v_avail
  from public.balances
  where user_id = v_user and asset_symbol = p_asset;

  if coalesce(v_avail, 0) < (p_amount + v_fee) then
    raise exception 'insufficient available balance: have %, need %',
      coalesce(v_avail, 0), p_amount + v_fee;
  end if;

  insert into public.withdrawal_requests
    (user_id, asset_symbol, amount, fee, destination_address, destination_memo)
  values (v_user, p_asset, p_amount, v_fee, p_address, p_memo)
  returning id into v_id;

  insert into public.notifications (user_id, kind, title, body, href)
  values (v_user, 'withdrawal_requested',
          'Withdrawal requested',
          p_amount || ' ' || p_asset || ' is on hold pending review.',
          '/dashboard#activity');

  insert into public.activity_log (user_id, actor_id, action, entity, entity_id, detail)
  values (v_user, v_user, 'withdrawal.requested', 'withdrawal', v_id::text,
          jsonb_build_object('asset', p_asset, 'amount', p_amount, 'to', p_address));

  return v_id;
end;
$$;

-- ============================================================================
-- 4. ADMIN: REVIEW A WITHDRAWAL
--
-- Approve or reject. Note the ceiling: approval debits an existing settled
-- balance. There is no branch here that can increase one.
-- ============================================================================

create or replace function public.review_withdrawal(
  p_id      uuid,
  p_approve boolean,
  p_note    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  w       public.withdrawal_requests;
begin
  if not public.has_role('admin') then
    raise exception 'admin role required';
  end if;

  select * into w from public.withdrawal_requests where id = p_id for update;
  if w.id is null then
    raise exception 'withdrawal not found';
  end if;
  if w.status not in ('requested', 'under_review') then
    raise exception 'withdrawal already resolved (%)', w.status;
  end if;
  if w.user_id = v_admin then
    raise exception 'cannot review your own withdrawal';
  end if;
  if not p_approve and (p_note is null or length(trim(p_note)) < 10) then
    raise exception 'a rejection reason of at least 10 characters is required';
  end if;

  update public.withdrawal_requests
     set status      = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = v_admin,
         reviewed_at = now(),
         review_note = p_note,
         updated_at  = now()
   where id = p_id;

  if p_approve then
    -- Debit now; the payout job flips status to 'sent' once broadcast.
    insert into public.ledger_entries
      (user_id, asset_symbol, direction, amount, reason, withdrawal_id, actor_id, note)
    values
      (w.user_id, w.asset_symbol, 'debit', w.amount + w.fee,
       'withdrawal_settled', w.id, v_admin, p_note);
  end if;

  insert into public.notifications (user_id, kind, title, body, href)
  values (
    w.user_id,
    case when p_approve then 'withdrawal_approved' else 'withdrawal_rejected' end,
    case when p_approve then 'Withdrawal approved' else 'Withdrawal rejected' end,
    coalesce(p_note, w.amount || ' ' || w.asset_symbol),
    '/dashboard#activity'
  );

  insert into public.activity_log (user_id, actor_id, action, entity, entity_id, detail)
  values (w.user_id, v_admin,
          case when p_approve then 'withdrawal.approved' else 'withdrawal.rejected' end,
          'withdrawal', w.id::text,
          jsonb_build_object('asset', w.asset_symbol, 'amount', w.amount, 'note', p_note));
end;
$$;

-- ============================================================================
-- 5. ADMIN: LEDGER CORRECTION
--
-- The honest replacement for "edit user balance".
--
-- Differences that matter: it posts a signed, attributed, immutable ledger
-- entry rather than overwriting a figure; it requires a written reason; it is
-- visible to the customer in their own history; it cannot be deleted; and it
-- cannot push a balance negative. Use it for a genuine operational error —
-- a fee charged twice, a deposit credited to the wrong account.
--
-- If you find yourself reaching for this to make a number look better to a
-- customer, that is the fraud this schema is shaped to prevent.
-- ============================================================================

create or replace function public.post_correction(
  p_user   uuid,
  p_asset  text,
  p_direction ledger_direction,
  p_amount numeric,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_avail numeric(38, 18);
  v_id    bigint;
begin
  if not public.has_role('admin') then
    raise exception 'admin role required';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_reason is null or length(trim(p_reason)) < 20 then
    raise exception 'a written reason of at least 20 characters is required';
  end if;
  if p_user = v_admin then
    raise exception 'cannot post a correction to your own account';
  end if;

  if p_direction = 'debit' then
    select available into v_avail from public.balances
     where user_id = p_user and asset_symbol = p_asset;
    if coalesce(v_avail, 0) < p_amount then
      raise exception 'correction would overdraw the account';
    end if;
  end if;

  insert into public.ledger_entries
    (user_id, asset_symbol, direction, amount, reason, actor_id, note)
  values (p_user, p_asset, p_direction, p_amount, 'correction', v_admin, p_reason)
  returning id into v_id;

  -- The customer is always told.
  insert into public.notifications (user_id, kind, title, body, href)
  values (p_user, 'account',
          'Balance adjustment: ' || p_direction || ' ' || p_amount || ' ' || p_asset,
          p_reason, '/dashboard#activity');

  insert into public.activity_log (user_id, actor_id, action, entity, entity_id, detail)
  values (p_user, v_admin, 'ledger.correction', 'ledger_entry', v_id::text,
          jsonb_build_object('asset', p_asset, 'direction', p_direction,
                             'amount', p_amount, 'reason', p_reason));
  return v_id;
end;
$$;

-- ============================================================================
-- 6. NOTIFICATIONS: mark read
-- ============================================================================

create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ============================================================================
-- 7. updated_at
-- ============================================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

create trigger t_profiles_touch  before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger t_assets_touch    before update on public.assets
  for each row execute function public.touch_updated_at();
create trigger t_withdrawals_touch before update on public.withdrawal_requests
  for each row execute function public.touch_updated_at();
create trigger t_deposits_touch  before update on public.chain_deposits
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- Enabled on every table. Deny by default — no policy means no access.
-- ============================================================================

alter table public.profiles            enable row level security;
alter table public.user_roles          enable row level security;
alter table public.assets              enable row level security;
alter table public.deposit_addresses   enable row level security;
alter table public.chain_deposits      enable row level security;
alter table public.ledger_entries      enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.notifications       enable row level security;
alter table public.activity_log        enable row level security;
alter table public.watchlist           enable row level security;

-- ---- profiles ----
create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff());

create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "admin updates profiles" on public.profiles
  for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- ---- roles ----
create policy "read own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

create policy "admin manages roles" on public.user_roles
  for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- ---- assets: world-readable, admin-writable ----
create policy "anyone reads assets" on public.assets
  for select to anon, authenticated using (true);

create policy "admin edits assets" on public.assets
  for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- ---- deposit addresses ----
create policy "read own deposit addresses" on public.deposit_addresses
  for select to authenticated using (user_id = auth.uid() or public.is_staff());
-- Inserts come from the processor webhook via service_role, which bypasses RLS.

-- ---- chain deposits ----
create policy "read own deposits" on public.chain_deposits
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

-- ---- ledger: READ ONLY for everyone, always ----
-- No insert/update/delete policy exists for authenticated. Entries are created
-- only by the SECURITY DEFINER functions above and the deposit trigger.
create policy "read own ledger" on public.ledger_entries
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

-- ---- withdrawals ----
create policy "read own withdrawals" on public.withdrawal_requests
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

create policy "cancel own pending withdrawal" on public.withdrawal_requests
  for update to authenticated
  using (user_id = auth.uid() and status = 'requested')
  with check (user_id = auth.uid() and status = 'cancelled');
-- Creation goes through request_withdrawal(); review through review_withdrawal().

-- ---- notifications ----
create policy "read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());

create policy "update own notifications" on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- activity log ----
create policy "read own activity" on public.activity_log
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

-- ---- watchlist ----
create policy "manage own watchlist" on public.watchlist
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
-- GRANTS — belt and braces alongside RLS
-- ============================================================================

revoke insert, update, delete on public.ledger_entries from authenticated, anon;
revoke insert, update, delete on public.activity_log   from authenticated, anon;
revoke insert, update, delete on public.chain_deposits from authenticated, anon;
revoke all on public.assets from anon;
grant select on public.assets to anon;

-- ============================================================================
-- REALTIME — powers the notification bell and the live history feed
-- ============================================================================



-- Realtime: adding a table twice errors, so each add is guarded.
do $$
declare t text;
begin
  foreach t in array array['notifications','activity_log','chain_deposits','ledger_entries']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;
    end;
  end loop;
end $$;

-- ============================================================================
--  6. SPACEX IPO RECONCILIATION (12 June 2026)
-- ============================================================================
update public.assets
   set symbol = 'SPCX'
 where symbol = 'SPACEX'
   and not exists (select 1 from public.assets where symbol = 'SPCX');

update public.assets
   set kind         = 'public_equity',
       display_name = 'Space Exploration Technologies (SPCX)',
       decimals     = 2,
       network      = null,
       sort_order   = 90        -- sits at the head of the public list
 where symbol = 'SPCX';

insert into public.assets
  (symbol, kind, display_name, decimals, is_deposit_enabled,
   is_withdrawal_enabled, required_confirmations, sort_order)
values
  ('SPCX', 'public_equity', 'Space Exploration Technologies (SPCX)', 2,
   false, false, 1, 90)
on conflict (symbol) do nothing;

-- 2. Grok/xAI, X and Starlink were never separately investable and are now
--    unambiguously inside SPCX. Retire the rows so nothing in the UI can ever
--    render a standalone price for them.
--
--    Deleted only where nothing references them; otherwise renamed so the
--    history stays readable. No ledger row is ever rewritten.
do $$
declare
  s text;
begin
  foreach s in array array['XAI', 'GROK', 'X', 'STARLINK']
  loop
    if exists (select 1 from public.ledger_entries  where asset_symbol = s)
    or exists (select 1 from public.chain_deposits  where asset_symbol = s)
    or exists (select 1 from public.withdrawal_requests where asset_symbol = s)
    then
      update public.assets
         set display_name = display_name || ' — merged into SPCX',
             is_deposit_enabled = false,
             is_withdrawal_enabled = false
       where symbol = s;
    else
      delete from public.watchlist where asset_symbol = s;
      delete from public.assets    where symbol = s;
    end if;
  end loop;
end $$;

-- 3. Neuralink and The Boring Company are still private. Normalise their rows.
update public.assets
   set kind = 'private_company',
       is_deposit_enabled = false,
       is_withdrawal_enabled = false
 where symbol in ('NEURALINK', 'BORING');

comment on type asset_kind is
  'private_company means exactly that: no ticker, no quote. SpaceX moved out of this category on 12 June 2026. Grok, X and Starlink were never in it — they are divisions inside SPCX.';

-- ============================================================================
--  7. SEED — asset configuration
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




-- ============================================================================
--  ORDERS — added for the trade ticket
--  An order is an intent. It becomes a position only when the broker confirms
--  a fill, at which point the ledger entry is written. Never on submit.
-- ============================================================================

do $$ begin
  create type order_side as enum ('buy','sell');
exception when duplicate_object then null; end $$;
do $$ begin
  create type order_status as enum ('draft','submitted','filled','partial','rejected','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete restrict,
  asset_symbol  text not null references public.assets (symbol),
  side          order_side not null,
  -- Exactly one of these is set: a dollar order or a share order.
  notional      numeric(20, 2) check (notional is null or notional > 0),
  quantity      numeric(28, 8) check (quantity is null or quantity > 0),
  limit_price   numeric(20, 4),
  status        order_status not null default 'draft',
  broker_ref    text unique,
  filled_qty    numeric(28, 8) not null default 0,
  filled_avg    numeric(20, 4),
  reject_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint one_sizing check (num_nonnulls(notional, quantity) = 1)
);

create index if not exists ix_orders_user on public.orders (user_id, created_at desc);
create index if not exists ix_orders_open on public.orders (status)
  where status in ('submitted','partial');

create table if not exists public.positions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete restrict,
  asset_symbol text not null references public.assets (symbol),
  quantity     numeric(28, 8) not null check (quantity >= 0),
  cost_basis   numeric(20, 2) not null check (cost_basis >= 0),
  opened_at    timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, asset_symbol)
);

alter table public.orders    enable row level security;
alter table public.positions enable row level security;

drop policy if exists "read own orders"    on public.orders;
drop policy if exists "read own positions" on public.positions;

create policy "read own orders" on public.orders
  for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy "read own positions" on public.positions
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

revoke insert, update, delete on public.orders    from authenticated, anon;
revoke insert, update, delete on public.positions from authenticated, anon;

drop trigger if exists t_orders_touch    on public.orders;
drop trigger if exists t_positions_touch on public.positions;
create trigger t_orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
create trigger t_positions_touch before update on public.positions
  for each row execute function public.touch_updated_at();

-- P/L is derived, never stored: cost basis lives on the position, market value
-- comes from the live quote at request time. A stored P/L figure is a stale
-- figure the moment the market moves.
create or replace view public.holdings
with (security_invoker = true)
as
select p.user_id, p.asset_symbol, p.quantity, p.cost_basis,
       case when p.quantity > 0 then p.cost_basis / p.quantity end as cost_per_share
from public.positions p
where p.quantity > 0;

-- ============================================================================
--  8. POST-INSTALL CHECKLIST
-- ============================================================================
--
--  1) Grant yourself admin AFTER signing up through the app:
--
--       insert into public.user_roles (user_id, role)
--       select id, 'admin' from public.profiles
--        where email = 'you@yourdomain.com'
--       on conflict do nothing;
--
--  2) Deposits ship DISABLED on every asset. Leave them off until a payment
--     processor is wired to the webhook and you have watched one real deposit
--     confirm end to end. An unauthenticated webhook is a hole straight into
--     the ledger.
--
--  3) Confirmation thresholds are per chain: BTC 2, ETH 12, SOL 32, TRC20 20.
--     Set them too low and you credit a transaction that later reorgs out.
--
--  4) Verify the install:
--
--       select symbol, kind, is_deposit_enabled
--         from public.assets order by sort_order;
--
--       select count(*) from public.balances;    -- 0 on a fresh install
--
--       -- this MUST fail with 'append-only':
--       update public.ledger_entries set amount = 1 where id = -1;
--
--       -- confirm RLS is on everywhere (expect no rows):
--       select tablename from pg_tables
--        where schemaname = 'public' and rowsecurity = false;
--
--  5) Custodying customer crypto in the US generally requires FinCEN MSB
--     registration plus state licensing, and that attaches the moment you hold
--     someone else's funds. No schema comment substitutes for counsel.
-- ============================================================================
