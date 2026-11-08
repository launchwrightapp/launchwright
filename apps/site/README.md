# launchwright.app

Landing page + pilot waitlist. Cloudflare Workers (static assets) + Neon.

This site follows the same readiness checks Launchwright teaches:

| Check | How |
|---|---|
| No secrets in repo | gitleaks in CI; `.dev.vars` and `.env*` gitignored |
| Env config | `DATABASE_URL` is a Worker secret; see `.dev.vars.example` |
| CI with tests | `.github/workflows/ci.yml`: typecheck + Playwright |
| Playwright E2E on preview | `BASE_URL=<preview-url> npm run test:e2e` |
| Auth on API routes | Only route is the public waitlist: validated, size-capped, honeypot |
| Database migrations | `sql/001_waitlist.sql` |
| HTTPS + security headers | `public/_headers` (CSP, HSTS, nosniff…), asserted in tests |
| Uptime check | To do after first deploy |

## Develop

```bash
npm install
npm run dev          # http://localhost:8787
npm run test:e2e     # starts wrangler dev on :8790 and runs the smoke tests
```

## Deploy

```bash
psql "$DATABASE_URL" -f sql/001_waitlist.sql
npx wrangler secret put DATABASE_URL
npm run deploy
```
