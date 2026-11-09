// Applicants: a table with filter tabs. View opens a bottom sheet with the answers and Accept.
// Everything shown comes from people, so it's set with textContent only.
import { add, api } from "./conversation";

interface Applicant { email: string; name: string | null; building: string | null; answers: Record<string, unknown> | null; appliedAt: string; acceptedAt: string | null }
type Filter = "waiting" | "accepted" | "all";

const listEl = document.querySelector<HTMLTableSectionElement>("[data-applicants]")!;
const empty = document.querySelector<HTMLElement>("[data-applicants-empty]")!;
const seatsEl = document.querySelector<HTMLElement>("[data-seats]")!;
const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-filter] [data-show]")];

let people: Applicant[] = [];
let seats = 10;
let filter: Filter = "waiting";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const human = (k: string) => k.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "object" && v ? JSON.stringify(v) : String(v ?? ""));

// The sheet: one <dialog> reused for whoever is open.
const sheet = document.querySelector<HTMLDialogElement>("[data-sheet]")!;
const q = <T extends HTMLElement>(sel: string) => sheet.querySelector<T>(sel)!;
const acceptBtn = q<HTMLButtonElement>("[data-sheet-accept]");
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
  const rows: [string, string][] = [];
  if (a.building) rows.push(["Building", a.building]);
  for (const [k, v] of Object.entries(a.answers ?? {})) if (show(v)) rows.push([human(k), show(v)]);
  const dl = q("[data-sheet-answers]");
  dl.replaceChildren(...rows.flatMap(([k, v]) => [el("dt", "pt-2 text-muted md:pt-0", k), el("dd", "break-words", v)]));
  if (!rows.length) dl.replaceChildren(el("dd", "text-muted", "No answers saved."));
  armed = false;
  acceptBtn.disabled = false;
  acceptBtn.className = a.acceptedAt ? "btn btn-sm btn-outline" : "btn btn-sm";
  acceptBtn.textContent = label(a);
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

function row(a: Applicant) {
  const tr = el("tr", "border-t border-line first:border-t-0 hover:bg-surface-2");
  // Narrow screens keep Name, Status and View; the email moves under the name.
  const name = el("td", "w-full max-w-0 px-3 py-3 @xl:px-5");
  add(name, el("p", "truncate font-semibold", a.name || a.email.split("@")[0]), el("p", "truncate text-[14px] text-muted @2xl:hidden", a.email));
  const email = el("td", "hidden max-w-[18rem] truncate px-3 py-3 @xl:px-5 text-muted @2xl:table-cell", a.email);
  const building = el("td", "hidden max-w-[18rem] truncate px-3 py-3 @xl:px-5 text-muted @4xl:table-cell", a.building ?? "");
  const applied = el("td", "hidden whitespace-nowrap px-3 py-3 @xl:px-5 tabular-nums text-muted @xl:table-cell", day(a.appliedAt));
  const st = el("td", "px-3 py-3 @xl:px-5");
  const tag = el("span", "");
  status(tag, a);
  add(st, tag);
  const act = el("td", "px-3 py-3 @xl:px-5 text-right");
  const view = el("button", "btn btn-sm btn-outline", "View") as HTMLButtonElement;
  view.type = "button";
  view.setAttribute("aria-label", `View ${a.name || a.email}`);
  view.addEventListener("click", () => openSheet(a));
  add(act, view);
  add(tr, name, email, building, applied, st, act);
  return tr;
}

function draw() {
  const accepted = people.filter((p) => p.acceptedAt).length;
  seatsEl.textContent = `${accepted} of ${seats} seats taken`;
  const counts: Record<Filter, number> = { waiting: people.length - accepted, accepted, all: people.length };
  for (const [k, n] of Object.entries(counts)) {
    const c = document.querySelector(`[data-count="${k}"]`);
    if (c) c.textContent = String(n);
  }
  const shown = people.filter((p) => (filter === "all" ? true : filter === "accepted" ? !!p.acceptedAt : !p.acceptedAt));
  listEl.replaceChildren(...shown.map(row));
  listEl.closest("div")!.hidden = shown.length === 0;
  empty.hidden = shown.length > 0;
  empty.textContent = filter === "waiting" ? "No one is waiting." : filter === "accepted" ? "No one accepted yet." : "No applications yet.";
}

for (const t of tabs) {
  t.addEventListener("click", () => {
    filter = t.dataset.show as Filter;
    for (const x of tabs) x.setAttribute("aria-selected", String(x === t));
    draw();
  });
}

(async () => {
  const { ok, data } = await api<{ seats: number; applicants: Applicant[] }>("/api/admin/applicants");
  listEl.setAttribute("aria-busy", "false");
  if (!ok) {
    seatsEl.textContent = "Seats unavailable";
    empty.hidden = false;
    empty.textContent = data.error ?? "Couldn't load applicants.";
    return;
  }
  people = data.applicants;
  seats = data.seats;
  draw();
})();
