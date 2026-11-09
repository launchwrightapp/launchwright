// platform.launchwright.app: GitHub sign-in in front of the static dashboard.
import { SESSION_COOKIE, SESSION_DAYS, cookie, readCookie, sign, verify, type User } from "./session";
import { handleApplicantsApi, type ApplicantsEnv } from "./applicants";
import { handleFunnelApi } from "./funnel";
import { handleMessagesApi, handleInboundEmail, isAdmin, type MessagesEnv } from "./messages";
import { handleLearnerApi, handleLearnerAuth, type LearnerEnv } from "./learner";

interface Env extends ApplicantsEnv, LearnerEnv {
  ASSETS: Fetcher;
  GITHUB_CLIENT_ID: string; // public, in wrangler.jsonc
  GITHUB_CLIENT_SECRET?: string; // secret
  SESSION_SECRET?: string; // secret, 32+ random bytes
}

const STATE_COOKIE = "__Host-lw_oauth";
const PUBLIC = /^\/(signin\/?|favicon\.svg|robots\.txt|health|_astro\/.*)$/;

const redirect = (to: string, headers: Record<string, string> = {}, cookies: string[] = []) => {
  const h = new Headers({ location: to, "cache-control": "no-store", ...headers });
  for (const c of cookies) h.append("set-cookie", c);
  return new Response(null, { status: 302, headers: h });
};
const fail = (_url: URL, code: string) => redirect(`/signin?error=${code}`, {}, [cookie(STATE_COOKIE, "", 0)]);
const origin = (url: URL, env: Env) => env.PUBLIC_ORIGIN ?? url.origin;
// Only same-site paths, so ?next= can't send people elsewhere.
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/");

async function startLogin(url: URL, env: Env) {
  const state = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const next = safeNext(url.searchParams.get("next"));
  const auth = new URL("https://github.com/login/oauth/authorize");
  auth.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  auth.searchParams.set("redirect_uri", `${origin(url, env)}/auth/github/callback`);
  auth.searchParams.set("state", state);
  return redirect(auth.toString(), {}, [cookie(STATE_COOKIE, `${state}|${encodeURIComponent(next)}`, 600)]);
}

async function finishLogin(req: Request, url: URL, env: Env) {
  const [state, next] = decodeURIComponent(readCookie(req, STATE_COOKIE) ?? "").split("|");
  if (url.searchParams.get("error") === "access_denied") return fail(url, "cancelled");
  if (!state || url.searchParams.get("state") !== state) return fail(url, "expired");
  const code = url.searchParams.get("code");
  if (!code) return fail(url, "expired");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${origin(url, env)}/auth/github/callback` }),
  });
  const token = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
  if (!token.access_token) return fail(url, "github");

  const userRes = await fetch("https://api.github.com/user", {
    headers: { authorization: `Bearer ${token.access_token}`, accept: "application/vnd.github+json", "user-agent": "launchwright-platform", "x-github-api-version": "2022-11-28" },
  });
  if (!userRes.ok) return fail(url, "github");
  const gh = (await userRes.json()) as { id: number; login: string; name: string | null; avatar_url: string; email: string | null };
  const user: User = { id: gh.id, login: gh.login, name: gh.name || gh.login, avatar: gh.avatar_url, email: await primaryEmail(token.access_token, gh.email) };

  const session = await sign(user, env.SESSION_SECRET!);
  return redirect(safeNext(next ? decodeURIComponent(next) : null), {}, [cookie(SESSION_COOKIE, session, SESSION_DAYS * 86400), cookie(STATE_COOKIE, "", 0)]);
}

// The verified primary email, so team replies reach the learner. Needs the GitHub App's
// "Email addresses: read" permission; without it we fall back to the public profile email.
async function primaryEmail(accessToken: string, publicEmail: string | null) {
  const res = await fetch("https://api.github.com/user/emails", {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/vnd.github+json", "user-agent": "launchwright-platform", "x-github-api-version": "2022-11-28" },
  }).catch(() => null);
  if (res?.ok) {
    const list = (await res.json().catch(() => [])) as { email: string; primary: boolean; verified: boolean }[];
    const hit = Array.isArray(list) ? list.find((e) => e.primary && e.verified) : undefined;
    if (hit) return hit.email.toLowerCase();
  }
  return publicEmail?.toLowerCase() ?? null;
}

// Fill the signed-in person into the page (name, first name, avatar).
function personalize(res: Response, user: User, admin: boolean) {
  const first = user.name.split(/\s+/)[0];
  const initials = user.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const avatarOk = /^https:\/\/avatars\.githubusercontent\.com\//.test(user.avatar);
  return new HTMLRewriter()
    .on("[data-user-name]", { element: (e) => void e.setInnerContent(user.name) })
    .on("[data-user-first]", { element: (e) => void e.setInnerContent(first) })
    .on("[data-admin-only]", { element: (e) => void (admin ? e.removeAttribute("data-admin-only") : e.remove()) })
    .on("[data-learner-only]", { element: (e) => void (admin ? e.remove() : e.removeAttribute("data-learner-only")) })
    .on("[data-user-login]", { element: (e) => void e.setInnerContent(`@${user.login}`) })
    .on("[data-user-avatar]", {
      element: (e) => {
        e.setAttribute("aria-label", user.name);
        if (avatarOk) e.setInnerContent(`<img src="${user.avatar.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`)}&amp;s=64" alt="" class="size-full rounded-full object-cover">`, { html: true });
        else e.setInnerContent(initials);
      },
    })
    .transform(res);
}

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const url = new URL(req.url);
    // For the uptime workflow. Says only whether sign-in and storage are configured.
    if (url.pathname === "/health") {
      const ok = !!env.SESSION_SECRET && !!env.GITHUB_CLIENT_SECRET;
      return Response.json({ ok, database: !!env.DATABASE_URL, encryption: !!env.TOKEN_KEY }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
    }
    // Fail closed: without secrets nobody can sign in, and nothing private is served.
    if (!env.SESSION_SECRET || !env.GITHUB_CLIENT_SECRET) {
      if (PUBLIC.test(url.pathname)) return env.ASSETS.fetch(req);
      return new Response("Sign-in isn't configured yet.", { status: 503, headers: { "cache-control": "no-store" } });
    }

    if (url.pathname === "/auth/github") return startLogin(url, env);
    if (url.pathname === "/auth/github/callback") return finishLogin(req, url, env);
    if (url.pathname === "/auth/logout") {
      if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
      return redirect("/signin?signed_out=1", {}, [cookie(SESSION_COOKIE, "", 0)]);
    }

    const user = await verify(readCookie(req, SESSION_COOKIE), env.SESSION_SECRET);
    if (url.pathname.replace(/\/$/, "") === "/signin" && user) return redirect("/");
    if (PUBLIC.test(url.pathname)) return env.ASSETS.fetch(req);
    const api = url.pathname.startsWith("/api/");
    if (!user && api) return new Response(JSON.stringify({ error: "Please sign in again." }), { status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    if (!user) return redirect(`/signin?next=${encodeURIComponent(url.pathname + url.search)}`);

    const connect = await handleLearnerAuth(req, url, env, user);
    if (connect) return connect;
    if (api) {
      return (
        (await handleApplicantsApi(req, url, env, user)) ??
        (await handleFunnelApi(req, url, env, user)) ??
        (await handleMessagesApi(req, url, env, user, ctx)) ??
        (await handleLearnerApi(req, url, env, user)) ??
        new Response("Not found", { status: 404 })
      );
    }
    const admin = isAdmin(user, env);
    // Team pages don't exist for anyone else.
    if (/^\/(inbox|applicants|funnel)(\/|\.html|$)/.test(url.pathname) && !admin) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });

    const res = await env.ASSETS.fetch(req);
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) return res;
    const out = personalize(res, user, admin);
    const headers = new Headers(out.headers);
    headers.set("cache-control", "private, no-store");
    return new Response(out.body, { status: out.status, headers });
  },
  // Email Routing sends hello@launchwright.app here (see messages.ts).
  async email(message, env) {
    await handleInboundEmail(message, env);
  },
} satisfies ExportedHandler<Env>;
