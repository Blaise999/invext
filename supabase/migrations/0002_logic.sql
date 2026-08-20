-- ============================================================================
-- InveXt — 0002_logic.sql
-- Triggers that turn confirmed chain events into balance, plus all RLS.
-- ============================================================================

-- ============================================================================
-- 1. NEW USER -> PROFILE
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

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.activity_log;
alter publication supabase_realtime add table public.chain_deposits;
alter publication supabase_realtime add table public.ledger_entries;
