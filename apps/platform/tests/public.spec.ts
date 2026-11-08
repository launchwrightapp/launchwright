// Public behavior: runs locally, in CI, and against preview and production URLs.
import { test, expect } from "@playwright/test";

test("signed-out visitors are sent to sign in, keeping where they were going", async ({ page }) => {
  await page.goto("/security");
  await expect(page).toHaveURL(/\/signin\?next=%2Fsecurity$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to launchwright");
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toHaveAttribute("href", "/auth/github?next=%2Fsecurity");
});

test("Continue with GitHub goes to GitHub with this app and a state", async ({ request, baseURL }) => {
  const res = await request.get("/auth/github?next=/lessons", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  const to = new URL(res.headers()["location"]);
  expect(to.origin + to.pathname).toBe("https://github.com/login/oauth/authorize");
  expect(to.searchParams.get("client_id")).toBe("Iv23lixXjMCTRCvuULLf");
  expect(to.searchParams.get("redirect_uri")).toBe(`${new URL(baseURL!).origin}/auth/github/callback`);
  expect(to.searchParams.get("state")).toMatch(/^[0-9a-f]{48}$/);
});

test("a callback without the right state is refused", async ({ page }) => {
  await page.goto("/auth/github/callback?code=fake&state=forged");
  await expect(page).toHaveURL(/\/signin\?error=expired$/);
  await expect(page.getByRole("status")).toContainText("expired");
});

test("a forged session cookie doesn't get in", async ({ context, page, baseURL }) => {
  await context.addCookies([{ name: "__Host-lw_session", value: "v1.eyJpZCI6MX0.AAAA", domain: new URL(baseURL!).hostname, path: "/", secure: true }]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin/);
});

test("sign out only accepts POST", async ({ request }) => {
  expect((await request.get("/auth/logout", { maxRedirects: 0 })).status()).toBe(405);
});

test("security headers and noindex", async ({ request }) => {
  const h = (await request.get("/signin")).headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-robots-tag"]).toBe("noindex");
});

test("sign-in page has no errors and no horizontal scroll", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/signin");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
