-- ============================================================================
-- InveXt — 0005_auth_challenges_sessions.sql
--
-- Moves the two pieces of auth state that were living in the JSON store
-- (lib/db.ts) into Postgres: OTP challenges and app sessions.
--
-- Why: on Vercel every request may land on a different serverless instance,
-- and the filesystem is ephemeral. A challenge written by POST /api/auth/signup
-- was frequently invisible to the very next request (GET /verify), so the page
-- redirected to /login. Sessions had the same problem one step later.
--
-- Access model: RLS is ON and there are no policies, so anon and authenticated
-- can read nothing. Only the service-role key (server routes) touches these.
-- ============================================================================

-- ---------------------------------------------------------------- challenges

create table if not exists public.auth_challenges (
  id           text        primary key,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  purpose      text        not null check (purpose in ('signup', 'login')),
  code_hash    text        not null,
  attempts     integer     not null default 0,
  sends        integer     not null default 1,
  last_sent_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.auth_challenges is
  'One pending OTP. code_hash is an HMAC of (challenge_id:code) keyed with AUTH_SECRET — the code itself is never stored.';

-- Finding the live challenge for a user+purpose is the hot path on resend.
create index if not exists auth_challenges_live_idx
  on public.auth_challenges (user_id, purpose)
  where consumed_at is null;

create index if not exists auth_challenges_expires_idx
  on public.auth_challenges (expires_at);

alter table public.auth_challenges enable row level security;
-- Deliberately no policies. Service role only.

-- ------------------------------------------------------------------ sessions

create table if not exists public.auth_sessions (
  id          text        primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  token_hash  text        not null unique,
  user_agent  text,
  ip          text,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

comment on table public.auth_sessions is
  'App session. The cookie holds a random token; only its HMAC is stored, so a database leak does not hand over live sessions.';

create index if not exists auth_sessions_user_idx
  on public.auth_sessions (user_id, created_at desc);

create index if not exists auth_sessions_expires_idx
  on public.auth_sessions (expires_at);

alter table public.auth_sessions enable row level security;
-- Deliberately no policies. Service role only.

-- ----------------------------------------------------------------- helpers

-- Atomic increment. Read-modify-write from the app would let an attacker
-- firing guesses in parallel keep the counter pinned near zero and defeat the
-- 5-attempt lockout.
create or replace function public.otp_bump_attempts(cid text)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  update public.auth_challenges
     set attempts = attempts + 1
   where id = cid
  returning attempts;
$$;

revoke all on function public.otp_bump_attempts(text) from public, anon, authenticated;

-- Housekeeping. Safe to call from a cron job; nothing depends on it running.
create or replace function public.purge_expired_auth()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.auth_sessions   where expires_at < now();
  delete from public.auth_challenges where expires_at < now() - interval '1 day';
$$;

revoke all on function public.purge_expired_auth() from public, anon, authenticated;
