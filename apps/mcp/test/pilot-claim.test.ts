import { describe, expect, it } from "vitest";
import { CLAIM_RE, claimUrl, hashClaim, issueClaim, redeemClaim } from "../../../packages/core/pilot-claim";

function fakeSql(answer: (text: string, values: unknown[]) => unknown[]) {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return answer(text, values);
  };
  return { sql, calls };
}

describe("pilot sign-in links", () => {
  it("issues a random token and stores only its hash, with an expiry", async () => {
    const { sql, calls } = fakeSql(() => []);
    const now = Date.UTC(2026, 10, 10);
    const token = await issueClaim(sql, "juan@example.com", now);
    expect(token).toMatch(CLAIM_RE);
    expect(calls[0].values).toEqual([await hashClaim(token), "2026-12-10T00:00:00.000Z", "juan@example.com"]);
    expect(JSON.stringify(calls)).not.toContain(token);
    expect(await issueClaim(sql, "juan@example.com")).not.toBe(token);
    expect(claimUrl("https://platform.launchwright.app", token)).toBe(`https://platform.launchwright.app/claim?t=${token}`);
  });

  it("links the GitHub account and uses up the token", async () => {
    const { sql, calls } = fakeSql(() => [{ id: 42 }]);
    const token = "a".repeat(43);
    expect(await redeemClaim(sql, token, 7, Date.UTC(2026, 10, 10))).toBe("linked");
    expect(calls[0].text).toContain("set github_id = ?, claim_hash = null");
    expect(calls[0].text).toContain("accepted_at is not null");
    expect(calls[0].values).toEqual([7, await hashClaim(token), "2026-11-10T00:00:00.000Z"]);
  });

  it("refuses unknown, used, expired or malformed tokens", async () => {
    const { sql, calls } = fakeSql(() => []);
    expect(await redeemClaim(sql, "a".repeat(43), 7)).toBe("invalid");
    expect(await redeemClaim(sql, "short", 7)).toBe("invalid");
    expect(await redeemClaim(sql, "a".repeat(42) + "!", 7)).toBe("invalid");
    expect(calls).toHaveLength(1); // malformed ones never reach the database
  });

  it("says when the GitHub account is already linked to another application", async () => {
    const { sql } = fakeSql(() => {
      throw new Error('duplicate key value violates unique constraint "waitlist_github_id_key"');
    });
    expect(await redeemClaim(sql, "a".repeat(43), 7)).toBe("taken");
  });

  it("passes other database errors to the caller", async () => {
    const { sql } = fakeSql(() => {
      throw new Error("connection refused");
    });
    await expect(redeemClaim(sql, "a".repeat(43), 7)).rejects.toThrow("connection refused");
  });
});
