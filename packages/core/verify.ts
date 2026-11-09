// Checking a key a learner pastes on the dashboard before we store it: is it valid, and whose is it?
// Results only ever contain account names, never the key.

interface CfResponse<T> {
  success: boolean;
  result: T;
}

// The Cloudflare API token template the dashboard links to: the smallest set of permissions
// Launchwright needs (deploy Workers and Pages, set Worker secrets, read Worker logs).
export const CLOUDFLARE_TOKEN_TEMPLATE =
  "https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=" +
  encodeURIComponent(JSON.stringify([
    { key: "workers_scripts", type: "edit" },
    { key: "workers_observability", type: "read" },
    { key: "account_settings", type: "read" },
    { key: "page", type: "edit" },
  ])) +
  "&name=launchwright&accountId=*&zoneId=all";

export const CLOUDFLARE_SCOPES = "Workers Scripts: Edit · Workers Observability: Read · Account Settings: Read · Pages: Edit (1 account)";
export const NEON_SCOPES = "Neon API key: list and create projects, read connection strings";
export const SUPABASE_SCOPES = "Supabase OAuth: list and create projects, read pooler settings";

export async function verifyCloudflareToken(token: string, f: typeof fetch = fetch): Promise<{ accountId: string; accountName: string } | null> {
  const h = { authorization: `Bearer ${token}` };
  const v = (await f("https://api.cloudflare.com/client/v4/user/tokens/verify", { headers: h }).then((r) => r.json()).catch(() => null)) as CfResponse<{ status: string }> | null;
  if (!v?.success || v.result?.status !== "active") return null;
  const a = (await f("https://api.cloudflare.com/client/v4/accounts?per_page=5", { headers: h }).then((r) => r.json()).catch(() => null)) as CfResponse<{ id: string; name: string }[]> | null;
  const acct = a?.success ? a.result[0] : undefined;
  return acct ? { accountId: acct.id, accountName: acct.name } : null;
}

export async function verifyNeonKey(key: string, f: typeof fetch = fetch): Promise<{ label: string } | null> {
  const h = { authorization: `Bearer ${key}`, accept: "application/json" };
  const me = await f("https://console.neon.tech/api/v2/users/me", { headers: h }).catch(() => null);
  if (me?.ok) {
    const u = (await me.json().catch(() => ({}))) as { email?: string; name?: string };
    return { label: u.email ?? u.name ?? "Neon account" };
  }
  // Organization API keys can't call /users/me but can list projects.
  const p = await f("https://console.neon.tech/api/v2/projects?limit=1", { headers: h }).catch(() => null);
  return p?.ok ? { label: "Neon (organization key)" } : null;
}
