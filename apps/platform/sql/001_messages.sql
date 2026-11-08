-- Messages between learners and the team. Same Neon database as the site.
-- Run once (Neon SQL Editor, or): psql "$DATABASE_URL" -f apps/platform/sql/001_messages.sql
--
-- One conversation per person. A learner who signs in is matched by GitHub account;
-- email to hello@launchwright.app is matched by the sender's address.
create table if not exists threads (
  id              bigint generated always as identity primary key,
  email           text unique,           -- lowercased; null if GitHub gave us none
  github_id       bigint unique,         -- null for email-only conversations
  github_login    text,
  name            text,
  subject         text not null,
  unread          boolean not null default true,  -- for the team inbox
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table if not exists messages (
  id               bigint generated always as identity primary key,
  thread_id        bigint not null references threads (id) on delete cascade,
  direction        text not null check (direction in ('in', 'out')),  -- in = from the learner
  via              text not null check (via in ('platform', 'email')),
  author           text,
  body             text not null,
  email_message_id text,                 -- Message-ID header, to keep email replies threaded
  created_at       timestamptz not null default now()
);

create index if not exists messages_thread_idx on messages (thread_id, created_at);
create index if not exists threads_recent_idx on threads (last_message_at desc);
