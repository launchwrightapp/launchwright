import { test, expect } from "@playwright/test";

// The pilot funnel (worker/funnel.ts): anonymous counts, at most one per tab per event.
const isDeployed = !!process.env.BASE_URL && !process.env.BASE_URL.includes("localhost");

test("the landing page counts one visit per tab", async ({ page }) => {
  const events: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/funnel")) events.push(JSON.parse(r.postData() ?? "{}").event);
  });
  const sent = page.waitForResponse((r) => r.url().endsWith("/api/funnel"));
  await page.goto("/");
  expect((await sent).status()).toBe(204);
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(events).toEqual(["visit"]);
});

test("the application counts each step reached, once", async ({ page }) => {
  test.skip(isDeployed, "the questionnaire needs a real session on deployed sites");
  const events: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/funnel")) events.push(JSON.parse(r.postData() ?? "{}").event);
  });
  await page.goto("/pilot/apply");
  await page.getByRole("radio", { name: "Career shifter" }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForLoadState("networkidle");
  expect(events).toEqual(["apply_1", "apply_2"]);
});

test("the funnel endpoint takes known events only, from this site", async ({ request, baseURL }) => {
  const post = (data: unknown, headers: Record<string, string> = {}) =>
    request.post("/api/funnel", { data, headers: { origin: new URL(baseURL!).origin, ...headers } });
  expect((await post({ event: "visit" })).status()).toBe(204);
  expect((await post({ event: "apply_3" })).status()).toBe(204);
  expect((await post({ event: "drop table" })).status()).toBe(400);
  expect((await post({ event: "visit" }, { origin: "https://evil.example" })).status()).toBe(403);
  expect((await request.get("/api/funnel")).status()).toBe(405);
});

test("the funnel report needs the admin token", async ({ request }) => {
  expect((await request.get("/api/admin/funnel")).status()).toBe(404);
  expect((await request.get("/api/admin/funnel", { headers: { authorization: "Bearer nope" } })).status()).toBe(404);
});
