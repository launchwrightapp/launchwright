import { test, expect } from "@playwright/test";

const isPreview = !!process.env.BASE_URL;

test("home page renders the hero and every section", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await expect(page).toHaveTitle("Launchwright");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Build it right.");
  for (const id of ["how", "curriculum", "readiness", "pilot"]) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
  expect(errors, errors.join("\n")).toEqual([]);
});

test("no horizontal scroll", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["strict-transport-security"]).toContain("max-age=");
});

test.describe("waitlist API", () => {
  test("rejects GET", async ({ request }) => {
    const res = await request.get("/api/waitlist");
    expect(res.status()).toBe(405);
  });

  test("rejects a bad email", async ({ request }) => {
    const res = await request.post("/api/waitlist", { data: { email: "not-an-email", consent: true } });
    expect(res.status()).toBe(400);
  });

  test("rejects missing consent", async ({ request }) => {
    const res = await request.post("/api/waitlist", { data: { email: "a@example.com" } });
    expect(res.status()).toBe(400);
  });

  test("rejects oversized bodies", async ({ request }) => {
    const res = await request.post("/api/waitlist", {
      data: { email: "a@example.com", consent: true, building: "x".repeat(5000) },
    });
    expect(res.status()).toBe(400);
  });

  test("honeypot submissions are silently dropped", async ({ request }) => {
    const res = await request.post("/api/waitlist", {
      data: { email: "bot@example.com", consent: true, website: "http://spam" },
    });
    expect(res.status()).toBe(200);
  });

  test("valid signup without a database says the waitlist isn't open", async ({ request }) => {
    test.skip(isPreview, "Would write a real row on a deployed site");
    const res = await request.post("/api/waitlist", { data: { email: "a@example.com", consent: true } });
    expect(res.status()).toBe(503);
  });
});

test("form shows an error for a bad email without submitting", async ({ page }) => {
  await page.goto("/#pilot");
  await page.getByRole("textbox", { name: "Email" }).fill("nope");
  await page.getByRole("button", { name: /Join the waitlist/ }).click();
  await expect(page.locator("#waitlist-status")).toHaveText("Please check your email address.");
});

test("theme switch toggles and remembers the choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const toggle = page.locator("[data-theme-toggle]");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
