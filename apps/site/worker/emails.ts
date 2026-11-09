// Pilot emails. Templates live in ../emails (HTML + plain text, kept in sync).
import ackHtmlModule from "../emails/application-received.html";
import ackText from "../emails/application-received.txt";
import acceptHtmlModule from "../emails/pilot-accepted.html";
import acceptText from "../emails/pilot-accepted.txt";

// Wrangler bundles .html as a plain string. Astro's types describe .html imports
// differently (as components), so tell TypeScript what we actually get.
const ackHtml = ackHtmlModule as unknown as string;
const acceptHtml = acceptHtmlModule as unknown as string;

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

export function sendAcceptance(mail: SendEmail, a: Applicant) {
  const v = vars(a);
  return mail.send({
    from: FROM,
    replyTo: FROM.email,
    to: a.email,
    subject: "You're in: launchwright pilot",
    html: render(acceptHtml, v, true),
    text: render(acceptText, v, false),
  });
}
