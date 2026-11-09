// Pilot funnel: each step with its count, its share of landing visits, and the drop
// from the step before. Labels and numbers come from our own API; set as text anyway.
import { api } from "./conversation";

interface Step { key: string; label: string; n: number }
interface Report { days: number | null; steps: Step[]; sample?: boolean }

// Site steps end at "accepted"; the rest are learners (GitHub accounts).
const LEARNER_KEYS = new Set(["ai_connected", "first_check", "production_deploy", "all_checks_live"]);
// "Biggest drop" looks only inside the application, from code to sent. Visits → code is
// always the biggest drop and says nothing about the form.
const FORM_KEYS = new Set(["verified", "apply_1", "apply_2", "apply_3", "apply_4", "apply_5", "submitted"]);

const statusEl = document.querySelector<HTMLElement>("[data-status]")!;
const biggestEl = document.querySelector<HTMLElement>("[data-biggest]")!;
const bodies = { site: document.querySelector<HTMLElement>('[data-group="site"]')!, learners: document.querySelector<HTMLElement>('[data-group="learners"]')! };
const rangeBtns = [...document.querySelectorAll<HTMLButtonElement>("[data-range] [data-days]")];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
const cell = "px-3 py-2.5 @xl:px-4";

function row(step: Step, top: number, prev: Step | null) {
  const tr = el("tr", "border-b border-line last:border-b-0");
  tr.dataset.step = step.key;
  tr.appendChild(el("td", cell, step.label));
  tr.appendChild(el("td", `${cell} text-right font-semibold tabular-nums`, step.n.toLocaleString()));

  const share = el("td", `${cell} hidden @xl:table-cell`);
  const wrap = el("div", "flex items-center gap-2");
  const track = el("div", "h-1.5 w-40 overflow-hidden rounded-full bg-surface-3");
  const bar = el("div", "h-full rounded-full bg-blue");
  bar.style.width = top ? `${Math.min(100, (step.n / top) * 100)}%` : "0%";
  track.appendChild(bar);
  wrap.appendChild(track);
  wrap.appendChild(el("span", "tabular-nums text-muted", pct(step.n, top)));
  share.appendChild(wrap);
  tr.appendChild(share);

  tr.appendChild(el("td", `${cell} text-right tabular-nums text-muted`, prev ? pct(step.n, prev.n) : ""));
  return tr;
}

let latest = 0; // a slow answer for an older range never replaces a newer one
async function load(days: string) {
  const mine = ++latest;
  statusEl.textContent = "Loading…";
  for (const b of Object.values(bodies)) b.setAttribute("aria-busy", "true");
  const { ok, data } = await api<Report>(`/api/admin/funnel${days ? `?days=${days}` : ""}`);
  if (mine !== latest) return;
  for (const b of Object.values(bodies)) { b.replaceChildren(); b.setAttribute("aria-busy", "false"); }
  if (!ok) {
    statusEl.textContent = data.error ?? "Couldn't load the funnel.";
    biggestEl.hidden = true;
    return;
  }

  const steps = data.steps;
  const top = steps[0]?.n ?? 0;
  let worst: { from: Step; to: Step; kept: number } | null = null;
  steps.forEach((s, i) => {
    const prev = i ? steps[i - 1] : null;
    bodies[LEARNER_KEYS.has(s.key) ? "learners" : "site"].appendChild(row(s, top, prev));
    if (prev && prev.n >= 5 && FORM_KEYS.has(s.key)) {
      const kept = s.n / prev.n;
      if (!worst || kept < worst.kept) worst = { from: prev, to: s, kept };
    }
  });

  statusEl.textContent = days ? `Last ${days} days.` : "All time.";
  document.querySelector<HTMLElement>("[data-sample]")!.classList.toggle("hidden", !data.sample);
  const w = worst as { from: Step; to: Step; kept: number } | null;
  biggestEl.hidden = !w;
  if (w) biggestEl.textContent = `Biggest drop in the application: ${w.from.label} → ${w.to.label}. ${Math.round(w.kept * 100)}% made it (${w.to.n} of ${w.from.n}).`;
}

for (const b of rangeBtns) {
  b.addEventListener("click", () => {
    for (const o of rangeBtns) o.setAttribute("aria-pressed", String(o === b));
    void load(b.dataset.days ?? "");
  });
}
void load(rangeBtns.find((b) => b.getAttribute("aria-pressed") === "true")?.dataset.days ?? "30");
