// HTTPS and security headers for every response a Worker sends, shared by the site, the
// platform and the MCP server.
//
// Static files already get their headers from public/_headers, and pages the worker builds set
// their own Content-Security-Policy. This fills in only what a response is missing, so redirects,
// JSON, 401s and 404s made in worker code are covered too. Responses without a CSP get the
// strictest one: they are data, not pages, so they load nothing and can't be framed.

const DEFAULTS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

// The scheme the visitor used, as Cloudflare's edge reports it. The request URL isn't enough:
// `wrangler dev` rewrites it to the production hostname over http, which would redirect forever.
function visitorScheme(req: Request): string | null {
  try {
    const v = JSON.parse(req.headers.get("cf-visitor") ?? "null") as { scheme?: string } | null;
    if (v?.scheme) return v.scheme;
  } catch {
    /* malformed header: fall through */
  }
  return req.headers.get("x-forwarded-proto");
}

/** A permanent redirect to https:// for visitors who came over plain http. */
export function httpsRedirect(req: Request): Response | null {
  if (visitorScheme(req) !== "http") return null;
  const url = new URL(req.url);
  url.protocol = "https:";
  return new Response(null, { status: 301, headers: { location: url.href, ...DEFAULTS } });
}

/** The same response with any missing security header added. */
export function withSecurityHeaders(res: Response): Response {
  // A WebSocket upgrade's response can't be rebuilt.
  if (res.status === 101) return res;
  const missing = Object.entries(DEFAULTS).filter(([k]) => !res.headers.has(k));
  if (!missing.length) return res;
  const headers = new Headers(res.headers);
  for (const [k, v] of missing) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** Wraps a Worker's fetch handler: redirect http to https, then add the headers. */
export function secure<R extends Request, A extends unknown[]>(handler: (req: R, ...rest: A) => Response | Promise<Response>) {
  return async (req: R, ...rest: A): Promise<Response> => httpsRedirect(req) ?? withSecurityHeaders(await handler(req, ...rest));
}
