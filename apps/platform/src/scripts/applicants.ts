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

// Accepted learners' activity (worker/activity.ts) and Claude's recommendations, for this page view.
type Stage = "not_signed_in" | "signed_in" | "ai_connected" | "checked" | "deployed" | "live";
interface Activity {
  email: string; acceptedAt: string; stage: Stage; lastActiveAt: string | null; aiCalls: number; checks: number;
  connections: number; concepts: number; readiness: { passed: number; total: number } | null;
  remindersSent: number; lastRemindedAt: string | null; reminderDue: boolean;
}
type Verdict = "keep" | "nudge" | "consider_removing";
interface Recommendation { email: string; verdict: Verdict; reason: string }
const STAGE_LABEL: Record<Stage, string> = {
  not_signed_in: "Not signed in", signed_in: "Signed in", ai_connected: "AI tool connected",
  checked: "Ran a check", deployed: "Deployed", live: "Live, all checks pass",
};
const STAGE_TAG: Record<Stage, string> = { not_signed_in: "tag-bad", signed_in: "tag-warn", ai_connected: "tag-warn", checked: "tag-ok", deployed: "tag-ok", live: "tag-ok" };
const VERDICT_LABEL: Record<Verdict, string> = { keep: "Keep", nudge: "Nudge", consider_removing: "Consider removing" };
const VERDICT_TAG: Record<Verdict, string> = { keep: "tag-ok", nudge: "tag-warn", consider_removing: "tag-bad" };
let activity = new Map<string, Activity>();
let activityError = "";
let recs = new Map<string, Recommendation>();
const selected = new Set<string>();
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
const activityText = (a: Activity) =>
  [`Active ${ago(a.lastActiveAt)}`, `${a.aiCalls} AI tool call${a.aiCalls === 1 ? "" : "s"}`,
    a.readiness ? `best check ${a.readiness.passed}/${a.readiness.total}` : "",
    `${a.remindersSent} reminder${a.remindersSent === 1 ? "" : "s"}${a.lastRemindedAt ? ` (last ${ago(a.lastRemindedAt)})` : ""}`,
    a.reminderDue ? "reminder due" : ""].filter(Boolean).join(" · ");

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
  const act = a.acceptedAt ? activity.get(a.email) : undefined;
  const actBox = q("[data-sheet-activity]");
  actBox.hidden = !act;
  if (act) {
    const stage = q("[data-sheet-stage]");
    stage.className = `tag text-[12px] ${STAGE_TAG[act.stage]}`;
    stage.textContent = STAGE_LABEL[act.stage];
    q("[data-sheet-activity-text]").textContent = `${activityText(act)} · ${act.connections} account${act.connections === 1 ? "" : "s"} connected · ${act.concepts} lesson${act.concepts === 1 ? "" : "s"} seen`;
    const rec = recs.get(a.email);
    const v = q("[data-sheet-verdict]");
    v.hidden = !rec;
    q("[data-sheet-verdict-reason]").textContent = rec ? `Claude: ${rec.reason}` : "";
    if (rec) {
      v.className = `tag text-[12px] ${VERDICT_TAG[rec.verdict]}`;
      v.textContent = VERDICT_LABEL[rec.verdict];
    }
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
  selected.delete(a.email);
  activity.delete(a.email);
  recs.delete(a.email);
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
  // Checkbox for bulk remove, on the Accepted tab only. Its clicks don't open the sheet.
  const pick = el("td", `w-0 py-2.5 pl-3 @xl:pl-4 ${filter === "accepted" ? "" : "hidden"}`);
  if (a.acceptedAt) {
    const box = el("input", "size-4 accent-ink") as HTMLInputElement;
    box.type = "checkbox";
    box.checked = selected.has(a.email);
    box.setAttribute("aria-label", `Select ${a.name || a.email}`);
    box.addEventListener("click", (e) => e.stopPropagation());
    box.addEventListener("change", () => {
      if (box.checked) selected.add(a.email);
      else selected.delete(a.email);
      drawBulk();
    });
    add(pick, box);
  }
  pick.addEventListener("click", (e) => e.stopPropagation());
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
  const acty = a.acceptedAt ? activity.get(a.email) : undefined;
  const rec = acty ? recs.get(a.email) : undefined;
  if (acty) {
    const line = el("p", "mt-1 truncate text-[13px] text-muted", rec ? rec.reason : activityText(acty));
    line.title = rec ? `${rec.reason}\n${activityText(acty)}` : activityText(acty);
    add(name, line);
  }
  const email = el("td", "hidden max-w-[18rem] truncate px-3 py-2.5 @xl:px-4 text-muted @2xl:table-cell", a.email);
  // On the Accepted tab the activity needs the room; the sheet still shows what they're building.
  const building = el("td", `hidden max-w-[18rem] truncate px-3 py-2.5 @xl:px-4 text-muted ${filter === "accepted" ? "" : "@4xl:table-cell"}`, a.building ?? "");
  const applied = el("td", "hidden whitespace-nowrap px-3 py-2.5 @xl:px-4 tabular-nums text-muted @xl:table-cell", day(a.appliedAt));
  const st = el("td", "px-3 py-2.5 @xl:px-4");
  if (acty) {
    // Accepted learners: where they are, and Claude's recommendation once there is one.
    const tags = el("div", "flex flex-col items-start gap-1");
    add(tags, el("span", `tag whitespace-nowrap text-[12px] ${STAGE_TAG[acty.stage]}`, STAGE_LABEL[acty.stage]));
    if (rec) add(tags, el("span", `tag whitespace-nowrap text-[12px] ${VERDICT_TAG[rec.verdict]}`, VERDICT_LABEL[rec.verdict]));
    add(st, tags);
  } else {
    const tag = el("span", "");
    status(tag, a);
    add(st, tag);
  }
  const act = el("td", "px-3 py-2.5 @xl:px-4 text-right");
  const view = el("button", "btn btn-sm btn-outline", "View") as HTMLButtonElement;
  view.type = "button";
  view.setAttribute("aria-label", `View ${a.name || a.email}`);
  add(act, view);
  add(tr, pick, name, email, building, applied, st, act);
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
  td.colSpan = 7;
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

  shownNow = shown;
  activitySection.hidden = filter !== "accepted";
  selectCol.hidden = filter !== "accepted";
  document.querySelector('th[data-col="building"]')?.classList.toggle("@4xl:table-cell", filter !== "accepted");
  drawActivity();
  drawBulk();
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

// ---- Activity, reminders, recommendations, bulk remove (Accepted tab) ----
let shownNow: Applicant[] = [];
const activitySection = document.querySelector<HTMLElement>("[data-activity]")!;
const selectCol = document.querySelector<HTMLElement>("[data-select-col]")!;
const selectAll = document.querySelector<HTMLInputElement>("[data-select-all]")!;
const summaryEl = document.querySelector<HTMLElement>("[data-activity-summary]")!;
const activityNote = document.querySelector<HTMLElement>("[data-activity-note]")!;
const recommendBtn = document.querySelector<HTMLButtonElement>("[data-recommend]")!;
const remindBtn = document.querySelector<HTMLButtonElement>("[data-remind]")!;
const bulk = document.querySelector<HTMLElement>("[data-bulk]")!;
const bulkCount = document.querySelector<HTMLElement>("[data-bulk-count]")!;
const bulkRemove = document.querySelector<HTMLButtonElement>("[data-bulk-remove]")!;
const selectSuggested = document.querySelector<HTMLButtonElement>("[data-select-suggested]")!;
let remindArmed = false;
let bulkArmed = false;
const setNote = (text: string, bad = false) => {
  activityNote.className = `text-[13px] ${bad ? "text-bad" : "text-muted"}`;
  activityNote.textContent = text;
};

function drawActivity() {
  if (activityError) { summaryEl.textContent = activityError; remindBtn.disabled = recommendBtn.disabled = true; return; }
  const list = [...activity.values()];
  const by = (s: Stage[]) => list.filter((a) => s.includes(a.stage)).length;
  const due = list.filter((a) => a.reminderDue).length;
  summaryEl.textContent = list.length
    ? `${list.length} accepted · ${by(["not_signed_in"])} not signed in · ${by(["signed_in"])} signed in · ${by(["ai_connected"])} AI connected · ${by(["checked", "deployed", "live"])} past their first check`
    : "No accepted learners yet.";
  if (!remindArmed) remindBtn.textContent = due ? `Send reminders (${due} due)` : "No reminders due";
  remindBtn.disabled = !due;
  const suggested = [...recs.values()].filter((r) => r.verdict === "consider_removing").length;
  selectSuggested.hidden = !suggested;
  selectSuggested.textContent = `Select Claude's "consider removing" (${suggested})`;
}

function drawBulk() {
  for (const e of [...selected]) if (!people.find((p) => p.email === e && p.acceptedAt)) selected.delete(e);
  const n = selected.size;
  bulk.hidden = filter !== "accepted" || (!n && !recs.size);
  bulkCount.textContent = n ? `${n} selected` : "Tick people to remove several at once.";
  bulkRemove.disabled = !n;
  if (!bulkArmed) bulkRemove.textContent = n ? `Remove access (${n})` : "Remove access";
  const pickable = shownNow.filter((p) => p.acceptedAt);
  selectAll.checked = pickable.length > 0 && pickable.every((p) => selected.has(p.email));
  selectAll.indeterminate = !selectAll.checked && pickable.some((p) => selected.has(p.email));
}

selectAll.addEventListener("change", () => {
  for (const p of shownNow) if (p.acceptedAt) selectAll.checked ? selected.add(p.email) : selected.delete(p.email);
  draw();
});
document.querySelector("[data-bulk-clear]")!.addEventListener("click", () => { selected.clear(); draw(); });
selectSuggested.addEventListener("click", () => {
  for (const r of recs.values()) if (r.verdict === "consider_removing") selected.add(r.email);
  draw();
});

async function loadActivity() {
  const { ok, data } = await api<{ activity: Activity[] }>("/api/admin/applicants/activity");
  activityError = ok ? "" : data.error ?? "Couldn't load activity.";
  if (ok) activity = new Map(data.activity.map((a) => [a.email, a]));
  draw();
}

// Reminders: two clicks. The server re-checks who is due, so nobody gets one twice.
remindBtn.addEventListener("click", async () => {
  const due = [...activity.values()].filter((a) => a.reminderDue).length;
  if (!due) return;
  if (!remindArmed) {
    remindArmed = true;
    remindBtn.textContent = `Confirm: email ${due}`;
    setNote(`Sends a reminder for the step each of them is on to ${due} ${due === 1 ? "person" : "people"}.`);
    setTimeout(() => { if (remindArmed && !remindBtn.disabled) { remindArmed = false; drawActivity(); } }, 6000);
    return;
  }
  remindArmed = false;
  remindBtn.disabled = true;
  remindBtn.textContent = "Sending…";
  const { ok, data } = await api<{ sent: string[]; failed: string[] }>("/api/admin/applicants/remind", { method: "POST", body: {} });
  if (!ok) setNote(data.error ?? "Reminders didn't send. Try again.", true);
  else setNote(`Sent ${data.sent.length} reminder${data.sent.length === 1 ? "" : "s"}.${data.failed.length ? ` ${data.failed.length} failed: ${data.failed.join(", ")}.` : ""}`, data.failed.length > 0);
  await loadActivity();
});

recommendBtn.addEventListener("click", async () => {
  recommendBtn.disabled = true;
  recommendBtn.textContent = "Reviewing…";
  setNote("Claude is reading everyone's activity. This takes up to a minute.");
  const { ok, data } = await api<{ model: string; reviewed: number; recommendations: Recommendation[] }>("/api/admin/applicants/recommend", { method: "POST", body: {} });
  recommendBtn.disabled = false;
  recommendBtn.textContent = "Recommend again";
  if (!ok) { setNote(data.error ?? "That didn't work. Try again.", true); return; }
  recs = new Map(data.recommendations.map((r) => [r.email, r]));
  const n = (v: Verdict) => data.recommendations.filter((r) => r.verdict === v).length;
  setNote(`${data.model} reviewed ${data.reviewed}: ${n("keep")} keep, ${n("nudge")} nudge, ${n("consider_removing")} consider removing. Recommendations only: nothing changes until you remove someone.`);
  draw();
  if (open && sheet.open) fillSheet(open);
});

// Bulk remove: two clicks, names listed before the second.
bulkRemove.addEventListener("click", async () => {
  const emails = [...selected];
  if (!emails.length) return;
  if (!bulkArmed) {
    bulkArmed = true;
    bulkRemove.textContent = `Confirm: remove ${emails.length}`;
    setNote(`${emails.join(", ")} will lose access to the dashboard and their AI tool connection. No email is sent; they go back to Waiting.`);
    setTimeout(() => { if (bulkArmed && !bulkRemove.disabled) { bulkArmed = false; drawBulk(); } }, 8000);
    return;
  }
  bulkArmed = false;
  bulkRemove.disabled = true;
  bulkRemove.textContent = "Removing…";
  const { ok, data } = await api<{ removed: string[]; accepted: number }>("/api/admin/applicants/remove", { method: "POST", body: { emails } });
  if (!ok) { setNote(data.error ?? "That didn't work. Try again.", true); drawBulk(); return; }
  for (const e of data.removed) {
    const p = people.find((x) => x.email === e);
    if (p) p.acceptedAt = null;
    selected.delete(e);
    activity.delete(e);
    recs.delete(e);
  }
  setNote(`Removed access for ${data.removed.length}. ${data.accepted} still accepted.`);
  draw();
});

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
  await loadActivity();
})();
