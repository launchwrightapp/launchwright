// Small helpers shared by the site's API routes.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY = 8192; // the pilot questionnaire (src/pages/pilot/apply.astro) fits well under this

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "cache-control": "no-store",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...extra },
  });
}

// A 303 redirect that can also carry headers such as Set-Cookie (Response.redirect can't).
export function seeOther(location: string, extra: Record<string, string> = {}) {
  return new Response(null, { status: 303, headers: { location, ...SECURITY_HEADERS, ...extra } });
}

export function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export const cleanEmail = (value: unknown) => clean(value, 254).toLowerCase();

export async function readBody(req: Request): Promise<{ data: Record<string, unknown>; isForm: boolean } | null> {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return null;
  const type = req.headers.get("content-type") ?? "";
  const text = await req.text();
  if (text.length > MAX_BODY) return null;

  if (type.includes("application/json")) {
    try {
      const data = JSON.parse(text);
      return data && typeof data === "object" && !Array.isArray(data) ? { data, isForm: false } : null;
    } catch {
      return null;
    }
  }
  if (type.includes("application/x-www-form-urlencoded")) {
    // Checkbox groups send the same name more than once; keep every value.
    const data: Record<string, unknown> = {};
    for (const [k, v] of new URLSearchParams(text)) {
      const prev = data[k];
      data[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
    }
    return { data, isForm: true };
  }
  return null;
}
