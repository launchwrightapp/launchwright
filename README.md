# Launchwright

Build it right. Launch it right.

Launchwright teaches beginners how real production apps work while they ship their own app.
This repo holds the website, the learner dashboard, the shared UI, and the CLI.

| Path | What |
|---|---|
| `apps/site` | launchwright.app landing page + waitlist (Cloudflare Workers + Neon) |
| `apps/platform` | platform.launchwright.app dashboard (v0.1 mockup, sample data) |
| `packages/ui` | Shared UI: Tailwind theme tokens (light/dark), layout, logo, theme switch |
| `packages/cli` | `launchwright` npm package (placeholder CLI) |

```bash
npm install
npm run dev -w apps/site
npm run test:e2e -w apps/site
```

## Shipping changes (GitHub flow)

Never deploy from a laptop and never push straight to `main`.

1. `git checkout -b feat/short-name`
2. Commit, push, open a pull request.
3. CI runs the secret scan, typecheck, and Playwright tests, then uploads a **preview** of both apps
   (`pr-<number>-…workers.dev`), runs the E2E tests against it, and comments the links on the PR.
4. Review the preview, then merge.
5. Merging to `main` deploys `launchwright.app` and `platform.launchwright.app`, runs the smoke tests
   against production, and rolls back automatically if they fail.

Needs `CLOUDFLARE_API_TOKEN` (secret) and `CLOUDFLARE_ACCOUNT_ID` (variable) in the repo settings.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately: [SECURITY.md](SECURITY.md).

## License

[GNU AGPL-3.0](LICENSE). The `packages/cli` npm package is MIT (see its own LICENSE).
