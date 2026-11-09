# Runbook: when launchwright is down or broken

Owner and on call: the maintainer (@rmbergonia on GitHub). Contact for learners: hello@launchwright.app.

## What we run

| Service | Address | Worker | Health check |
|---|---|---|---|
| Site and pilot form | https://launchwright.app | `launchwright-site` (apps/site) | `/` answers 200 |
| Dashboard | https://platform.launchwright.app | `launchwright-platform` (apps/platform) | `/health` says `"ok":true` |
| MCP server | https://mcp.launchwright.app | `launchwright-mcp` (apps/mcp) | `/health` says `"ok":true` |

All three run on Cloudflare Workers and keep data in Neon Postgres. GitHub provides sign-in.

## How we find out

- **Uptime alert:** `.github/workflows/uptime.yml` checks all three services every 10 minutes. On failure it opens one GitHub issue labelled `outage` (or comments on the open one), and GitHub notifies the maintainer. It closes the issue itself when every check passes again.
- **Failed deploy:** the `Deploy production` job in `.github/workflows/pipeline.yml` smoke-tests production after each deploy. If that fails, it **rolls back all three Workers automatically**, and the run shows as failed.
- **Learners:** messages to hello@launchwright.app land in the dashboard inbox (`/inbox`).

## First 15 minutes

1. **Acknowledge:** comment "Looking" on the outage issue, so it's clear someone has it.
2. **Scope:** which service is failing, and since when? Open the failing uptime run from the issue, then check the health URLs above yourself.
3. **Recent change?** Compare the time it started with the latest deploys: `gh run list --branch main --limit 5`.
   - If it started right after a deploy, **roll back first, debug later** (see below).
4. **Platform problem?** Check https://www.cloudflarestatus.com, https://neonstatus.com and https://www.githubstatus.com. If one of them is down, post a short note to pilot learners and wait for the fix.
5. **Logs:** run `npx wrangler tail <worker-name>` from the app's folder, or open Workers → the worker → Logs in the Cloudflare dashboard.

## Roll back a Worker

A rollback switches the Worker back to its previous deployed version (the code, plus that version's settings and secrets). It takes effect within seconds.

```sh
cd apps/<site|platform|mcp>
npx wrangler deployments list          # find the version that was working
npx wrangler rollback                  # previous version
npx wrangler rollback <version-id>     # or a specific one
```

You can also do it in the Cloudflare dashboard: Workers & Pages → the worker → Deployments → Rollback.

**Then make main match production.** The next push to main deploys main again, which would undo the rollback. Revert the bad merge in a pull request: `git revert -m 1 <merge-sha>` on a branch, open the PR, let checks pass, then merge.

**A rollback doesn't undo database changes.** We apply migrations by hand (`apps/*/sql/`), so make them backward compatible: add columns and tables, and don't rename or drop in the same release as the code that stops using them. If the data itself is damaged, follow [RECOVERY.md](RECOVERY.md).

## Common failures

| Symptom | Likely cause | Fix |
|---|---|---|
| `/health` answers 503 with `"ok":false` | A secret is missing on that Worker | Check the repo secrets used by the deploy job, then re-run the deploy |
| Dashboard sign-in loops or fails | GitHub App client secret rotated, or `SESSION_SECRET` changed | Update the repo secret and redeploy; everyone has to sign in again |
| MCP tools fail with "not connected" for everyone | `TOKEN_KEY` differs between platform and MCP | Both must be the same value; fix the secret and redeploy both |
| 5xx errors only on data pages | Neon is down or `DATABASE_URL` is wrong | Check Neon status and the connection string |

## After the incident

Within two days, add a short note to the outage issue:
- what happened and how long it lasted;
- how we found out, and whether the alert came first;
- what fixed it;
- one change that would stop it happening again, or catch it sooner.

If learners' personal data may have been exposed, the Data Privacy Act clock starts: see [DATA.md](DATA.md#if-personal-data-leaks).
