-- ============================================================================
-- InveXt — 0003_spacex_ipo.sql
--
-- SpaceX completed its IPO on 12 June 2026 and now trades on Nasdaq as SPCX.
-- Separately, SpaceX had already acquired xAI outright on 2 February 2026, and
-- xAI had acquired X in March 2025 — so Grok and X are divisions inside SpaceX,
-- and Starlink has always been a subsidiary.
--
-- Net effect on this schema: one row moves from private_company to
-- public_equity, and the rows that were never separately investable are
-- retired rather than repriced.
--
-- Safe to re-run.
-- ============================================================================

-- 1. SpaceX is now a listed security. Reuse the row so any watchlist entries
--    and ledger history pointing at it survive the change.
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
