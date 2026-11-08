# Contributing

Thanks for helping. Launchwright teaches beginners how real production apps work, so the code here
should be easy to read and safe by default.

## Setup

```bash
npm install
npm run dev -w apps/site        # http://localhost:8790
npm run dev -w apps/platform    # http://localhost:8791
npm run test:e2e -w apps/site
npm run test:e2e -w apps/platform
```

## Pull requests

1. Fork, then branch from `main` (`feat/short-name` or `fix/short-name`).
2. Keep each PR to one change. Add or update a Playwright test when behavior changes.
3. CI runs the secret scan, typecheck, and E2E tests. Preview deploys run only for branches in
   this repo (forks don't get deploy secrets), so a maintainer will check the preview for you.

## Rules of the codebase

- **UI copy is English.** The logo is always lowercase: `launchwright`.
- **Strict CSP:** no inline `style=`, `<style>`, or inline scripts. Use Tailwind classes and
  files in `src/scripts`.
- **Shared UI lives in `packages/ui`** (theme tokens, layout, logo, theme switch). Use its tokens
  (`bg-surface`, `text-muted`, `border-line`, …) so light and dark mode both work.
- **Mockups say "Sample".** Never show made-up numbers as real.
- **Never commit secrets.** `.dev.vars` and `.env*` are git-ignored; use `.dev.vars.example`.

## License

By contributing, you agree your contributions are licensed under the
[GNU AGPL-3.0](LICENSE) (the `packages/cli` npm package stays MIT).
