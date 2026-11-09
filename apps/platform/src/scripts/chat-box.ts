// Floating "Message us" box (components/ChatBox.astro). Same conversation as the
// Messages page: it loads when you first open the box, and stays open across pages
// until you close it; minimize keeps just the title bar. A dot on the launcher means the team replied since you last looked.
import { add, api, initComposer, renderMessage, type Message } from "./conversation";

const root = document.querySelector<HTMLElement>("[data-chat]");
if (root) init(root);

function init(root: HTMLElement) {
  const launcher = root.querySelector<HTMLAnchorElement>("[data-chat-open]")!;
  const panel = root.querySelector<HTMLElement>("#chat-panel")!;
  const scroller = root.querySelector<HTMLElement>("[data-chat-scroll]")!;
  const list = root.querySelector<HTMLOListElement>("[data-chat-thread]")!;
  const empty = root.querySelector<HTMLElement>("[data-chat-empty]")!;
  const unread = root.querySelector<HTMLElement>("[data-chat-unread]")!;
  const form = root.querySelector<HTMLFormElement>("[data-chat-form]")!;
  const composer = initComposer(form);

  const store = {
    get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} },
  };
  const OPEN = "chat-open";
  const SEEN = "chat-seen"; // time of the newest team reply you've seen

  const label = (m: Message) => (m.direction === "in" ? "You" : `${m.author ?? "launchwright"} · launchwright`);
  const toBottom = () => (scroller.scrollTop = scroller.scrollHeight);
  const show = (m: Message) => {
    add(list, renderMessage(m, "in", label));
    empty.hidden = true;
  };
  const lastReply = (ms: Message[]) => ms.filter((m) => m.direction === "out").at(-1)?.at ?? "";

  let loaded = false;
  let messages: Message[] = [];

  async function fetchThread() {
    const { ok, data } = await api<{ messages: Message[] }>("/api/messages");
    list.setAttribute("aria-busy", "false");
    if (!ok) {
      empty.textContent = data.error ?? "Couldn't load your messages.";
      empty.hidden = false;
      return false;
    }
    messages = data.messages;
    return true;
  }

  function render() {
    list.replaceChildren();
    messages.forEach(show);
    empty.hidden = messages.length > 0;
    toBottom();
  }

  function markSeen() {
    const t = lastReply(messages);
    if (t) store.set(SEEN, t);
    unread.hidden = true;
  }

  const body = root.querySelector<HTMLElement>("[data-chat-body]")!;
  const minBtn = root.querySelector<HTMLButtonElement>("[data-chat-min]")!;

  // Minimized: only the title bar stays, so it's one click to get back to the conversation.
  function minimize(on: boolean) {
    body.hidden = on;
    minBtn.setAttribute("aria-expanded", String(!on));
    minBtn.setAttribute("aria-label", on ? "Expand" : "Minimize");
    minBtn.title = on ? "Expand" : "Minimize";
    store.set(OPEN, on ? "min" : "1");
    if (!on) {
      toBottom();
      markSeen();
    }
  }

  async function open(focus = true, min = false) {
    panel.hidden = false;
    launcher.hidden = true;
    launcher.setAttribute("aria-expanded", "true");
    minimize(min);
    if (focus) composer.focus();
    if (!loaded) {
      loaded = await fetchThread();
      if (loaded) render();
    }
    if (!min) {
      toBottom();
      markSeen();
    }
  }

  function close() {
    panel.hidden = true;
    launcher.hidden = false;
    launcher.setAttribute("aria-expanded", "false");
    store.set(OPEN, "");
    launcher.focus();
  }

  launcher.addEventListener("click", (e) => {
    e.preventDefault();
    void open();
  });
  minBtn.addEventListener("click", () => {
    const on = !body.hidden;
    minimize(on);
    if (!on) composer.focus();
  });
  root.querySelector("[data-chat-close]")!.addEventListener("click", close);
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = composer.value();
    if (!body) return composer.say("Write a message first.", true);
    composer.busy(true);
    composer.say("Sending…");
    const { ok, data } = await api<{ message: Message }>("/api/messages", { method: "POST", body: { body } });
    composer.busy(false);
    if (!ok) return composer.say(data.error ?? "That didn't send. Please try again.", true);
    messages.push(data.message);
    show(data.message);
    toBottom();
    composer.clear();
    composer.say("Sent. We usually answer within a day.");
  });

  // Reopen if you left it open on the last page. Otherwise check for a new reply, once
  // the dashboard has loaded and only if this server has a database to ask.
  const saved = store.get(OPEN);
  if (saved === "1" || saved === "min") void open(false, saved === "min");
  else
    document.addEventListener(
      "learner-loaded",
      async (e) => {
        if (!(e as CustomEvent<{ configured?: { database?: boolean } }>).detail.configured?.database || loaded) return;
        if (!(await fetchThread()) || loaded) return;
        loaded = true;
        render();
        const t = lastReply(messages);
        unread.hidden = !t || t <= (store.get(SEEN) ?? "");
      },
      { once: true },
    );
}
