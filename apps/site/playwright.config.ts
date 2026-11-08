import { defineConfig, devices } from "@playwright/test";

// Local: starts `wrangler dev` and tests it.
// Preview deploy: BASE_URL=https://<preview-url> npx playwright test
const baseURL = process.env.BASE_URL ?? "http://localhost:8790";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:8790",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
