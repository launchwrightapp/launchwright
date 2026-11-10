// Access tests: who may reach what. Each private route is tried as nobody, as a forged session,
// as a learner and (for team pages) as an admin, and must refuse the ones that aren't allowed.
// Practice exercise "access_tests" (Security module).
import { test, expect, type APIRequestContext } from "@playwright/test";
import { remote, signIn, testAdmin, testUser } from "./auth";

// Signing in needs the local test server's secret.
test.skip(remote, "access tests sign in, which only works against the local test server");

const LEARNER_API = ["/api/me", "/api/messages"];
const ADMIN_API = ["/api/admin/applicants", "/api/admin/applicants/activity", "/api/admin/threads", "/api/admin/funnel"];
const ADMIN_PAGES = ["/applicants", "/inbox", "/funnel"];

// Same-origin requests, so a refusal comes from the access rule and not the cross-site check.
const ORIGIN = new URL(process.env.BASE_URL ?? "http://localhost:8792").origin;
const status = async (req: APIRequestContext, path: string, method: "GET" | "POST" = "GET") =>
  (await req.fetch(path, { method, maxRedirects: 0, headers: { origin: ORIGIN } })).status();

test("nobody signed in: APIs answer 401, pages send you to sign in", async ({ request }) => {
  for (const path of [...LEARNER_API, ...ADMIN_API]) expect(await status(request, path), path).toBe(401);
  const res = await request.get("/", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers().location).toMatch(/^\/signin\?next=/);
});

test("a forged session cookie counts as nobody", async ({ context, baseURL }) => {
  const body = Buffer.from(JSON.stringify({ ...testAdmin, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  await context.addCookies([{ name: "__Host-lw_session", value: `v1.${body}.not-the-real-signature`, domain: new URL(baseURL!).hostname, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  for (const path of ["/api/me", ...ADMIN_API]) expect(await status(context.request, path), path).toBe(401);
});

test("an expired session counts as nobody", async ({ context, baseURL }) => {
  await signIn(context, baseURL!, testUser);
  const [cookie] = await context.cookies();
  const { createHmac } = await import("node:crypto");
  const { TEST_SESSION_SECRET } = await import("../playwright.config");
  const body = Buffer.from(JSON.stringify({ ...testUser, exp: Math.floor(Date.now() / 1000) - 60 })).toString("base64url");
  const mac = createHmac("sha256", TEST_SESSION_SECRET).update(`v1.${body}`).digest("base64url");
  await context.addCookies([{ ...cookie, value: `v1.${body}.${mac}` }]);
  expect(await status(context.request, "/api/me")).toBe(401);
});

test("a learner can't see team pages or team APIs: they don't exist for them (404)", async ({ context, baseURL }) => {
  await signIn(context, baseURL!, testUser);
  for (const path of [...ADMIN_API, ...ADMIN_PAGES]) expect(await status(context.request, path), path).toBe(404);
  for (const path of ["accept", "remove", "recommend", "remind"]) expect(await status(context.request, `/api/admin/applicants/${path}`, "POST"), path).toBe(404);
});

test("an admin can open the team pages", async ({ context, baseURL }) => {
  await signIn(context, baseURL!, testAdmin);
  for (const path of ADMIN_PAGES) expect(await status(context.request, path), path).toBe(200);
});
