import { test, expect, type Page } from "@playwright/test";

// Deployed previews: don't create real applications.
const isDeployed = !!process.env.BASE_URL && !process.env.BASE_URL.includes("localhost");
const cont = (page: Page) => page.getByRole("button", { name: "Continue" }).click();
const status = (page: Page) => page.locator("#pilot-status");
const stepHeading = (page: Page) => page.locator("[data-step]:not([hidden]) h2");

async function fillToReview(page: Page) {
  await page.goto("/pilot?email=juan@example.com");
  await page.getByRole("textbox", { name: "First name" }).fill("Juan");
  await page.getByRole("radio", { name: "Career shifter" }).check();
  await cont(page);
  await page.getByRole("radio", { name: "I build with AI (vibe coding)" }).check();
  await page.getByRole("checkbox", { name: "Claude Code" }).check();
  await page.getByRole("checkbox", { name: "Cursor" }).check();
  await cont(page);
  await page.getByRole("textbox", { name: "What do you want to ship?" }).fill("A booking app for our barbershop");
  await page.getByRole("radio", { name: "Building it" }).check();
  await cont(page);
  await page.getByRole("checkbox", { name: "Deploying" }).check();
  await page.getByRole("radio", { name: "5–10" }).check();
  await cont(page);
}

test("the questionnaire renders as a 5-step stepper with no errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/pilot");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Apply for the pilot");
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  await expect(stepHeading(page)).toHaveText("About you");
  await expect(page.locator("[data-step]:visible")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Back" })).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("each step checks its required answers before continuing", async ({ page }) => {
  await page.goto("/pilot");
  await cont(page);
  await expect(status(page)).toHaveText("Please check your email address.");
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  await page.getByRole("textbox", { name: "Email" }).fill("juan@example.com");
  await cont(page);
  await expect(status(page)).toHaveText("Please answer: What describes you best?");
  await page.getByRole("radio", { name: "Student" }).check();
  await cont(page);
  await expect(page.getByText("Step 2 of 5")).toBeVisible();
  await expect(stepHeading(page)).toBeFocused();
  await cont(page);
  await expect(status(page)).toHaveText("Please answer: How much have you coded?");
});

test("back keeps answers, and review shows them with edit links", async ({ page }) => {
  await fillToReview(page);
  await expect(page.getByText("Step 5 of 5")).toBeVisible();
  const review = page.locator("[data-review]");
  await expect(review).toContainText("juan@example.com");
  await expect(review).toContainText("Career shifter");
  await expect(review).toContainText("Claude Code, Cursor");
  await expect(review).toContainText("A booking app for our barbershop");
  await expect(review).toContainText("5–10");

  await page.getByRole("button", { name: "Edit Your project" }).click();
  await expect(page.getByText("Step 3 of 5")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "What do you want to ship?" })).toHaveValue("A booking app for our barbershop");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("checkbox", { name: "Claude Code" })).toBeChecked();
});

test("sending needs consent, then posts the answers", async ({ page }) => {
  test.skip(isDeployed, "Would write a real row on a deployed site");
  await fillToReview(page);
  await page.getByRole("button", { name: "Send application" }).click();
  await expect(status(page)).toHaveText("Please give consent to apply.");

  await page.getByRole("checkbox", { name: /I agree/ }).check();
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().endsWith("/api/waitlist") && r.method() === "POST"),
    page.getByRole("button", { name: "Send application" }).click(),
  ]);
  expect(req.postDataJSON()).toMatchObject({
    email: "juan@example.com", role: "shifter", experience: "ai", tools: ["claude-code", "cursor"],
    stage: "building", learn: ["deploy"], hours: "5-10", consent: true,
  });
  // The local server has no database, so it answers with the friendly 503.
  await expect(status(page)).toHaveText("Applications aren't being saved yet. Please check back soon.");
});

test("'None yet' and specific AI tools don't mix", async ({ page }) => {
  await page.goto("/pilot?email=a@example.com");
  await page.getByRole("radio", { name: "Student" }).check();
  await cont(page);
  await page.getByRole("checkbox", { name: "Cursor" }).check();
  await page.getByRole("checkbox", { name: "None yet" }).check();
  await expect(page.getByRole("checkbox", { name: "Cursor" })).not.toBeChecked();
});

test("without JavaScript every step shows and the form still posts", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/pilot");
  for (const h of ["About you", "Your experience", "Your project", "Your goals", "Review and send"]) {
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  }
  await expect(page.locator("#pilot-form")).toHaveAttribute("action", "/api/waitlist");
  await expect(page.getByRole("button", { name: "Send application" })).toBeVisible();
  await context.close();
});

test("a plain form post lands on the thanks page", async ({ request }) => {
  // Honeypot path: accepted without touching the database, so it's safe anywhere.
  const res = await request.post("/api/waitlist", { form: { email: "bot@example.com", consent: "yes", website: "x" }, maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toMatch(/\/pilot\/thanks$/);
});

test("thanks page renders", async ({ page }) => {
  await page.goto("/pilot/thanks");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thanks! Your application is in.");
});
