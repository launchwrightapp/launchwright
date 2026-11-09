# Personal data: what we keep, why, and for how long

The Philippine Data Privacy Act (RA 10173) applies to us. This file is the team's working map of personal data; the public promise is the privacy policy at https://launchwright.app/privacy. When they disagree, fix one of them.

Everything below lives in one Neon Postgres database, unless the row says otherwise. Retention marked **not set** means no period has been decided or written down yet. Those rows are open decisions, not "keep forever".

## Inventory

| Data | Where | Personal data in it | Why | Retention |
|---|---|---|---|---|
| Pilot applications | `waitlist` + answers (apps/site) | Email, answers, optional city, GitHub username, consent time | Review applications, contact applicants | Until the pilot ends; if they don't join, deleted within 30 days after it ends; sooner on request (privacy policy) |
| Email confirmation codes | `pilot_codes` (apps/site) | Email, hashed code | Confirm the email is theirs | Up to 1 day, or until the application is sent (`apps/site/worker/verify.ts` deletes older rows) |
| Pilot funnel | `funnel_daily` (apps/site) | None: daily counts only | See where applicants drop off | **Not set** (no personal data) |
| Dashboard session | Signed cookie in the learner's browser | Name, GitHub username and ID, avatar URL | Keep them signed in | Up to 7 days (privacy policy) |
| Messages | `threads`, `messages` (apps/platform) | Name, email or GitHub ID, message text | Support and pilot contact | **Not set** |
| Lesson progress | `lesson_progress` (apps/mcp) | GitHub ID, concepts and exercises done | Adapt lessons, show progress | **Not set** |
| Projects | `projects` (apps/mcp) | GitHub ID, repo name, production URL, readiness results | Project status and the dashboard | **Not set** |
| Audit log | `audit_log` (apps/mcp) | GitHub ID, AI tool name, repo, what each tool call did | Show the learner what their AI did; investigate problems | **Not set** |
| Approvals | `approvals` (apps/mcp) | GitHub ID, action details | Learner approves production and destructive actions | Expire after 1 day; rows themselves **not set** |
| Connected accounts | `connections` (apps/mcp) | GitHub ID, sealed Cloudflare, Neon and Supabase tokens | Act on the learner's own cloud accounts | Until the learner disconnects, then the tokens are deleted |
| Secret requests | `secret_requests` (apps/mcp) | GitHub ID, secret name, sealed value | Pass a secret from the learner to GitHub or Cloudflare | Value wiped after use, or within 1 hour by the cron (`purgeExpired`); rows **not set** |
| Secret names | `secret_names` (apps/mcp) | GitHub ID, repo, secret names (never values) | The dashboard's Secrets tab | **Not set** |
| Database dumps | Wherever the maintainer keeps them (see [RECOVERY.md](RECOVERY.md)) | Everything above | Recovery | Delete when superseded; **not set** |
| Worker logs | Cloudflare (observability) | Request URLs, errors; may include IPs | Debugging | Cloudflare's retention for our plan |

Processors: Cloudflare (hosting, email, logs), Neon (database), GitHub (sign-in), and Anthropic (AI help reviewing applications, without names or contact details). See the privacy policy.

## Gaps to close before the pilot grows

1. **The privacy policy covers applicants and sign-in, but not what the MCP server and dashboard keep** about learners: lesson progress, projects, the audit log, connected accounts, secret names and messages. Pilot learners should be told before they connect. Add a section, then email learners as the policy promises when it changes.
2. **Decide retention for every row marked not set.** One option: keep learner data while the account is active, and delete it 30 days after the learner asks or after a year without sign-in. Write the decision here and in the policy.
3. **Deletion on request.** The policy promises deletion within its 15-day reply time. Today that's a manual SQL job across the tables above, matched by GitHub ID and email. Write the query down here once it has been done the first time.

## Access and protection

- Only the maintainer can reach the database (Neon console, and the Worker secrets).
- Tokens and secret values are sealed with AES-256-GCM (`packages/core/seal.ts`, key in the `TOKEN_KEY` secret); the database never holds a readable credential.
- Team pages and APIs are admin-only and answer 404 to everyone else (`apps/platform/tests/access.spec.ts`).

## If personal data leaks

1. Contain it: rotate the leaked credential (database password, `TOKEN_KEY`, `SESSION_SECRET`), roll back or take the service down if needed ([RUNBOOK.md](RUNBOOK.md)).
2. Work out what data, whose, and since when. The audit log and Worker logs help.
3. **Within 72 hours** of knowing about a breach that is likely to cause serious harm (for example sensitive personal information, or information that enables identity fraud), notify the National Privacy Commission and the affected people, as RA 10173 and NPC Circular 16-03 require. When unsure whether it's notifiable, ask the NPC.
4. Write it up on the outage issue, as in the runbook.
