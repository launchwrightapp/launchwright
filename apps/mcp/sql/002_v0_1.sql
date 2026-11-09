-- v0.1: projects and readiness results, the audit log, approvals for destructive actions,
-- connected accounts (encrypted tokens), and one-time secret requests.
-- Same Neon database as the site and platform. Run once after 001:
--   psql "$DATABASE_URL" -f apps/mcp/sql/002_v0_1.sql
--
-- Tokens and secret values are sealed with AES-256-GCM (packages/core/seal.ts) using the
-- TOKEN_KEY Worker secret. This database never holds a readable credential.

-- One row per learner repo, written by the MCP server whenever it looks at the repo.
create table if not exists projects (
  id               bigint generated always as identity primary key,
  github_id        bigint not null,
  repo             text   not null,               -- owner/name
  framework        text,
  package_manager  text,
  database         text,
  hosting          text,
  worker_name      text,                           -- from wrangler config, for Worker secrets and logs
  production_url   text,                           -- https only; used by the live checks
  readiness_passed int,
  readiness_total  int,
  checks           jsonb,                          -- the last check_readiness result
  checked_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- GitHub names are case-insensitive: Juan/Shop and juan/shop are the same repo.
create unique index if not exists projects_repo_idx on projects (github_id, lower(repo));

-- Everything the AI did (and everything the learner decided), newest first on the dashboard.
create table if not exists audit_log (
  id         bigint generated always as identity primary key,
  github_id  bigint not null,
  actor      text   not null check (actor in ('ai', 'learner', 'system')),
  client     text,                                 -- "Claude Code", "Cursor", ...
  tool       text   not null,                      -- tool name or dashboard action
  repo       text,
  summary    text   not null,                      -- never contains a secret value
  outcome    text   not null check (outcome in ('ok', 'error', 'blocked', 'pending')),
  created_at timestamptz not null default now()
);
create index if not exists audit_log_recent_idx on audit_log (github_id, created_at desc);

-- Destructive or production actions wait here until the learner decides in the dashboard.
create table if not exists approvals (
  id         uuid primary key default gen_random_uuid(),
  github_id  bigint not null,
  repo       text   not null,
  client     text,
  tool       text   not null,
  action     text   not null,                      -- e.g. deploy:production
  title      text   not null,
  summary    text   not null,                      -- plain words: what happens if you approve
  detail     jsonb  not null default '{}',          -- what exactly runs (shown under "Inspect")
  status     text   not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'used', 'expired')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  used_at    timestamptz,
  expires_at timestamptz not null default now() + interval '1 day'
);
create index if not exists approvals_pending_idx on approvals (github_id, status, created_at desc);

-- Cloudflare, Neon and Supabase accounts. One per provider per learner.
create table if not exists connections (
  github_id      bigint not null,
  provider       text   not null check (provider in ('cloudflare', 'neon', 'supabase')),
  method         text   not null check (method in ('oauth', 'api_key')),
  account_id     text,
  account_label  text,                             -- shown on the dashboard
  scopes         text,                             -- what the token can do, plain words
  token_sealed   text   not null,
  refresh_sealed text,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (github_id, provider)
);

-- set_secret: the AI asks by name, the learner types the value on the dashboard, the MCP server
-- writes it to GitHub or Cloudflare and wipes it here. Values live at most an hour, sealed:
-- a cron on the MCP Worker (purgeExpired in src/store.ts) wipes any value left past expires_at.
create table if not exists secret_requests (
  id           uuid primary key default gen_random_uuid(),
  github_id    bigint not null,
  repo         text   not null,
  name         text   not null,
  target       text   not null check (target in ('github_actions', 'cloudflare_worker', 'both')),
  status       text   not null default 'waiting' check (status in ('waiting', 'submitted', 'applied', 'expired', 'cancelled')),
  value_sealed text,
  created_at   timestamptz not null default now(),
  submitted_at timestamptz,
  applied_at   timestamptz,
  expires_at   timestamptz not null default now() + interval '1 hour'
);
create index if not exists secret_requests_idx on secret_requests (github_id, status, created_at desc);
create index if not exists secret_requests_purge_idx on secret_requests (expires_at) where value_sealed is not null;

-- Names (never values) of the secrets Launchwright has set, for the dashboard's Secrets tab.
create table if not exists secret_names (
  github_id  bigint not null,
  repo       text   not null,
  name       text   not null,
  target     text   not null,
  updated_at timestamptz not null default now(),
  primary key (github_id, repo, name, target)
);
