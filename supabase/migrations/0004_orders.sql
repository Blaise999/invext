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
