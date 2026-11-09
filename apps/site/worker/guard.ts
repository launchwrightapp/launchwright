// Abuse protection for the pilot form (POST /api/waitlist).
// Order in the handler: same origin → size and shape → honeypot → per-IP rate limit
// → Turnstile → database. Cheap checks first, so bots never reach siteverify or Neon.

export interface GuardEnv {
  TURNSTILE_SITEKEY?: string; // public; set in wrangler.jsonc (dev uses Cloudflare's test key)
  TURNSTILE_SECRET?: string; // secret; `npx wrangler secret put TURNSTILE_SECRET`
  TURNSTILE_HOSTNAMES?: string; // comma-separated hostnames the widget may run on
  PILOT_LIMIT?: RateLimit; // Workers rate limiting binding
}

export const TURNSTILE_ACTION = "pilot";

// Browsers send Origin on POST. A different origin means another site is posting for the visitor.
export function crossSite(req: Request, url: URL): boolean {
  const origin = req.headers.get("origin");
  if (origin && origin !== url.origin) return true;
  return req.headers.get("sec-fetch-site") === "cross-site";
}

export const clientIp = (req: Request) => req.headers.get("cf-connecting-ip") ?? "unknown";

// True when this IP is still under the limit. Without the binding (unit tests), allow.
export async function underLimit(req: Request, env: GuardEnv): Promise<boolean> {
  if (!env.PILOT_LIMIT) return true;
  const { success } = await env.PILOT_LIMIT.limit({ key: clientIp(req) });
  return success;
}

export type Verdict = "ok" | "off" | "misconfigured" | "failed";

// Server-side Turnstile check. Fails closed: any error means "failed".
export async function verifyTurnstile(token: unknown, req: Request, env: GuardEnv): Promise<Verdict> {
  if (!env.TURNSTILE_SITEKEY && !env.TURNSTILE_SECRET) return "off";
  if (!env.TURNSTILE_SITEKEY || !env.TURNSTILE_SECRET) return "misconfigured";
  if (typeof token !== "string" || !token || token.length > 2048) return "failed";

  let result: { success?: boolean; action?: string; hostname?: string; metadata?: { result_with_testing_key?: boolean } };
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: clientIp(req) }),
    });
    if (!r.ok) throw new Error(`siteverify ${r.status}`);
    result = await r.json();
  } catch (err) {
    console.error("turnstile siteverify failed", err);
    return "failed";
  }
  if (result.success !== true) return "failed";
  // Cloudflare's test secret (local dev and CI only) answers without an action and with
  // hostname example.com. The secret is ours, so a visitor can't make this true in production.
  if (result.metadata?.result_with_testing_key === true) return "ok";
  const hostnames = new Set((env.TURNSTILE_HOSTNAMES ?? "").split(",").map((h) => h.trim()).filter(Boolean));
  if (result.action !== TURNSTILE_ACTION || !hostnames.has(result.hostname ?? "")) return "failed";
  return "ok";
}
