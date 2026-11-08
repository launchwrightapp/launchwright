-- Pilot questionnaire answers (role, experience, tools, stage, goals, ...).
-- Run once against the Neon database (SQL Editor, or):
--   psql "$DATABASE_URL" -f sql/003_pilot_answers.sql
alter table waitlist add column if not exists answers jsonb;
