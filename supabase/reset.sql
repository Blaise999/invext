-- ============================================================================
-- FULL RESET — wipes every account and everything attached to one.
--
-- Run in the Supabase SQL editor. Irreversible.
--
-- Two reasons a plain DELETE fails here, both by design:
--
--   1. profiles is referenced by ledger_entries, app_transactions, orders,
--      user_roles and more. Deleting a profile with history attached hits a
--      foreign key — which is the error you saw.
--   2. app_transactions, app_marks and app_activity carry BEFORE DELETE
--      triggers that refuse row deletion outright. That is the append-only
--      ledger doing its job: you cannot quietly erase what an account was
--      worth last month.
--
-- TRUNCATE ... CASCADE gets past both. It doesn't fire row-level triggers and
-- it follows the foreign keys itself, so the order doesn't matter.
--
-- `assets` is left alone — it's reference data (symbols and names), not
-- anyone's records.
-- ============================================================================

do $$
declare
  t text;
begin
  for t in
    select tablename
      from pg_tables
     where schemaname = 'public'
       and tablename <> 'assets'
  loop
    execute format('truncate table public.%I cascade', t);
  end loop;
end $$;

-- profiles and user_roles are gone with the truncate above; this clears the
-- auth side, which lives in a schema the loop doesn't touch.
delete from auth.users;

-- ---------------------------------------------------------------------------
-- Confirm it's clean. Every count should be 0.
-- ---------------------------------------------------------------------------
select
  (select count(*) from auth.users)              as auth_users,
  (select count(*) from public.profiles)         as profiles,
  (select count(*) from public.user_roles)       as roles,
  (select count(*) from public.app_transactions) as ledger,
  (select count(*) from public.app_positions)    as positions,
  (select count(*) from public.auth_sessions)    as sessions;
