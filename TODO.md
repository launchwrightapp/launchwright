# TODO

## Next
- [ ] **Smooth the first run.** First project connection, first readiness check, and first deploy
  should work without help.
- [ ] **Read the funnel.** `npm run pilot -- funnel 30` (in `apps/site`). Once a few weeks of data are in,
  shorten the application where people leave it.

## Curriculum
- [ ] **Lesson: dummy data with an API spec (OpenAPI).** Teach learners to write an OpenAPI spec for
  their API first, then serve dummy data from it (e.g. Prism mock server, or MSW in the browser)
  so the UI can be built before the backend or database exists.
  - Why: frontend and backend agree on one contract; the spec doubles as docs and test fixtures.
  - Where it fits: Level 1, around 03 Database / 05 Testing.
  - Dogfood it: `apps/platform/dev/mock-api.mjs` is a hand-written mock today. Replace it with an
    OpenAPI spec for `/api/admin/*` and `/api/messages` + a generated mock, and use that as the
    lesson's worked example.

## Done
- [x] Pilot funnel and application drop-off: anonymous daily counts from landing visit to
  verified email and each form step, plus learner steps from the MCP audit log, read with
  `npm run pilot -- funnel` (#PR)
- [x] Pilot emails no longer talk about seats (#41)
- [x] FAQ uses button toggles instead of `<details>` (#42)
- [x] Landing page says it's for websites and web apps, not mobile apps (#38)
- [x] MCP test dependencies installed in the main checkout
- [x] Site copy matches what's built: production deploys (not migrations) wait for approval,
  "secure" no longer reads as a guarantee, cost note by the pilot offer, Level 2 marked
  "Not in the pilot", walkthrough tested at 360px (#33)
- [x] Landing page sections restyled with motion, electric blue CTAs, compact nav on scroll (#31)
- [x] Launch ops (#30)
- [x] Platform dashboard: projects, readiness, lessons, accounts, approvals, audit log (#29)
- [x] MCP server v0.1: all 9 tools, encrypted tokens (AES-256-GCM), dashboard approvals that
  work once and expire in 24h, audit log; live at mcp.launchwright.app (#20, #22, #25, #26, #28)
- [x] Platform UI polish, smaller radius, content corners (#18, #19, #27)
- [x] Underlined tabs (#21, #23); site copy fixes (#24)
- [x] Worktree-per-branch flow (#17)
- [x] Pilot: application questionnaire, email code sign-in, bot protection, emails, admin
  messages and ops (#4, #5, #8, #9, #14, #16)
- [x] Brand: favicon, blue logo, LW mark, hero arc (#10–#13)
- [x] Tailwind redesign (#2); contextual explorer fix (#6)
