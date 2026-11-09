import { test, expect, type Page } from "@playwright/test";

// The pilot flow: /pilot (email) → /pilot/verify (code) → /pilot/apply (5 steps) → /pilot/thanks.
// Code and verify calls are mocked in the browser: real ones would send email.
// Deployed sites have a database, so /pilot/apply needs a real session there; the
// questionnaire tests run locally, where the page shows without one.
const isDeployed = !!process.env.BASE_URL && !process.env.BASE_URL.includes("localhost");
const cont = (page: Page) => page.getByRole("button", { name: "Continue" }).click();
const status = (page: Page) => page.locator("#pilot-status");
const stepHeading = (page: Page) => page.locator("[data-step]:not([hidden]) h2");

function noErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/status of 4\d\d/.test(m.text()) && errors.push(m.text()));
  return errors;
}

async function fillToReview(page: Page) {
  await page.goto("/pilot/apply");
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

test.describe("email and code", () => {
  test("/pilot asks for the email, prefilled from the link", async ({ page }) => {
    const errors = noErrors(page);
    await page.goto("/pilot?email=juan@example.com");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Apply for the pilot");
    await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue("juan@example.com");
    await expect(page.getByRole("list", { name: "Application progress" }).locator("[aria-current=step]")).toContainText("Email");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("/pilot says when the email check expired", async ({ page }) => {
    await page.goto("/pilot?expired=1");
    await expect(page.getByText("Your email check expired.")).toBeVisible();
  });

  test("the code page fills six boxes and sends on the sixth digit", async ({ page }) => {
    const errors = noErrors(page);
    const tries: string[] = [];
    await page.route("**/api/pilot/verify", async (r) => {
      const { code, email } = r.request().postDataJSON();
      tries.push(`${email}:${code}`);
      if (code === "111111") return r.fulfill({ status: 400, json: { error: "That code isn't right. 4 tries left." } });
      return r.fulfill({ json: { ok: true, next: "/pilot/thanks" } });
    });
    await page.goto("/pilot/verify?email=juan@example.com");
    await expect(page.getByText("juan@example.com")).toBeVisible();
    await expect(page.getByRole("link", { name: "Change email" })).toHaveAttribute("href", "/pilot?email=juan%40example.com");
    const code = page.getByRole("textbox", { name: "6-digit code" });
    await expect(code).toBeFocused();

    await page.keyboard.type("11 11-11");
    await expect(status(page)).toHaveText("That code isn't right. 4 tries left.");
    await expect(page.locator("[data-cell]").first()).toHaveText("1");

    await code.fill("");
    await code.pressSequentially("123456");
    await expect(page).toHaveURL(/\/pilot\/thanks$/);
    expect(tries).toEqual(["juan@example.com:111111", "juan@example.com:123456"]);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("an expired code clears the boxes and offers a new one right away", async ({ page }) => {
    await page.route("**/api/pilot/verify", (r) => r.fulfill({ status: 400, json: { error: "That code has expired. Send a new one.", expired: true } }));
    await page.goto("/pilot/verify?email=juan@example.com");
    await page.keyboard.type("123456");
    await expect(status(page)).toHaveText("That code has expired. Send a new one.");
    await expect(page.getByRole("textbox", { name: "6-digit code" })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Send a new code" })).toBeEnabled();
  });

  test("resend waits 30 seconds, then sends a new code", async ({ page }) => {
    await page.route("**/api/pilot/code", (r) => r.fulfill({ json: { ok: true, resendIn: 30 } }));
    await page.goto("/pilot/verify?email=juan@example.com");
    await page.evaluate(() => sessionStorage.setItem("lw-pilot-sent", String(Date.now())));
    await page.reload();
    await expect(page.getByRole("button", { name: /Send a new code in \d+s/ })).toBeDisabled();
    await page.evaluate(() => sessionStorage.setItem("lw-pilot-sent", "0"));
    await page.reload();
    await page.getByRole("button", { name: "Send a new code" }).click();
    await expect(status(page)).toHaveText("New code sent. Check your inbox.");
    await expect(page.getByRole("button", { name: /Send a new code in \d+s/ })).toBeDisabled();
  });

  test("someone who already applied is told so", async ({ page }) => {
    await page.route("**/api/pilot/verify", (r) => r.fulfill({ json: { ok: true, applied: true } }));
    await page.goto("/pilot/verify?email=juan@example.com");
    await page.keyboard.type("123456");
    await expect(page.getByRole("heading", { name: "You've already applied" })).toBeVisible();
    await expect(page.locator("#pilot-verify")).toBeHidden();
  });

  test("the code page without an email goes back to /pilot", async ({ page }) => {
    await page.goto("/pilot/verify");
    await expect(page).toHaveURL(/\/pilot$/);
  });
});

test.describe("deployed", () => {
  test.skip(!isDeployed, "Locally there's no database, so the questionnaire shows without a session");
  test("the questionnaire needs a verified email", async ({ page }) => {
    await page.goto("/pilot/apply");
    await expect(page).toHaveURL(/\/pilot$/);
  });
});

test.describe("questionnaire", () => {
  test.skip(isDeployed, "Needs a verified email on a deployed site");

  test("renders as a 5-step wizard with no errors", async ({ page }) => {
    const errors = noErrors(page);
    await page.goto("/pilot/apply");
    await expect(page.getByText("Step 1 of 5")).toBeVisible();
    await expect(stepHeading(page)).toHaveText("About you");
    await expect(page.locator("[data-step]:visible")).toHaveCount(1);
    await expect(page.getByRole("textbox", { name: "Email" })).toHaveCount(0); // verified already
    await expect(page.getByRole("button", { name: "Back" })).toBeHidden();
    await expect(page.getByRole("list", { name: "Application progress" }).locator("[aria-current=step]")).toContainText("Apply");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("each step checks its required answers before continuing", async ({ page }) => {
    await page.goto("/pilot/apply");
    await cont(page);
    await expect(status(page)).toHaveText("Please answer: What describes you best?");
    await page.getByRole("radio", { name: "Student" }).check();
    await cont(page);
    await expect(page.getByText("Step 2 of 5")).toBeVisible();
    await expect(stepHeading(page)).toBeFocused();
    await cont(page);
    await expect(status(page)).toHaveText("Please answer: How much have you coded?");
  });

  test("review shows the answers; Back keeps them", async ({ page }) => {
    await fillToReview(page);
    await expect(page.getByText("Step 5 of 5")).toBeVisible();
    const review = page.locator("[data-review]");
    for (const t of ["Career shifter", "Claude Code, Cursor", "A booking app for our barbershop", "5–10"]) await expect(review).toContainText(t);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("checkbox", { name: "Deploying" })).toBeChecked();
  });

  test("editing from the review: Save and review returns with the change", async ({ page }) => {
    await fillToReview(page);
    await page.getByRole("button", { name: "Edit Your project" }).click();
    await expect(page.getByText("Editing step 3 of 5")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeHidden();
    await page.getByRole("textbox", { name: "What do you want to ship?" }).fill("A clinic booking app");
    await page.getByRole("button", { name: "Save and review" }).click();
    await expect(page.getByText("Step 5 of 5")).toBeVisible();
    await expect(page.locator("[data-review]")).toContainText("A clinic booking app");
  });

  test("editing from the review: Save checks the step first", async ({ page }) => {
    await fillToReview(page);
    await page.getByRole("button", { name: "Edit Your project" }).click();
    await page.getByRole("textbox", { name: "What do you want to ship?" }).fill("");
    await page.getByRole("button", { name: "Save and review" }).click();
    await expect(status(page)).toHaveText("Please fill in: What do you want to ship?");
    await expect(page.getByText("Editing step 3 of 5")).toBeVisible();
  });

  test("editing from the review: Cancel undoes the changes", async ({ page }) => {
    await fillToReview(page);
    await page.getByRole("button", { name: "Edit About you" }).click();
    await page.getByRole("radio", { name: "Student" }).check();
    await page.getByRole("textbox", { name: "First name" }).fill("Pedro");
    await page.getByRole("button", { name: "Cancel" }).click();
    const review = page.locator("[data-review]");
    await expect(review).toContainText("Career shifter");
    await expect(review).toContainText("Juan");
    await expect(review).not.toContainText("Pedro");
  });

  test("the step list jumps to steps you've reached", async ({ page, isMobile }) => {
    test.skip(isMobile, "The step list shows on wide screens");
    await fillToReview(page);
    const steps = page.getByRole("list", { name: "Steps" });
    await steps.getByRole("button", { name: "Experience" }).click();
    await expect(stepHeading(page)).toHaveText("Your experience");
    await steps.getByRole("button", { name: "Review" }).click();
    await expect(page.getByText("Step 5 of 5")).toBeVisible();
  });

  test("a refresh keeps the answers", async ({ page }) => {
    await fillToReview(page);
    await page.reload();
    await expect(page.getByText("Step 5 of 5")).toBeVisible();
    await expect(page.locator("[data-review]")).toContainText("A booking app for our barbershop");
  });

  test("sending needs consent, then posts the answers", async ({ page }) => {
    await fillToReview(page);
    await page.getByRole("button", { name: "Send application" }).click();
    await expect(status(page)).toHaveText("Please give consent to apply.");

    await page.getByRole("checkbox", { name: /I agree/ }).check();
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().endsWith("/api/waitlist") && r.method() === "POST"),
      page.getByRole("button", { name: "Send application" }).click(),
    ]);
    expect(req.postDataJSON()).toMatchObject({
      role: "shifter", experience: "ai", tools: ["claude-code", "cursor"], stage: "building", learn: ["deploy"], hours: "5-10", consent: true,
    });
    expect(req.postDataJSON().email).toBeUndefined(); // the email comes from the session
    // No session cookie here: the server asks to verify, and we go back to /pilot.
    await expect(page).toHaveURL(/\/pilot\?expired=1$/);
  });

  test("'None yet' and specific AI tools don't mix", async ({ page }) => {
    await page.goto("/pilot/apply");
    await page.getByRole("radio", { name: "Student" }).check();
    await cont(page);
    await page.getByRole("checkbox", { name: "Cursor" }).check();
    await page.getByRole("checkbox", { name: "None yet" }).check();
    await expect(page.getByRole("checkbox", { name: "Cursor" })).not.toBeChecked();
  });

  test("without JavaScript every step shows and the form still posts", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/pilot/apply");
    for (const h of ["About you", "Your experience", "Your project", "Your goals", "Review and send"]) {
      await expect(page.getByRole("heading", { name: h, exact: true })).toBeVisible();
    }
    await expect(page.locator("#pilot-form")).toHaveAttribute("action", "/api/waitlist");
    await context.close();
  });
});

test("a plain form post lands on the thanks page", async ({ request }) => {
  // Honeypot path: accepted without touching the database, so it's safe anywhere.
  const res = await request.post("/api/waitlist", { form: { consent: "yes", website: "x" }, maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toBe("/pilot/thanks");
});

test("thanks page renders", async ({ page }) => {
  await page.goto("/pilot/thanks");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thanks! Your application is in.");
});
