import { beforeEach, describe, expect, it } from "vitest";
import { ACCESS_CACHE_MS, forgetAccess, hasPilotAccess } from "../../../packages/core/pilot-access";

// A stand-in for neon(): records each query and answers from a list of canned results.
function fakeSql(results: unknown[][]) {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("?").replace(/\s+/g, " ").trim(), values });
    return results.shift() ?? [];
  };
  return { sql, calls };
}

const env = { ADMIN_GITHUB_IDS: "100", PILOT_GITHUB_IDS: "200, 201" };
const learner = { id: 7, login: "JuanDC", email: "Juan@Example.com" };

describe("pilot access", () => {
  beforeEach(() => forgetAccess());

  it("lets admins and listed IDs in without the database", async () => {
    expect(await hasPilotAccess({ id: 100, login: "owner" }, env, null)).toBe(true);
    expect(await hasPilotAccess({ id: 201, login: "friend" }, env, null)).toBe(true);
  });
  it("refuses everyone else when there's no database (fails closed)", async () => {
    expect(await hasPilotAccess(learner, env, null)).toBe(false);
  });
  it("refuses accounts with no accepted application", async () => {
    const { sql, calls } = fakeSql([[]]);
    expect(await hasPilotAccess(learner, env, sql)).toBe(false);
    expect(calls[0].text).toContain("accepted_at is not null");
    expect(calls[0].values).toEqual([7, "juan@example.com", "juan@example.com"]);
  });
  it("never matches on the GitHub username typed on the form (nobody checked it)", async () => {
    const { sql, calls } = fakeSql([[]]);
    await hasPilotAccess({ id: 8, login: "JuanDC" }, env, sql);
    expect(calls[0].text).not.toContain("answers");
    expect(calls[0].values).not.toContain("juandc");
  });
  it("lets an accepted applicant in and saves their GitHub ID the first time", async () => {
    const { sql, calls } = fakeSql([[{ id: 42, github_id: null }], []]);
    expect(await hasPilotAccess(learner, env, sql)).toBe(true);
    expect(calls[1].text).toContain("update waitlist set github_id =");
    expect(calls[1].values).toEqual([7, 42]);
  });
  it("doesn't rewrite the ID once it's saved, and remembers the answer briefly", async () => {
    const { sql, calls } = fakeSql([[{ id: 42, github_id: 7 }]]);
    const t = 1_000_000;
    expect(await hasPilotAccess(learner, env, sql, t)).toBe(true);
    expect(await hasPilotAccess(learner, env, sql, t + ACCESS_CACHE_MS - 1)).toBe(true);
    expect(calls).toHaveLength(1);
    // After the window it asks again, so removed access ends.
    expect(await hasPilotAccess(learner, env, sql, t + ACCESS_CACHE_MS + 1)).toBe(false);
    expect(calls).toHaveLength(2);
  });
  it("still lets them in if saving the ID fails", async () => {
    let n = 0;
    const sql = async () => {
      if (n++ === 0) return [{ id: 42, github_id: null }];
      throw new Error("duplicate key value violates unique constraint");
    };
    expect(await hasPilotAccess(learner, env, sql)).toBe(true);
  });
  it("passes database errors to the caller (which refuses with a try-again)", async () => {
    const sql = async () => {
      throw new Error("connection refused");
    };
    await expect(hasPilotAccess(learner, env, sql)).rejects.toThrow();
  });
});
