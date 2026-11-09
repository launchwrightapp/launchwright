// Accessibility: axe checks each dashboard page for WCAG 2.1 A/AA problems, on desktop and mobile.
// Practice exercise "launch_quality" (Testing module).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { remote, signIn } from "./auth";
import { loaded, me, serveMe } from "./fixture";

const PAGES = ["/signin", "/", "/lessons", "/readiness", "/security", "/connect"];

for (const path of PAGES) {
  test(`${path} has no WCAG A/AA violations`, async ({ page, context, baseURL }) => {
    test.skip(remote && path !== "/signin", "signed-in pages need the local test server");
    if (path !== "/signin") {
      await signIn(context, baseURL!);
      await serveMe(page, me);
    }
    await page.goto(path);
    if (path !== "/signin") await loaded(page);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}
