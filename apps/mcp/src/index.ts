// mcp.launchwright.app: the remote MCP server learners connect their AI tool to.
//
//   /mcp         MCP over Streamable HTTP, needs an OAuth access token
//   /authorize   consent page, then GitHub sign-in (auth.ts)
//   /callback    back from GitHub
//   /oauth/token, /oauth/register, /.well-known/*   served by the OAuth library
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp";
import { handleAuth, refreshUpstream, type AuthEnv, type Props } from "./auth";
import { PAGE_CSS, homePage } from "./page";
import { buildServer } from "./server";
import { neonProgress, noProgress } from "./progress";

interface Env extends AuthEnv {
  DATABASE_URL?: string;
}

const mcpApi = {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    // Set by the OAuth library from the access token's grant (encrypted at rest).
    const props = ctx.props as Props | undefined;
    if (!props?.githubToken) return new Response("Unauthorized", { status: 401 });
    const store = env.DATABASE_URL ? neonProgress(env.DATABASE_URL) : noProgress;
    const learner = { id: props.id, login: props.login, githubToken: props.githubToken };
    return createMcpHandler(() => buildServer(learner, store), { route: "/mcp" })(req, env, ctx);
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
    if (url.pathname === "/" && req.method === "GET") {
      return new Response(homePage(url.origin), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": "default-src 'none'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'",
          "x-content-type-options": "nosniff",
        },
      });
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

export default {
  fetch(req, env, ctx) {
    return provider(new URL(req.url).origin).fetch(req, env, ctx);
  },
} satisfies ExportedHandler<Env>;
