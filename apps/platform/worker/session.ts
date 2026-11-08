// Signed session cookie: v1.<payload>.<hmac>, both base64url. No server storage.
// The GitHub token is never kept: we only need to know who you are.

export interface User { id: number; login: string; name: string; avatar: string; email?: string | null }
interface Payload extends User { exp: number }

export const SESSION_COOKIE = "__Host-lw_session";
export const SESSION_DAYS = 7;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function sign(user: User, secret: string, now = Date.now()): Promise<string> {
  const payload: Payload = { ...user, exp: Math.floor(now / 1000) + SESSION_DAYS * 86400 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(`v1.${body}`)));
  return `v1.${body}.${b64url(mac)}`;
}

export async function verify(token: string | undefined, secret: string, now = Date.now()): Promise<User | null> {
  const [v, body, mac] = token?.split(".") ?? [];
  if (v !== "v1" || !body || !mac) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(secret), fromB64url(mac), enc.encode(`v1.${body}`));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Payload;
    if (typeof p.exp !== "number" || p.exp * 1000 < now) return null;
    return { id: p.id, login: p.login, name: p.name, avatar: p.avatar, email: p.email ?? null };
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
}

export const cookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
