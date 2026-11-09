// Applicants: list, filter, and accept (two clicks: Accept, then Confirm, so nothing is sent by accident).
// Everything shown comes from people, so it's set with textContent only.
import { add, api } from "./conversation";

interface Applicant { email: string; name: string | null; building: string | null; answers: Record<string, unknown> | null; appliedAt: string; acceptedAt: string | null }
type Filter = "waiting" | "accepted" | "all";

const listEl = document.querySelector<HTMLUListElement>("[data-applicants]")!;
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

function card(a: Applicant) {
  const li = el("li", "flex flex-col gap-3 rounded-xl border border-line bg-surface p-5");
  const top = el("div", "flex items-start gap-3");
  const who = el("div", "min-w-0 flex-1");
  add(who, el("p", "truncate text-lg font-semibold", a.name || a.email.split("@")[0]), el("p", "truncate text-[15px] text-muted", `${a.email} · applied ${day(a.appliedAt)}`));
  const tag = a.acceptedAt ? el("span", "tag tag-ok flex-none text-[13px]", `Accepted ${day(a.acceptedAt)}`) : el("span", "tag tag-line flex-none text-[13px]", "Waiting");
  add(top, who, tag);
  add(li, top);

  const rows: [string, string][] = [];
  if (a.building) rows.push(["Building", a.building]);
  for (const [k, v] of Object.entries(a.answers ?? {})) if (show(v)) rows.push([human(k), show(v)]);
  if (rows.length) {
    const dl = el("dl", "grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[15px]");
    for (const [k, v] of rows) add(dl, el("dt", "text-muted", k), el("dd", "break-words", v));
    add(li, dl);
  }

  const actions = el("div", "flex flex-wrap items-center gap-3 border-t border-line pt-3");
  const btn = el("button", a.acceptedAt ? "btn btn-sm btn-outline" : "btn btn-sm", a.acceptedAt ? "Resend email" : "Accept") as HTMLButtonElement;
  btn.type = "button";
  const note = el("p", "text-[14px] text-muted");
  note.setAttribute("role", "status");
  let armed = false;
  btn.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      btn.textContent = a.acceptedAt ? "Confirm: resend" : "Confirm: send email";
      note.textContent = `Sends the "You're in" email to ${a.email}.`;
      setTimeout(() => {
        if (armed && !btn.disabled) {
          armed = false;
          btn.textContent = a.acceptedAt ? "Resend email" : "Accept";
          note.textContent = "";
        }
      }, 6000);
      return;
    }
    armed = false;
    btn.disabled = true;
    note.textContent = "Sending…";
    const { ok, data } = await api<{ acceptedAt: string; accepted: number }>("/api/admin/applicants/accept", { method: "POST", body: { email: a.email, resend: !!a.acceptedAt } });
    btn.disabled = false;
    if (!ok) {
      btn.textContent = a.acceptedAt ? "Resend email" : "Accept";
      note.textContent = data.error ?? "That didn't work. Try again.";
      note.className = "text-[14px] text-bad";
      return;
    }
    a.acceptedAt = a.acceptedAt ?? String(data.acceptedAt);
    draw();
  });
  add(actions, btn, note);
  add(li, actions);
  return li;
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
  listEl.replaceChildren(...shown.map(card));
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
