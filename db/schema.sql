-- ============================================================================
-- SUPERSEDED — kept for reference only.
--
-- This described the tables of the JSON store (lib/db.ts), which no longer
-- exists. Auth state is now supabase/migrations/0005_auth_challenges_sessions.sql
-- and the ledger, positions, marks, addresses, notifications, activity and
-- watchlist are supabase/migrations/0006_app_ledger.sql.
--
-- Nothing reads this file. Delete it once you're happy the port is settled.
-- ============================================================================

-- ============================================================
-- InveXt — PostgreSQL schema
-- Tested against PostgreSQL 18.
--
--   psql "$DATABASE_URL" -f db/schema.sql
--
-- Idempotent: safe to re-run.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('member', 'support', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT      NOT NULL UNIQUE,
  password_hash   TEXT        NOT NULL,
  first_name      TEXT        NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 60),
  last_name       TEXT        NOT NULL CHECK (length(btrim(last_name))  BETWEEN 1 AND 60),
  state           CHAR(2)     NOT NULL,
  role            user_role   NOT NULL DEFAULT 'member',
  email_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
  locked_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at   TIMESTAMPTZ,
  CONSTRAINT users_email_shape CHECK (position('@' IN email) > 1)
);

-- ------------------------------------------------------------
-- challenges  (one-time codes for signup + login)
-- ------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE challenge_purpose AS ENUM ('signup', 'login');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS challenges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose       challenge_purpose NOT NULL,
  code_hash     TEXT        NOT NULL,          -- HMAC-SHA256, never the code
  attempts      SMALLINT    NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  sends         SMALLINT    NOT NULL DEFAULT 1 CHECK (sends >= 1),
  last_sent_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS challenges_user_idx ON challenges (user_id, purpose);

-- At most one live challenge per user per purpose, enforced by the database
-- rather than by application discipline.
CREATE UNIQUE INDEX IF NOT EXISTS challenges_one_live_idx
  ON challenges (user_id, purpose)
  WHERE consumed_at IS NULL;

-- ------------------------------------------------------------
-- sessions
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,     -- HMAC of the cookie value
  user_agent  TEXT,
  ip          INET,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx  ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_live_idx  ON sessions (expires_at);

-- ------------------------------------------------------------
-- activity_log  — append only, the source for the history feed
-- ------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE activity_kind AS ENUM (
    'account_created',
    'email_verified',
    'code_sent',
    'code_failed',
    'signed_in',
    'signed_out',
    'session_revoked',
    'password_changed',
    'admin_viewed_account'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS activity_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        activity_kind NOT NULL,
  summary     TEXT          NOT NULL,
  meta        JSONB         NOT NULL DEFAULT '{}'::jsonb,
  ip          INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_user_time_idx
  ON activity_log (user_id, created_at DESC);

-- Append only. No UPDATE, no DELETE — an audit trail you can edit is not one.
CREATE OR REPLACE FUNCTION activity_log_is_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only (attempted %)', TG_OP;
END $$;

DROP TRIGGER IF EXISTS activity_log_no_mutate ON activity_log;
CREATE TRIGGER activity_log_no_mutate
  BEFORE UPDATE OR DELETE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION activity_log_is_append_only();

-- ------------------------------------------------------------
-- notifications  — what the bell shows
-- ------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE notification_level AS ENUM ('info', 'security', 'warning');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level       notification_level NOT NULL DEFAULT 'info',
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  href        TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_time_idx
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (user_id) WHERE read_at IS NULL;

-- ------------------------------------------------------------
-- positions  — holdings of PUBLIC equities only
--
-- The CHECK constraint below is deliberate. SpaceX, xAI, Neuralink,
-- The Boring Company and X do not trade on any exchange, so a holding
-- in them cannot be priced, marked or settled. The database refuses to
-- store one rather than leaving it to application code to remember.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS positions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol       TEXT NOT NULL,
  quantity     NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
  cost_basis   NUMERIC(18,2) NOT NULL CHECK (cost_basis >= 0),
  opened_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT positions_public_symbols_only
    CHECK (symbol IN ('TSLA','NVDA','AAPL','AMZN','PLTR','RIVN')),
  CONSTRAINT positions_unique_symbol UNIQUE (user_id, symbol)
);

CREATE INDEX IF NOT EXISTS positions_user_idx ON positions (user_id);

COMMIT;
