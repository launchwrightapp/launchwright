-- Track pilot emails. Run once against the Neon database (SQL Editor, or):
--   psql "$DATABASE_URL" -f sql/002_pilot_emails.sql
alter table waitlist add column if not exists acknowledged_at timestamptz;
alter table waitlist add column if not exists accepted_at timestamptz;
