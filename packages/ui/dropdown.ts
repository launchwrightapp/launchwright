// Behavior for Dropdown.astro (searchable listbox) and [data-popover] menus.
// Keyboard: ArrowUp/Down move, Enter picks, Escape closes and returns focus.

const openOnes = new Set<() => void>();
const closeAll = (except?: () => void) => openOnes.forEach((c) => c !== except && c());

function initDropdown(root: HTMLElement) {
  const trigger = root.querySelector<HTMLButtonElement>("[data-dropdown-trigger]")!;
  const pop = root.querySelector<HTMLElement>("[data-dropdown-pop]")!;
  const search = root.querySelector<HTMLInputElement>("[data-dropdown-search]")!;
  const empty = root.querySelector<HTMLElement>("[data-dropdown-empty]")!;
  const options = [...root.querySelectorAll<HTMLElement>('[role="option"]')];
  const label = trigger.getAttribute("aria-label")!.split(":")[0];
  let active = -1;

  const visible = () => options.filter((o) => !o.hidden);
  const setActive = (i: number) => {
    const list = visible();
    options.forEach((o) => o.removeAttribute("data-active"));
    if (!list.length) return search.removeAttribute("aria-activedescendant");
    active = (i + list.length) % list.length;
    list[active].setAttribute("data-active", "");
    list[active].scrollIntoView({ block: "nearest" });
    search.setAttribute("aria-activedescendant", list[active].id);
  };
  const close = (focus = false) => {
    if (pop.hidden) return;
    pop.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    openOnes.delete(close);
    if (focus) trigger.focus();
  };
  const open = () => {
    closeAll(close);
    pop.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    search.value = "";
    filter();
    setActive(Math.max(0, visible().findIndex((o) => o.getAttribute("aria-selected") === "true")));
    search.focus();
    openOnes.add(close);
  };
  const filter = () => {
    const q = search.value.trim().toLowerCase();
    options.forEach((o) => (o.hidden = !!q && !o.textContent!.toLowerCase().includes(q)));
    empty.hidden = visible().length > 0;
    setActive(0);
  };
  const pick = (o: HTMLElement) => {
    options.forEach((x) => x.setAttribute("aria-selected", String(x === o)));
    const text = o.querySelector("[data-dropdown-label]")!.textContent!;
    root.querySelector("[data-dropdown-value]")!.textContent = text;
    trigger.setAttribute("aria-label", `${label}: ${text}`);
    document.dispatchEvent(new CustomEvent("lw:dropdown-change", { detail: { name: root.dataset.name, value: o.dataset.value } }));
    close(true);
  };

  trigger.addEventListener("click", () => (pop.hidden ? open() : close()));
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); }
  });
  search.addEventListener("input", filter);
  search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Enter") { e.preventDefault(); const o = visible()[active]; if (o) pick(o); }
    else if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "Tab") close();
  });
  options.forEach((o) => {
    o.addEventListener("click", () => pick(o));
    o.addEventListener("mousemove", () => setActive(visible().indexOf(o)));
  });
  document.addEventListener("click", (e) => { if (!root.contains(e.target as Node)) close(); });
}

// Simple popover menus: a [data-popover-trigger] button and a [data-popover-panel].
function initPopover(root: HTMLElement) {
  const trigger = root.querySelector<HTMLButtonElement>("[data-popover-trigger]")!;
  const panel = root.querySelector<HTMLElement>("[data-popover-panel]")!;
  const close = (focus = false) => {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    openOnes.delete(close);
    if (focus) trigger.focus();
  };
  const open = () => {
    closeAll(close);
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    openOnes.add(close);
  };
  trigger.addEventListener("click", () => (panel.hidden ? open() : close()));
  panel.addEventListener("click", (e) => { if ((e.target as Element).closest("a")) close(); });
  root.addEventListener("keydown", (e) => { if (e.key === "Escape") close(true); });
  document.addEventListener("click", (e) => { if (!root.contains(e.target as Node)) close(); });
}

document.querySelectorAll<HTMLElement>("[data-dropdown]").forEach(initDropdown);
document.querySelectorAll<HTMLElement>("[data-popover]").forEach(initPopover);
