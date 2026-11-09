-- Email verification for pilot applications (worker/verify.ts): one row per email,
-- holding the current code and, once verified, a short session. Both are SHA-256
-- hashes. The row is deleted when the application is sent.
-- Run once against the Neon database (SQL Editor, or):
--   psql "$DATABASE_URL" -f sql/004_pilot_codes.sql
create table if not exists pilot_codes (
  email              text primary key,
  code_hash          text,
  expires_at         timestamptz not null,
  attempts           int not null default 0,
  sent_at            timestamptz not null default now(),
  sends              int not null default 1,
  window_start       timestamptz not null default now(),
  session_hash       text unique,
  session_expires_at timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists pilot_codes_sent_at on pilot_codes (sent_at);
