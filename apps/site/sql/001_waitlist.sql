-- Pilot waitlist. Run once against the Neon database:
--   psql "$DATABASE_URL" -f sql/001_waitlist.sql
create table if not exists waitlist (
  id          bigint generated always as identity primary key,
  email       text not null unique,
  name        text,
  building    text,
  consent_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
