-- ============================================================================
-- InveXt — 0007_networks.sql
--
-- Deposit and withdrawal rails.
--
-- Two levels of address, resolved in this order:
--
--   1. a per-user override in app_deposit_addresses
--   2. the global default for that network in app_network_addresses
--
-- The global default is what makes the desk usable on day one; the per-user
-- override is what makes deposits attributable once there's more than a
-- handful of customers. Both are set by an admin and both are attributed.
--
-- Run after 0006.
-- ============================================================================

-- ============================================================================
-- GLOBAL ADDRESS PER NETWORK
-- ============================================================================

create table if not exists public.app_network_addresses (
  network    text primary key,
  address    text not null,
  memo       text,
  updated_by text not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_network_addresses is
  'The fallback deposit address for each rail. The list of rails themselves lives in lib/networks.ts — code, not data, so a typo cannot invent a payment method.';

alter table public.app_network_addresses enable row level security;

/*
 * Every change to a global address is logged before it takes effect.
 *
 * This is the single highest-consequence value in the system: change it and
 * every customer without an override starts sending money somewhere else.
 * The row itself only holds the current value, so without this the previous
 * address — and who replaced it, and when — would be unrecoverable.
 */
create or replace function public.app_network_address_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_activity (user_id, actor, action, entity, entity_id, detail)
  values (
    null,
    new.updated_by,
    case when tg_op = 'INSERT' then 'network.address.set' else 'network.address.changed' end,
    'network',
    new.network,
    jsonb_build_object(
      'network', new.network,
      'to', new.address,
      'from', case when tg_op = 'UPDATE' then old.address else null end,
      'memo', new.memo
    )
  );
  return new;
end;
$$;

drop trigger if exists app_network_address_audited on public.app_network_addresses;
create trigger app_network_address_audited
  after insert or update on public.app_network_addresses
  for each row execute function public.app_network_address_audit();

create or replace function public.app_set_network_address(
  net    text,
  addr   text,
  p_memo text,
  by     text
)
returns public.app_network_addresses
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  row_out public.app_network_addresses;
begin
  if length(trim(coalesce(addr, ''))) < 8 then
    raise exception 'address_too_short' using errcode = 'P0001';
  end if;

  insert into public.app_network_addresses (network, address, memo, updated_by, updated_at)
  values (net, trim(addr), nullif(trim(coalesce(p_memo, '')), ''), by, now())
  on conflict (network) do update
    set address    = excluded.address,
        memo       = excluded.memo,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into row_out;

  return row_out;
end;
$$;

-- ============================================================================
-- PER-USER OVERRIDES — now keyed by network, not asset
-- ============================================================================

-- 0006 allowed one active address per (user, asset). USDT exists on three
-- chains, so that let a user hold one USDT address and quietly lose the
-- ability to be given a second on a different chain.
drop index if exists public.app_addr_one_active_per_asset;

create unique index if not exists app_addr_one_active_per_network
  on public.app_deposit_addresses (user_id, network) where active;

create or replace function public.app_assign_address(
  uid      uuid,
  p_asset  text,
  p_net    text,
  p_addr   text,
  p_memo   text,
  by       text
)
returns public.app_deposit_addresses
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  row_out public.app_deposit_addresses;
begin
  -- An address live for someone else makes both deposits unattributable, and
  -- matching by amount fails the first time two people send the same figure.
  if exists (
    select 1 from public.app_deposit_addresses
     where lower(address) = lower(p_addr) and user_id <> uid
  ) then
    raise exception 'address_taken' using errcode = 'P0001';
  end if;

  update public.app_deposit_addresses
     set active = false
   where user_id = uid and network = p_net and active;

  insert into public.app_deposit_addresses
    (user_id, asset, network, address, memo, assigned_by)
  values (uid, p_asset, p_net, p_addr, nullif(trim(coalesce(p_memo, '')), ''), by)
  returning * into row_out;

  return row_out;
end;
$$;

/**
 * The address a given customer should send to on a given rail.
 *
 * Override first, global second, nothing third — and "nothing" is a real
 * answer the UI has to handle, not an error. An unset rail shows the customer
 * that deposits on it aren't open yet, which is true, rather than falling back
 * to some other network's address.
 */
create or replace function public.app_resolve_deposit_address(uid uuid, net text)
returns table (address text, memo text, source text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hit record;
begin
  select a.address, a.memo into hit
    from public.app_deposit_addresses a
   where a.user_id = uid and a.network = net and a.active
   limit 1;

  if found then
    address := hit.address; memo := hit.memo; source := 'user';
    return next;
    return;
  end if;

  select n.address, n.memo into hit
    from public.app_network_addresses n
   where n.network = net
   limit 1;

  if found then
    address := hit.address; memo := hit.memo; source := 'global';
    return next;
  end if;

  -- No row at all is the correct answer for an unconfigured rail. The UI shows
  -- "not open yet", which is true; falling back to another chain's address
  -- would lose the money.
  return;
end;
$$;

-- ============================================================================
-- THE LEDGER LEARNS ABOUT CHAINS
-- ============================================================================

alter table public.app_transactions
  add column if not exists network text;

comment on column public.app_transactions.network is
  'Which rail this deposit or withdrawal used. Null for trades and corrections.';

create index if not exists app_tx_network_idx
  on public.app_transactions (network) where network is not null;

/*
 * Same guard as 0006, with `network` and `destination` added to the immutable
 * set. A withdrawal is approved on the strength of the address shown in the
 * queue; if that address could be edited after filing — or between the
 * operator reading it and clicking approve — the review would be meaningless.
 */
create or replace function public.app_tx_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'app_transactions is append-only: DELETE is not permitted. Post a compensating correction instead.';
  end if;

  if old.status <> 'pending' then
    raise exception 'ledger row % is already %; decided rows are immutable', old.id, old.status;
  end if;

  if new.status = 'pending' then
    raise exception 'ledger row % must move to settled, rejected or failed', old.id;
  end if;

  if new.user_id           is distinct from old.user_id
     or new.kind           is distinct from old.kind
     or new.amount         is distinct from old.amount
     or new.symbol         is distinct from old.symbol
     or new.quantity       is distinct from old.quantity
     or new.price          is distinct from old.price
     or new.realised       is distinct from old.realised
     or new.basis_relieved is distinct from old.basis_relieved
     or new.method         is distinct from old.method
     or new.network        is distinct from old.network
     or new.reference      is distinct from old.reference
     or new.destination    is distinct from old.destination
     or new.created_at     is distinct from old.created_at then
    raise exception 'only status, note and the review fields may change on a ledger row';
  end if;

  return new;
end;
$$;

-- ============================================================================

revoke all on function public.app_set_network_address(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.app_resolve_deposit_address(uuid, text)
  from public, anon, authenticated;
