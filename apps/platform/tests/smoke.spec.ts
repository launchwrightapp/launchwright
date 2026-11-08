import { test, expect } from "@playwright/test";

const pages = [
  ["/", "checks passed"],
  ["/lessons", "modules done"],
  ["/readiness", "checks passed"],
  ["/security", "You stay in control"],
  ["/connect", "Keep using the AI tool you have"],
] as const;

for (const [path, heading] of pages) {
  test(`${path} renders with no errors and no horizontal scroll`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("overview shows the next step, checks, and the approval", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Add login checks to your API" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Readiness checks", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
});

test("explain dropdown is searchable and switches simple and technical", async ({ page }) => {
  await page.goto("/readiness");
  const panel = page.locator("#check-auth");
  await expect(panel.getByText("Anyone on the internet can call")).toBeVisible();
  const trigger = page.getByRole("button", { name: /^Explain: Simple/ });
  await trigger.click();
  const search = page.getByRole("combobox", { name: /Search explain options/ });
  await expect(search).toBeFocused();
  await search.fill("tech");
  await expect(page.getByRole("option")).toHaveCount(1);
  await search.press("Enter");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(page.getByRole("button", { name: /^Explain: Technical/ })).toBeFocused();
  await expect(panel.getByText("returned 200 to an unauthenticated request")).toBeVisible();
  await expect(panel.getByText("Anyone on the internet can call")).toBeHidden();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-level", "tech");
  await expect(page.getByRole("button", { name: /^Explain: Technical/ })).toBeVisible();
});

test("explain dropdown works with the keyboard and closes on Escape", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /^Explain/ });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("security tabs switch panels", async ({ page }) => {
  await page.goto("/security");
  const main = page.getByRole("main");
  await expect(main.getByRole("tabpanel")).toHaveCount(1);
  await main.getByRole("tab", { name: /Secrets/ }).click();
  await expect(main.getByRole("tabpanel")).toContainText("DATABASE_URL");
});

test("sidebar or menu marks the current page", async ({ page, isMobile }) => {
  await page.goto("/lessons");
  if (isMobile) await page.getByRole("button", { name: "Menu" }).click();
  const nav = page.getByRole("navigation", { name: isMobile ? "Menu" : "Dashboard" });
  await expect(nav.locator('[aria-current="page"]')).toContainText("Lessons");
  await nav.getByRole("link", { name: /Readiness/ }).click();
  await expect(page).toHaveURL(/\/readiness/);
});

test("security headers and noindex", async ({ request }) => {
  const h = (await request.get("/")).headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-robots-tag"]).toBe("noindex");
});

test("top bar stays fixed while scrolling", async ({ page }) => {
  await page.goto("/");
  // Desktop scrolls the editor pane; mobile scrolls the page.
  await page.evaluate(() => {
    document.querySelector("[data-editor]")!.scrollTop = 1200;
    scrollTo({ top: 1200, behavior: "instant" });
  });
  const box = await page.getByRole("banner").boundingBox();
  expect(box?.y).toBe(0);
  await expect(page.getByRole("button", { name: /^Explain/ })).toBeInViewport();
});

test("editor shell: tabs remember opened pages, panel shows problems", async ({ page, isMobile }) => {
  test.skip(isMobile, "The editor chrome is desktop only");
  await page.goto("/");
  await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Readiness" }).click();
  const tabs = page.getByRole("navigation", { name: "Open pages" });
  await expect(tabs.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Readiness" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("button", { name: "Close Overview" }).click();
  await expect(tabs.getByRole("link", { name: "Overview" })).toBeHidden();
  const panel = page.getByRole("region", { name: "Panel" });
  await panel.getByRole("tab", { name: /Problems/ }).click();
  await expect(panel.getByRole("tabpanel")).toContainText("Auth on API routes");
  await panel.getByRole("button", { name: "Show or hide the panel" }).click();
  await expect(panel.getByRole("tabpanel")).toBeHidden();
});
