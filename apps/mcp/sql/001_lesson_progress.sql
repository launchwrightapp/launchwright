-- The lesson engine: which concepts each learner has been taught, so a lesson is full
-- the first time and one line after that. Same Neon database as the site and platform.
-- Run once (Neon SQL Editor, or): psql "$DATABASE_URL" -f apps/mcp/sql/001_lesson_progress.sql
create table if not exists lesson_progress (
  github_id     bigint not null,
  concept       text   not null,
  times_seen    int    not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (github_id, concept)
);
