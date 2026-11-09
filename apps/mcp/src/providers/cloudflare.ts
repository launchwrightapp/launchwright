// Cloudflare, with the learner's own API token (connected on the dashboard).
// We use an API token rather than OAuth because the deploy runs in the learner's own GitHub Actions,
// which needs a long-lived token anyway, and Cloudflare OAuth isn't open to third-party apps yet.
// The token template the dashboard links to asks only for: Workers Scripts (edit),
// Workers Observability (read), Account Settings (read), Cloudflare Pages (edit).
export class CloudflareError extends Error {}

const BASE = "https://api.cloudflare.com/client/v4";

interface CfResponse<T> {
  success: boolean;
  result: T;
  errors?: { code: number; message: string }[];
}

export function cloudflare(token: string, accountId: string) {
  async function call<T>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${token}`, ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
      body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    });
    const data = (await res.json().catch(() => null)) as CfResponse<T> | null;
    if (res.status === 401 || res.status === 403) throw new CloudflareError("Cloudflare refused the token. It may have been revoked, or it lacks a permission. Reconnect Cloudflare on the Launchwright dashboard.");
    if (!res.ok || !data?.success) {
      const msg = data?.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
      throw new CloudflareError(`Cloudflare said: ${msg}`);
    }
    return data.result;
  }
  const script = (name: string) => `/accounts/${accountId}/workers/scripts/${encodeURIComponent(name)}`;

  return {
    async listWorkerSecrets(worker: string): Promise<string[]> {
      try {
        return (await call<{ name: string }[]>(`${script(worker)}/secrets`)).map((s) => s.name);
      } catch (err) {
        if (err instanceof CloudflareError && /not found|10007/i.test(err.message)) return [];
        throw err;
      }
    },
    async putWorkerSecret(worker: string, name: string, value: string) {
      await call(`${script(worker)}/secrets`, { method: "PUT", body: { name, text: value, type: "secret_text" } });
    },
    async workersSubdomain(): Promise<string | null> {
      try {
        return (await call<{ subdomain: string }>(`/accounts/${accountId}/workers/subdomain`)).subdomain;
      } catch {
        return null;
      }
    },
    // Recent invocation logs from Workers Observability (needs "observability": { "enabled": true }).
    async recentLogs(worker: string, minutes = 60, limit = 50): Promise<{ at: string; level: string; message: string }[]> {
      const to = Date.now();
      const result = await call<{ events?: { events?: Record<string, unknown>[] } }>(`/accounts/${accountId}/workers/observability/telemetry/query`, {
        method: "POST",
        body: {
          queryId: "launchwright-recent",
          timeframe: { from: to - minutes * 60_000, to },
          view: "events",
          limit,
          parameters: { filters: [{ key: "$metadata.service", operation: "eq", type: "string", value: worker }] },
        },
      });
      return (result.events?.events ?? []).map((e) => {
        const meta = (e.$metadata ?? {}) as Record<string, unknown>;
        return {
          at: new Date(Number(e.timestamp ?? meta.timestamp ?? Date.now())).toISOString(),
          level: String(meta.level ?? (e.level as string) ?? "log"),
          message: String(meta.message ?? meta.error ?? JSON.stringify(e.source ?? e).slice(0, 500)),
        };
      });
    },
  };
}
