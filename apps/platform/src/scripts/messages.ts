// Learner's Messages page: load the conversation with the team and send new messages.
import { add, api, renderMessage, submitOnShortcut, type Message } from "./conversation";

const list = document.querySelector<HTMLOListElement>("[data-thread]")!;
const empty = document.querySelector<HTMLElement>("[data-thread-empty]")!;
const note = document.querySelector<HTMLElement>("[data-email-note]")!;
const form = document.querySelector<HTMLFormElement>("[data-message-form]")!;
const status = document.querySelector<HTMLElement>("[data-message-status]")!;
const button = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
const box = form.querySelector<HTMLTextAreaElement>("textarea")!;

const label = (m: Message) => (m.direction === "in" ? "You" : `${m.author ?? "launchwright"} · launchwright`);
const show = (m: Message) => {
  add(list, renderMessage(m, "in", label));
  empty.hidden = true;
};
const say = (text: string, bad = false) => {
  status.textContent = text;
  status.className = bad ? "text-[15px] text-bad" : "text-[15px] text-muted";
};

async function load() {
  const { ok, data } = await api<{ email: string | null; messages: Message[] }>("/api/messages");
  list.setAttribute("aria-busy", "false");
  if (!ok) {
    empty.textContent = data.error ?? "Couldn't load your messages.";
    return;
  }
  note.textContent = data.email
    ? `We reply here and by email to ${data.email}.`
    : "GitHub didn't share an email with us, so our replies show up here only.";
  list.replaceChildren();
  data.messages.forEach(show);
  empty.hidden = data.messages.length > 0;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = box.value.trim();
  if (!body) return say("Write a message first.", true);
  button.disabled = true;
  say("Sending…");
  const { ok, data } = await api<{ message: Message }>("/api/messages", { method: "POST", body: { body } });
  button.disabled = false;
  if (!ok) return say(data.error ?? "That didn't send. Please try again.", true);
  show(data.message);
  box.value = "";
  say("Sent. We usually answer within a day.");
});
submitOnShortcut(form);
load();
