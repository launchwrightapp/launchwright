# TODO

## Curriculum
- [ ] **Lesson: dummy data with an API spec (OpenAPI).** Teach learners to write an OpenAPI spec for
  their API first, then serve dummy data from it (e.g. Prism mock server, or MSW in the browser)
  so the UI can be built before the backend or database exists.
  - Why: frontend and backend agree on one contract; the spec doubles as docs and test fixtures.
  - Where it fits: Level 1, around 03 Database / 05 Testing.
  - Dogfood it: `apps/platform/dev/mock-api.mjs` is a hand-written mock today. Replace it with an
    OpenAPI spec for `/api/admin/*` and `/api/messages` + a generated mock, and use that as the
    lesson's worked example.
