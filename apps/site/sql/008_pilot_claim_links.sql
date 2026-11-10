-- Pilot sign-in links: the link in the "You're in" email that links an accepted applicant's GitHub
-- account to their application (packages/core/pilot-claim.ts). Only a SHA-256 hash of the token is
-- kept. Cleared when the link is used; replaced when the acceptance email is resent.
-- Run once against the Neon database (SQL Editor, or):
--   psql "$DATABASE_URL" -f apps/site/sql/008_pilot_claim_links.sql
alter table waitlist add column if not exists claim_hash text unique;
alter table waitlist add column if not exists claim_expires_at timestamptz;
