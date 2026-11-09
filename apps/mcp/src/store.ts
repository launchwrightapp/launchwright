// Everything the MCP server remembers (sql/001 + sql/002, same Neon database as the platform).
// Without DATABASE_URL nothing is remembered: every lesson is the full one and tools that need
// state (approvals, connections, secret requests) explain that they aren't available.
import { neon } from "@neondatabase/serverless";
import type { Concept } from "../../../packages/core/curriculum";
import { connectionAad, seal, secretRequestAad, unseal } from "../../../packages/core/seal";

export type Provider = "cloudflare" | "neon" | "supabase";
export type SecretTarget = "github_actions" | "cloudflare_worker" | "both";
export type Outcome = "ok" | "error" | "blocked" | "pending";

export interface ProjectInfo {
  repo: string;
  framework?: string | null;
  packageManager?: string | null;
  database?: string | null;
  hosting?: string | null;
  workerName?: string | null;
  productionUrl?: string | null;
  readiness?: { passed: number; total: number; checks: unknown };
}

export interface Approval {
  id: string;
  repo: string;
  action: string;
  title: string;
  status: "pending" | "approved" | "rejected" | "used" | "expired";
  detail: Record<string, unknown>;
}

export interface Connection {
  provider: Provider;
  method: "oauth" | "api_key";
  accountId: string | null;
  accountLabel: string | null;
  token: string; // decrypted, server-side only
  refresh: string | null;
  expiresAt: number | null; // ms, OAuth only
}

export interface SecretRequest {
  id: string;
  repo: string;
  name: string;
  target: SecretTarget;
  status: "waiting" | "submitted" | "applied" | "expired" | "cancelled";
  value: string | null; // decrypted, only while submitted
}

export interface Store {
  readonly persistent: boolean;
  readonly canSeal: boolean;
  seen(githubId: number, concepts: Concept[]): Promise<Partial<Record<Concept, number>>>;
  record(githubId: number, concepts: Concept[]): Promise<void>;
  saveProject(githubId: number, p: ProjectInfo): Promise<void>;
  getProject(githubId: number, repo: string): Promise<ProjectInfo | null>;
  audit(githubId: number, e: { client: string; tool: string; repo?: string | null; summary: string; outcome: Outcome }): Promise<void>;
  createApproval(githubId: number, a: { repo: string; client: string; tool: string; action: string; title: string; summary: string; detail: Record<string, unknown> }): Promise<string>;
  getApproval(githubId: number, id: string): Promise<Approval | null>;
  useApproval(githubId: number, id: string): Promise<boolean>; // approved -> used, once
  getConnection(githubId: number, provider: Provider): Promise<Connection | null>;
  updateConnectionToken(githubId: number, provider: Provider, t: { token: string; refresh: string | null; expiresAt: number | null }): Promise<void>;
  // A value the server must keep briefly (e.g. a new Supabase project's password), sealed, 1 hour.
  stash(githubId: number, r: { repo: string; name: string; target: SecretTarget; value: string }): Promise<string>;
  createSecretRequest(githubId: number, r: { repo: string; name: string; target: SecretTarget }): Promise<string>;
  getSecretRequest(githubId: number, id: string): Promise<SecretRequest | null>;
  finishSecretRequest(githubId: number, id: string, status: "applied" | "cancelled"): Promise<void>;
  recordSecretName(githubId: number, repo: string, name: string, target: SecretTarget): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

export function neonStore(url: string, tokenKey?: string): Store {
  const sql = neon(url);
  return {
    persistent: true,
    canSeal: !!tokenKey,
    async seen(githubId, concepts) {
      const rows = await sql`select concept, times_seen from lesson_progress where github_id = ${githubId} and concept = any(${concepts})`;
      return Object.fromEntries(rows.map((r) => [r.concept as string, r.times_seen as number]));
    },
    async record(githubId, concepts) {
      if (!concepts.length) return;
      await sql`
        insert into lesson_progress (github_id, concept)
        select ${githubId}, unnest(${concepts}::text[])
        on conflict (github_id, concept) do update set times_seen = lesson_progress.times_seen + 1, last_seen_at = now()`;
    },
    async saveProject(githubId, p) {
      const r = p.readiness;
      await sql`
        insert into projects (github_id, repo, framework, package_manager, database, hosting, worker_name, production_url, readiness_passed, readiness_total, checks, checked_at)
        values (${githubId}, ${p.repo}, ${p.framework ?? null}, ${p.packageManager ?? null}, ${p.database ?? null}, ${p.hosting ?? null}, ${p.workerName ?? null}, ${p.productionUrl ?? null},
                ${r?.passed ?? null}, ${r?.total ?? null}, ${r ? JSON.stringify(r.checks) : null}::jsonb, ${r ? new Date().toISOString() : null})
        on conflict (github_id, lower(repo)) do update set
          framework        = coalesce(excluded.framework, projects.framework),
          package_manager  = coalesce(excluded.package_manager, projects.package_manager),
          database         = coalesce(excluded.database, projects.database),
          hosting          = coalesce(excluded.hosting, projects.hosting),
          worker_name      = coalesce(excluded.worker_name, projects.worker_name),
          production_url   = coalesce(excluded.production_url, projects.production_url),
          readiness_passed = coalesce(excluded.readiness_passed, projects.readiness_passed),
          readiness_total  = coalesce(excluded.readiness_total, projects.readiness_total),
          checks           = coalesce(excluded.checks, projects.checks),
          checked_at       = coalesce(excluded.checked_at, projects.checked_at),
          updated_at       = now()`;
    },
    async getProject(githubId, repo) {
      const [r] = await sql`select * from projects where github_id = ${githubId} and lower(repo) = lower(${repo})`;
      if (!r) return null;
      return { repo: r.repo, framework: r.framework, packageManager: r.package_manager, database: r.database, hosting: r.hosting, workerName: r.worker_name, productionUrl: r.production_url };
    },
    async audit(githubId, e) {
      await sql`insert into audit_log (github_id, actor, client, tool, repo, summary, outcome) values (${githubId}, 'ai', ${e.client}, ${e.tool}, ${e.repo ?? null}, ${e.summary.slice(0, 500)}, ${e.outcome})`;
    },
    async createApproval(githubId, a) {
      const [r] = await sql`
        insert into approvals (github_id, repo, client, tool, action, title, summary, detail)
        values (${githubId}, ${a.repo}, ${a.client}, ${a.tool}, ${a.action}, ${a.title}, ${a.summary}, ${JSON.stringify(a.detail)}::jsonb)
        returning id`;
      return r.id as string;
    },
    async getApproval(githubId, id) {
      if (!isUuid(id)) return null;
      const [r] = await sql`
        select id, repo, action, title, detail,
          case when status in ('pending', 'approved') and expires_at < now() then 'expired' else status end as status
        from approvals where id = ${id} and github_id = ${githubId}`;
      return r ? { id: r.id, repo: r.repo, action: r.action, title: r.title, status: r.status, detail: r.detail ?? {} } : null;
    },
    async useApproval(githubId, id) {
      if (!isUuid(id)) return false;
      const rows = await sql`update approvals set status = 'used', used_at = now() where id = ${id} and github_id = ${githubId} and status = 'approved' and expires_at > now() returning id`;
      return rows.length === 1;
    },
    async getConnection(githubId, provider) {
      if (!tokenKey) return null;
      const [r] = await sql`select provider, method, account_id, account_label, token_sealed, refresh_sealed, expires_at from connections where github_id = ${githubId} and provider = ${provider}`;
      if (!r) return null;
      const aad = connectionAad(githubId, provider);
      const token = await unseal(r.token_sealed, tokenKey, aad);
      const refresh = r.refresh_sealed ? await unseal(r.refresh_sealed, tokenKey, aad) : null;
      return { provider, method: r.method, accountId: r.account_id, accountLabel: r.account_label, token, refresh, expiresAt: r.expires_at ? new Date(r.expires_at).getTime() : null };
    },
    async updateConnectionToken(githubId, provider, t) {
      if (!tokenKey) return;
      const aad = connectionAad(githubId, provider);
      const tokenSealed = await seal(t.token, tokenKey, aad);
      const refreshSealed = t.refresh ? await seal(t.refresh, tokenKey, aad) : null;
      await sql`update connections set token_sealed = ${tokenSealed}, refresh_sealed = coalesce(${refreshSealed}, refresh_sealed),
        expires_at = ${t.expiresAt ? new Date(t.expiresAt).toISOString() : null}, updated_at = now() where github_id = ${githubId} and provider = ${provider}`;
    },
    async stash(githubId, r) {
      if (!tokenKey) throw new Error("TOKEN_KEY is not set");
      const id = crypto.randomUUID();
      const sealed = await seal(r.value, tokenKey, secretRequestAad(githubId, id));
      await sql`insert into secret_requests (id, github_id, repo, name, target, status, value_sealed, submitted_at) values (${id}, ${githubId}, ${r.repo}, ${r.name}, ${r.target}, 'submitted', ${sealed}, now())`;
      return id;
    },
    async createSecretRequest(githubId, r) {
      const [row] = await sql`insert into secret_requests (github_id, repo, name, target) values (${githubId}, ${r.repo}, ${r.name}, ${r.target}) returning id`;
      return row.id as string;
    },
    async getSecretRequest(githubId, id) {
      if (!isUuid(id)) return null;
      const [r] = await sql`
        select id, repo, name, target, value_sealed,
          case when status in ('waiting', 'submitted') and expires_at < now() then 'expired' else status end as status
        from secret_requests where id = ${id} and github_id = ${githubId}`;
      if (!r) return null;
      let value: string | null = null;
      if (r.status === "submitted" && r.value_sealed && tokenKey) value = await unseal(r.value_sealed, tokenKey, secretRequestAad(githubId, r.id));
      return { id: r.id, repo: r.repo, name: r.name, target: r.target, status: r.status, value };
    },
    async finishSecretRequest(githubId, id, status) {
      await sql`update secret_requests set status = ${status}, value_sealed = null, applied_at = case when ${status} = 'applied' then now() else applied_at end where id = ${id} and github_id = ${githubId}`;
    },
    async recordSecretName(githubId, repo, name, target) {
      await sql`insert into secret_names (github_id, repo, name, target) values (${githubId}, ${repo}, ${name}, ${target}) on conflict (github_id, repo, name, target) do update set updated_at = now()`;
    },
  };
}

// Run by the Worker's cron: wipe secret values left past their hour, and expire stale approvals.
export async function purgeExpired(url: string) {
  const sql = neon(url);
  const secrets = await sql`
    update secret_requests set value_sealed = null,
      status = case when status in ('waiting', 'submitted') then 'expired' else status end
    where value_sealed is not null and expires_at < now() returning id`;
  const approvals = await sql`update approvals set status = 'expired' where status in ('pending', 'approved') and expires_at < now() returning id`;
  return { secrets: secrets.length, approvals: approvals.length };
}

// In-memory store: local dev without a database, and tests. Seeding helpers are for tests.
export function memoryStore(opts: { persistent?: boolean } = {}) {
  const lessons = new Map<string, number>();
  const projects = new Map<string, ProjectInfo>();
  const approvals = new Map<string, Approval & { githubId: number }>();
  const connections = new Map<string, Connection>();
  const requests = new Map<string, SecretRequest & { githubId: number }>();
  const auditLog: { githubId: number; tool: string; repo?: string | null; summary: string; outcome: Outcome }[] = [];
  const secretNames: string[] = [];
  const persistent = opts.persistent ?? true;
  const store: Store = {
    persistent,
    canSeal: persistent,
    async seen(id, concepts) {
      return Object.fromEntries(concepts.filter((c) => lessons.has(`${id}:${c}`)).map((c) => [c, lessons.get(`${id}:${c}`)!]));
    },
    async record(id, concepts) {
      if (!persistent) return;
      for (const c of new Set(concepts)) lessons.set(`${id}:${c}`, (lessons.get(`${id}:${c}`) ?? 0) + 1);
    },
    async saveProject(id, p) {
      const key = `${id}:${p.repo.toLowerCase()}`;
      const old = projects.get(key) ?? { repo: p.repo };
      const merged: ProjectInfo = { ...old };
      for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null) (merged as unknown as Record<string, unknown>)[k] = v;
      projects.set(key, merged);
    },
    async getProject(id, repo) {
      return projects.get(`${id}:${repo.toLowerCase()}`) ?? null;
    },
    async audit(githubId, e) {
      auditLog.push({ githubId, ...e });
    },
    async createApproval(githubId, a) {
      const id = crypto.randomUUID();
      approvals.set(id, { id, githubId, repo: a.repo, action: a.action, title: a.title, status: "pending", detail: a.detail });
      return id;
    },
    async getApproval(githubId, id) {
      const a = approvals.get(id);
      return a && a.githubId === githubId ? a : null;
    },
    async useApproval(githubId, id) {
      const a = approvals.get(id);
      if (!a || a.githubId !== githubId || a.status !== "approved") return false;
      a.status = "used";
      return true;
    },
    async getConnection(githubId, provider) {
      return connections.get(`${githubId}:${provider}`) ?? null;
    },
    async updateConnectionToken(githubId, provider, t) {
      const c = connections.get(`${githubId}:${provider}`);
      if (c) Object.assign(c, { token: t.token, refresh: t.refresh ?? c.refresh, expiresAt: t.expiresAt });
    },
    async stash(githubId, r) {
      const id = crypto.randomUUID();
      requests.set(id, { id, githubId, repo: r.repo, name: r.name, target: r.target, status: "submitted", value: r.value });
      return id;
    },
    async createSecretRequest(githubId, r) {
      const id = crypto.randomUUID();
      requests.set(id, { id, githubId, ...r, status: "waiting", value: null });
      return id;
    },
    async getSecretRequest(githubId, id) {
      const r = requests.get(id);
      return r && r.githubId === githubId ? r : null;
    },
    async finishSecretRequest(githubId, id, status) {
      const r = requests.get(id);
      if (r && r.githubId === githubId) Object.assign(r, { status, value: null });
    },
    async recordSecretName(_g, repo, name, target) {
      secretNames.push(`${repo}:${name}:${target}`);
    },
  };
  return {
    store,
    auditLog,
    secretNames,
    approve(id: string, status: Approval["status"] = "approved") {
      approvals.get(id)!.status = status;
    },
    connect(githubId: number, c: Connection) {
      connections.set(`${githubId}:${c.provider}`, c);
    },
    submitSecret(id: string, value: string) {
      Object.assign(requests.get(id)!, { status: "submitted", value });
    },
    approvals,
    requests,
  };
}

