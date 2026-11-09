// What every tool call shares: who the learner is, where state lives, how to reach their accounts,
// and the wrapper that adds the lesson, writes the audit log, and turns errors into plain words.
import { refreshSupabaseToken } from "../../../packages/core/supabase-oauth";
import { deliver, type Delivered } from "./lessons";
import type { Concept } from "../../../packages/core/curriculum";
import { RepoError, readRepo, type Snapshot } from "./github";
import { cloudflare, CloudflareError } from "./providers/cloudflare";
import { DatabaseError, neonProvider, supabaseProvider, type DatabaseProvider } from "./providers/database";
import { UrlError } from "./live";
import { wranglerConfig } from "./env";
import type { Outcome, Store } from "./store";

export interface Learner {
  id: number; // GitHub user id
  login: string;
  githubToken: string; // never returned to the AI
  client: string; // the AI tool's name, for the audit log
}

export interface Config {
  platformOrigin: string; // https://platform.launchwright.app
  supabase?: { clientId: string; clientSecret: string };
  dispatchDelayMs?: number; // wait before looking up a just-dispatched run (tests use 0)
}

export interface Ctx {
  learner: Learner;
  store: Store;
  config: Config;
}

// A problem the learner (or their AI) can act on. Its message is shown as is.
export class UserError extends Error {
  constructor(message: string, readonly outcome: Outcome = "error") {
    super(message);
  }
}

export interface ToolResult {
  result: string; // markdown for the AI
  data?: Record<string, unknown>;
  concepts: Concept[];
  audit: { repo?: string | null; summary: string; outcome?: Outcome };
}

const friendly = (err: unknown) =>
  err instanceof UserError || err instanceof RepoError || err instanceof CloudflareError || err instanceof DatabaseError || err instanceof UrlError;

export async function runTool(ctx: Ctx, tool: string, repo: string | undefined, fn: () => Promise<ToolResult>) {
  const { learner, store } = ctx;
  let out: ToolResult;
  try {
    out = await fn();
  } catch (err) {
    if (!friendly(err)) console.error(`tool ${tool} failed`, err);
    const message = friendly(err) ? (err as Error).message : "Something went wrong on Launchwright's side. Please try again.";
    const outcome = err instanceof UserError ? err.outcome : "error";
    await store.audit(learner.id, { client: learner.client, tool, repo, summary: message.slice(0, 300), outcome }).catch((e) => console.error("audit write failed", e));
    return { isError: true, content: [{ type: "text" as const, text: message }] };
  }

  let seen = {};
  try {
    seen = await store.seen(learner.id, out.concepts);
  } catch (err) {
    console.error("lesson progress read failed", err);
  }
  const lessons: Delivered[] = deliver(out.concepts, seen);
  await Promise.all([
    store.record(learner.id, out.concepts).catch((e) => console.error("lesson progress write failed", e)),
    store.audit(learner.id, { client: learner.client, tool, repo: out.audit.repo ?? repo, summary: out.audit.summary, outcome: out.audit.outcome ?? "ok" }).catch((e) => console.error("audit write failed", e)),
  ]);
  const text = `## Result\n\n${out.result}${lessons.length ? `\n\n## Lesson\n\n${lessons.map((l) => `- ${l.text}`).join("\n")}` : ""}`;
  return { content: [{ type: "text" as const, text }], structuredContent: { ...(out.data ?? {}), lessons } };
}

// --- The learner's accounts -----------------------------------------------------------------

export const dashboard = (ctx: Ctx, path: string) => `${ctx.config.platformOrigin}${path}`;

export function needsDb(ctx: Ctx, what: string) {
  if (!ctx.store.persistent || !ctx.store.canSeal) throw new UserError(`${what} isn't available on this Launchwright server yet (no database or encryption key configured).`, "blocked");
}

export async function cloudflareFor(ctx: Ctx) {
  const c = await ctx.store.getConnection(ctx.learner.id, "cloudflare");
  if (!c || !c.accountId) return null;
  return { api: cloudflare(c.token, c.accountId), accountId: c.accountId, token: c.token, method: c.method, label: c.accountLabel };
}

export async function databaseFor(ctx: Ctx, provider: "neon" | "supabase"): Promise<DatabaseProvider | null> {
  const c = await ctx.store.getConnection(ctx.learner.id, provider);
  if (!c) return null;
  if (provider === "neon") return neonProvider(c.token);
  let token = c.token;
  if (c.expiresAt && c.expiresAt - Date.now() < 60_000) {
    const s = ctx.config.supabase;
    if (!s || !c.refresh) throw new UserError("Your Supabase connection expired. Reconnect Supabase on the dashboard.", "blocked");
    const t = await refreshSupabaseToken(s.clientId, s.clientSecret, c.refresh).catch(() => null);
    if (!t) throw new UserError("Your Supabase connection expired. Reconnect Supabase on the dashboard.", "blocked");
    await ctx.store.updateConnectionToken(ctx.learner.id, "supabase", { token: t.accessToken, refresh: t.refreshToken, expiresAt: t.expiresAt });
    token = t.accessToken;
  }
  return supabaseProvider(token);
}

export function notConnected(ctx: Ctx, name: string, why: string): never {
  throw new UserError(`${name} isn't connected yet. ${why} Ask the learner to connect it here (it takes a minute, and the AI never sees the key): ${dashboard(ctx, "/security#accounts")}`, "blocked");
}

// --- The repo -------------------------------------------------------------------------------

export interface RepoContext {
  snap: Snapshot;
  worker: string | null; // Cloudflare Worker (or Pages project) name from wrangler config
  pages: boolean;
  productionUrl: string | null;
}

export async function repoContext(ctx: Ctx, repo: string): Promise<RepoContext> {
  const snap = await readRepo(repo, ctx.learner.githubToken);
  const wranglerPath = Object.keys(snap.files)
    .filter((p) => /(^|\/)wrangler\.(jsonc?|toml)$/.test(p))
    .sort((a, b) => a.split("/").length - b.split("/").length)[0];
  const cfg = wranglerPath ? wranglerConfig(wranglerPath, snap.files[wranglerPath]) : null;
  const saved = await ctx.store.getProject(ctx.learner.id, snap.repo).catch(() => null);
  return { snap, worker: cfg?.name ?? null, pages: cfg?.pages ?? false, productionUrl: saved?.productionUrl ?? null };
}

export const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,99}$/;
