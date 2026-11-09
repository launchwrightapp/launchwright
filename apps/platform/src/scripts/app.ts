import "../../../../packages/ui/dropdown";

// Dashboard behavior. Everything works without this file; it only adds polish.

// Copy buttons next to prompts and commands (delegated, so rows rendered later work too).
if (navigator.clipboard) document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => (btn.hidden = false));
document.addEventListener("click", async (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>("[data-copy]");
  if (!btn) return;
  const text = btn.parentElement?.querySelector("[data-copy-text]")?.textContent ?? "";
  try {
    await navigator.clipboard.writeText(text.trim());
    btn.textContent = "Copied";
  } catch {
    btn.textContent = "Select and copy";
  }
  setTimeout(() => (btn.textContent = "Copy"), 1600);
});

// Tabs: role=tab buttons with aria-controls. Without JS every panel shows.
function initTabs(list: HTMLElement) {
  const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panel = (t: HTMLButtonElement) => document.getElementById(t.getAttribute("aria-controls")!)!;
  const select = (next: HTMLButtonElement, focus = false) => {
    for (const t of tabs) {
      const on = t === next;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      panel(t).hidden = !on;
    }
    if (focus) next.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", (e) => {
      const keys: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      select(tabs[(keys[e.key] + tabs.length) % tabs.length], true);
    });
  });
  // /security#accounts opens the Accounts tab.
  // /security#connect-neon opens the tab that contains that section.
  let fromHash: HTMLButtonElement | undefined;
  if (list.hasAttribute("data-hash-tabs") && location.hash.length > 1) {
    const id = decodeURIComponent(location.hash.slice(1));
    const panel = document.getElementById(`panel-${id}`) ?? document.getElementById(id)?.closest<HTMLElement>('[role="tabpanel"]');
    fromHash = panel ? tabs.find((t) => t.getAttribute("aria-controls") === panel.id) : undefined;
  }
  select(fromHash ?? tabs.find((t) => t.getAttribute("aria-selected") === "true") ?? tabs[0]);
}
document.querySelectorAll<HTMLElement>("[data-tabs]").forEach(initTabs);

// Collapsible sections (explorer groups, bottom panel, lesson panel). The markup
// sets the default; your choice is remembered per browser.
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} },
};
document.querySelectorAll<HTMLButtonElement>("[data-collapse]").forEach((btn) => {
  const target = document.getElementById(btn.dataset.collapse!);
  if (!target) return;
  const key = `lw-collapse:${btn.dataset.collapse}`;
  const apply = (open: boolean) => {
    btn.setAttribute("aria-expanded", String(open));
    target.hidden = !open;
  };
  const saved = store.get(key);
  if (saved) apply(saved === "open");
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") !== "true";
    apply(open);
    store.set(key, open ? "open" : "closed");
  });
});

// Editor tabs: pages you've opened stay as tabs until you close them.
const strip = document.querySelector<HTMLElement>("[data-editor-tabs]");
if (strip) {
  const KEY = "lw-tabs";
  const current = strip.dataset.page!;
  const all = [...strip.querySelectorAll<HTMLElement>("[data-tab]")].map((t) => t.dataset.tab!);
  let open: string[] = [];
  try { open = JSON.parse(store.get(KEY) ?? "[]"); } catch {}
  open = open.filter((id) => all.includes(id));
  if (!open.includes(current)) open.push(current);
  const render = () => {
    strip.querySelectorAll<HTMLElement>("[data-tab]").forEach((t) => (t.hidden = !open.includes(t.dataset.tab!)));
    store.set(KEY, JSON.stringify(open));
  };
  render();
  strip.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>("[data-tab-close]");
    if (!btn) return;
    const id = btn.dataset.tabClose!;
    const i = open.indexOf(id);
    open = open.filter((x) => x !== id);
    if (id !== current) return render();
    // Closing the page you're on opens its neighbor (or Overview if none are left).
    const next = open[Math.max(0, i - 1)] ?? "overview";
    if (!open.length) open = ["overview"];
    render();
    const link = strip.querySelector<HTMLAnchorElement>(`[data-tab="${next}"] a`);
    if (link) location.href = link.href;
  });
}

// Show/hide toggles that aren't remembered (e.g. "Inspect change").
document.querySelectorAll<HTMLButtonElement>("[data-toggle]").forEach((btn) => {
  const target = document.getElementById(btn.dataset.toggle!);
  if (!target) return;
  btn.addEventListener("click", () => {
    const open = target.hidden;
    target.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  });
});

// Filter chips: show only list items whose data-kind matches.
document.querySelectorAll<HTMLElement>("[data-filter]").forEach((group) => {
  const list = document.getElementById(group.dataset.filter!);
  if (!list) return;
  const empty = list.parentElement?.querySelector<HTMLElement>("[data-filter-empty]");
  const chips = [...group.querySelectorAll<HTMLButtonElement>("[data-kind]")];
  group.addEventListener("click", (e) => {
    const chip = (e.target as Element).closest<HTMLButtonElement>("[data-kind]");
    if (!chip) return;
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
    const kind = chip.dataset.kind!;
    let shown = 0;
    list.querySelectorAll<HTMLElement>(":scope > [data-kind]").forEach((li) => {
      li.hidden = kind !== "all" && li.dataset.kind !== kind;
      if (!li.hidden) shown++;
    });
    if (empty) empty.hidden = shown > 0;
  });
});
