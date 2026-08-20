-- ============================================================================
-- InveXt — 0006_app_ledger.sql
--
-- The rest of lib/db.ts, moved off the JSON file and into Postgres: the
-- ledger, positions, valuation marks, deposit addresses, notifications, the
-- audit log and the watchlist.
--
-- Same reason as 0005. DATA_DIR resolves to /tmp on Vercel, /tmp is
-- per-instance and disposable, and `cashForUser` is a sum over the ledger —
-- so a balance computed on one lambda disagreed with the same balance
-- computed on the next, and an approved deposit could vanish outright.
--
-- ── WHY app_* AND NOT THE TABLES IN 0001 ───────────────────────────────────
--
-- 0001 models crypto custody: `ledger_entries` requires an `asset_symbol`
-- present in `assets`, and `credit_needs_provenance` forbids any credit that
-- doesn't trace to a confirmed on-chain deposit (except sells, reversals and
-- corrections). The app's flow is fiat-first — a customer files an ACH/wire
-- deposit, an operator or a processor webhook settles it — which that
-- constraint deliberately refuses. `withdrawal_requests` is likewise a
-- separate table with four-eyes review, while the app models both directions
-- as rows in one ledger.
--
-- Rather than weaken 0001's constraints to fit, these tables mirror the model
-- the application actually implements, and keep the properties that mattered
-- in the JSON version — append-only history, no balance column, a sum as the
-- only definition of cash — enforced here in the database instead of by
-- convention. Consolidating the two is a real piece of work; see FIXES.md.
--
-- Access model: RLS on, no policies. Service role only, like 0005.
-- ============================================================================

-- ============================================================================
-- LEDGER
-- ============================================================================

create table if not exists public.app_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete restrict,
  kind           text not null check (kind in ('deposit','withdrawal','buy','sell','correction')),
  symbol         text,
  amount         numeric(20,2) not null,
  status         text not null default 'pending'
                   check (status in ('pending','settled','rejected','failed')),

  /* trade legs */
  quantity       numeric(28,6),
  price          numeric(20,2),
  realised       numeric(20,2),
  basis_relieved numeric(20,2),

  /* funding legs */
  method         text,
  reference      text,
  destination    text,

  /* review trail */
  note           text,
  reviewed_at    timestamptz,
  reviewed_by    text,

  created_at     timestamptz not null default now(),

  -- A correction is signed at write time; everything else is a magnitude.
  constraint amount_sign check (kind = 'correction' or amount >= 0),
  constraint correction_needs_note check (
    kind <> 'correction' or (note is not null and length(trim(note)) >= 20)
  )
);

comment on table public.app_transactions is
  'The ledger. Append-only apart from a pending row being decided once. There is no balance column anywhere — cash is app_cash(), a sum over these rows.';

create index if not exists app_tx_user_idx    on public.app_transactions (user_id, created_at desc);
create index if not exists app_tx_pending_idx on public.app_transactions (status, created_at) where status = 'pending';
create index if not exists app_tx_kind_idx    on public.app_transactions (kind, created_at desc);

/*
 * History is immutable; a pending row may be decided exactly once.
 *
 * Fires for the service role too, so a leaked service key still cannot rewrite
 * what an account was worth last month. The only permitted mutation is
 * pending → settled/rejected/failed, carrying the review trail with it.
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
     or new.reference      is distinct from old.reference
     or new.destination    is distinct from old.destination
     or new.created_at     is distinct from old.created_at then
    raise exception 'only status, note and the review fields may change on a ledger row';
  end if;

  return new;
end;
$$;

drop trigger if exists app_tx_no_delete on public.app_transactions;
create trigger app_tx_no_delete
  before delete on public.app_transactions
  for each row execute function public.app_tx_guard();

drop trigger if exists app_tx_decide_only on public.app_transactions;
create trigger app_tx_decide_only
  before update on public.app_transactions
  for each row execute function public.app_tx_guard();

alter table public.app_transactions enable row level security;

-- ============================================================================
-- CASH — the only definition
-- ============================================================================

/*
 * Sign convention lives here and nowhere else.
 *
 *   deposit / sell / correction  → counted as stored, once settled
 *   buy                          → magnitude, subtracted, once settled
 *   withdrawal                   → magnitude, subtracted while PENDING TOO
 *
 * That last asymmetry is deliberate: filing a withdrawal holds the funds
 * immediately, so the same $500 can't be requested twice while the first sits
 * in review. Pending deposits are the mirror image — money that hasn't landed
 * isn't buying power.
 */
create or replace function public.app_cash(uid uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case
      when t.kind = 'withdrawal'                     then -abs(t.amount)
      when t.status <> 'settled'                     then 0
      when t.kind in ('deposit','sell','correction') then t.amount
      when t.kind = 'buy'                            then -abs(t.amount)
      else 0
    end
  ), 0)::numeric(20,2)
  from public.app_transactions t
  where t.user_id = uid
    and t.status not in ('failed','rejected');
$$;

/** Every account's cash in one round trip — the back office lists all of them. */
create or replace function public.app_cash_all()
returns table (user_id uuid, cash numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.user_id,
    coalesce(sum(
      case
        when t.kind = 'withdrawal'                     then -abs(t.amount)
        when t.status <> 'settled'                     then 0
        when t.kind in ('deposit','sell','correction') then t.amount
        when t.kind = 'buy'                            then -abs(t.amount)
        else 0
      end
    ), 0)::numeric(20,2)
  from public.app_transactions t
  where t.status not in ('failed','rejected')
  group by t.user_id;
$$;

-- ============================================================================
-- POSITIONS
-- ============================================================================

create table if not exists public.app_positions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  symbol     text not null,
  quantity   numeric(28,6) not null check (quantity > 0),
  cost_basis numeric(20,2) not null check (cost_basis >= 0),
  opened_at  timestamptz not null default now(),

  -- The JSON version did find-then-create, so two simultaneous buys could
  -- leave one symbol split across two rows with two average costs.
  unique (user_id, symbol)
);

create index if not exists app_positions_symbol_idx on public.app_positions (symbol);

alter table public.app_positions enable row level security;

-- ============================================================================
-- FILLS — position and ledger row in one transaction
-- ============================================================================

/*
 * A fill touches two tables. Previously they were two separate writes with a
 * network round trip between them: a failure in the gap left shares with no
 * debit against them, or a debit with no shares.
 *
 * The advisory lock serialises fills per account, which is what makes the cash
 * check meaningful — without it two concurrent buys can both read the same
 * balance and both pass.
 *
 * Basis relieved and realised P/L are computed HERE, at the moment they are
 * knowable, and returned. Reconstructing them later from the post-sale average
 * cost gives a different, wrong answer.
 */
create or replace function public.app_record_fill(
  uid         uuid,
  sym         text,
  side        text,
  qty         numeric,
  px          numeric,
  price_src   text default null
)
returns public.app_transactions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  notional   numeric(20,2) := round(qty * px, 2);
  pos        public.app_positions;
  relieved   numeric(20,2) := null;
  gain       numeric(20,2) := null;
  available  numeric(20,2);
  row_out    public.app_transactions;
begin
  if side not in ('buy','sell') then
    raise exception 'side must be buy or sell';
  end if;
  if qty <= 0 or px <= 0 then
    raise exception 'quantity and price must both be positive';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  if side = 'buy' then
    available := public.app_cash(uid);
    if notional > available then
      raise exception 'insufficient_cash:%', available using errcode = 'P0001';
    end if;

    insert into public.app_positions (user_id, symbol, quantity, cost_basis)
    values (uid, sym, round(qty, 6), notional)
    on conflict (user_id, symbol) do update
      set quantity   = round(public.app_positions.quantity + excluded.quantity, 6),
          cost_basis = round(public.app_positions.cost_basis + excluded.cost_basis, 2);

  else
    select * into pos
      from public.app_positions
     where user_id = uid and symbol = sym
     for update;

    if not found or pos.quantity + 0.000000001 < qty then
      raise exception 'insufficient_position:%', coalesce(pos.quantity, 0) using errcode = 'P0001';
    end if;

    relieved := round((pos.cost_basis / pos.quantity) * qty, 2);
    gain     := round(notional - relieved, 2);

    -- A sale that takes the position to (near) zero removes the row rather
    -- than leaving dust with a rounding-error basis attached.
    if round(pos.quantity - qty, 6) <= 0.000000001 then
      delete from public.app_positions where id = pos.id;
    else
      update public.app_positions
         set quantity   = round(pos.quantity - qty, 6),
             cost_basis = round(pos.cost_basis - relieved, 2)
       where id = pos.id;
    end if;
  end if;

  insert into public.app_transactions (
    user_id, kind, symbol, amount, status,
    quantity, price, realised, basis_relieved, method
  )
  values (
    uid, side, sym, notional, 'settled',
    round(qty, 6), px, gain, relieved,
    case when price_src is null then null else 'price:' || price_src end
  )
  returning * into row_out;

  return row_out;
end;
$$;

/*
 * Balance adjustment. Append-only, like everything else: this writes a signed
 * `correction` row carrying the operator's name and a written reason. There is
 * deliberately no function that sets a balance, because there is no balance
 * column to set.
 */
create or replace function public.app_post_correction(
  uid    uuid,
  delta  numeric,
  reason text,
  by     text
)
returns public.app_transactions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  before  numeric(20,2);
  row_out public.app_transactions;
begin
  if length(trim(coalesce(reason, ''))) < 20 then
    raise exception 'a correction needs a written reason of at least 20 characters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  before := public.app_cash(uid);
  if before + delta < 0 then
    raise exception 'negative_balance:%', before using errcode = 'P0001';
  end if;

  insert into public.app_transactions (
    user_id, kind, symbol, amount, status, note, reviewed_at, reviewed_by
  )
  values (
    uid, 'correction', null, round(delta, 2), 'settled',
    trim(reason) || ' — by ' || by, now(), by
  )
  returning * into row_out;

  return row_out;
end;
$$;

-- ============================================================================
-- VALUATION MARKS
-- ============================================================================

create table if not exists public.app_marks (
  id           uuid primary key default gen_random_uuid(),
  symbol       text not null,
  price        numeric(20,2) not null check (price > 0),
  effective_at timestamptz not null,
  basis        text not null check (length(trim(basis)) >= 3),
  source       text not null check (length(trim(source)) >= 8),
  created_by   text not null,
  created_at   timestamptz not null default now()
);

comment on table public.app_marks is
  'Dated valuations for private vehicles. Appended, never edited — a mark that has appeared on a statement is superseded by a new one, not rewritten.';

create index if not exists app_marks_symbol_idx on public.app_marks (symbol, effective_at);
create index if not exists app_marks_recent_idx on public.app_marks (created_at desc);

/*
 * Marks are never updated, and can only be deleted through app_remove_mark —
 * which enforces the same-author, within-24-hours rule. Anything older has
 * already been on somebody's statement; the correct move there is a
 * superseding mark, not a deletion.
 */
create or replace function public.app_mark_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'app_marks is append-only: record a superseding mark instead of editing one';
  end if;
  if coalesce(current_setting('app.allow_mark_delete', true), '') <> '1' then
    raise exception 'marks are removed through app_remove_mark(), which enforces the 24-hour window';
  end if;
  return old;
end;
$$;

drop trigger if exists app_marks_no_update on public.app_marks;
create trigger app_marks_no_update
  before update on public.app_marks
  for each row execute function public.app_mark_guard();

drop trigger if exists app_marks_guarded_delete on public.app_marks;
create trigger app_marks_guarded_delete
  before delete on public.app_marks
  for each row execute function public.app_mark_guard();

create or replace function public.app_remove_mark(mid uuid, admin_email text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  m public.app_marks;
begin
  select * into m from public.app_marks where id = mid;
  if not found then return false; end if;
  if m.created_by <> admin_email then return false; end if;
  if now() - m.created_at > interval '24 hours' then return false; end if;

  perform set_config('app.allow_mark_delete', '1', true);
  delete from public.app_marks where id = mid;
  perform set_config('app.allow_mark_delete', '0', true);
  return true;
end;
$$;

alter table public.app_marks enable row level security;

-- ============================================================================
-- DEPOSIT ADDRESSES
-- ============================================================================

create table if not exists public.app_deposit_addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  asset       text not null,
  network     text not null,
  address     text not null,
  memo        text,
  active      boolean not null default true,
  assigned_by text not null,
  created_at  timestamptz not null default now()
);

-- One live address per user per asset, while keeping retired ones as history.
create unique index if not exists app_addr_one_active_per_asset
  on public.app_deposit_addresses (user_id, asset) where active;

-- Backstop for the check inside app_assign_address: the same address can never
-- be live for two accounts. Deposits into a shared address are unattributable,
-- and matching by amount fails the first time two people send the same figure.
create unique index if not exists app_addr_unique_active
  on public.app_deposit_addresses (lower(address)) where active;

create index if not exists app_addr_user_idx on public.app_deposit_addresses (user_id);

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
  if exists (
    select 1 from public.app_deposit_addresses
     where lower(address) = lower(p_addr) and user_id <> uid
  ) then
    raise exception 'address_taken' using errcode = 'P0001';
  end if;

  update public.app_deposit_addresses
     set active = false
   where user_id = uid and asset = p_asset and active;

  insert into public.app_deposit_addresses
    (user_id, asset, network, address, memo, assigned_by)
  values (uid, p_asset, p_net, p_addr, p_memo, by)
  returning * into row_out;

  return row_out;
end;
$$;

alter table public.app_deposit_addresses enable row level security;

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

create table if not exists public.app_notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  href       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_notif_user_idx   on public.app_notifications (user_id, created_at desc);
create index if not exists app_notif_unread_idx on public.app_notifications (user_id) where read_at is null;

alter table public.app_notifications enable row level security;

-- ============================================================================
-- ACTIVITY LOG — append only, no exceptions
-- ============================================================================

create table if not exists public.app_activity (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  actor      text not null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  detail     jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_activity_user_idx   on public.app_activity (user_id, created_at desc);
create index if not exists app_activity_recent_idx on public.app_activity (created_at desc);

create or replace function public.app_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only: % is not permitted', tg_table_name, tg_op;
end;
$$;

drop trigger if exists app_activity_no_update on public.app_activity;
create trigger app_activity_no_update
  before update on public.app_activity
  for each row execute function public.app_append_only();

drop trigger if exists app_activity_no_delete on public.app_activity;
create trigger app_activity_no_delete
  before delete on public.app_activity
  for each row execute function public.app_append_only();

alter table public.app_activity enable row level security;

-- ============================================================================
-- WATCHLIST
-- ============================================================================

create table if not exists public.app_watchlist (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  symbol     text not null,
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create index if not exists app_watchlist_user_idx on public.app_watchlist (user_id, created_at desc);

/** Returns the state AFTER the toggle: true = now watching. */
create or replace function public.app_toggle_watch(uid uuid, sym text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.app_watchlist where user_id = uid and symbol = sym;
  if found then
    return false;
  end if;
  insert into public.app_watchlist (user_id, symbol) values (uid, sym);
  return true;
end;
$$;

alter table public.app_watchlist enable row level security;

-- ============================================================================
-- Nothing here is callable without the service-role key.
-- ============================================================================

revoke all on function public.app_cash(uuid)            from public, anon, authenticated;
revoke all on function public.app_cash_all()            from public, anon, authenticated;
revoke all on function public.app_record_fill(uuid, text, text, numeric, numeric, text)
                                                        from public, anon, authenticated;
revoke all on function public.app_post_correction(uuid, numeric, text, text)
                                                        from public, anon, authenticated;
revoke all on function public.app_remove_mark(uuid, text) from public, anon, authenticated;
revoke all on function public.app_assign_address(uuid, text, text, text, text, text)
                                                        from public, anon, authenticated;
revoke all on function public.app_toggle_watch(uuid, text) from public, anon, authenticated;
