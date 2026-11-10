// The sign-in link in the "You're in" email. It's how an accepted applicant's GitHub account gets
// linked to their application: opening the link proves they own the email they applied with, and
// the GitHub account they then sign in with is saved on the application (waitlist.github_id).
//
// Only a SHA-256 hash of the token is stored, so a database leak doesn't leak working links.
// A link works once and expires after CLAIM_DAYS. Accepting again with resend issues a new one,
// which also replaces the old link.

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

export const CLAIM_DAYS = 30;
export const CLAIM_COOKIE = "__Host-lw_claim";
export const CLAIM_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function hashClaim(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const claimUrl = (origin: string, token: string) => `${origin}/claim?t=${token}`;

// A fresh link for this applicant. Call it before sending the acceptance email.
export async function issueClaim(sql: Sql, email: string, now = Date.now()): Promise<string> {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const expires = new Date(now + CLAIM_DAYS * 86_400_000).toISOString();
  await sql`update waitlist set claim_hash = ${await hashClaim(token)}, claim_expires_at = ${expires} where email = ${email}`;
  return token;
}

export type ClaimResult = "linked" | "invalid" | "taken";

// Link the GitHub account to the application the token belongs to, and use up the token.
// "invalid": unknown, used, expired, or the application isn't accepted (any more).
// "taken": this GitHub account is already linked to a different application.
export async function redeemClaim(sql: Sql, token: string, githubId: number, now = Date.now()): Promise<ClaimResult> {
  if (!CLAIM_RE.test(token)) return "invalid";
  const hash = await hashClaim(token);
  try {
    const rows = (await sql`
      update waitlist set github_id = ${githubId}, claim_hash = null, claim_expires_at = null
      where claim_hash = ${hash} and claim_expires_at > ${new Date(now).toISOString()} and accepted_at is not null
      returning id`) as unknown[];
    return rows.length ? "linked" : "invalid";
  } catch (e) {
    // waitlist.github_id is unique.
    if (/unique|duplicate/i.test(String((e as Error)?.message))) return "taken";
    throw e;
  }
}
