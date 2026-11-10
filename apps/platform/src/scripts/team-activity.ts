// Learner activity for the team: learners, tools and recent entries, plus a sheet with one
// learner's full timeline and lessons. Everything comes from our API but includes text the
// learner's AI tool wrote (summaries, repo names), so it's always set as text, never HTML.
import { api } from "./conversation";

interface Learner {
  githubId: string; name: string | null; email: string | null; login: string | null; accepted: boolean;
  aiCalls: number; actions: number; errors: number; blocked: number; clients: string[]; repos: string[];
  firstAt: string | null; lastAt: string | null; concepts: number; exercises: number;
}
interface Tool { tool: string; calls: number; people: number; errors: number; blocked: number; lastAt: string | null }
interface Entry { actor: string; client: string | null; tool: string; repo: string | null; summary: string; outcome: string; at: string | null }
interface RecentEntry extends Entry { githubId: string; name: string | null; email: string | null }
interface Report { learners: Learner[]; tools: Tool[]; recent: RecentEntry[]; notSignedIn: number; recentLimit: number; sample?: boolean }
interface Lesson { key: string; title: string; module: string; exercise: boolean; timesSeen: number; firstSeen: string | null; lastSeen: string | null }
interface Detail { timeline: Entry[]; lessons: Lesson[]; limit: number }

const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s)!;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const cell = "px-3 py-2.5 @xl:px-4";
const num = (n: number) => n.toLocaleString();

// "3 min ago", "yesterday", "Nov 2". Full date and time on hover.
function ago(iso: string | null) {
  if (!iso) return "–";
  const ms = Date.now() - Date.parse(iso);
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
const full = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "");
const who = (x: { name: string | null; email: string | null; login?: string | null; githubId: string }) =>
  x.name || x.login || x.email?.split("@")[0] || `GitHub #${x.githubId}`;

const OUTCOME: Record<string, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "tag-ok" },
  error: { label: "Error", cls: "tag-bad" },
  blocked: { label: "Blocked", cls: "tag-warn" },
  pending: { label: "Waiting for approval", cls: "tag-warn" },
};

// One audit entry: when, which tool (and which AI tool or the dashboard), repo, summary, outcome.
function entry(e: Entry, person?: { label: string; open: () => void }) {
  const li = el("li", "flex flex-col gap-1 border-b border-line px-3 py-2.5 last:border-b-0 @xl:px-4");
  const top = el("p", "flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]");
  if (person) {
    const b = el("button", "cursor-pointer font-semibold text-ink underline-offset-2 hover:underline", person.label);
    b.type = "button";
    b.addEventListener("click", person.open);
    top.appendChild(b);
  }
  top.appendChild(el("code", "font-mono text-[13px] font-semibold", e.tool));
  top.appendChild(el("span", "text-[13px] text-muted", e.actor === "ai" ? `via ${e.client ?? "AI tool"}` : e.actor === "learner" ? "on the dashboard" : "by launchwright"));
  const o = OUTCOME[e.outcome];
  if (o && e.outcome !== "ok") top.appendChild(el("span", `tag ${o.cls} text-[12px]`, o.label));
  const time = el("time", "ml-auto text-[13px] tabular-nums text-muted", ago(e.at));
  if (e.at) { time.dateTime = e.at; time.title = full(e.at); }
  top.appendChild(time);
  li.appendChild(top);
  li.appendChild(el("p", "break-words text-[14px]", e.summary));
  if (e.repo) li.appendChild(el("p", "font-mono text-[12px] text-muted", e.repo));
  return li;
}

const statusEl = $("[data-status]");
const totalsEl = $("[data-totals]");
const learnersEl = $("[data-learners]");
const toolsEl = $("[data-tools]");
const recentEl = $("[data-recent]");
const searchEl = $<HTMLInputElement>("[data-search]");
let report: Report | null = null;

function learnerRow(l: Learner) {
  const tr = el("tr", "cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-3/50");
  tr.dataset.learner = l.githubId;
  const name = el("td", cell);
  const btn = el("button", "block max-w-full cursor-pointer truncate text-left font-semibold text-ink", who(l));
  btn.type = "button";
  btn.addEventListener("click", (e) => { e.stopPropagation(); openSheet(l); });
  name.appendChild(btn);
  const sub = [l.email ?? `GitHub #${l.githubId}`, l.repos.length ? l.repos.join(", ") : ""].filter(Boolean).join(" · ");
  name.appendChild(el("span", "block max-w-[28rem] truncate text-[13px] text-muted", sub));
  tr.appendChild(name);
  tr.appendChild(el("td", `${cell} hidden @3xl:table-cell text-muted`, l.clients.join(", ") || "–"));
  tr.appendChild(el("td", `${cell} text-right font-semibold tabular-nums`, num(l.aiCalls)));
  tr.appendChild(el("td", `${cell} hidden @xl:table-cell text-right tabular-nums ${l.errors ? "text-bad" : "text-muted"}`, num(l.errors)));
  tr.appendChild(el("td", `${cell} hidden @2xl:table-cell text-right tabular-nums`, num(l.concepts)));
  tr.appendChild(el("td", `${cell} hidden @2xl:table-cell text-right tabular-nums`, num(l.exercises)));
  const last = el("td", `${cell} text-right tabular-nums text-muted`, ago(l.lastAt));
  last.title = full(l.lastAt);
  tr.appendChild(last);
  tr.addEventListener("click", () => openSheet(l));
  return tr;
}

function drawLearners() {
  if (!report) return;
  const q = searchEl.value.trim().toLowerCase();
  const list = report.learners.filter((l) => !q || [l.name, l.email, l.login, l.githubId, ...l.repos, ...l.clients].some((v) => v?.toLowerCase().includes(q)));
  learnersEl.replaceChildren(...list.map(learnerRow));
  if (!list.length) {
    const tr = el("tr", "");
    const td = el("td", `${cell} text-muted`, q ? "No learner matches that." : "No activity yet.");
    td.colSpan = 7;
    tr.appendChild(td);
    learnersEl.appendChild(tr);
  }
}

function drawTools(tools: Tool[]) {
  toolsEl.replaceChildren(...tools.map((t) => {
    const tr = el("tr", "border-b border-line last:border-b-0");
    tr.dataset.tool = t.tool;
    const name = el("td", cell);
    name.appendChild(el("code", "font-mono text-[13px] font-semibold", t.tool));
    tr.appendChild(name);
    tr.appendChild(el("td", `${cell} text-right font-semibold tabular-nums`, num(t.calls)));
    tr.appendChild(el("td", `${cell} text-right tabular-nums`, num(t.people)));
    tr.appendChild(el("td", `${cell} hidden @xl:table-cell text-right tabular-nums ${t.errors ? "text-bad" : "text-muted"}`, num(t.errors)));
    tr.appendChild(el("td", `${cell} hidden @xl:table-cell text-right tabular-nums text-muted`, num(t.blocked)));
    const last = el("td", `${cell} hidden @2xl:table-cell text-right tabular-nums text-muted`, ago(t.lastAt));
    last.title = full(t.lastAt);
    tr.appendChild(last);
    return tr;
  }));
  if (!tools.length) {
    const tr = el("tr", "");
    const td = el("td", `${cell} text-muted`, "No AI tool calls yet.");
    td.colSpan = 6;
    tr.appendChild(td);
    toolsEl.appendChild(tr);
  }
}

function drawRecent(recent: RecentEntry[]) {
  const byId = new Map(report?.learners.map((l) => [l.githubId, l]));
  recentEl.replaceChildren(...recent.map((r) => entry(r, { label: who(r), open: () => openSheet(byId.get(r.githubId) ?? { ...emptyLearner, githubId: r.githubId, name: r.name, email: r.email }) })));
  if (!recent.length) recentEl.appendChild(el("li", `${cell} text-muted`, "Nothing yet."));
}

const emptyLearner: Learner = { githubId: "", name: null, email: null, login: null, accepted: false, aiCalls: 0, actions: 0, errors: 0, blocked: 0, clients: [], repos: [], firstAt: null, lastAt: null, concepts: 0, exercises: 0 };

async function load() {
  const { ok, data } = await api<Report>("/api/admin/activity");
  for (const b of [learnersEl, toolsEl, recentEl]) b.setAttribute("aria-busy", "false");
  if (!ok) {
    statusEl.textContent = data.error ?? "Couldn't load activity.";
    totalsEl.textContent = "–";
    return;
  }
  report = data;
  const calls = data.tools.reduce((n, t) => n + t.calls, 0);
  const active = data.learners.filter((l) => l.aiCalls > 0).length;
  totalsEl.textContent = `${num(calls)} AI call${calls === 1 ? "" : "s"} · ${active} of ${data.learners.length} active`;
  $("[data-count='learners']").textContent = String(data.learners.length);
  $("[data-count='tools']").textContent = String(data.tools.length);
  $("[data-count='recent']").textContent = String(data.recent.length);
  $("[data-not-signed-in]").textContent = data.notSignedIn
    ? `${data.notSignedIn} accepted ${data.notSignedIn === 1 ? "person hasn't" : "people haven't"} signed in yet, so they aren't listed.`
    : "Everyone accepted has signed in.";
  $("[data-sample]").classList.toggle("hidden", !data.sample);
  drawLearners();
  drawTools(data.tools);
  drawRecent(data.recent);
}

// The sheet: one learner's timeline and lessons.
const sheet = $<HTMLDialogElement>("[data-sheet]");
const timelineEl = $("[data-sheet-timeline]");
const lessonsEl = $("[data-sheet-lessons]");
const noteEl = $("[data-sheet-note]");
let openId = "";

async function openSheet(l: Learner) {
  openId = l.githubId;
  $("[data-sheet-name]").textContent = who(l);
  $("[data-sheet-meta]").textContent = [l.email, l.login ? `@${l.login}` : null, `GitHub #${l.githubId}`, l.accepted ? null : "not on the pilot list"].filter(Boolean).join(" · ");
  const bits = [
    `${num(l.aiCalls)} AI call${l.aiCalls === 1 ? "" : "s"}`,
    `${num(l.actions)} dashboard action${l.actions === 1 ? "" : "s"}`,
    l.errors ? `${num(l.errors)} error${l.errors === 1 ? "" : "s"}` : null,
    l.clients.length ? `uses ${l.clients.join(", ")}` : null,
    l.firstAt ? `first seen ${ago(l.firstAt)}` : null,
  ];
  $("[data-sheet-stats]").textContent = bits.filter(Boolean).join(" · ");
  timelineEl.replaceChildren();
  lessonsEl.replaceChildren();
  $("[data-sheet-count='timeline']").textContent = "";
  $("[data-sheet-count='lessons']").textContent = "";
  noteEl.hidden = false;
  noteEl.textContent = "Loading…";
  $<HTMLButtonElement>("#sheet-tab-timeline").click(); // every learner opens on the timeline
  if (!sheet.open) sheet.showModal();

  const { ok, data } = await api<Detail>(`/api/admin/activity/learner?id=${encodeURIComponent(l.githubId)}`);
  if (openId !== l.githubId) return; // another learner was opened meanwhile
  if (!ok) {
    noteEl.textContent = data.error ?? "Couldn't load this learner.";
    return;
  }
  $("[data-sheet-count='timeline']").textContent = String(data.timeline.length);
  $("[data-sheet-count='lessons']").textContent = String(data.lessons.length);
  noteEl.hidden = data.timeline.length > 0 && data.timeline.length < data.limit;
  noteEl.textContent = !data.timeline.length ? "No tool calls or dashboard actions yet." : `Showing the latest ${data.limit}.`;
  timelineEl.replaceChildren(...data.timeline.map((e) => entry(e)));

  if (!data.lessons.length) lessonsEl.appendChild(el("li", "py-2 text-[14px] text-muted", "No lessons yet. A lesson counts the first time one of their tool calls teaches it."));
  for (const x of data.lessons) {
    const li = el("li", "flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line py-2.5 text-[14px] last:border-b-0");
    li.appendChild(el("span", "font-semibold", x.title));
    if (x.exercise) li.appendChild(el("span", "tag tag-ok text-[12px]", "Exercise done"));
    li.appendChild(el("span", "text-[13px] text-muted", x.module));
    const when = el("span", "ml-auto text-[13px] tabular-nums text-muted", x.exercise ? ago(x.firstSeen) : `${x.timesSeen}× · first ${ago(x.firstSeen)}`);
    when.title = `First ${full(x.firstSeen)}\nLast ${full(x.lastSeen)}`;
    li.appendChild(when);
    lessonsEl.appendChild(li);
  }
}

$("[data-sheet-close]").addEventListener("click", () => sheet.close());
sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
sheet.addEventListener("close", () => (openId = ""));
searchEl.addEventListener("input", drawLearners);

void load();
