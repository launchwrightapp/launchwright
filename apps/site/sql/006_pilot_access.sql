-- Private pilot access: the GitHub account an accepted applicant signs in with.
-- Filled in on their first sign-in (dashboard or MCP), matched by the GitHub username from the
-- application or their verified GitHub email. "Remove access" clears it with accepted_at.
-- Run once against the Neon database (SQL Editor, or):
--   psql "$DATABASE_URL" -f apps/site/sql/006_pilot_access.sql
alter table waitlist add column if not exists github_id bigint unique;
