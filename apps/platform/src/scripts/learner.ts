// Learner pages: load /api/me, fill the page in (bind.ts), and handle the few actions:
// approve/reject, connect/disconnect accounts, and the secret form (/secret).
import { bind } from "./bind";
import { view, type Me } from "./view";

const root = document.documentElement;

async function api(path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: init.body !== undefined ? { "content-type": "application/json" } : {},
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) ?? "Something went wrong. Please try again.");
  return data;
}

function say(id: string | undefined, text: string) {
  const el = id ? document.getElementById(id) : null;
  if (el) el.textContent = text;
}

async function load() {
  try {
    const me = (await api("/api/me")) as unknown as Me;
    bind(document, view(me));
    root.dataset.loaded = "true";
    // The Message us box (chat-box.ts) waits for this before checking for replies.
    document.dispatchEvent(new CustomEvent("learner-loaded", { detail: me }));
    // Links like /readiness#check-auth point at rows that only exist now.
    if (location.hash.length > 1) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  } catch (err) {
    root.dataset.loaded = "error";
    const banner = document.getElementById("load-error");
    if (banner) {
      banner.hidden = false;
      banner.textContent = (err as Error).message;
    }
  }
}

// Approve / Reject (overview and security page). The buttons carry the approval id.
document.addEventListener("click", async (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>("[data-decision]");
  if (!btn) return;
  const id = btn.dataset.approval!;
  const status = btn.dataset.status;
  btn.closest("[data-row]")?.querySelectorAll("button[data-decision]").forEach((b) => ((b as HTMLButtonElement).disabled = true));
  try {
    await api(`/api/approvals/${encodeURIComponent(id)}`, { method: "POST", body: { decision: btn.dataset.decision } });
    say(status, btn.dataset.decision === "approve" ? "Approved. Tell your AI tool to continue: it can run this once." : "Rejected. Your AI tool will be told no, and nothing changes.");
  } catch (err) {
    say(status, (err as Error).message);
    btn.closest("[data-row]")?.querySelectorAll("button[data-decision]").forEach((b) => ((b as HTMLButtonElement).disabled = false));
  }
});

// Connect forms (Cloudflare token, Neon key) and Disconnect buttons.
document.addEventListener("submit", async (e) => {
  const form = (e.target as Element).closest<HTMLFormElement>("form[data-connect]");
  if (!form) return;
  e.preventDefault();
  const provider = form.dataset.connect!;
  const input = form.querySelector<HTMLInputElement>("input[name=secret]")!;
  const button = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  button.disabled = true;
  say(form.dataset.status, "Checking with " + (provider === "cloudflare" ? "Cloudflare" : "Neon") + "…");
  try {
    const r = await api(`/api/connections/${provider}`, { method: "POST", body: provider === "cloudflare" ? { token: input.value } : { apiKey: input.value } });
    input.value = "";
    say(form.dataset.status, `Connected (${r.label}). The key is stored encrypted; your AI tool never sees it.`);
    await load();
  } catch (err) {
    say(form.dataset.status, (err as Error).message);
  } finally {
    button.disabled = false;
  }
});

document.addEventListener("click", async (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>("[data-disconnect]");
  if (!btn) return;
  btn.disabled = true;
  try {
    await api(`/api/connections/${btn.dataset.disconnect}`, { method: "DELETE" });
    await load();
  } catch (err) {
    say(btn.dataset.status, (err as Error).message);
  } finally {
    btn.disabled = false;
  }
});

// /secret?id=... : the learner types a value the AI asked for by name.
async function secretPage(form: HTMLFormElement) {
  const id = new URLSearchParams(location.search).get("id") ?? "";
  const status = (t: string) => say("secret-status", t);
  const show = (state: string) => document.querySelectorAll<HTMLElement>("[data-secret-state]").forEach((el) => (el.hidden = el.dataset.secretState !== state));
  await load(); // the layout around the form
  const scope: Document | HTMLElement = document.querySelector<HTMLElement>("[data-secret-root]") ?? document;
  try {
    const r = await api(`/api/secret-requests/${encodeURIComponent(id)}`);
    bind(scope, {
      secret: { ...r, where: r.target === "both" ? "GitHub Actions and your Cloudflare Worker" : r.target === "github_actions" ? "GitHub Actions" : "your Cloudflare Worker" },
    });
    show(r.status === "waiting" ? "form" : r.status === "expired" ? "expired" : r.status === "cancelled" ? "cancelled" : "done");
  } catch (err) {
    show("invalid");
    say("secret-invalid", (err as Error).message);
  }
  root.dataset.secretLoaded = "true";
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = form.querySelector<HTMLInputElement>("[name=value]")!;
    const cancel = (e as SubmitEvent).submitter?.getAttribute("value") === "cancel";
    try {
      await api(`/api/secret-requests/${encodeURIComponent(id)}`, { method: "POST", body: cancel ? { cancel: true } : { value: input.value } });
      input.value = "";
      show(cancel ? "cancelled" : "done");
    } catch (err) {
      status((err as Error).message);
    }
  });
  // Reveal / hide what you typed.
  document.getElementById("secret-reveal")?.addEventListener("change", (e) => {
    form.querySelector<HTMLInputElement>("[name=value]")!.type = (e.target as HTMLInputElement).checked ? "text" : "password";
  });
}

// Back from Supabase's approval screen (/security?connected=supabase or ?error=supabase_*).
const SUPABASE_RESULT: Record<string, string> = {
  "connected=supabase": "Connected. Supabase access is stored encrypted; your AI tool never sees it.",
  "error=supabase_cancelled": "You cancelled on Supabase, so nothing was connected. Try again whenever you're ready.",
  "error=supabase_expired": "That sign-in took too long or was opened twice. Click Connect Supabase again.",
  "error=supabase_failed": "Supabase didn't finish the sign-in. Please try again in a minute.",
  "error=supabase_unavailable": "Supabase sign-in isn't switched on for this server yet. Use Neon for now.",
};
{
  const q = new URLSearchParams(location.search);
  const key = q.has("connected") ? `connected=${q.get("connected")}` : `error=${q.get("error")}`;
  if (SUPABASE_RESULT[key]) say("supabase-status", SUPABASE_RESULT[key]);
}

const secretForm = document.querySelector<HTMLFormElement>("form[data-secret-form]");
if (secretForm) void secretPage(secretForm);
else if (document.querySelector("[data-learner-page]")) void load();
