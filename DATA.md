# Personal data: what we keep, why, and for how long

The Philippine Data Privacy Act (RA 10173) applies to us. This file is the team's working map of personal data; the public promise is the privacy policy at https://launchwright.app/privacy. When they disagree, fix one of them.

Everything below lives in one Neon Postgres database, unless the row says otherwise. Learner retention is enforced daily by `purgeRetention` in `apps/mcp/src/store.ts` (the MCP Worker's cron, 03:00 Manila). Periods live in `RETENTION` there. Change them there and in the privacy policy together.

## Inventory

| Data | Where | Personal data in it | Why | Retention |
|---|---|---|---|---|
| Pilot applications | `waitlist` + answers (apps/site) | Email, answers, optional city, GitHub username, consent time | Review applications, contact applicants | Until the pilot ends; if they don't join, deleted within 30 days after it ends; sooner on request (privacy policy) |
| Email confirmation codes | `pilot_codes` (apps/site) | Email, hashed code | Confirm the email is theirs | Up to 1 day, or until the application is sent (`apps/site/worker/verify.ts` deletes older rows) |
| Pilot funnel | `funnel_daily` (apps/site) | None: daily counts only | See where applicants drop off | No limit needed (no personal data) |
| AI tool sign-in (OAuth grant) | Cloudflare KV `OAUTH_KV` (apps/mcp) | GitHub ID and username, encrypted GitHub token | Let the MCP server act for the learner | Expires 30 days after sign-in (library default `refreshTokenTTL`) |
| Dashboard session | Signed cookie in the learner's browser | Name, GitHub username and ID, avatar URL | Keep them signed in | Up to 7 days (privacy policy) |
| Messages | `threads`, `messages` (apps/platform) | Name, email or GitHub ID, message text | Support and pilot contact | 2 years after the last message (`purgeRetention`) |
| Lesson progress | `lesson_progress` (apps/mcp) | GitHub ID, concepts and exercises done | Adapt lessons, show progress | Until 12 months without activity, then deleted (`purgeRetention`) |
| Projects | `projects` (apps/mcp) | GitHub ID, repo name, production URL, readiness results | Project status and the dashboard | Until 12 months without activity |
| Audit log | `audit_log` (apps/mcp) | GitHub ID, AI tool name, repo, what each tool call did | Show the learner what their AI did; investigate problems | 12 months per entry |
| Approvals | `approvals` (apps/mcp) | GitHub ID, action details | Learner approves production and destructive actions | Expire after 1 day; rows deleted 30 days after expiry |
| Connected accounts | `connections` (apps/mcp) | GitHub ID, sealed Cloudflare, Neon and Supabase tokens | Act on the learner's own cloud accounts | Until the learner disconnects (deleted right away), or 12 months without activity |
| Secret requests | `secret_requests` (apps/mcp) | GitHub ID, secret name, sealed value | Pass a secret from the learner to GitHub or Cloudflare | Value wiped after use, or within 1 hour by the cron (`purgeExpired`); rows deleted 30 days after expiry |
| Secret names | `secret_names` (apps/mcp) | GitHub ID, repo, secret names (never values) | The dashboard's Secrets tab | Until 12 months without activity |
| Database dumps | Wherever the maintainer keeps them (see [RECOVERY.md](RECOVERY.md)) | Everything above | Recovery | Keep the latest 3; delete older ones (manual) |
| Worker logs | Cloudflare (observability) | Request URLs, errors; may include IPs | Debugging | Cloudflare's retention for our plan |

Processors: Cloudflare (hosting, email, logs), Neon (database), GitHub (sign-in), and Anthropic (AI help reviewing applications, without names or contact details). See the privacy policy.

## Deletion on request

The policy promises a reply within 15 days. Learner data is matched by GitHub ID, applicants and messages by email:

```sql
-- learner (GitHub ID)
begin;
delete from lesson_progress where github_id = $1;
delete from projects        where github_id = $1;
delete from connections     where github_id = $1;
delete from secret_names    where github_id = $1;
delete from approvals       where github_id = $1;
delete from secret_requests where github_id = $1;
delete from audit_log       where github_id = $1;
delete from threads         where github_id = $1 or email = lower($2);  -- messages cascade
commit;
```

Pilot applications are deleted by email from the site's tables (`waitlist` and the answers stored with it). Also ask the learner to uninstall the GitHub App. Their AI tool sign-in expires by itself within 30 days.

## Access and protection

- Only the maintainer can reach the database (Neon console, and the Worker secrets).
- Tokens and secret values are sealed with AES-256-GCM (`packages/core/seal.ts`, key in the `TOKEN_KEY` secret); the database never holds a readable credential.
- Team pages and APIs are admin-only and answer 404 to everyone else (`apps/platform/tests/access.spec.ts`).

## If personal data leaks

1. Contain it: rotate the leaked credential (database password, `TOKEN_KEY`, `SESSION_SECRET`), roll back or take the service down if needed ([RUNBOOK.md](RUNBOOK.md)).
2. Work out what data, whose, and since when. The audit log and Worker logs help.
3. **Within 72 hours** of knowing about a breach that is likely to cause serious harm (for example sensitive personal information, or information that enables identity fraud), notify the National Privacy Commission and the affected people, as RA 10173 and NPC Circular 16-03 require. When unsure whether it's notifiable, ask the NPC.
4. Write it up on the outage issue, as in the runbook.
