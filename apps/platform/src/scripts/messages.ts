// Learner's Messages page: load the conversation with the team and send new messages.
import { add, api, initComposer, renderMessage, type Message } from "./conversation";

const list = document.querySelector<HTMLOListElement>("[data-thread]")!;
const empty = document.querySelector<HTMLElement>("[data-thread-empty]")!;
const note = document.querySelector<HTMLElement>("[data-email-note]")!;
const form = document.querySelector<HTMLFormElement>("[data-message-form]")!;
const composer = initComposer(form);

const label = (m: Message) => (m.direction === "in" ? "You" : `${m.author ?? "launchwright"} · launchwright`);
const show = (m: Message) => {
  add(list, renderMessage(m, "in", label));
  empty.hidden = true;
};
const say = composer.say;

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
  const body = composer.value();
  if (!body) return say("Write a message first.", true);
  composer.busy(true);
  say("Sending…");
  const { ok, data } = await api<{ message: Message }>("/api/messages", { method: "POST", body: { body } });
  composer.busy(false);
  if (!ok) return say(data.error ?? "That didn't send. Please try again.", true);
  show(data.message);
  composer.clear();
  say("Sent. We usually answer within a day.");
});
load();
