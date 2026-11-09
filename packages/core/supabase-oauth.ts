// Supabase OAuth (https://supabase.com/docs/guides/integrations/build-a-supabase-integration).
// The platform runs the authorize + code exchange; the MCP server refreshes expired tokens.
// Needs SUPABASE_CLIENT_ID and SUPABASE_CLIENT_SECRET (an OAuth app in the Launchwright Supabase org).

export const SUPABASE_AUTHORIZE = "https://api.supabase.com/v1/oauth/authorize";
const TOKEN_URL = "https://api.supabase.com/v1/oauth/token";

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null; // ms
}

async function tokenRequest(clientId: string, clientSecret: string, body: Record<string, string>): Promise<OAuthTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
    body: new URLSearchParams(body),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) throw new Error(`Supabase token request failed (${res.status})`);
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null, expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : null };
}

export const exchangeSupabaseCode = (clientId: string, clientSecret: string, code: string, redirectUri: string, codeVerifier: string) =>
  tokenRequest(clientId, clientSecret, { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: codeVerifier });

export const refreshSupabaseToken = (clientId: string, clientSecret: string, refreshToken: string) =>
  tokenRequest(clientId, clientSecret, { grant_type: "refresh_token", refresh_token: refreshToken });
