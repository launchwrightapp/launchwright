import { test, expect } from "@playwright/test";
import { signIn, remote, testAdmin } from "./auth";

// The local test server has no DATABASE_URL, so the APIs answer 503 with a friendly message.
test.skip(remote, "Signed-in tests run locally and in CI, not against deployed URLs");

test.describe("learner", () => {
  test.beforeEach(async ({ context, baseURL }) => signIn(context, baseURL!));

  test("messages page explains when messaging isn't set up", async ({ page }) => {
    await page.goto("/messages");
    await expect(page.getByText("Messages aren't set up yet")).toBeVisible();
    const box = page.getByRole("textbox", { name: "Your message" });
    await expect(box).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
    await box.fill("hello");
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  test("the team inbox doesn't exist for learners", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href="/messages"]').first()).toBeAttached();
    await expect(page.locator('a[href="/inbox"]')).toHaveCount(0);
    await expect(page.locator('a[href="/applicants"]')).toHaveCount(0);
    expect((await page.goto("/inbox"))?.status()).toBe(404);
    expect((await page.goto("/applicants"))?.status()).toBe(404);
    expect((await page.goto("/funnel"))?.status()).toBe(404);
    expect((await page.request.get("/api/admin/funnel")).status()).toBe(404);
    expect((await page.request.get("/api/admin/applicants")).status()).toBe(404);
    expect((await page.request.get("/api/admin/threads")).status()).toBe(404);
  });

  test("the Message us box opens from any page and closes again", async ({ page }) => {
    await page.goto("/lessons");
    const launcher = page.getByRole("link", { name: /Message us/ });
    await launcher.click();
    const panel = page.getByRole("region", { name: /launchwright/ });
    await expect(panel).toBeVisible();
    await expect(launcher).toBeHidden();
    await expect(panel.getByText("Messages aren't set up yet")).toBeVisible();
    const box = panel.getByRole("textbox", { name: "Message to the launchwright team" });
    await expect(box).toBeFocused();
    await box.fill("hello");
    await expect(panel.getByRole("button", { name: "Send" })).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(launcher).toBeFocused();
  });

  test("the Message us box stays open on the next page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Message us/ }).click();
    await page.goto("/readiness");
    await expect(page.getByRole("region", { name: /launchwright/ })).toBeVisible();
    await page.getByRole("button", { name: "Minimize" }).click();
    await page.goto("/");
    await expect(page.getByRole("region", { name: /launchwright/ })).toBeHidden();
  });

  test("no Message us box on the Messages page itself", async ({ page }) => {
    await page.goto("/messages");
    await expect(page.locator("[data-chat]")).toHaveCount(0);
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

  test("the team gets operations in the nav instead of Messages", async ({ page }) => {
    await page.goto("/applicants");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pilot applicants");
    await expect(page.locator('a[href="/applicants"]').first()).toBeAttached();
    await expect(page.locator('a[href="/messages"]')).toHaveCount(0);
    await expect(page.locator("[data-chat]")).toHaveCount(0);
    await expect(page.getByText("Applications aren't", { exact: false }).or(page.getByText("DATABASE_URL isn't set"))).toBeVisible();
  });
});

test.describe("admin funnel", () => {
  test.beforeEach(async ({ context, baseURL }) => signIn(context, baseURL!, testAdmin));

  test("the funnel page is in the team nav and explains a missing database", async ({ page }) => {
    await expect(async () => expect((await page.goto("/funnel"))?.status()).toBe(200)).toPass();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pilot funnel");
    await expect(page.locator('a[href="/funnel"]').first()).toBeAttached();
    await expect(page.getByText("DATABASE_URL isn't set")).toBeVisible();
    await expect(page.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  });

  test("the funnel API only answers GET", async ({ page }) => {
    await page.goto("/funnel");
    expect((await page.request.post("/api/admin/funnel", { data: {} })).status()).toBe(405);
  });
});

test("signed-out API calls get 401, not a redirect", async ({ request }) => {
  const res = await request.get("/api/messages", { maxRedirects: 0 });
  expect(res.status()).toBe(401);
});
