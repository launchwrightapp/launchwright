// Private pilot: a GitHub account that isn't in it gets no dashboard and no API.
import { test, expect } from "@playwright/test";
import { remote, signIn, testOutsider } from "./auth";

test.skip(remote, "needs the local test server's session secret");

test("an account outside the pilot is signed out with a plain explanation", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!, testOutsider);
  await page.goto("/lessons");
  await expect(page).toHaveURL(/\/signin\?error=not_in_pilot$/);
  await expect(page.getByText("launchwright is in a private pilot, and this GitHub account isn't in it.")).toBeVisible();
  // The session cookie is cleared, so the sign-in page stays put (no redirect loop).
  expect((await context.cookies()).find((c) => c.name === "__Host-lw_session")).toBeUndefined();
});

test("the API refuses an account outside the pilot", async ({ context, baseURL }) => {
  await signIn(context, baseURL!, testOutsider);
  const res = await context.request.get("/api/me");
  expect(res.status()).toBe(403);
  expect((await res.json()).error).toContain("private pilot");
});

test("a listed learner still gets in", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!);
  await page.goto("/lessons");
  await expect(page).toHaveURL(/\/lessons$/);
});
