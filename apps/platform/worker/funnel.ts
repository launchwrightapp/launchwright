// The pilot funnel for the team: the same report as the site's /api/admin/funnel and
// `npm run pilot -- funnel` (apps/site/worker/funnel.ts), behind the platform sign-in.
import { neon } from "@neondatabase/serverless";
import { report } from "../../site/worker/funnel";
import { isAdmin, type MessagesEnv } from "./messages";
import type { User } from "./session";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

export async function handleFunnelApi(req: Request, url: URL, env: MessagesEnv, user: User): Promise<Response | null> {
  if (url.pathname !== "/api/admin/funnel") return null;
  if (!isAdmin(user, env)) return json({ error: "Not found." }, 404);
  if (req.method !== "GET") return json({ error: "Method not allowed." }, 405);
  if (!env.DATABASE_URL) return json({ error: "DATABASE_URL isn't set on the platform." }, 503);
  try {
    return json(await report(neon(env.DATABASE_URL), url));
  } catch (err) {
    console.error("funnel report failed", err);
    return json({ error: "Couldn't load the funnel. If this is a new database, run apps/site/sql/005_funnel.sql." }, 500);
  }
}
