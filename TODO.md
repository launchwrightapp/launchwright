# TODO

## Next
- [ ] **Measure the pilot funnel.** Track: landing visit → application started → submitted →
  accepted learner connects an AI tool → first readiness check → first successful deploy.
  The number that matters most: accepted learners who reach a verified first deploy.
- [ ] **Watch application drop-off.** See where people leave the 5-step form before shortening it.
- [ ] **Smooth the first run.** First project connection, first readiness check, and first deploy
  should work without help.
- [ ] **Reword the pilot emails.** They still say "one of the 10 seats".
- [ ] **Install MCP test deps in the main checkout.** `tweetnacl` is missing there, so
  `apps/mcp` tests only run in CI or fresh worktrees.

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
- [x] Site copy matches what's built: production deploys (not migrations) wait for approval,
  "secure" no longer reads as a guarantee, cost note by the pilot offer, Level 2 marked
  "Not in the pilot", walkthrough tested at 360px (`fix/honest-claims`)
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
