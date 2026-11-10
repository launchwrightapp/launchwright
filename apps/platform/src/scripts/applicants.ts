// Applicants: a table with filter tabs. View opens a bottom sheet with the answers and Accept.
// Everything shown comes from people, so it's set with textContent only.
import { add, api } from "./conversation";
import { OPTIONS } from "../../../site/worker/options";

interface Applicant { email: string; name: string | null; building: string | null; answers: Record<string, unknown> | null; appliedAt: string; acceptedAt: string | null }
type Filter = "waiting" | "accepted" | "all";

const listEl = document.querySelector<HTMLTableSectionElement>("[data-applicants]")!;
const acceptedEl = document.querySelector<HTMLElement>("[data-accepted]")!;
const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-filter] [data-show]")];
// Role and stage filters are design-system Dropdowns; picking one fires lw:dropdown-change.
const picked: Record<string, string> = { role: "", stage: "" };
const search = document.querySelector<HTMLInputElement>("[data-search]")!;
const sortBtns = [...document.querySelectorAll<HTMLButtonElement>("[data-sort]")];
type SortKey = "name" | "email" | "building" | "applied" | "status" | "fit";
interface Review { email: string; score: number; fit: "strong" | "maybe" | "weak"; reason: string; risk: string }
// Claude's ranking (worker/review.ts), kept only for this page view.
let reviews = new Map<string, Review>();
const FIT_TAG: Record<Review["fit"], string> = { strong: "tag-ok", maybe: "tag-warn", weak: "tag-bad" };
const fitText = (r: Review) => `${r.fit[0].toUpperCase()}${r.fit.slice(1)} fit · ${r.score}`;

let people: Applicant[] = [];
let filter: Filter = "waiting";
let sortKey: SortKey = "applied";
let sortDir: 1 | -1 = -1; // newest first

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const human = (k: string) => k.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
// Pilot form steps and their fields, in form order. Labels for stored values come from
// the site's own option list, so the sheet reads like the form the applicant filled in.
type Section = "about" | "experience" | "project" | "goals";
const SECTIONS: Section[] = ["about", "experience", "project", "goals"];
const STEP_FIELDS: Record<Section, string[]> = {
  about: ["role", "city"],
  experience: ["experience", "tools"],
  project: ["stage", "github"],
  goals: ["learn", "hours", "heard"],
};
const FIELDS: Record<string, string> = {
  role: "Describes them", city: "City", experience: "Coding so far", tools: "AI tools",
  stage: "Where it is", github: "GitHub", learn: "Wants to learn", hours: "Hours a week", heard: "Heard about us",
};
const optionLabel = (k: string, v: unknown) =>
  (OPTIONS as Record<string, readonly (readonly [string, string])[]>)[k]?.find(([val]) => val === v)?.[1] ?? v;
const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "object" && v ? JSON.stringify(v) : String(v ?? ""));

// The sheet: one <dialog> reused for whoever is open.
const sheet = document.querySelector<HTMLDialogElement>("[data-sheet]")!;
const q = <T extends HTMLElement>(sel: string) => sheet.querySelector<T>(sel)!;
const acceptBtn = q<HTMLButtonElement>("[data-sheet-accept]");
const removeBtn = q<HTMLButtonElement>("[data-sheet-remove]");
let removeArmed = false;
const note = q<HTMLElement>("[data-sheet-note]");
let open: Applicant | null = null;
let armed = false;

const label = (a: Applicant) => (a.acceptedAt ? "Resend email" : "Accept");
function status(span: HTMLElement, a: Applicant) {
  span.className = `tag flex-none text-[13px] ${a.acceptedAt ? "tag-ok" : "tag-line"}`;
  span.textContent = a.acceptedAt ? `Accepted ${day(a.acceptedAt)}` : "Waiting";
}

function fillSheet(a: Applicant) {
  q("[data-sheet-name]").textContent = a.name || a.email.split("@")[0];
  q("[data-sheet-meta]").textContent = `${a.email} · applied ${day(a.appliedAt)}`;
  status(q("[data-sheet-status]"), a);
  const rv = reviews.get(a.email);
  const box = q("[data-sheet-review]");
  box.hidden = !rv;
  if (rv) {
    const fit = q("[data-sheet-fit]");
    fit.className = `tag text-[12px] ${FIT_TAG[rv.fit]}`;
    fit.textContent = fitText(rv);
    q("[data-sheet-reason]").textContent = rv.reason;
    q("[data-sheet-risk]").textContent = rv.risk ? `Risk: ${rv.risk}` : "";
  }
  // One tab per pilot form step. Answers we don't know yet land in the last tab.
  const answers: Record<string, unknown> = { ...(a.answers ?? {}) };
  const take = (k: string): [string, string] | null => {
    const v = answers[k];
    delete answers[k];
    const text = show(Array.isArray(v) ? v.map((x) => optionLabel(k, x)) : typeof v === "string" ? optionLabel(k, v) : v);
    return text ? [FIELDS[k] ?? human(k), text] : null;
  };
  const rows: Record<Section, [string, string][]> = { about: [], experience: [], project: [], goals: [] };
  if (a.name) rows.about.push(["Name", a.name]);
  rows.about.push(["Email", a.email]);
  if (a.building) rows.project.push(["Building", a.building]);
  for (const s of SECTIONS) for (const k of STEP_FIELDS[s]) { const r = take(k); if (r) rows[s].push(r); }
  for (const k of Object.keys(answers)) { const r = take(k); if (r) rows.goals.push(r); }
  for (const s of SECTIONS) {
    const dl = q(`[data-sheet-section="${s}"]`);
    dl.replaceChildren(...rows[s].flatMap(([k, v]) => [el("dt", "pt-2 text-muted md:pt-0", k), el("dd", "break-words", v)]));
    if (!rows[s].length) dl.replaceChildren(el("dd", "text-muted", "Nothing answered here."));
  }
  q<HTMLButtonElement>('[role="tab"]').click(); // every applicant opens on the first tab
  armed = false;
  acceptBtn.disabled = false;
  acceptBtn.className = a.acceptedAt ? "btn btn-sm btn-outline" : "btn btn-sm";
  acceptBtn.textContent = label(a);
  removeArmed = false;
  removeBtn.hidden = !a.acceptedAt;
  removeBtn.disabled = false;
  removeBtn.textContent = "Remove access";
  note.className = "text-[14px] text-muted";
  note.textContent = "";
}

function openSheet(a: Applicant) {
  open = a;
  fillSheet(a);
  sheet.showModal();
}

q("[data-sheet-close]").addEventListener("click", () => sheet.close());
// A click on the dimmed area (the dialog itself, outside its content) closes the sheet.
sheet.addEventListener("click", (e) => {
  if (e.target === sheet) sheet.close();
});

// Accept takes two clicks (Accept, then Confirm), so nothing is sent by accident.
acceptBtn.addEventListener("click", async () => {
  const a = open;
  if (!a) return;
  if (!armed) {
    armed = true;
    acceptBtn.textContent = a.acceptedAt ? "Confirm: resend" : "Confirm: send email";
    note.textContent = `Sends the "You're in" email to ${a.email}.`;
    setTimeout(() => {
      if (armed && open === a && !acceptBtn.disabled) {
        armed = false;
        acceptBtn.textContent = label(a);
        note.textContent = "";
      }
    }, 6000);
    return;
  }
  armed = false;
  acceptBtn.disabled = true;
  note.textContent = "Sending…";
  const { ok, data } = await api<{ acceptedAt: string; accepted: number }>("/api/admin/applicants/accept", { method: "POST", body: { email: a.email, resend: !!a.acceptedAt } });
  acceptBtn.disabled = false;
  if (!ok) {
    acceptBtn.textContent = label(a);
    note.textContent = data.error ?? "That didn't work. Try again.";
    note.className = "text-[14px] text-bad";
    return;
  }
  const resent = !!a.acceptedAt;
  a.acceptedAt = a.acceptedAt ?? String(data.acceptedAt);
  draw();
  if (open === a) {
    fillSheet(a);
    note.textContent = resent ? "Email sent again." : "Accepted. The email is on its way.";
  }
});

// Remove access also takes two clicks. It frees the seat and signs them out of the dashboard
// and their AI tool. No email goes out; they move back to Waiting.
removeBtn.addEventListener("click", async () => {
  const a = open;
  if (!a?.acceptedAt) return;
  if (!removeArmed) {
    removeArmed = true;
    removeBtn.textContent = "Confirm: remove access";
    note.className = "text-[14px] text-muted";
    note.textContent = `${a.email} loses access to the dashboard and the AI tool connection, and the seat opens up. No email is sent.`;
    setTimeout(() => {
      if (removeArmed && open === a && !removeBtn.disabled) {
        removeArmed = false;
        removeBtn.textContent = "Remove access";
        note.textContent = "";
      }
    }, 6000);
    return;
  }
  removeArmed = false;
  removeBtn.disabled = true;
  note.textContent = "Removing…";
  const { ok, data } = await api<{ accepted: number }>("/api/admin/applicants/remove", { method: "POST", body: { email: a.email } });
  removeBtn.disabled = false;
  if (!ok) {
    removeBtn.textContent = "Remove access";
    note.textContent = data.error ?? "That didn't work. Try again.";
    note.className = "text-[14px] text-bad";
    return;
  }
  a.acceptedAt = null;
  draw();
  if (open === a) {
    fillSheet(a);
    note.textContent = "Access removed. The seat is open again.";
  }
});

function row(a: Applicant) {
  // The whole row opens the sheet; the View button stays for keyboard and screen reader users
  // (its click bubbles up to the row, so there's one handler).
  const tr = el("tr", "cursor-pointer border-t border-line first:border-t-0 hover:bg-surface-2");
  tr.addEventListener("click", () => { if (!sheet.open) openSheet(a); });
  // Narrow screens keep Name, Status and View; the email moves under the name.
  const name = el("td", "w-full max-w-0 px-3 py-2.5 @xl:px-4");
  add(name, el("p", "truncate font-semibold", a.name || a.email.split("@")[0]), el("p", "truncate text-[14px] text-muted @2xl:hidden", a.email));
  const rv = reviews.get(a.email);
  if (rv) {
    const line = el("p", "mt-1 flex min-w-0 items-center gap-2 text-[13px]");
    add(line, el("span", `tag flex-none text-[12px] ${FIT_TAG[rv.fit]}`, fitText(rv)), el("span", "truncate text-muted", rv.reason));
    line.title = rv.reason;
    add(name, line);
  }
  const email = el("td", "hidden max-w-[18rem] truncate px-3 py-2.5 @xl:px-4 text-muted @2xl:table-cell", a.email);
  const building = el("td", "hidden max-w-[18rem] truncate px-3 py-2.5 @xl:px-4 text-muted @4xl:table-cell", a.building ?? "");
  const applied = el("td", "hidden whitespace-nowrap px-3 py-2.5 @xl:px-4 tabular-nums text-muted @xl:table-cell", day(a.appliedAt));
  const st = el("td", "px-3 py-2.5 @xl:px-4");
  const tag = el("span", "");
  status(tag, a);
  add(st, tag);
  const act = el("td", "px-3 py-2.5 @xl:px-4 text-right");
  const view = el("button", "btn btn-sm btn-outline", "View") as HTMLButtonElement;
  view.type = "button";
  view.setAttribute("aria-label", `View ${a.name || a.email}`);
  add(act, view);
  add(tr, name, email, building, applied, st, act);
  return tr;
}

const nameOf = (a: Applicant) => a.name || a.email.split("@")[0];
const sortValue: Record<SortKey, (a: Applicant) => string> = {
  name: (a) => nameOf(a).toLowerCase(),
  email: (a) => a.email,
  building: (a) => (a.building ?? "").toLowerCase(),
  applied: (a) => a.appliedAt,
  status: (a) => a.acceptedAt ?? "", // waiting first, then by accept date
  fit: (a) => String(1000 - (reviews.get(a.email)?.score ?? -1)).padStart(4, "0"), // best first, unranked last
};
// Everything a search can match: who they are and what they told us.
const haystack = (a: Applicant) =>
  [a.name, a.email, a.building, ...Object.values(a.answers ?? {}).flat().map((v) => optionLabel("", v))]
    .filter(Boolean).join(" ").toLowerCase();

function emptyRow(text: string) {
  const tr = el("tr", "");
  const td = el("td", "px-4 py-8 text-center text-muted", text);
  td.colSpan = 6;
  add(tr, td);
  return tr;
}

function draw() {
  const accepted = people.filter((p) => p.acceptedAt).length;
  acceptedEl.textContent = `${accepted} accepted`;
  const counts: Record<Filter, number> = { waiting: people.length - accepted, accepted, all: people.length };
  for (const [k, n] of Object.entries(counts)) {
    const c = document.querySelector(`[data-count="${k}"]`);
    if (c) c.textContent = String(n);
  }
  const q = search.value.trim().toLowerCase();
  const shown = people
    .filter((p) => (filter === "all" ? true : filter === "accepted" ? !!p.acceptedAt : !p.acceptedAt))
    .filter((p) => Object.entries(picked).every(([k, v]) => !v || p.answers?.[k] === v))
    .filter((p) => !q || haystack(p).includes(q))
    .sort((a, b) => sortValue[sortKey](a).localeCompare(sortValue[sortKey](b)) * sortDir);

  for (const b of sortBtns) {
    const on = b.dataset.sort === sortKey;
    const th = b.closest("th")!;
    if (on) th.setAttribute("aria-sort", sortDir === 1 ? "ascending" : "descending");
    else th.removeAttribute("aria-sort");
    const icon = b.querySelector<HTMLElement>("[data-sort-icon]")!;
    icon.textContent = on && sortDir === 1 ? "▲" : "▼";
    icon.classList.toggle("opacity-0", !on);
    b.classList.toggle("text-ink", on);
  }

  const filtered = q || Object.values(picked).some(Boolean);
  listEl.replaceChildren(
    ...(shown.length
      ? shown.map(row)
      : [emptyRow(filtered ? "No one matches. Try another search or filter." : filter === "waiting" ? "No one is waiting." : filter === "accepted" ? "No one accepted yet." : "No applications yet.")]),
  );
}

for (const t of tabs) {
  t.addEventListener("click", () => {
    filter = t.dataset.show as Filter;
    for (const x of tabs) x.setAttribute("aria-pressed", String(x === t));
    draw();
  });
}
document.addEventListener("lw:dropdown-change", (e) => {
  const { name, value } = (e as CustomEvent<{ name: string; value: string }>).detail;
  const key = name.replace(/^applicants-/, "");
  if (name.startsWith("applicants-") && key in picked) { picked[key] = value; draw(); }
});
search.addEventListener("input", draw);
for (const b of sortBtns) {
  b.addEventListener("click", () => {
    const key = b.dataset.sort as SortKey;
    if (key === sortKey) sortDir = sortDir === 1 ? -1 : 1;
    else { sortKey = key; sortDir = key === "applied" ? -1 : 1; }
    draw();
  });
}

const rankBtn = document.querySelector<HTMLButtonElement>("[data-rank]")!;
const rankNote = document.querySelector<HTMLElement>("[data-rank-note]")!;
rankBtn.addEventListener("click", async () => {
  rankBtn.disabled = true;
  rankBtn.textContent = "Ranking…";
  rankNote.className = "-mt-2 text-[13px] text-muted";
  rankNote.textContent = "Claude is reading the applications. This takes up to a minute.";
  const { ok, data } = await api<{ model: string; reviewed: number; reviews: Review[] }>("/api/admin/applicants/review", { method: "POST", body: {} });
  rankBtn.disabled = false;
  rankBtn.textContent = "Rank again";
  if (!ok) {
    rankNote.className = "-mt-2 text-[13px] text-bad";
    rankNote.textContent = data.error ?? "Ranking didn't work. Try again.";
    return;
  }
  reviews = new Map(data.reviews.map((r) => [r.email, r]));
  const strong = data.reviews.filter((r) => r.fit === "strong").length;
  rankNote.textContent = `Ranked ${data.reviews.length} of ${data.reviewed} waiting by ${data.model}: ${strong} strong fit. Sorted best first; a suggestion, not a decision.`;
  filter = "waiting";
  for (const x of tabs) x.setAttribute("aria-pressed", String(x.dataset.show === "waiting"));
  sortKey = "fit";
  sortDir = 1;
  draw();
  if (open && sheet.open) fillSheet(open);
});

(async () => {
  const { ok, data } = await api<{ applicants: Applicant[] }>("/api/admin/applicants");
  listEl.setAttribute("aria-busy", "false");
  if (!ok) {
    acceptedEl.textContent = "Count unavailable";
    listEl.replaceChildren(emptyRow(data.error ?? "Couldn't load applicants."));
    return;
  }
  people = data.applicants;
  draw();
})();
