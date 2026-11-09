-- Pilot funnel: anonymous daily totals (worker/funnel.ts). No email, IP, or cookie is kept,
-- only "on this day, N tabs did this". Run once against the Neon database (SQL Editor, or):
--   psql "$DATABASE_URL" -f sql/005_funnel.sql
create table if not exists funnel_daily (
  day   date not null default current_date,
  event text not null,
  n     int  not null default 0,
  primary key (day, event)
);
