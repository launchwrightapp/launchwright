import { test, expect } from "@playwright/test";
import { signIn, remote, testAdmin } from "./auth";

// The local test server has no DATABASE_URL, so the APIs answer 503 with a friendly message.
test.skip(remote, "Signed-in tests run locally and in CI, not against deployed URLs");

test.describe("learner", () => {
  test.beforeEach(async ({ context, baseURL }) => signIn(context, baseURL!));

  test("messages page explains when messaging isn't set up", async ({ page }) => {
    await page.goto("/messages");
    await expect(page.getByText("Messages aren't set up yet")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Your message" })).toBeVisible();
  });

  test("the team inbox doesn't exist for learners", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href="/messages"]').first()).toBeAttached();
    await expect(page.locator('a[href="/inbox"]')).toHaveCount(0);
    expect((await page.goto("/inbox"))?.status()).toBe(404);
    expect((await page.request.get("/api/admin/threads")).status()).toBe(404);
  });

  test("message API rejects cross-site posts", async ({ page }) => {
    const res = await page.request.post("/api/messages", { headers: { origin: "https://evil.example", "content-type": "application/json" }, data: { body: "hi" } });
    expect(res.status()).toBe(403);
  });
});

test.describe("admin", () => {
  test.beforeEach(async ({ context, baseURL }) => signIn(context, baseURL!, testAdmin));

  test("team inbox is reachable and in the nav", async ({ page }) => {
    await expect(async () => expect((await page.goto("/inbox"))?.status()).toBe(200)).toPass();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Messages from learners");
    await expect(page.locator('a[href="/inbox"]').first()).toBeAttached();
  });
});

test("signed-out API calls get 401, not a redirect", async ({ request }) => {
  const res = await request.get("/api/messages", { maxRedirects: 0 });
  expect(res.status()).toBe(401);
});
