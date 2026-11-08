#!/usr/bin/env node
// Pilot admin from your terminal.
//   npm run pilot -- list                      applicants, newest first
//   npm run pilot -- accept juan@example.com   send "You're in" and take a seat
//   npm run pilot -- accept juan@example.com --resend
// The admin token comes from LW_ADMIN_TOKEN, or the macOS Keychain item "launchwright-admin".
import { execFileSync } from "node:child_process";

const SITE = process.env.LW_SITE ?? "https://launchwright.app";

function token() {
  if (process.env.LW_ADMIN_TOKEN) return process.env.LW_ADMIN_TOKEN;
  try {
    return execFileSync("security", ["find-generic-password", "-s", "launchwright-admin", "-w"], { encoding: "utf8" }).trim();
  } catch {
    console.error("No admin token. Set LW_ADMIN_TOKEN or add the Keychain item \"launchwright-admin\".");
    process.exit(1);
  }
}

async function call(path, init = {}) {
  const res = await fetch(SITE + path, {
    ...init,
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json", ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(res.status === 404 && !body.error?.startsWith("No application") ? "Not found: check the token and that ADMIN_TOKEN is set on the Worker." : body.error ?? `HTTP ${res.status}`);
    process.exit(1);
  }
  return body;
}

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const [cmd, email, flag] = process.argv.slice(2);

if (cmd === "list") {
  const { applicants, accepted, seats } = await call("/api/admin/applicants");
  console.log(`${accepted}/${seats} seats taken · ${applicants.length} applicants\n`);
  for (const a of applicants) {
    const status = a.accepted_at ? "ACCEPTED" : a.acknowledged_at ? "applied" : "applied (no ack)";
    console.log(`${day(a.created_at)}  ${status.padEnd(16)}  ${a.email}${a.name ? `  (${a.name})` : ""}`);
    if (a.building) console.log(`            ${a.building}`);
  }
} else if (cmd === "accept" && email) {
  const r = await call("/api/admin/accept", { method: "POST", body: JSON.stringify({ email, resend: flag === "--resend" }) });
  console.log(`Sent "You're in" to ${r.email}. Seats used: ${r.seatsUsed}/${r.seats}.`);
} else {
  console.log("Usage:\n  npm run pilot -- list\n  npm run pilot -- accept <email> [--resend]");
  process.exit(cmd ? 1 : 0);
}
