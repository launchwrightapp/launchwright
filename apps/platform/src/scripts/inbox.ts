// Team inbox: every conversation, newest first. Pick one, read it, and reply.
// Replies are emailed from hello@launchwright.app and show on the learner's Messages page.
import { add, api, initComposer, renderMessage, type Message } from "./conversation";

interface Summary { id: number; email: string | null; login: string | null; name: string; subject: string; unread: boolean; at: string; preview: string; waiting: boolean }
interface Thread { id: number; email: string | null; login: string | null; name: string; subject: string }

const listEl = document.querySelector<HTMLUListElement>("[data-threads]")!;
const views = [...document.querySelectorAll<HTMLButtonElement>("[data-view] [data-show]")];
const search = document.querySelector<HTMLInputElement>("[data-search]")!;
const waitingTag = document.querySelector<HTMLElement>("[data-waiting-tag]")!;
type View = "all" | "waiting" | "unread";
let view: View = "all";
const pane = document.querySelector<HTMLElement>("[data-pane]")!;
const paneEmpty = document.querySelector<HTMLElement>("[data-pane-empty]")!;
const title = document.querySelector<HTMLElement>("[data-pane-title]")!;
const who = document.querySelector<HTMLElement>("[data-pane-who]")!;
const convo = document.querySelector<HTMLOListElement>("[data-pane-messages]")!;
const form = document.querySelector<HTMLFormElement>("[data-reply-form]")!;
const composer = initComposer(form);

let current: Thread | null = null;
let threads: Summary[] = [];

const say = composer.say;
const ago = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function note(text: string) {
  const li = document.createElement("li");
  li.className = "px-4 py-8 text-center text-[14px] text-muted";
  li.textContent = text;
  return li;
}

function drawList() {
  const waiting = threads.filter((t) => t.waiting).length;
  const counts: Record<View, number> = { all: threads.length, waiting, unread: threads.filter((t) => t.unread).length };
  for (const [k, n] of Object.entries(counts)) {
    const c = document.querySelector(`[data-count="${k}"]`);
    if (c) c.textContent = String(n);
  }
  waitingTag.textContent = waiting ? `${waiting} need${waiting === 1 ? "s" : ""} a reply` : "All caught up";
  waitingTag.className = `tag text-[14px] ${waiting ? "tag-warn" : "tag-ok"}`;

  const q = search.value.trim().toLowerCase();
  const shown = threads
    .filter((t) => view === "all" || (view === "waiting" ? t.waiting : t.unread))
    .filter((t) => !q || [t.name, t.email, t.login, t.subject, t.preview].filter(Boolean).join(" ").toLowerCase().includes(q));

  listEl.replaceChildren();
  if (!shown.length) {
    add(listEl, note(q ? "No conversations match." : view === "waiting" ? "Nothing needs a reply." : view === "unread" ? "Nothing unread." : "No messages yet."));
    return;
  }
  for (const t of shown) {
    const li = document.createElement("li");
    li.className = "border-b border-line";
    const a = document.createElement("a");
    a.href = `#thread-${t.id}`;
    a.className = "flex flex-col gap-0.5 px-4 py-2.5 text-ink no-underline hover:bg-surface-2 aria-[current=true]:bg-surface-3 dark:hover:bg-surface-3";
    if (current?.id === t.id) a.setAttribute("aria-current", "true");
    const top = document.createElement("span");
    top.className = "flex items-center gap-2";
    if (t.unread) {
      const dot = document.createElement("span");
      dot.className = "size-2 flex-none rounded-full bg-blue";
      dot.setAttribute("aria-label", "Unread");
      add(top, dot);
    }
    const name = document.createElement("span");
    name.className = `truncate text-[14px] ${t.unread ? "font-semibold" : "font-medium"}`;
    name.textContent = t.name;
    const date = document.createElement("span");
    date.className = "ml-auto flex-none text-[12px] tabular-nums text-muted";
    date.textContent = ago(t.at);
    add(top, name, date);
    const subject = document.createElement("span");
    subject.className = "flex items-center gap-2";
    const subj = document.createElement("span");
    subj.className = "truncate text-[13px] font-medium";
    subj.textContent = t.subject;
    add(subject, subj);
    if (t.waiting) {
      const badge = document.createElement("span");
      badge.className = "ml-auto flex-none rounded-sm bg-warn-bg px-1.5 text-[11px] font-semibold text-warn";
      badge.textContent = "Needs reply";
      add(subject, badge);
    }
    const preview = document.createElement("span");
    preview.className = "truncate text-[13px] text-muted";
    preview.textContent = `${t.waiting ? "" : "You: "}${t.preview}`;
    add(a, top, subject, preview);
    add(li, a);
    add(listEl, li);
  }
}

for (const b of views) {
  b.addEventListener("click", () => {
    view = b.dataset.show as View;
    for (const x of views) x.setAttribute("aria-pressed", String(x === b));
    drawList();
  });
}
search.addEventListener("input", drawList);

async function loadList() {
  const { ok, data } = await api<{ threads: Summary[] }>("/api/admin/threads");
  listEl.setAttribute("aria-busy", "false");
  if (!ok) {
    waitingTag.textContent = "Inbox unavailable";
    listEl.replaceChildren(note(data.error ?? "Couldn't load the inbox."));
    return;
  }
  threads = data.threads;
  drawList();
}

async function open(id: number) {
  const { ok, data } = await api<{ thread: Thread; messages: Message[] }>(`/api/admin/threads/${id}`);
  if (!ok) {
    paneEmpty.hidden = false;
    pane.hidden = true;
    paneEmpty.textContent = data.error ?? "Couldn't open that conversation.";
    return;
  }
  current = data.thread;
  paneEmpty.hidden = true;
  pane.hidden = false;
  title.textContent = data.thread.subject;
  who.textContent = [data.thread.name, data.thread.login && `@${data.thread.login}`, data.thread.email ?? "no email: replies show on the platform only"].filter(Boolean).join(" · ");
  convo.replaceChildren(...data.messages.map((m) => renderMessage(m, "out", (x) => (x.direction === "in" ? x.author ?? data.thread.name : `${x.author ?? "Team"} (team)`))));
  const t = threads.find((x) => x.id === id);
  if (t) t.unread = false;
  drawList();
  convo.scrollTop = convo.scrollHeight;
  say("");
  composer.focus();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!current) return;
  const body = composer.value();
  if (!body) return say("Write a reply first.", true);
  composer.busy(true);
  say("Sending…");
  const { ok, data } = await api<{ message: Message; emailed: boolean }>(`/api/admin/threads/${current.id}/reply`, { method: "POST", body: { body } });
  composer.busy(false);
  if (!ok) return say(data.error ?? "That didn't send. Please try again.", true);
  add(convo, renderMessage(data.message, "out", (x) => `${x.author ?? "Team"} (team)`));
  convo.scrollTop = convo.scrollHeight;
  composer.clear();
  say(data.emailed ? `Sent from hello@launchwright.app to ${current.email}.` : "Saved. They'll see it on their Messages page.");
  const t = threads.find((x) => x.id === current!.id);
  if (t) Object.assign(t, { waiting: false, preview: body, at: data.message.at });
  threads.sort((a, b) => b.at.localeCompare(a.at));
  drawList();
});

const fromHash = () => Number(location.hash.match(/^#thread-(\d+)$/)?.[1] ?? 0);
const openFromHash = () => {
  if (fromHash()) void open(fromHash());
};
window.addEventListener("hashchange", openFromHash);
loadList().then(openFromHash);
