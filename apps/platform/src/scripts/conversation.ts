// Shared by the learner's Messages page and the team inbox.
// Message text comes from people (and from email), so it's only ever set with textContent.

export interface Message { id: number; direction: "in" | "out"; via: "platform" | "email"; author: string | null; body: string; at: string }

// appendChild, not append(): the worker types in this project override Element.append.
export const add = (parent: Node, ...kids: Node[]) => kids.forEach((k) => parent.appendChild(k));

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// mine: which direction sits on the right (the person reading).
export function renderMessage(m: Message, mine: "in" | "out", label: (m: Message) => string) {
  const right = m.direction === mine;
  const li = document.createElement("li");
  li.className = right ? "flex flex-col items-end gap-1" : "flex flex-col items-start gap-1";
  const meta = document.createElement("p");
  meta.className = "px-1 text-[13px] text-muted";
  meta.textContent = `${label(m)} · ${when(m.at)}${m.via === "email" ? " · by email" : ""}`;
  const bubble = document.createElement("p");
  bubble.className = right
    ? "max-w-[min(36rem,100%)] whitespace-pre-wrap break-words rounded-[20px] rounded-br-md bg-ink px-4 py-3 text-on-ink"
    : "max-w-[min(36rem,100%)] whitespace-pre-wrap break-words rounded-[20px] rounded-bl-md border border-line bg-surface-2 px-4 py-3";
  bubble.textContent = m.body;
  add(li, meta, bubble);
  return li;
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  try {
    const res = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "content-type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
    });
    const data = (await res.json().catch(() => ({ error: "Unexpected response. Please try again." }))) as T & { error?: string };
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "You seem to be offline. Please try again." } as T & { error?: string } };
  }
}

// Ctrl/Cmd+Enter sends.
export function submitOnShortcut(form: HTMLFormElement) {
  form.querySelector("textarea")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
}
