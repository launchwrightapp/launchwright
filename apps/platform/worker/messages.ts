// Messages: learners write to the team from the platform, the team answers from the
// inbox (sent as email from hello@launchwright.app), and email to hello@ lands in the
// same conversation. Everything people write is untrusted: pages render it as text only.
import { neon } from "@neondatabase/serverless";
import PostalMime from "postal-mime";
import type { User } from "./session";

export interface MessagesEnv {
  DATABASE_URL?: string; // secret, same Neon database as the site
  EMAIL?: SendEmail; // Cloudflare Email Sending, from hello@launchwright.app
  ADMIN_GITHUB_IDS?: string; // comma-separated numeric GitHub ids (ids never change; logins can)
  FORWARD_TO?: string; // secret: verified inbox that gets a copy of every message
  PUBLIC_ORIGIN?: string;
}

const FROM = { email: "hello@launchwright.app", name: "launchwright" };
const PLATFORM = "https://platform.launchwright.app";
const MAX_BODY = 5000;
const DAILY_LIMIT = 20;

type Row = Record<string, unknown>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });

export const isAdmin = (user: User | null, env: MessagesEnv) =>
  !!user && (env.ADMIN_GITHUB_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean).includes(String(user.id));

const db = (env: MessagesEnv) => neon(env.DATABASE_URL!);

const toMessage = (r: Row) => ({
  id: Number(r.id),
  direction: r.direction as "in" | "out",
  via: r.via as "platform" | "email",
  author: (r.author as string | null) ?? null,
  body: r.body as string,
  at: new Date(r.created_at as string).toISOString(),
});

// Writes must come from our own pages, as JSON. (The session cookie is SameSite=Lax too.)
async function readJson(req: Request, url: URL, env: MessagesEnv): Promise<Record<string, unknown> | null> {
  const origin = req.headers.get("origin");
  if (origin && origin !== (env.PUBLIC_ORIGIN ?? url.origin)) return null;
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return null;
  const text = await req.text();
  if (text.length > MAX_BODY * 2) return null;
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

const cleanBody = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, MAX_BODY) : "");

// The learner's conversation: by GitHub account, or by the verified email GitHub gave us.
async function findLearnerThread(env: MessagesEnv, user: User) {
  const sql = db(env);
  const email = user.email?.toLowerCase() ?? null;
  const rows = await sql`select * from threads where github_id = ${user.id} or (${email}::text is not null and email = ${email}) order by github_id nulls last limit 1`;
  return (rows[0] as Row | undefined) ?? null;
}

async function learnerGet(env: MessagesEnv, user: User) {
  const thread = await findLearnerThread(env, user);
  const messages = thread ? (await db(env)`select * from messages where thread_id = ${thread.id} order by created_at, id`).map(toMessage) : [];
  return json({ email: user.email ?? null, messages });
}

async function learnerPost(req: Request, url: URL, env: MessagesEnv, user: User, ctx: ExecutionContext) {
  const data = await readJson(req, url, env);
  if (!data) return json({ error: "Invalid request." }, 400);
  const body = cleanBody(data.body);
  if (!body) return json({ error: "Write a message first." }, 400);

  const sql = db(env);
  const email = user.email?.toLowerCase() ?? null;
  let thread = await findLearnerThread(env, user);
  if (thread) {
    const [{ n }] = (await sql`select count(*)::int as n from messages where thread_id = ${thread.id} and direction = 'in' and created_at > now() - interval '1 day'`) as { n: number }[];
    if (n >= DAILY_LIMIT) return json({ error: "That's a lot of messages for one day. We'll read these first, then you can send more tomorrow." }, 429);
    await sql`update threads set github_id = ${user.id}, github_login = ${user.login}, name = ${user.name}, email = coalesce(email, ${email}), unread = true, last_message_at = now() where id = ${thread.id}`;
  } else {
    const subject = `Message from ${user.name}`.slice(0, 200);
    thread = ((await sql`insert into threads (email, github_id, github_login, name, subject) values (${email}, ${user.id}, ${user.login}, ${user.name}, ${subject}) returning *`) as Row[])[0];
  }
  const [row] = (await sql`insert into messages (thread_id, direction, via, author, body) values (${thread.id}, 'in', 'platform', ${user.name}, ${body}) returning *`) as Row[];

  // Copy to the team's inbox, so nothing waits unseen. Replying there goes straight to the learner.
  if (env.EMAIL && env.FORWARD_TO) {
    ctx.waitUntil(
      env.EMAIL.send({
        from: FROM,
        to: env.FORWARD_TO,
        ...(email ? { replyTo: email } : {}),
        subject: `New message from ${user.name} (@${user.login})`,
        text: `${body}\n\n--\n${user.name} (@${user.login})${email ? ` <${email}>` : ", no email on file"}\nAnswer in the inbox: ${PLATFORM}/inbox#thread-${thread.id}`,
      }).catch((e) => console.error("notify failed", e)),
    );
  }
  return json({ message: toMessage(row) }, 201);
}

async function adminList(env: MessagesEnv) {
  const rows = await db(env)`
    select t.id, t.email, t.github_login, t.name, t.subject, t.unread, t.last_message_at,
           (select body from messages m where m.thread_id = t.id order by created_at desc, id desc limit 1) as preview,
           (select direction from messages m where m.thread_id = t.id order by created_at desc, id desc limit 1) as last_direction
    from threads t order by t.last_message_at desc limit 200`;
  return json({
    threads: (rows as Row[]).map((r) => ({
      id: Number(r.id),
      email: r.email ?? null,
      login: r.github_login ?? null,
      name: r.name ?? r.email ?? "Unknown",
      subject: r.subject,
      unread: !!r.unread,
      at: new Date(r.last_message_at as string).toISOString(),
      preview: String(r.preview ?? "").slice(0, 160),
      waiting: r.last_direction === "in",
    })),
  });
}

async function adminThread(env: MessagesEnv, id: number) {
  const sql = db(env);
  const [t] = (await sql`update threads set unread = false where id = ${id} returning *`) as Row[];
  if (!t) return json({ error: "Not found." }, 404);
  const messages = (await sql`select * from messages where thread_id = ${id} order by created_at, id`).map(toMessage);
  return json({ thread: { id: Number(t.id), email: t.email ?? null, login: t.github_login ?? null, name: t.name ?? t.email, subject: t.subject }, messages });
}

async function adminReply(req: Request, url: URL, env: MessagesEnv, user: User, id: number) {
  const data = await readJson(req, url, env);
  if (!data) return json({ error: "Invalid request." }, 400);
  const body = cleanBody(data.body);
  if (!body) return json({ error: "Write a reply first." }, 400);

  const sql = db(env);
  const [t] = (await sql`select * from threads where id = ${id}`) as Row[];
  if (!t) return json({ error: "Not found." }, 404);

  // Send first: if the email fails, don't pretend it went out.
  let emailed = false;
  if (t.email) {
    if (!env.EMAIL) return json({ error: "Email sending isn't set up on the platform." }, 503);
    const [last] = (await sql`select email_message_id from messages where thread_id = ${id} and email_message_id is not null order by created_at desc limit 1`) as Row[];
    const ref = last?.email_message_id as string | undefined;
    const subject = /^re:/i.test(String(t.subject)) ? String(t.subject) : `Re: ${t.subject}`;
    const first = String(t.name ?? "").split(/\s+/)[0];
    try {
      await env.EMAIL.send({
        from: FROM,
        to: String(t.email),
        replyTo: FROM.email,
        subject,
        text: `${first ? `Hi ${first},\n\n` : ""}${body}\n\n--\nThe launchwright team\nReply to this email, or read the whole conversation on the platform: ${PLATFORM}/messages`,
        ...(ref ? { headers: { "In-Reply-To": ref, References: ref } } : {}),
      });
      emailed = true;
    } catch (e) {
      console.error("reply send failed", e);
      return json({ error: "The email didn't send, so the reply wasn't saved. Try again." }, 502);
    }
  }
  const [row] = (await sql`insert into messages (thread_id, direction, via, author, body) values (${id}, 'out', 'platform', ${user.name}, ${body}) returning *`) as Row[];
  await sql`update threads set last_message_at = now(), unread = false where id = ${id}`;
  return json({ message: toMessage(row), emailed }, 201);
}

// Routes under /api/messages and /api/admin/*. Returns null when the path isn't ours.
export async function handleMessagesApi(req: Request, url: URL, env: MessagesEnv, user: User, ctx: ExecutionContext): Promise<Response | null> {
  const p = url.pathname;
  const admin = p.startsWith("/api/admin/");
  if (p !== "/api/messages" && !admin) return null;
  if (admin && !isAdmin(user, env)) return notFound();
  const origin = req.headers.get("origin");
  if (req.method !== "GET" && origin && origin !== (env.PUBLIC_ORIGIN ?? url.origin)) return json({ error: "Forbidden." }, 403);
  if (!env.DATABASE_URL) return json({ error: "Messages aren't set up yet. Email hello@launchwright.app instead." }, 503);

  try {
    if (p === "/api/messages") {
      if (req.method === "GET") return await learnerGet(env, user);
      if (req.method === "POST") return await learnerPost(req, url, env, user, ctx);
      return json({ error: "Method not allowed." }, 405);
    }
    if (p === "/api/admin/threads" && req.method === "GET") return await adminList(env);
    const m = p.match(/^\/api\/admin\/threads\/(\d{1,12})(\/reply)?$/);
    if (m && !m[2] && req.method === "GET") return await adminThread(env, Number(m[1]));
    if (m && m[2] && req.method === "POST") return await adminReply(req, url, env, user, Number(m[1]));
    return notFound();
  } catch (e) {
    console.error("messages api error", e);
    return json({ error: "Something went wrong on our side. Please try again." }, 500);
  }
}

// Drop the quoted history most mail apps add under a reply.
export function stripQuoted(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex((l, i) =>
    /^On .{4,200}wrote:\s*$/.test(l) ||
    (/^On .{4,200}$/.test(l) && /wrote:\s*$/.test(lines[i + 1] ?? "")) ||
    /^-{2,}\s*Original Message\s*-{2,}/i.test(l) ||
    /^From: .+/.test(l) && /^(Sent|Date): /.test(lines[i + 1] ?? ""),
  );
  const kept = (cut >= 0 ? lines.slice(0, cut) : lines).filter((l, i, all) => !(l.startsWith(">") && all.slice(i).every((x) => x.startsWith(">") || !x.trim())));
  return kept.join("\n").trim();
}

// Email to hello@launchwright.app (Email Routing → this worker). Store it, then forward a copy.
export async function handleInboundEmail(message: ForwardableEmailMessage, env: MessagesEnv) {
  const raw = await new Response(message.raw).arrayBuffer();
  try {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL not set");
    const mail = await PostalMime.parse(raw);
    const from = (mail.from?.address ?? message.from).toLowerCase();
    // Our own mail (and anything without a usable sender) is only forwarded.
    if (from.endsWith("@launchwright.app") || !from.includes("@")) throw new Error("skip");
    const auto = /auto-(replied|generated)/i.test(message.headers.get("auto-submitted") ?? "");
    const body = (stripQuoted(mail.text ?? "") || (mail.html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 20000);
    if (!auto && body) {
      const sql = db(env);
      const name = mail.from?.name?.trim().slice(0, 100) || null;
      const subject = (mail.subject?.trim() || "(no subject)").slice(0, 200);
      const [t] = (await sql`
        insert into threads (email, name, subject) values (${from}, ${name}, ${subject})
        on conflict (email) do update set unread = true, last_message_at = now(), name = coalesce(threads.name, excluded.name)
        returning id`) as Row[];
      await sql`insert into messages (thread_id, direction, via, author, body, email_message_id)
        values (${t.id}, 'in', 'email', ${name ?? from}, ${body}, ${mail.messageId ?? message.headers.get("message-id")})`;
    }
  } catch (e) {
    if ((e as Error).message !== "skip") console.error("inbound store failed", e);
  }
  // Always forward, so a storage problem never loses mail.
  if (env.FORWARD_TO) await message.forward(env.FORWARD_TO);
}
