-- Pilot reminders: how many nudges an accepted learner got, and when the last one went out.
-- Sent from the platform's Applicants page (apps/platform/worker/activity.ts limits them).
-- Run once against the Neon database (SQL Editor, or):
--   psql "$DATABASE_URL" -f apps/site/sql/007_pilot_reminders.sql
alter table waitlist add column if not exists reminders_sent int not null default 0;
alter table waitlist add column if not exists last_reminded_at timestamptz;
