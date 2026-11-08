// Sign the test browser in by minting the same signed cookie the worker issues.
// Works only against the local test server, which uses TEST_SESSION_SECRET.
import { createHmac } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import { TEST_SESSION_SECRET } from "../playwright.config";

export const testUser = { id: 1, login: "test-learner", name: "Test Learner", avatar: "" };
// The local test server lists id 2 in ADMIN_GITHUB_IDS (playwright.config.ts).
export const testAdmin = { id: 2, login: "test-admin", name: "Test Admin", avatar: "" };
export const remote = !!process.env.BASE_URL;

export async function signIn(context: BrowserContext, baseURL: string, user = testUser) {
  const body = Buffer.from(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const mac = createHmac("sha256", TEST_SESSION_SECRET).update(`v1.${body}`).digest("base64url");
  await context.addCookies([{ name: "__Host-lw_session", value: `v1.${body}.${mac}`, domain: new URL(baseURL).hostname, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
}
