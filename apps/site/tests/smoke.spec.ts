import { test, expect } from "@playwright/test";


test("home page renders the hero and every section", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await expect(page).toHaveTitle("Launchwright");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Now learn to ship it.");
  for (const id of ["how", "curriculum", "readiness", "trust", "pilot", "faq"]) {
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
      data: { email: "a@example.com", consent: true, building: "x".repeat(9000) },
    });
    expect(res.status()).toBe(400);
  });

  test("honeypot submissions are silently dropped", async ({ request }) => {
    const res = await request.post("/api/waitlist", {
      data: { email: "bot@example.com", consent: true, website: "http://spam" },
    });
    expect(res.status()).toBe(200);
  });

  test("a valid signup without a Turnstile token is refused", async ({ request }) => {
    // Safe on the live site too: it stops before the database.
    const res = await request.post("/api/waitlist", { data: { email: "a@example.com", consent: true } });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toMatch(/not a bot/);
  });

  test("posts from another site are refused", async ({ request }) => {
    const res = await request.post("/api/waitlist", {
      data: { email: "a@example.com", consent: true },
      headers: { origin: "https://evil.example" },
    });
    expect(res.status()).toBe(403);
  });
});

test("home form checks the email before continuing", async ({ page }) => {
  await page.goto("/#pilot");
  await page.locator("#waitlist").getByRole("textbox", { name: "Email" }).fill("nope");
  await page.locator("#waitlist").getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#waitlist-status")).toHaveText("Please check your email address.");
  await expect(page).not.toHaveURL(/\/pilot/);
});

test("home form continues to the questionnaire with the email filled in", async ({ page }) => {
  await page.goto("/#pilot");
  await page.locator("#waitlist").getByRole("textbox", { name: "Email" }).fill("juan@example.com");
  await page.locator("#waitlist").getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/pilot\?email=juan%40example\.com/);
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue("juan@example.com");
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

test("how-it-works walkthrough switches steps", async ({ page }) => {
  await page.goto("/#how");
  const how = page.locator("#how");
  const verify = how.getByRole("tab", { name: /Verify/ });
  await expect(how.getByRole("tabpanel")).toHaveCount(1);
  await verify.click();
  await expect(verify).toHaveAttribute("aria-selected", "true");
  await expect(how.getByRole("tabpanel")).toContainText("Every change is checked");
  await verify.press("ArrowRight");
  await expect(how.getByRole("tab", { name: /Learn/ })).toBeFocused();
  await expect(how.getByRole("tabpanel")).toContainText("short lesson");
});

test("readiness leads with the failing check and its fix", async ({ page }) => {
  await page.goto("/#readiness");
  const section = page.locator("#readiness");
  await expect(section).toContainText("7 of 8 checks passed");
  await expect(section).toContainText("Action needed");
  await expect(section).toContainText("Suggested fix");
  const list = page.getByRole("tablist", { name: "Readiness checks" });
  await expect(list).toBeHidden();
  await section.getByText(/View all 8 checks/).click();
  const fail = list.locator('[data-check="fail"]');
  await expect(fail).toHaveAttribute("aria-selected", "true");
  const panel = page.locator("#readiness [role=tabpanel]:visible");
  await expect(panel).toHaveCount(1);
  await expect(panel).toContainText("Why it matters");
  await expect(panel).toContainText("How to fix");
  await list.getByRole("tab", { name: /No secrets in repo/ }).click();
  await expect(panel).toContainText("history");
});

test("one call to action wording across the page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/waitlist/i)).toHaveCount(0);
  expect(await page.getByRole("link", { name: "Join the free pilot" }).count()).toBeGreaterThanOrEqual(2);
});

for (const [w, h] of [[1288, 675], [1024, 600], [1440, 900], [1920, 1080], [390, 664], [360, 640]]) {
  test(`hero call to action is visible without scrolling at ${w}x${h}`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto("/");
    const cta = page.locator("[data-hero-cta] .btn");
    await expect(cta).toBeInViewport({ ratio: 1 });
    await page.close();
  });
}

test("nav highlights the section you're in", async ({ page, isMobile }) => {
  test.skip(isMobile, "The section nav is desktop only");
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Sections" });
  await expect(nav.locator('[aria-current="true"]')).toHaveCount(0);
  for (const [id, label] of [["readiness", "Readiness"], ["curriculum", "Learning path"], ["faq", "FAQ"]]) {
    await page.locator(`#${id}`).evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
    await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "true");
    await expect(nav.locator('[aria-current="true"]')).toHaveCount(1);
  }
});

for (const [path, heading] of [["/privacy", "Privacy policy"], ["/terms", "Terms of use"]]) {
  test(`${path} page renders and is linked from the footer`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto("/");
    await page.getByRole("contentinfo").getByRole("link", { name: new RegExp(heading, "i") }).click();
    await expect(page).toHaveURL(new RegExp(`${path}(\\.html)?$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.getByText("Last updated")).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("consent text links to the privacy policy", async ({ page }) => {
  await page.goto("/pilot");
  // The consent box is on the last step, so it's hidden until then: check the markup.
  await expect(page.locator("#pilot-form a", { hasText: "privacy policy" })).toHaveAttribute("href", "/privacy");
});

test("the offer and the signup form are in one section, before the FAQ", async ({ page }) => {
  await page.goto("/");
  const pilot = page.locator("#pilot");
  await expect(pilot.getByText("Free for the first 10 learners")).toBeVisible();
  await expect(pilot.locator("#waitlist")).toBeVisible();
  const order = await page.evaluate(() => [...document.querySelectorAll("main > section[id]")].map((s) => s.id));
  expect(order.indexOf("pilot")).toBeLessThan(order.indexOf("faq"));
  expect(order[0]).toBe("how");
});

test("security dashboard tabs switch panels", async ({ page }) => {
  await page.goto("/#trust");
  const trust = page.locator("#trust");
  await expect(trust.locator("[role=tabpanel]:visible")).toHaveCount(1);
  await expect(trust.locator("[role=tabpanel]:visible")).toContainText("Connected accounts");
  const approvals = trust.getByRole("tab", { name: /Approvals/ });
  await approvals.click();
  await expect(approvals).toHaveAttribute("aria-selected", "true");
  await expect(trust.locator("[role=tabpanel]:visible")).toContainText("Migration drops a column");
  await approvals.press("ArrowRight");
  await expect(trust.locator("[role=tabpanel]:visible")).toContainText("Every tool call");
});

test("header hides on the footer and returns when scrolling up", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header[data-autohide]");
  const scroll = (top: number) => page.evaluate((t) => scrollTo({ top: t, behavior: "instant" }), top);
  await scroll(500);
  await expect(header).not.toHaveAttribute("data-hidden");
  const bottom = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await scroll(bottom - 200);
  await scroll(bottom);
  await expect(header).toHaveAttribute("data-hidden", "");
  await scroll(bottom - 300);
  await expect(header).not.toHaveAttribute("data-hidden");
});

test("mobile menu opens, links to sections, and closes", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The menu button is for small screens");
  await page.goto("/");
  const toggle = page.getByRole("banner").getByRole("button", { name: "Menu" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  const menu = page.getByRole("navigation", { name: "Menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Security" }).click();
  await expect(menu).toBeHidden();
  await expect(page).toHaveURL(/#trust$/);
  await toggle.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("admin routes are hidden without the admin token", async ({ request }) => {
  for (const [method, path] of [["GET", "/api/admin/applicants"], ["POST", "/api/admin/accept"]] as const) {
    const res = await request.fetch(path, { method, headers: { authorization: "Bearer wrong" }, data: method === "POST" ? { email: "a@b.co" } : undefined });
    expect(res.status()).toBe(404);
  }
});
