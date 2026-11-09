// Accessibility: axe checks each public page for WCAG 2.1 A/AA problems, on desktop and mobile.
// Practice exercise "launch_quality" (Testing module).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = ["/", "/pilot", "/privacy", "/terms"];

for (const path of PAGES) {
  test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
    // Fade-ins and count-ups would be scanned half-faded; reduced motion shows the final state.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // The Turnstile widget is Cloudflare's iframe, outside our control.
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("iframe").analyze();
    expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}
