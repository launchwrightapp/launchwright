// Pilot emails. Templates live in ../emails (HTML + plain text, kept in sync).
import ackHtmlModule from "../emails/application-received.html";
import ackText from "../emails/application-received.txt";
import acceptHtmlModule from "../emails/pilot-accepted.html";
import acceptText from "../emails/pilot-accepted.txt";
import codeHtmlModule from "../emails/pilot-code.html";
import codeText from "../emails/pilot-code.txt";
import policyHtmlModule from "../emails/policy-update.html";
import policyText from "../emails/policy-update.txt";
import reminderHtmlModule from "../emails/pilot-reminder.html";
import reminderText from "../emails/pilot-reminder.txt";

// Wrangler bundles .html as a plain string. Astro's types describe .html imports
// differently (as components), so tell TypeScript what we actually get.
const ackHtml = ackHtmlModule as unknown as string;
const acceptHtml = acceptHtmlModule as unknown as string;
const codeHtml = codeHtmlModule as unknown as string;
const policyHtml = policyHtmlModule as unknown as string;
const reminderHtml = reminderHtmlModule as unknown as string;

const FROM = { email: "hello@launchwright.app", name: "launchwright" };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Fill {{field}} placeholders. HTML values are escaped; the notes comment at the top is dropped.
function render(template: string, vars: Record<string, string>, html: boolean) {
  const body = html ? template.replace(/<!--[\s\S]*?-->\n?/, "") : template;
  return body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (html ? escapeHtml(vars[k] ?? "") : vars[k] ?? ""));
}

export interface Applicant { email: string; name: string | null; building: string | null }

// First name only, letters only: the name field can't smuggle links into our emails.
const firstName = (name: string | null) =>
  (name?.trim().split(/\s+/)[0] ?? "").replace(/[^\p{L}\p{M}'-]/gu, "").slice(0, 30);

const vars = (a: Applicant) => ({
  name: firstName(a.name) || "there",
  headline: firstName(a.name) ? `You're in, ${firstName(a.name)}.` : "You're in.",
  building: a.building || "You didn't say yet. Reply and tell us, it helps us review.",
});

export function sendAcknowledgement(mail: SendEmail, a: Applicant) {
  const v = vars(a);
  return mail.send({
    from: FROM,
    replyTo: FROM.email,
    to: a.email,
    subject: "You applied to the launchwright pilot",
    html: render(ackHtml, v, true),
    text: render(ackText, v, false),
  });
}

// claimUrl: their one-time sign-in link (packages/core/pilot-claim.ts).
export function sendAcceptance(mail: SendEmail, a: Applicant, claimUrl: string) {
  const v = { ...vars(a), claim_url: claimUrl };
  return mail.send({
    from: FROM,
    replyTo: FROM.email,
    to: a.email,
    subject: "You're in: launchwright pilot",
    html: render(acceptHtml, v, true),
    text: render(acceptText, v, false),
  });
}

// The 6-digit code that confirms an applicant owns the email (worker/verify.ts).
export function sendCode(mail: SendEmail, email: string, code: string) {
  return mail.send({
    from: FROM,
    replyTo: FROM.email,
    to: email,
    subject: `${code} is your launchwright code`,
    html: render(codeHtml, { code }, true),
    text: render(codeText, { code }, false),
  });
}

// To the launchwright team when someone applies. Plain text only: everything in it was typed
// by the applicant, so no HTML to escape and nothing that renders as a link but the dashboard.
export function sendNewApplication(mail: SendEmail, to: string, a: Applicant & { answers: number }) {
  const who = firstName(a.name) || a.email.split("@")[0].replace(/[^\w.-]/g, "").slice(0, 30);
  return mail.send({
    from: FROM,
    to,
    subject: `New pilot application: ${who}`,
    text: [
      `${who} applied to the launchwright pilot.`,
      "",
      `Email: ${a.email}`,
      `Building: ${(a.building ?? "(not said)").replace(/\s+/g, " ")}`,
      `Questionnaire answers: ${a.answers}`,
      "",
      "Review and accept: https://platform.launchwright.app/applicants",
    ].join("\n"),
  });
}

// The privacy policy update (AI-assisted review), sent once to people who applied before it.
export function sendPolicyUpdate(mail: SendEmail, to: string, name: string | null) {
  const v = { name: firstName(name) || "there" };
  return mail.send({
    from: FROM,
    replyTo: FROM.email,
    to,
    subject: "A small update to our privacy policy",
    html: render(policyHtml, v, true),
    text: render(policyText, v, false),
  });
}

// A nudge for an accepted learner who hasn't run their first readiness check yet
// (platform worker/activity.ts decides who is due). Worded for the step they're on.
export type ReminderStage = "not_signed_in" | "signed_in" | "ai_connected";
const REMINDER_COPY: Record<ReminderStage, { subject: string; headline: (n: string) => string; step: string; why: string }> = {
  not_signed_in: {
    subject: "Your launchwright pilot place is waiting",
    headline: (n) => (n ? `${n}, your pilot place is waiting.` : "Your pilot place is waiting."),
    step: "Sign in with GitHub on your dashboard. The setup steps there take about 10 minutes.",
    why: "You don't need a working app yet. An idea and a GitHub account are enough to start, and each step comes with a short lesson.",
  },
  signed_in: {
    subject: "One step left: connect your AI tool to launchwright",
    headline: (n) => (n ? `Nice start, ${n}. One step left.` : "Nice start. One step left."),
    step: "Connect the AI tool you already use (Claude Code, Cursor or Codex). Your dashboard shows the exact command to copy, under \"Connect AI tool\".",
    why: "Everything in the pilot runs through your AI tool. Once it's connected, it can check your project and explain what it finds.",
  },
  ai_connected: {
    subject: "Run your first readiness check",
    headline: (n) => (n ? `${n}, your AI tool is connected.` : "Your AI tool is connected."),
    step: "Ask your AI tool: \"Use launchwright to check my project.\" It runs 8 readiness checks and tells you what to fix first.",
    why: "That check is your map for the rest of the pilot: what's already production-grade and what to learn next.",
  },
};

export function sendReminder(mail: SendEmail, a: { email: string; name: string | null }, stage: ReminderStage) {
  const c = REMINDER_COPY[stage];
  const n = firstName(a.name);
  const v = { name: n || "there", headline: c.headline(n), step: c.step, why: c.why, subject: c.subject };
  return mail.send({
    from: FROM,
    replyTo: FROM.email,
    to: a.email,
    subject: c.subject,
    html: render(reminderHtml, v, true),
    text: render(reminderText, v, false),
  });
}
