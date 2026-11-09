// Databases: one interface, two providers (Neon with an API key, Supabase with OAuth).
// Connection strings never leave the server: connect_database writes them straight into the
// learner's GitHub Actions and Cloudflare secrets.
export class DatabaseError extends Error {}

export interface DbProject {
  id: string;
  name: string;
  region: string;
  ready: boolean;
}

export interface DatabaseProvider {
  readonly name: "Neon" | "Supabase";
  listProjects(): Promise<DbProject[]>;
  createProject(name: string): Promise<DbProject & { password?: string }>;
  // A pooled connection string, or null when the provider can't give us the password
  // (an existing Supabase project): then the learner pastes it on the dashboard.
  connectionString(projectId: string, password?: string): Promise<string | null>;
}

async function jsonOrThrow<T>(res: Response, who: string): Promise<T> {
  if (res.status === 401 || res.status === 403) throw new DatabaseError(`${who} refused the credentials. Reconnect ${who} on the Launchwright dashboard.`);
  const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok || !data) throw new DatabaseError(`${who} said: ${data?.message ?? `HTTP ${res.status}`}`);
  return data;
}

// --- Neon (API v2) -------------------------------------------------------------------------
export function neonProvider(apiKey: string): DatabaseProvider {
  const BASE = "https://console.neon.tech/api/v2";
  const call = async <T>(path: string, init: { method?: string; body?: unknown } = {}) =>
    jsonOrThrow<T>(
      await fetch(`${BASE}${path}`, {
        method: init.method ?? "GET",
        headers: { authorization: `Bearer ${apiKey}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
        body: init.body ? JSON.stringify(init.body) : undefined,
      }),
      "Neon",
    );
  type P = { id: string; name: string; region_id: string };
  return {
    name: "Neon",
    async listProjects() {
      const { projects } = await call<{ projects: P[] }>("/projects?limit=20");
      return projects.map((p) => ({ id: p.id, name: p.name, region: p.region_id, ready: true }));
    },
    async createProject(name) {
      // Singapore is the closest Neon region to the Philippines.
      const { project } = await call<{ project: P }>("/projects", { method: "POST", body: { project: { name, region_id: "aws-ap-southeast-1" } } });
      return { id: project.id, name: project.name, region: project.region_id, ready: true };
    },
    async connectionString(projectId) {
      const { branches } = await call<{ branches: { id: string; default: boolean }[] }>(`/projects/${encodeURIComponent(projectId)}/branches`);
      const branch = branches.find((b) => b.default) ?? branches[0];
      if (!branch) throw new DatabaseError("That Neon project has no branches.");
      const { databases } = await call<{ databases: { name: string; owner_name: string }[] }>(`/projects/${encodeURIComponent(projectId)}/branches/${branch.id}/databases`);
      const db = databases[0];
      if (!db) throw new DatabaseError("That Neon project has no database yet. Create one in the Neon console first.");
      const q = new URLSearchParams({ branch_id: branch.id, database_name: db.name, role_name: db.owner_name, pooled: "true" });
      const { uri } = await call<{ uri: string }>(`/projects/${encodeURIComponent(projectId)}/connection_uri?${q}`);
      return uri;
    },
  };
}

// --- Supabase (Management API, OAuth access token) ------------------------------------------
export function supabaseProvider(accessToken: string): DatabaseProvider {
  const BASE = "https://api.supabase.com/v1";
  const call = async <T>(path: string, init: { method?: string; body?: unknown } = {}) =>
    jsonOrThrow<T>(
      await fetch(`${BASE}${path}`, {
        method: init.method ?? "GET",
        headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
        body: init.body ? JSON.stringify(init.body) : undefined,
      }),
      "Supabase",
    );
  type P = { id: string; ref?: string; name: string; region: string; status: string };
  const ref = (p: P) => p.ref ?? p.id;
  return {
    name: "Supabase",
    async listProjects() {
      const list = await call<P[]>("/projects");
      return list.map((p) => ({ id: ref(p), name: p.name, region: p.region, ready: p.status === "ACTIVE_HEALTHY" }));
    },
    async createProject(name) {
      const orgs = await call<{ id: string; slug?: string }[]>("/organizations");
      if (!orgs.length) throw new DatabaseError("Your Supabase account has no organization yet. Create one at supabase.com first.");
      const bytes = crypto.getRandomValues(new Uint8Array(24));
      const password = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "x");
      const p = await call<P>("/projects", { method: "POST", body: { name, organization_id: orgs[0].slug ?? orgs[0].id, db_pass: password, region: "ap-southeast-1" } });
      return { id: ref(p), name: p.name, region: p.region, ready: false, password };
    },
    async connectionString(projectId, password) {
      if (!password) return null;
      const pools = await call<{ connection_string?: string; pool_mode?: string; database_type?: string }[]>(`/projects/${encodeURIComponent(projectId)}/config/database/pooler`);
      const pool = pools.find((p) => p.database_type === "PRIMARY" && p.pool_mode === "transaction") ?? pools[0];
      if (!pool?.connection_string) return null;
      return pool.connection_string.replace("[YOUR-PASSWORD]", encodeURIComponent(password));
    },
  };
}
