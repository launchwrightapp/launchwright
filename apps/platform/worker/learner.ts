// The learner's dashboard API. Everything here is the signed-in learner's own data, read from the
// tables the MCP server writes (apps/mcp/sql/002_v0_1.sql).
//
//   GET    /api/me                       projects, readiness, lesson progress, accounts, approvals, audit log
//   POST   /api/approvals/:id            { decision: "approve" | "reject" }
//   GET    /api/secret-requests/:id      what's being asked for (never a value)
//   POST   /api/secret-requests/:id      { value } or { cancel: true }
//   POST   /api/connections/cloudflare   { token }   checked with Cloudflare, then sealed
//   POST   /api/connections/neon         { apiKey }  checked with Neon, then sealed
//   DELETE /api/connections/:provider
//   GET    /auth/supabase(/callback)     Supabase OAuth (handled in handleLearnerAuth)
//
// Credentials are sealed with TOKEN_KEY before they touch the database and are never sent back.
// Every change is written to the audit log as the learner's action.
import { neon } from "@neondatabase/serverless";
import { isConcept } from "../../../packages/core/curriculum";
import { connectionAad, seal, secretRequestAad } from "../../../packages/core/seal";
import { CLOUDFLARE_SCOPES, NEON_SCOPES, SUPABASE_SCOPES, verifyCloudflareToken, verifyNeonKey } from "../../../packages/core/verify";
import { SUPABASE_AUTHORIZE, exchangeSupabaseCode } from "../../../packages/core/supabase-oauth";
import { cookie, readCookie, type User } from "./session";

export interface LearnerEnv {
  DATABASE_URL?: string;
  TOKEN_KEY?: string; // base64 32 bytes, same as the MCP server's
  PUBLIC_ORIGIN?: string;
  SUPABASE_CLIENT_ID?: string;
  SUPABASE_CLIENT_SECRET?: string;
}

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SECRET = 8 * 1024;
const SUPA_COOKIE = "__Host-lw_supabase";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

// Writes must come from our own pages, as JSON. (The session cookie is SameSite=Lax too.)
async function body(req: Request, url: URL, env: LearnerEnv): Promise<Record<string, unknown> | null> {
  const origin = req.headers.get("origin");
  if (origin && origin !== (env.PUBLIC_ORIGIN ?? url.origin)) return null;
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return null;
  const text = await req.text();
  if (text.length > MAX_SECRET * 2) return null;
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

async function audit(env: LearnerEnv, user: User, tool: string, summary: string, outcome: "ok" | "error" | "blocked" = "ok", repo: string | null = null) {
  await neon(env.DATABASE_URL!)`insert into audit_log (github_id, actor, client, tool, repo, summary, outcome) values (${user.id}, 'learner', 'Dashboard', ${tool}, ${repo}, ${summary}, ${outcome})`.catch((e) =>
    console.error("audit write failed", e),
  );
}

const SCOPES: Record<string, string> = { cloudflare: CLOUDFLARE_SCOPES, neon: NEON_SCOPES, supabase: SUPABASE_SCOPES };

async function me(env: LearnerEnv, user: User) {
  const configured = { database: !!env.DATABASE_URL, encryption: !!env.TOKEN_KEY, supabase: !!(env.SUPABASE_CLIENT_ID && env.SUPABASE_CLIENT_SECRET) };
  const base = { user: { id: user.id, login: user.login, name: user.name }, configured };
  if (!env.DATABASE_URL) return { ...base, projects: [], conceptsSeen: [], connections: [], approvals: [], audit: [], secrets: [], mcp: { connected: false, client: null, lastSeen: null } };
  const sql = neon(env.DATABASE_URL);
  const [projects, lessons, connections, approvals, auditRows, secrets] = await Promise.all([
    sql`select repo, framework, package_manager, database, hosting, worker_name, production_url, readiness_passed, readiness_total, checks, checked_at, updated_at
        from projects where github_id = ${user.id} order by updated_at desc limit 10`,
    sql`select concept, times_seen, last_seen_at from lesson_progress where github_id = ${user.id}`,
    sql`select provider, method, account_label, created_at from connections where github_id = ${user.id}`,
    sql`select id, repo, client, tool, action, title, summary, detail, created_at, expires_at from approvals
        where github_id = ${user.id} and status = 'pending' and expires_at > now() order by created_at desc limit 20`,
    sql`select actor, client, tool, repo, summary, outcome, created_at from audit_log where github_id = ${user.id} order by created_at desc limit 50`,
    sql`select repo, name, target, updated_at from secret_names where github_id = ${user.id} order by name`,
  ]);
  const seen = lessons.map((r) => r.concept as string).filter(isConcept);
  const lastAi = auditRows.find((r) => r.actor === "ai");
  return {
    ...base,
    projects: projects.map((p: Row) => ({
      repo: p.repo, framework: p.framework, packageManager: p.package_manager, database: p.database, hosting: p.hosting, worker: p.worker_name,
      productionUrl: p.production_url, readiness: p.readiness_total != null ? { passed: p.readiness_passed, total: p.readiness_total } : null,
      checks: p.checks ?? null, checkedAt: iso(p.checked_at), updatedAt: iso(p.updated_at),
    })),
    conceptsSeen: seen,
    connections: connections.map((c: Row) => ({ provider: c.provider, method: c.method, label: c.account_label, scopes: SCOPES[c.provider as string] ?? "", connectedAt: iso(c.created_at) })),
    approvals: approvals.map((a: Row) => ({ id: a.id, repo: a.repo, client: a.client, tool: a.tool, action: a.action, title: a.title, summary: a.summary, detail: a.detail, createdAt: iso(a.created_at), expiresAt: iso(a.expires_at) })),
    audit: auditRows.map((r: Row) => ({ actor: r.actor, client: r.client, tool: r.tool, repo: r.repo, summary: r.summary, outcome: r.outcome, at: iso(r.created_at) })),
    secrets: secrets.map((s: Row) => ({ repo: s.repo, name: s.name, target: s.target, updatedAt: iso(s.updated_at) })),
    mcp: { connected: !!lastAi || seen.length > 0, client: (lastAi?.client as string) ?? null, lastSeen: iso(lastAi?.created_at) },
  };
}

export async function handleLearnerApi(req: Request, url: URL, env: LearnerEnv, user: User): Promise<Response | null> {
  const p = url.pathname;
  if (p === "/api/me" && req.method === "GET") {
    try {
      return json(await me(env, user));
    } catch (err) {
      console.error("/api/me failed", err);
      return json({ error: "Couldn't load your dashboard. Please refresh in a minute." }, 500);
    }
  }

  const needsSetup = () => json({ error: "This part of the dashboard isn't set up yet (no database or encryption key)." }, 503);

  // --- Approvals --------------------------------------------------------------------------
  let m = p.match(/^\/api\/approvals\/([^/]+)$/);
  if (m && req.method === "POST") {
    if (!env.DATABASE_URL) return needsSetup();
    if (!UUID.test(m[1])) return json({ error: "Not found." }, 404);
    const data = await body(req, url, env);
    const decision = data?.decision;
    if (decision !== "approve" && decision !== "reject") return json({ error: "Choose approve or reject." }, 400);
    const sql = neon(env.DATABASE_URL);
    const [row] = await sql`update approvals set status = ${decision === "approve" ? "approved" : "rejected"}, decided_at = now()
      where id = ${m[1]} and github_id = ${user.id} and status = 'pending' and expires_at > now() returning title, repo`;
    if (!row) return json({ error: "This request was already decided or has expired." }, 409);
    await audit(env, user, decision === "approve" ? "approve" : "reject", `${decision === "approve" ? "Approved" : "Rejected"}: ${row.title}`, decision === "approve" ? "ok" : "blocked", row.repo as string);
    return json({ ok: true, status: decision === "approve" ? "approved" : "rejected" });
  }

  // --- Secret requests ----------------------------------------------------------------------
  m = p.match(/^\/api\/secret-requests\/([^/]+)$/);
  if (m) {
    if (!env.DATABASE_URL || !env.TOKEN_KEY) return needsSetup();
    if (!UUID.test(m[1])) return json({ error: "This link isn't valid." }, 404);
    const sql = neon(env.DATABASE_URL);
    const [r] = await sql`select id, repo, name, target, expires_at,
        case when status in ('waiting', 'submitted') and expires_at < now() then 'expired' else status end as status
      from secret_requests where id = ${m[1]} and github_id = ${user.id} and name <> 'SUPABASE_NEW_PROJECT'`;
    if (!r) return json({ error: "This link isn't valid, or it belongs to another account." }, 404);
    const view = { id: r.id, repo: r.repo, name: r.name, target: r.target, status: r.status, expiresAt: iso(r.expires_at) };
    if (req.method === "GET") return json(view);
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const data = await body(req, url, env);
    if (!data) return json({ error: "Please try again." }, 400);
    if (r.status !== "waiting") return json({ error: r.status === "expired" ? "This link expired. Ask your AI tool for a new one." : "This secret was already saved." }, 409);
    if (data.cancel === true) {
      await sql`update secret_requests set status = 'cancelled' where id = ${r.id} and github_id = ${user.id}`;
      await audit(env, user, "set_secret", `Cancelled the request for ${r.name}`, "blocked", r.repo as string);
      return json({ ok: true, status: "cancelled" });
    }
    const value = typeof data.value === "string" ? data.value.replace(/\r?\n$/, "") : "";
    if (!value) return json({ error: "Paste the value first." }, 400);
    if (value.length > MAX_SECRET) return json({ error: "That's longer than any secret we expect (8 KB max)." }, 400);
    const sealed = await seal(value, env.TOKEN_KEY, secretRequestAad(user.id, r.id as string));
    const [ok] = await sql`update secret_requests set status = 'submitted', value_sealed = ${sealed}, submitted_at = now()
      where id = ${r.id} and github_id = ${user.id} and status = 'waiting' returning id`;
    if (!ok) return json({ error: "This secret was already saved." }, 409);
    await audit(env, user, "set_secret", `Typed the value of ${r.name} on the dashboard (hidden)`, "ok", r.repo as string);
    return json({ ok: true, status: "submitted" });
  }

  // --- Connections --------------------------------------------------------------------------
  m = p.match(/^\/api\/connections\/(cloudflare|neon|supabase)$/);
  if (m) {
    if (!env.DATABASE_URL || !env.TOKEN_KEY) return needsSetup();
    const provider = m[1];
    const sql = neon(env.DATABASE_URL);
    if (req.method === "DELETE") {
      const origin = req.headers.get("origin");
      if (origin && origin !== (env.PUBLIC_ORIGIN ?? url.origin)) return json({ error: "Please try again." }, 400);
      await sql`delete from connections where github_id = ${user.id} and provider = ${provider}`;
      await audit(env, user, "disconnect", `Disconnected ${provider}. Revoke the key at the provider too if you won't reconnect.`);
      return json({ ok: true });
    }
    if (req.method !== "POST" || provider === "supabase") return new Response("Method not allowed", { status: 405 });
    const data = await body(req, url, env);
    const secret = typeof data?.token === "string" ? data.token.trim() : typeof data?.apiKey === "string" ? data.apiKey.trim() : "";
    if (!secret || secret.length > 500 || /\s/.test(secret)) return json({ error: "Paste the key exactly as shown, with no spaces." }, 400);
    let accountId: string | null = null;
    let label: string;
    if (provider === "cloudflare") {
      const v = await verifyCloudflareToken(secret);
      if (!v) return json({ error: "Cloudflare didn't accept that token, or it can't see any account. Create it from the template link and copy it again." }, 400);
      accountId = v.accountId;
      label = v.accountName;
    } else {
      const v = await verifyNeonKey(secret);
      if (!v) return json({ error: "Neon didn't accept that API key. Create a new one in Neon (Account settings, API keys) and paste it again." }, 400);
      label = v.label;
    }
    const sealed = await seal(secret, env.TOKEN_KEY, connectionAad(user.id, provider));
    await sql`insert into connections (github_id, provider, method, account_id, account_label, scopes, token_sealed)
      values (${user.id}, ${provider}, 'api_key', ${accountId}, ${label}, ${SCOPES[provider]}, ${sealed})
      on conflict (github_id, provider) do update set method = 'api_key', account_id = excluded.account_id, account_label = excluded.account_label,
        scopes = excluded.scopes, token_sealed = excluded.token_sealed, refresh_sealed = null, expires_at = null, updated_at = now()`;
    await audit(env, user, "connect", `Connected ${provider === "cloudflare" ? "Cloudflare" : "Neon"} (${label}). The key is stored encrypted.`);
    return json({ ok: true, provider, label });
  }
  return null;
}

// --- Supabase OAuth ---------------------------------------------------------------------------
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const redirect = (to: string, cookies: string[] = []) => {
  const h = new Headers({ location: to, "cache-control": "no-store" });
  for (const c of cookies) h.append("set-cookie", c);
  return new Response(null, { status: 302, headers: h });
};

export async function handleLearnerAuth(req: Request, url: URL, env: LearnerEnv, user: User): Promise<Response | null> {
  if (url.pathname !== "/auth/supabase" && url.pathname !== "/auth/supabase/callback") return null;
  const back = (q: string) => redirect(`/security?${q}#connect-supabase`, [cookie(SUPA_COOKIE, "", 0)]);
  if (!env.SUPABASE_CLIENT_ID || !env.SUPABASE_CLIENT_SECRET || !env.DATABASE_URL || !env.TOKEN_KEY) return back("error=supabase_unavailable");
  const origin = env.PUBLIC_ORIGIN ?? url.origin;
  const redirectUri = `${origin}/auth/supabase/callback`;

  if (url.pathname === "/auth/supabase") {
    const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    const auth = new URL(SUPABASE_AUTHORIZE);
    auth.searchParams.set("client_id", env.SUPABASE_CLIENT_ID);
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("state", state);
    auth.searchParams.set("code_challenge", challenge);
    auth.searchParams.set("code_challenge_method", "S256");
    return redirect(auth.toString(), [cookie(SUPA_COOKIE, `${state}.${verifier}`, 600)]);
  }

  const [state, verifier] = (readCookie(req, SUPA_COOKIE) ?? "").split(".");
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return back("error=supabase_cancelled");
  if (!state || !verifier || url.searchParams.get("state") !== state || !code) return back("error=supabase_expired");
  let tokens;
  try {
    tokens = await exchangeSupabaseCode(env.SUPABASE_CLIENT_ID, env.SUPABASE_CLIENT_SECRET, code, redirectUri, verifier);
  } catch (err) {
    console.error("supabase exchange failed", err);
    return back("error=supabase_failed");
  }
  const aad = connectionAad(user.id, "supabase");
  const tokenSealed = await seal(tokens.accessToken, env.TOKEN_KEY, aad);
  const refreshSealed = tokens.refreshToken ? await seal(tokens.refreshToken, env.TOKEN_KEY, aad) : null;
  const sql = neon(env.DATABASE_URL);
  await sql`insert into connections (github_id, provider, method, account_label, scopes, token_sealed, refresh_sealed, expires_at)
    values (${user.id}, 'supabase', 'oauth', 'Supabase account', ${SUPABASE_SCOPES}, ${tokenSealed}, ${refreshSealed}, ${tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null})
    on conflict (github_id, provider) do update set method = 'oauth', account_label = excluded.account_label, scopes = excluded.scopes,
      token_sealed = excluded.token_sealed, refresh_sealed = excluded.refresh_sealed, expires_at = excluded.expires_at, updated_at = now()`;
  await audit(env, user, "connect", "Connected Supabase. The access is stored encrypted.");
  return back("connected=supabase");
}
