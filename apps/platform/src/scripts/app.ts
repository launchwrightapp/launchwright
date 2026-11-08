import "../../../../packages/ui/dropdown";

// Dashboard behavior. Everything works without this file; it only adds polish.

// Copy buttons next to prompts and commands.
document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
  if (!navigator.clipboard) return;
  btn.hidden = false;
  btn.addEventListener("click", async () => {
    const text = btn.parentElement?.querySelector("[data-copy-text]")?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text.trim());
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Select and copy";
    }
    setTimeout(() => (btn.textContent = "Copy"), 1600);
  });
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
  select(tabs.find((t) => t.getAttribute("aria-selected") === "true") ?? tabs[0]);
}
document.querySelectorAll<HTMLElement>("[data-tabs]").forEach(initTabs);

// Approve / Reject are a demo: show what would happen instead of doing anything.
document.querySelectorAll<HTMLButtonElement>("[data-decide]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const status = document.getElementById(btn.dataset.decide!);
    if (status) status.textContent = btn.value === "approve"
      ? "Sample only: in the real app, the migration would run now and this would be logged."
      : "Sample only: in the real app, Claude Code would be told no and nothing would change.";
  });
});
