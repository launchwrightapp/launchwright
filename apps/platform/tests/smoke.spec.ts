import { test, expect } from "@playwright/test";
import { signIn, remote } from "./auth";
import { loaded, me, serveMe } from "./fixture";

// Dashboard pages need a session; these run against the local test server (see auth.ts).
test.beforeEach(async ({ context, baseURL }) => {
  test.skip(remote, "Signed-in tests run locally and in CI, not against deployed URLs");
  await signIn(context, baseURL!);
});

// A brand-new learner: the local test server has no database, so /api/me is empty.
const empty = [
  ["/", "Welcome to launchwright"],
  ["/lessons", "0 of 8 modules done"],
  ["/readiness", "No checks yet"],
  ["/security", "You stay in control"],
  ["/connect", "Keep using the AI tool you have"],
] as const;

for (const [path, heading] of empty) {
  test(`${path} renders for a new learner with no errors and no horizontal scroll`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(path);
    await loaded(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("a new learner sees the setup checklist and a not-set-up notice", async ({ page }) => {
  await page.goto("/");
  await loaded(page);
  const setup = page.getByRole("region", { name: "Get set up" });
  await expect(setup).toBeVisible();
  await expect(setup.getByText("0 of 5 setup steps done")).toBeVisible();
  await expect(setup.getByRole("link", { name: "Connect" }).first()).toHaveAttribute("href", "/connect");
  await expect(setup.getByRole("link", { name: "Install" })).toHaveAttribute("href", "https://github.com/apps/launchwright-app/installations/new");
  await expect(page.getByText("This server isn't fully set up yet")).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("Sample");
});

test("explorer status labels stay on one line", async ({ page, isMobile }) => {
  test.skip(isMobile, "The explorer is desktop only");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await loaded(page);
  const labels = page.getByRole("complementary", { name: "Explorer" }).getByText("Not checked", { exact: true });
  await expect(labels.first()).toBeVisible();
  for (const l of await labels.all()) expect((await l.boundingBox())!.height).toBeLessThan(24);
});

test("overview with a project leads with now, then progress, then history", async ({ page }) => {
  await serveMe(page);
  await page.goto("/");
  await loaded(page);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("barbershop-booking");
  const order = await main.getByRole("heading", { level: 2 }).filter({ visible: true }).allTextContents();
  expect(order).toEqual(["Get set up", "Now", "Progress", "Recent activity"]);
  await expect(main.getByRole("heading", { name: "Fix auth on API routes" })).toBeVisible();
  await expect(main.getByText("5", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(main.getByRole("heading", { name: "Readiness checks", exact: true })).toBeVisible();
  await expect(main.getByRole("link", { name: "Auth: Auth on API routes, Failed" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Lesson progress" })).toBeVisible();
  await expect(main.getByText("2 of 8 Level 1 modules")).toBeVisible();
});

test("approving a production deploy calls the API and says what happens next", async ({ page }) => {
  await serveMe(page);
  let decided: unknown = null;
  await page.route("**/api/approvals/*", async (route) => {
    decided = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, status: "approved" } });
  });
  await page.goto("/");
  await loaded(page);
  const card = page.locator("#approvals");
  await expect(card.getByText("Deploy juan/barbershop-booking (main) to production")).toBeVisible();
  await card.getByText("Inspect change").click();
  await expect(card.locator("pre")).toContainText("launchwright-deploy.yml");
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card.getByRole("status")).toContainText("Approved. Tell your AI tool to continue");
  expect(decided).toEqual({ decision: "approve" });
  await expect(card.getByRole("button", { name: "Approve" })).toBeDisabled();
});

test("activity filters by kind", async ({ page }) => {
  await serveMe(page);
  await page.goto("/");
  await loaded(page);
  const list = page.locator("#activity-list > li");
  await expect(list).toHaveCount(5);
  const filter = page.getByRole("group", { name: "Filter activity" });
  await filter.getByRole("button", { name: "Approvals" }).click();
  await expect(list.filter({ visible: true })).toHaveCount(1);
  await filter.getByRole("button", { name: "Problems" }).click();
  await expect(list.filter({ visible: true })).toHaveCount(1);
  await filter.getByRole("button", { name: "All" }).click();
  await expect(list.filter({ visible: true })).toHaveCount(5);
});

test("readiness lists failures first, with a prompt to fix each", async ({ page }) => {
  await serveMe(page);
  await page.goto("/readiness");
  await loaded(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("5 of 8 checks passed");
  const items = page.locator("main ul > li[id^=check-]");
  await expect(items.first()).toHaveAttribute("id", "check-api_auth");
  const auth = page.locator("#check-api_auth");
  await expect(auth.getByText("/api/bookings")).toBeVisible();
  await expect(auth.getByText("Use launchwright to fix the auth on API routes check on juan/barbershop-booking")).toBeVisible();
  await expect(page.locator("#check-secrets details")).not.toHaveAttribute("open", "");
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

test("security: approvals, accounts, secrets and the audit log", async ({ page }) => {
  await serveMe(page);
  await page.goto("/security");
  await loaded(page);
  const main = page.getByRole("main");
  await expect(main.getByRole("tabpanel")).toHaveCount(1);
  await expect(main.getByRole("tabpanel")).toContainText("Deploy juan/barbershop-booking (main) to production");
  await main.getByRole("tab", { name: /Secrets/ }).click();
  await expect(main.getByRole("tabpanel")).toContainText("RESEND_API_KEY");
  await expect(main.getByRole("tabpanel")).not.toContainText("re_");
  await main.getByRole("tab", { name: /Audit log/ }).click();
  await expect(main.getByRole("tabpanel").locator("tbody tr")).toHaveCount(5);
  await main.getByRole("tab", { name: /Accounts/ }).click();
  await expect(main.getByRole("tabpanel")).toContainText("Juan's account");
  // Connected, so its steps are folded away, but the token link is still there to replace the key.
  await expect(main.locator("#connect-cloudflare a[href*='dash.cloudflare.com/profile/api-tokens']")).toHaveCount(1);
});

test("connecting Cloudflare sends the token once and clears the field", async ({ page }) => {
  await serveMe(page, { ...me, connections: [] });
  let sent: unknown = null;
  await page.route("**/api/connections/cloudflare", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, provider: "cloudflare", label: "Juan's account" } });
  });
  await page.goto("/security#accounts");
  await loaded(page);
  const field = page.getByLabel("Cloudflare API token");
  await field.fill("cf-test-token");
  await page.getByRole("button", { name: "Connect" }).first().click();
  await expect(page.getByText("Connected (Juan's account)")).toBeVisible();
  expect(sent).toEqual({ token: "cf-test-token" });
  await expect(field).toHaveValue("");
});

test("the secret page takes a value without showing it, then confirms", async ({ page }) => {
  await serveMe(page);
  let saved: unknown = null;
  await page.route("**/api/secret-requests/*", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { id: "x", repo: "juan/barbershop-booking", name: "RESEND_API_KEY", target: "both", status: "waiting", expiresAt: null } });
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, status: "submitted" } });
  });
  await page.goto("/secret?id=0b8e6a2e-6a8a-4c55-9a39-1a2b3c4d5e6f");
  await page.waitForFunction(() => document.documentElement.dataset.secretLoaded === "true");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("RESEND_API_KEY");
  await expect(page.getByRole("main")).toContainText("GitHub Actions and your Cloudflare Worker");
  const field = page.getByLabel("Value");
  await expect(field).toHaveAttribute("type", "password");
  await field.fill("re_live_123");
  await page.getByRole("button", { name: "Save secret" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  expect(saved).toEqual({ value: "re_live_123" });
});

test("sidebar or menu marks the current page", async ({ page, isMobile }) => {
  await page.goto("/lessons");
  if (isMobile) await page.getByRole("button", { name: "Menu" }).click();
  const nav = page.getByRole("navigation", { name: isMobile ? "Menu" : "Dashboard" });
  await expect(nav.locator('[aria-current="page"]')).toContainText("Lessons");
  await nav.getByRole("link", { name: /Readiness/ }).click();
  await expect(page).toHaveURL(/\/readiness/);
});

test("lessons list practice exercises under their module, with progress", async ({ page }) => {
  await serveMe(page);
  await page.goto("/lessons");
  await expect(page.getByText("Ship your first web app with production fundamentals.")).toBeVisible();
  const db = page.getByRole("listitem").filter({ has: page.getByText("Database", { exact: true }) });
  await db.getByText("Backup and restore drill").click();
  // The exact command Claude Code accepts: server prefix, then the repo, then the exercise.
  await expect(db.getByText("/launchwright:lesson-practice juan/barbershop-booking backup_restore", { exact: true })).toBeVisible();
  await expect(db.getByText("/launchwright:lesson-database juan/barbershop-booking", { exact: true })).toBeVisible();
  await expect(db.getByText(/Counts as done when your default branch has RECOVERY\.md/)).toBeVisible();
  const mon = page.getByRole("listitem").filter({ has: page.getByText("Monitoring", { exact: true }) });
  await expect(mon.getByText("Alerts, owner and runbook").locator("..")).toContainText("Done");
  await expect(page.getByText(/1 of 6 practice exercises done/)).toBeVisible();
});

test("top bar stays fixed while scrolling", async ({ page }) => {
  await serveMe(page);
  await page.goto("/");
  await loaded(page);
  // Desktop scrolls the editor pane; mobile scrolls the page.
  await page.evaluate(() => {
    document.querySelector("[data-editor]")!.scrollTop = 1200;
    scrollTo({ top: 1200, behavior: "instant" });
  });
  const box = await page.getByRole("banner").boundingBox();
  expect(box?.y).toBe(0);
  await expect(page.getByRole("button", { name: /^Explain/ })).toBeInViewport();
});

test("editor shell: tabs remember opened pages, panel shows tool calls and problems", async ({ page, isMobile }) => {
  test.skip(isMobile, "The editor chrome is desktop only");
  await serveMe(page);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: "Readiness" }).click();
  await loaded(page);
  const tabs = page.getByRole("navigation", { name: "Open pages" });
  await expect(tabs.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Readiness" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("button", { name: "Close Overview" }).click();
  await expect(tabs.getByRole("link", { name: "Overview" })).toBeHidden();
  const panel = page.getByRole("region", { name: "Panel" });
  await expect(panel.getByRole("tabpanel")).toContainText("check_readiness");
  await panel.getByRole("tab", { name: /Problems/ }).click();
  await expect(panel.getByRole("tabpanel")).toContainText("Auth on API routes");
  await panel.getByRole("button", { name: "Show or hide the panel" }).click();
  await expect(panel.getByRole("tabpanel")).toBeHidden();
});

test("explorer leads with what needs attention; lesson panel can be hidden", async ({ page, isMobile }) => {
  test.skip(isMobile, "The editor chrome is desktop only");
  await serveMe(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await loaded(page);
  const explorer = page.getByRole("complementary", { name: "Explorer" });
  await expect(explorer.getByRole("link", { name: /Auth on API routes/ })).toBeVisible();
  await expect(explorer.getByRole("link", { name: /No secrets in the repo/ })).toBeHidden();
  await explorer.getByRole("button", { name: /Passed/ }).click();
  await expect(explorer.getByRole("link", { name: /No secrets in the repo/ })).toBeVisible();
  const lesson = page.getByRole("complementary", { name: "Auth on API routes" });
  await expect(lesson).toBeVisible();
  await page.getByRole("button", { name: "Show or hide the lesson panel" }).click();
  await expect(lesson).toBeHidden();
  await page.reload();
  await expect(lesson).toBeHidden();
});

test("the signed-in person appears in the title bar and can sign out", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.getByRole("main")).toContainText(", Test.");
  if (isMobile) await page.getByRole("button", { name: "Menu" }).click();
  else await page.getByRole("button", { name: /^Account menu/ }).click();
  await expect(page.getByText("@test-learner").locator("visible=true")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).locator("visible=true").click();
  await expect(page).toHaveURL(/\/signin\?signed_out=1/);
  await expect(page.getByRole("status")).toHaveText("You're signed out.");
  await page.goto("/lessons");
  await expect(page).toHaveURL(/\/signin\?next=%2Flessons/);
});

test("the explorer follows the current section", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "The explorer is desktop-only");
  const explorer = page.getByRole("complementary", { name: "Explorer" });
  await page.goto("/");
  await expect(explorer.getByRole("button", { name: /Checks/ })).toBeVisible();
  await expect(explorer.getByRole("button", { name: /Lessons/ })).toBeVisible();
  await page.goto("/lessons");
  await expect(explorer.getByRole("button", { name: /Lessons/ })).toBeVisible();
  await expect(explorer.getByRole("button", { name: /Checks/ })).toHaveCount(0);
  await page.goto("/messages");
  await expect(explorer.getByRole("link", { name: "Talk to the team" })).toBeVisible();
  await expect(explorer.getByRole("button", { name: /Checks/ })).toHaveCount(0);
});

test("health endpoint answers without signing in", async ({ request }) => {
  const res = await request.get("/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true });
});

test("a deep link opens the Accounts tab at that provider's steps", async ({ page }) => {
  await serveMe(page, { ...me, connections: [] });
  await page.goto("/security#connect-neon");
  await loaded(page);
  const neon = page.locator("#connect-neon");
  await expect(neon).toBeInViewport();
  await expect(neon.getByText("Create a key named launchwright")).toBeVisible();
  await expect(neon.getByRole("link", { name: /Open Neon's API keys page/ })).toHaveAttribute("target", "_blank");
  await expect(neon.getByText("Never paste the key into your AI chat")).toBeVisible();
  await expect(page.getByLabel("Neon API key")).toHaveAttribute("type", "password");
});

test("a connected account shows its limits and how to revoke; steps fold away", async ({ page }) => {
  await serveMe(page);
  await page.goto("/security#connect-cloudflare");
  await loaded(page);
  const cf = page.locator("#connect-cloudflare");
  await expect(cf.getByText("Connected:")).toBeVisible();
  const tag = cf.locator("header .tag");
  await expect(tag).toHaveClass(/tag-ok/);
  await expect(tag).not.toHaveClass(/tag-line/);
  await expect(cf.getByText("The token can't touch your domains or DNS")).toBeVisible();
  await expect(cf.getByText(/My Profile → API Tokens → launchwright/)).toBeVisible();
  await expect(cf.getByRole("button", { name: "Disconnect" })).toBeVisible();
  await expect(cf.locator("details")).not.toHaveAttribute("open", "");
  await cf.getByText("Replace the key").click();
  await expect(cf.getByText("Workers Scripts: Edit")).toBeVisible();
  // Not-connected providers stay open.
  await expect(page.locator("#connect-neon details")).toHaveAttribute("open", "");
});

test("coming back from Supabase says what happened", async ({ page }) => {
  await serveMe(page);
  await page.goto("/security?error=supabase_cancelled#connect-supabase");
  await loaded(page);
  await expect(page.locator("#supabase-status")).toHaveText(/You cancelled on Supabase/);
});

test("connect page explains tools vs prompts, with the repo as the prompt argument", async ({ page }) => {
  await serveMe(page, me);
  await page.goto("/connect");
  const card = page.locator("#tools-and-prompts");
  await expect(card.getByText("Two ways to use launchwright")).toBeVisible();
  await expect(card.getByText("/launchwright:lesson-start octocat/hello-world")).toBeVisible();
  await expect(card.getByText("Use launchwright to review PR #3 on octocat/hello-world")).toBeVisible();
  await expect(page.getByText("Take the tour")).toBeVisible();
});

test("before a project exists, lesson commands use an owner/repo placeholder", async ({ page }) => {
  await serveMe(page, { ...me, projects: [] });
  await page.goto("/lessons");
  await loaded(page);
  const db = page.getByRole("listitem").filter({ has: page.getByText("Database", { exact: true }) });
  await db.getByText("Backup and restore drill").click();
  await expect(db.getByText("/launchwright:lesson-practice owner/repo backup_restore", { exact: true })).toBeVisible();
});
