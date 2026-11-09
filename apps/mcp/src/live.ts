// Readiness checks against the learner's deployed app: auth on API routes, HTTPS and security
// headers, uptime. Only plain GET requests with no cookies, the same thing any visitor could do.
//
// The URL comes from the learner (or their AI), so it is validated: https only, a real hostname,
// no IP literals or localhost. The Worker runs with global_fetch_strictly_public, so private
// addresses are refused by Cloudflare too.
import { apiRoutes, uptimeWorkflows, type Check, type RepoSnapshot } from "./readiness";

const TIMEOUT = 8000;
const MAX_ROUTES = 5;
const PUBLIC_ROUTE = /(^|\/)(health|healthz|status|ping|auth|login|logout|signin|signup|register|callback|webhooks?|og|public|csrf|session|version|robots|sitemap|rss|feed)(\/|\.|$)/i;
const PRIVATE_ROUTE = /(^|\/)(admin|users?|accounts?|me|profile|settings|orders?|bookings?|payments?|invoices?|messages?|private|dashboard|customers?|members?|reports?)(\/|\.|$)/i;

export class UrlError extends Error {}

export function checkUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    throw new UrlError("That doesn't look like a URL. Use the address of your deployed app, like https://my-app.example.workers.dev");
  }
  if (u.protocol !== "https:") throw new UrlError("Use the https:// address of your deployed app.");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    throw new UrlError("Live checks need your deployed app's public address, not a local one.");
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[")) throw new UrlError("Use your app's domain name, not an IP address.");
  if (u.username || u.password) throw new UrlError("Leave the username and password out of the URL.");
  return new URL(u.origin);
}

type Fetcher = typeof fetch;

async function get(f: Fetcher, url: string) {
  return f(url, { method: "GET", redirect: "manual", headers: { "user-agent": "launchwright-readiness (+https://launchwright.app)", accept: "*/*" }, signal: AbortSignal.timeout(TIMEOUT) });
}

export async function securityHeaders(f: Fetcher, base: URL): Promise<Check> {
  const title = "HTTPS and security headers";
  let res: Response;
  try {
    res = await get(f, base.href);
  } catch {
    return { id: "security_headers", title, status: "fail", detail: `${base.host} didn't answer over HTTPS within ${TIMEOUT / 1000} seconds.` };
  }
  const h = res.headers;
  const csp = h.get("content-security-policy") ?? "";
  const missing: string[] = [];
  if (!/max-age=\d{6,}/i.test(h.get("strict-transport-security") ?? "")) missing.push("Strict-Transport-Security (max-age of at least ~4 months)");
  if (!csp) missing.push("Content-Security-Policy");
  if ((h.get("x-content-type-options") ?? "").toLowerCase() !== "nosniff") missing.push("X-Content-Type-Options: nosniff");
  if (!h.get("x-frame-options") && !/frame-ancestors/i.test(csp)) missing.push("X-Frame-Options or CSP frame-ancestors");

  let httpRedirects = true;
  try {
    const plain = await get(f, `http://${base.host}/`);
    const loc = plain.headers.get("location") ?? "";
    httpRedirects = plain.status >= 300 && plain.status < 400 && loc.startsWith("https://");
  } catch {
    /* http not reachable at all is fine: nothing is served unencrypted */
  }
  if (!httpRedirects) missing.unshift("a redirect from http:// to https://");

  if (!missing.length) return { id: "security_headers", title, status: "pass", detail: `${base.host} redirects to HTTPS and sends HSTS, CSP, nosniff and a frame policy.` };
  const onlyCsp = missing.length === 1 && missing[0] === "Content-Security-Policy";
  return {
    id: "security_headers",
    title,
    status: onlyCsp ? "warn" : "fail",
    detail: `${base.host} is missing: ${missing.join("; ")}. On Cloudflare Workers, set them on every response (a small middleware or a _headers file for static assets).`,
  };
}

export async function apiAuth(f: Fetcher, base: URL, s: RepoSnapshot): Promise<Check> {
  const title = "Auth on API routes";
  const routes = apiRoutes(s.paths, s.files).filter((r) => !PUBLIC_ROUTE.test(r));
  if (!routes.length) {
    return { id: "api_auth", title, status: "skip", detail: "No private-looking API routes found in the repo (Next.js and Astro route files, and /api/... paths in Worker, Hono and server code are read). If your API lives elsewhere, make sure every private route checks the session." };
  }
  // Private-looking first, then shortest, so a few probes cover more of the API (not 5 /api/admin/* routes).
  const depth = (r: string) => r.split("/").length;
  const probed = routes.sort((a, b) => Number(PRIVATE_ROUTE.test(b)) - Number(PRIVATE_ROUTE.test(a)) || depth(a) - depth(b)).slice(0, MAX_ROUTES);
  const open: string[] = [];
  const openPrivate: string[] = [];
  for (const r of probed) {
    try {
      const res = await get(f, new URL(r, base).href);
      const type = res.headers.get("content-type") ?? "";
      if (res.status >= 200 && res.status < 300 && /json|text\/plain/.test(type)) {
        open.push(r);
        if (PRIVATE_ROUTE.test(r)) openPrivate.push(r);
      }
    } catch {
      /* unreachable route: not evidence either way */
    }
  }
  const files = probed.map((r) => `GET ${r}`);
  if (openPrivate.length) {
    return { id: "api_auth", title, status: "fail", detail: `These routes answered with data to a request with no login: ${openPrivate.join(", ")}. Anyone can call them directly. Check the session on the server and return 401 when there is none.`, files };
  }
  if (open.length) {
    return { id: "api_auth", title, status: "warn", detail: `These routes answered with data to a request with no login: ${open.join(", ")}. That's fine only if the data is meant to be public; otherwise check the session and return 401.`, files };
  }
  return { id: "api_auth", title, status: "pass", detail: `Without a login, every probed route refused (401/403), redirected, or returned no data.`, files };
}

export async function uptime(f: Fetcher, base: URL, s: RepoSnapshot): Promise<Check> {
  const title = "Uptime check";
  const started = Date.now();
  let up = false;
  let status = 0;
  try {
    const res = await get(f, base.href);
    status = res.status;
    up = res.status < 400;
  } catch {
    /* down or too slow */
  }
  const ms = Date.now() - started;
  if (!up) return { id: "uptime", title, status: "fail", detail: status ? `${base.host} answered ${status}. Your users see an error right now.` : `${base.host} didn't answer within ${TIMEOUT / 1000} seconds.` };
  const monitors = uptimeWorkflows(s);
  if (!monitors.length) {
    return { id: "uptime", title, status: "warn", detail: `${base.host} is up (${ms} ms), but nothing checks it on a schedule, so you'd only hear about an outage from users. \`setup_ci\` adds a free scheduled check in GitHub Actions.` };
  }
  return { id: "uptime", title, status: "pass", detail: `${base.host} is up (${ms} ms) and a scheduled workflow checks it.`, files: monitors };
}

export async function liveChecks(base: URL, s: RepoSnapshot, f: Fetcher = fetch): Promise<Check[]> {
  return Promise.all([apiAuth(f, base, s), securityHeaders(f, base), uptime(f, base, s)]);
}
