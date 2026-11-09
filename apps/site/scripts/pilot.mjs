#!/usr/bin/env node
// Pilot admin from your terminal.
//   npm run pilot -- list                      applicants, newest first
//   npm run pilot -- accept juan@example.com   send "You're in" and take a seat
//   npm run pilot -- accept juan@example.com --resend
//   npm run pilot -- funnel [days]              how far people get, step by step
//   npm run pilot -- notify-policy --test      privacy update email, one copy to NOTIFY_EMAIL
//   npm run pilot -- notify-policy --all       privacy update email to every applicant
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
} else if (cmd === "funnel") {
  const days = email && /^\d+$/.test(email) ? email : "";
  const { steps, countingSince } = await call(`/api/admin/funnel${days ? `?days=${days}` : ""}`);
  console.log(`${days ? `Last ${days} days` : "All time"}${countingSince ? ` (counting started ${countingSince})` : ""}\n`);
  const top = steps[0].n;
  let prev = null;
  for (const s of steps) {
    const ofTop = top ? `${Math.round((s.n / top) * 100)}%`.padStart(5) : "    -";
    const ofPrev = prev === null ? "" : s.n > prev || !prev ? "–" : `${Math.round((s.n / prev) * 100)}% of previous`;
    console.log(`${String(s.n).padStart(6)}  ${ofTop}  ${s.label.padEnd(42)} ${ofPrev}`);
    if (s.detail) console.log(`${" ".repeat(15)}${s.detail}`);
    prev = s.n;
  }
  console.log("\nThe first 10 rows are anonymous totals from the site. The last 4 count GitHub accounts, yours included.");
} else if (cmd === "notify-policy" && email === "--test") {
  const r = await call("/api/admin/notify-policy", { method: "POST", body: JSON.stringify({ test: true }) });
  console.log(`Test sent to ${r.to}.`);
} else if (cmd === "notify-policy" && email === "--all") {
  const { applicants } = await call("/api/admin/applicants");
  console.log(`Sending the privacy update to ${applicants.length} applicants.\n`);
  let sent = 0;
  for (const a of applicants) {
    const res = await fetch(SITE + "/api/admin/notify-policy", { method: "POST", headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" }, body: JSON.stringify({ email: a.email }) });
    const body = await res.json().catch(() => ({}));
    console.log(`${res.ok ? "sent  " : "FAILED"}  ${a.email}${res.ok ? "" : `  (${body.error ?? res.status})`}`);
    if (res.ok) sent++;
    await new Promise((r) => setTimeout(r, 400)); // gentle on the email sender
  }
  console.log(`\n${sent} of ${applicants.length} sent.`);
  if (sent < applicants.length) process.exit(1);
} else {
  console.log("Usage:\n  npm run pilot -- list\n  npm run pilot -- funnel [days]\n  npm run pilot -- accept <email> [--resend]\n  npm run pilot -- notify-policy --test | --all");
  process.exit(cmd ? 1 : 0);
}
