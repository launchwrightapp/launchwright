// Signing in: the MCP client sends the learner to /authorize. They approve the client on our
// consent page, sign in with GitHub, and come back to /callback, where we issue the MCP grant.
// GitHub's token lives only in the grant's encrypted props; the AI never sees it.
import { AuthorizationError, CimdFetchError, OAuthError, authorizationErrorRedirect, type ConsentDescription, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { PAGE_CSS, page, escape } from "./page";

export interface AuthEnv {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET?: string;
}

export interface Props extends Record<string, unknown> {
  id: number;
  login: string;
  githubToken: string;
  githubRefresh?: string;
  githubExpiresAt?: number; // ms; absent when the token doesn't expire
}

const UA = "launchwright-mcp";
const html = (body: string, status = 200, headers = new Headers()) => {
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("content-security-policy", "default-src 'none'; style-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  return new Response(body, { status, headers });
};
const problem = (msg: string, status = 400) =>
  html(page("Couldn't connect", `<h1>Couldn't connect</h1><p>${escape(msg)}</p><p>Go back to your AI tool and start connecting again.</p>`), status);

async function s256(verifier: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...d)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function consentPage(d: ConsentDescription, handle: string) {
  const who = d.clientDomain
    ? `Published by <strong>${escape(d.clientDomain)}</strong>.`
    : "This app registered itself, so its name isn't verified.";
  return page(
    `Connect ${d.clientName}`,
    `<h1>Connect <span class="name">${escape(d.clientName)}</span> to launchwright?</h1>
<p>${who} After you sign in with GitHub, access goes to <strong>${escape(d.redirectHost)}</strong>.</p>
${d.redirectIsLoopback ? '<p class="warn">This sends access to an app on your computer. Continue only if you just started connecting from your AI tool.</p>' : ""}
<p>It will be able to read your GitHub repos through launchwright and teach you as it works. It can't see your GitHub password or token.</p>
<form method="post" action="/authorize">
  <input type="hidden" name="handle" value="${escape(handle)}">
  <div class="actions">
    <button name="decision" value="approve" class="primary">Continue with GitHub</button>
    <button name="decision" value="deny">Cancel</button>
  </div>
</form>`,
  );
}

async function githubUser(token: string) {
  const r = await fetch("https://api.github.com/user", {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": UA, "x-github-api-version": "2022-11-28" },
  });
  if (!r.ok) return null;
  return (await r.json()) as { id: number; login: string };
}

interface GithubToken { access_token?: string; refresh_token?: string; expires_in?: number; error?: string }

async function githubToken(env: AuthEnv, body: Record<string, string>): Promise<GithubToken> {
  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, ...body }),
  });
  return (await r.json().catch(() => ({ error: `http_${r.status}` }))) as GithubToken;
}

const tokenProps = (t: GithubToken) => ({
  githubToken: t.access_token!,
  githubRefresh: t.refresh_token,
  githubExpiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined,
});

export async function handleAuth(req: Request, env: AuthEnv): Promise<Response | null> {
  const url = new URL(req.url);
  const oauth = env.OAUTH_PROVIDER;
  if (url.pathname !== "/authorize" && url.pathname !== "/callback") return null;
  if (!env.GITHUB_CLIENT_SECRET) return problem("Sign-in isn't configured yet.", 503);

  try {
    if (url.pathname === "/authorize" && req.method === "GET") {
      const request = await oauth.parseAuthRequest(req);
      const details = await oauth.describeConsent(request);
      const consent = await oauth.beginConsent(request);
      return html(consentPage(details, consent.handle), 200, consent.headers);
    }

    if (url.pathname === "/authorize" && req.method === "POST") {
      const form = await req.formData();
      const handle = String(form.get("handle") ?? "");
      if (form.get("decision") !== "approve") {
        const denied = await oauth.denyConsent(req, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const approved = await oauth.approveConsent(req, handle);
      const verifier = crypto.randomUUID() + crypto.randomUUID();
      const { state, headers } = await oauth.beginUpstream(approved.request, { data: { verifier }, headers: approved.headers });
      const gh = new URL("https://github.com/login/oauth/authorize");
      gh.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      gh.searchParams.set("redirect_uri", `${url.origin}/callback`);
      gh.searchParams.set("state", state);
      gh.searchParams.set("code_challenge", await s256(verifier));
      gh.searchParams.set("code_challenge_method", "S256");
      headers.set("location", gh.toString());
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === "/callback" && req.method === "GET") {
      const { request: original, data, headers } = await oauth.finishUpstream<{ verifier: string }>(req);
      const code = url.searchParams.get("code");
      if (url.searchParams.get("error") || !code) {
        headers.set("location", authorizationErrorRedirect(original, "access_denied"));
        return new Response(null, { status: 302, headers });
      }
      const token = await githubToken(env, { code, code_verifier: data.verifier, redirect_uri: `${url.origin}/callback` });
      if (!token.access_token) return problem("GitHub didn't accept the sign-in. Please try again.", 502);
      const user = await githubUser(token.access_token);
      if (!user) return problem("Couldn't read your GitHub account. Please try again.", 502);

      const props: Props = { id: user.id, login: user.login, ...tokenProps(token) };
      const { redirectTo } = await oauth.completeAuthorization({
        request: original,
        userId: String(user.id),
        metadata: { login: user.login },
        scope: original.scope,
        props,
      });
      headers.set("location", redirectTo);
      return new Response(null, { status: 302, headers });
    }
    return new Response("Method not allowed", { status: 405 });
  } catch (err) {
    if (err instanceof AuthorizationError && err.redirectTo) return Response.redirect(err.redirectTo, 302);
    if (err instanceof AuthorizationError) return problem(err.description ?? "This sign-in link expired or was already used.");
    if (err instanceof CimdFetchError) return problem("This app could not be verified.");
    throw err;
  }
}

// GitHub App user tokens expire after 8 hours. When the MCP client refreshes its token,
// refresh GitHub's too if it's close to expiring.
export async function refreshUpstream(env: AuthEnv, props: Props): Promise<{ newProps: Props } | void> {
  if (!props.githubRefresh || !props.githubExpiresAt || props.githubExpiresAt - Date.now() > 30 * 60_000) return;
  const t = await githubToken(env, { grant_type: "refresh_token", refresh_token: props.githubRefresh });
  if (t.access_token) return { newProps: { ...props, ...tokenProps(t) } };
  if (t.error === "bad_refresh_token" || t.error === "incorrect_client_credentials") {
    throw new OAuthError("invalid_grant", { description: "GitHub access was revoked. Connect launchwright again." });
  }
  throw new OAuthError("temporarily_unavailable", { description: "GitHub is unavailable", statusCode: 503 });
}

export { PAGE_CSS };
