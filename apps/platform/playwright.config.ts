import { defineConfig, devices } from "@playwright/test";

// Local and CI runs start their own server on 8792 with throwaway test secrets, so the
// tests can sign themselves in (tests/auth.ts). Remote runs (BASE_URL) only test public pages.
export const TEST_SESSION_SECRET = "e2e-only-not-a-real-secret";
const baseURL = process.env.BASE_URL ?? "http://localhost:8792";

export default defineConfig({
  testDir: "./tests",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npx wrangler dev --port 8792 --var SESSION_SECRET:${TEST_SESSION_SECRET} --var GITHUB_CLIENT_SECRET:e2e-only --var PUBLIC_ORIGIN:http://localhost:8792`,
        url: "http://localhost:8792/signin",
        reuseExistingServer: !process.env.CI,
        timeout: 90_000,
      },
});
