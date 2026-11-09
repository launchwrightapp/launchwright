// mcp.launchwright.app: the remote MCP server learners connect their AI tool to.
//
//   /mcp         MCP over Streamable HTTP, needs an OAuth access token
//   /authorize   consent page, then GitHub sign-in (auth.ts)
//   /callback    back from GitHub
//   /oauth/token, /oauth/register, /.well-known/*   served by the OAuth library
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp";
import { handleAuth, refreshUpstream, type AuthEnv, type Props } from "./auth";
import { PAGE_CSP, PAGE_CSS, PAGE_JS, homePage } from "./page";
import { buildServer, VERSION } from "./server";
import { memoryStore, neonStore, purgeExpired } from "./store";
import { secure } from "../../../packages/core/security-headers";

interface Env extends AuthEnv {
  DATABASE_URL?: string;
  TOKEN_KEY?: string; // base64 32 bytes, shared with the platform: seals connected-account tokens
  PLATFORM_ORIGIN?: string;
  SUPABASE_CLIENT_ID?: string;
  SUPABASE_CLIENT_SECRET?: string;
}

const noStore = memoryStore({ persistent: false }).store;

const mcpApi = {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    // Set by the OAuth library from the access token's grant (encrypted at rest).
    const props = ctx.props as Props | undefined;
    if (!props?.githubToken) return new Response("Unauthorized", { status: 401 });
    const store = env.DATABASE_URL ? neonStore(env.DATABASE_URL, env.TOKEN_KEY) : noStore;
    const learner = { id: props.id, login: props.login, githubToken: props.githubToken, client: props.clientName ?? "AI tool" };
    const config = {
      platformOrigin: env.PLATFORM_ORIGIN ?? "https://platform.launchwright.app",
      supabase: env.SUPABASE_CLIENT_ID && env.SUPABASE_CLIENT_SECRET ? { clientId: env.SUPABASE_CLIENT_ID, clientSecret: env.SUPABASE_CLIENT_SECRET } : undefined,
    };
    return createMcpHandler(() => buildServer(learner, store, config), { route: "/mcp" })(req, env, ctx);
  },
};

const site = {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const auth = await handleAuth(req, env);
    if (auth) return auth;
    if (url.pathname === "/page.css") {
      return new Response(PAGE_CSS, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=3600" } });
    }
    if (url.pathname === "/page.js") {
      return new Response(PAGE_JS, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=3600" } });
    }
    if (url.pathname === "/" && req.method === "GET") {
      return new Response(homePage(url.origin), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": PAGE_CSP,
          "x-content-type-options": "nosniff",
        },
      });
    }
    // For the uptime workflow: is the Worker up, and is its configuration complete?
    if (url.pathname === "/health") {
      const ok = !!env.GITHUB_CLIENT_SECRET;
      return Response.json(
        { ok, version: VERSION, database: !!env.DATABASE_URL, encryption: !!env.TOKEN_KEY },
        { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
      );
    }
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n");
    return new Response("Not found", { status: 404 });
  },
};

// The OAuth resource is this Worker's own /mcp URL, so production, PR previews and local dev
// each get a provider for their own origin.
const providers = new Map<string, OAuthProvider<Env>>();
function provider(origin: string) {
  let p = providers.get(origin);
  if (!p) {
    p = new OAuthProvider<Env>({
      apiRoute: "/mcp",
      apiHandler: mcpApi,
      defaultHandler: site,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/oauth/token",
      clientRegistrationEndpoint: "/oauth/register",
      scopesSupported: ["mcp"],
      requiredScopes: ["mcp"],
      resourceMetadata: { resource: `${origin}/mcp`, resource_name: "launchwright" },
      clientIdMetadataDocumentEnabled: true,
      accessTokenTTL: 3600,
      tokenExchangeCallback: async ({ grantType, props, env }) => {
        if (grantType === "refresh_token") return refreshUpstream(env as Env, props as Props);
      },
    });
    providers.set(origin, p);
  }
  return p;
}

const app = {
  fetch(req, env, ctx) {
    return provider(new URL(req.url).origin).fetch(req, env, ctx);
  },
  // Every 15 minutes (wrangler.jsonc triggers): secret values never outlive their hour.
  async scheduled(_event, env) {
    if (!env.DATABASE_URL) return;
    const n = await purgeExpired(env.DATABASE_URL);
    if (n.secrets || n.approvals) console.log("purged expired", n);
  },
} satisfies ExportedHandler<Env>;

// Every response: http redirects to https, and missing security headers are filled in.
export default { ...app, fetch: secure(app.fetch) } satisfies ExportedHandler<Env>;
