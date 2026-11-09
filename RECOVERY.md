# Recovery: backups and restore

Our data lives in one Neon Postgres database, shared by all three apps (see the comments in `apps/*/sql/`). The site reads it through its own `DATABASE_URL` Worker secret. The dashboard and MCP server get theirs from the `PLATFORM_DATABASE_URL` repo secret at deploy time. The code is on GitHub, and the Workers can be redeployed from any commit, so **the database is the only thing that needs a backup**.

What would hurt to lose: pilot applications (site), lesson progress, connected accounts and approvals (MCP), and the team inbox (platform). See [DATA.md](DATA.md) for the full list.

## What protects us

1. **Neon point-in-time restore.** Neon keeps the history of every change for the project's restore window. That window depends on the plan, so check it under Project settings → Storage before you rely on it. Within that window we can restore to any second, for example just before a bad migration ran.
2. **A logical backup (pg_dump)** you keep yourself. It covers mistakes found after the restore window has passed, or losing the Neon account. Take one before every hand-applied migration, and at least monthly during the pilot.

```sh
# Needs Postgres client tools (brew install libpq). Use the direct (unpooled) connection string.
pg_dump --format=custom --no-owner --file "launchwright-$(date +%F).dump" "$DIRECT_DATABASE_URL"
```

The dump holds applicants' personal data. Keep it encrypted, for example on an encrypted disk or in a password manager's file storage, never in the repo or in chat. Delete dumps you no longer need (see [DATA.md](DATA.md)).

## Restore

### From Neon history (a mistake within the restore window)

1. In the Neon console, open the project → Branches. Create a branch from the production branch **at a past point in time**, just before the problem.
2. Connect to the new branch and check the data is right: `select count(*) from waitlist;` and the rows you care about.
3. Then either:
   - **Restore in place:** use Restore on the production branch, set to that time. Neon keeps a backup of the state before the restore. Or:
   - **Switch over:** point the Workers at the new branch by updating the `DATABASE_URL` secrets (repo secret for platform and MCP, then redeploy; `npx wrangler secret put DATABASE_URL` in apps/site).
4. Check the health URLs and sign in to the dashboard, as in [RUNBOOK.md](RUNBOOK.md).

### From a pg_dump file

```sh
# Into a NEW empty Neon branch or database first, never straight over production.
pg_restore --no-owner --clean --if-exists --dbname "$NEW_DATABASE_URL" launchwright-YYYY-MM-DD.dump
```

Check the data as above, then switch the `DATABASE_URL` secrets over.

## Migrations and rollback

Migrations are hand-applied SQL files in `apps/*/sql/`. A Worker rollback doesn't undo them, so:
- take a dump (or note the time, for point-in-time restore) right before applying one;
- make changes backward compatible: add, don't rename or drop in the same release as the code that stops using them;
- try the migration on a Neon branch first.

## Restore drill log

A backup only counts once a restore from it has worked. Do a drill every 3 months: restore into a new Neon branch, check the row counts, time how long it took, then delete the branch.

| Date | What was restored | From | Took | Result | By |
|---|---|---|---|---|---|
| _not yet done_ | | | | | |
