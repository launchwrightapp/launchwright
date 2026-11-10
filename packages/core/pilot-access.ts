// Who can use launchwright during the private pilot. Shared by the dashboard and the MCP server.
//
// In: admins (ADMIN_GITHUB_IDS), GitHub IDs listed in PILOT_GITHUB_IDS, and applicants the team
// accepted. An accepted applicant is matched by the GitHub ID saved on their application. It gets
// saved when they sign in through the link in their "You're in" email (pilot-claim.ts), or, the
// first time, when their verified GitHub email is the email they applied with. The GitHub
// username typed on the form is never used: nobody checked it, so it could name anyone.
// Everyone else is refused. No database means only the listed IDs get in (fail closed).

export interface AccessEnv {
  ADMIN_GITHUB_IDS?: string;
  PILOT_GITHUB_IDS?: string;
}
export interface Who {
  id: number;
  login: string;
  email?: string | null;
}
type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

const ids = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
export const listed = (who: Who, env: AccessEnv) => ids(env.ADMIN_GITHUB_IDS).includes(String(who.id)) || ids(env.PILOT_GITHUB_IDS).includes(String(who.id));

// Allowed people are remembered per Worker instance for a short time, so a page load's handful
// of API calls costs one lookup. Removing someone takes effect within this window.
export const ACCESS_CACHE_MS = 30_000;
const allowedUntil = new Map<number, number>();

export async function hasPilotAccess(who: Who, env: AccessEnv, sql: Sql | null, now = Date.now()): Promise<boolean> {
  if (listed(who, env)) return true;
  if (!sql) return false;
  if ((allowedUntil.get(who.id) ?? 0) > now) return true;

  const email = who.email?.toLowerCase() ?? "";
  const rows = (await sql`
    select id, github_id from waitlist
    where accepted_at is not null
      and (github_id = ${who.id}
        or (github_id is null and ${email} <> '' and lower(email) = ${email}))
    order by github_id nulls last
    limit 1`) as { id: number | string; github_id: number | string | null }[];
  const row = rows[0];
  if (!row) {
    allowedUntil.delete(who.id);
    return false;
  }
  if (row.github_id == null) {
    // Can fail on the unique index if this account is already bound to another application; the
    // match above still stands.
    await sql`update waitlist set github_id = ${who.id} where id = ${row.id} and github_id is null`.catch((e) => console.error("pilot access: binding the GitHub ID failed", e));
  }
  allowedUntil.set(who.id, now + ACCESS_CACHE_MS);
  return true;
}

// For tests, and after "Remove access" in the same Worker instance.
export const forgetAccess = (id?: number) => (id === undefined ? allowedUntil.clear() : allowedUntil.delete(id));

export const NOT_IN_PILOT = `launchwright is in a private pilot, and this GitHub account isn't in it. If you were accepted, open the sign-in link in your "You're in" email. Not in yet? Apply at https://launchwright.app/pilot`;
