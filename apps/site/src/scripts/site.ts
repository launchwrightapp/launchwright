import "../../../../packages/ui/dropdown";
import { codeForm } from "./code-form";

// Walkthrough tabs. Without JS every step stays visible, one after another.
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
      const keys: Record<string, number> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      select(tabs[(keys[e.key] + tabs.length) % tabs.length], true);
    });
  });
  select(tabs.find((t) => t.getAttribute("aria-selected") === "true") ?? tabs[0]);
}
document.querySelectorAll<HTMLElement>("[data-tabs]").forEach(initTabs);

// Active nav link: highlights the section you're reading.
// The current section is the last one whose top has passed just under the header.
// Sections without a nav link (hero, pilot form) clear the highlight.
function initScrollspy(nav: HTMLElement) {
  const links = new Map<string, HTMLAnchorElement>();
  nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => links.set(a.hash.slice(1), a));
  const sections = [...document.querySelectorAll<HTMLElement>("main > section")];
  let queued = false;

  const update = () => {
    queued = false;
    const line = 120;
    let current: HTMLElement | undefined;
    for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s;
    const active = current && links.has(current.id) ? current.id : null;
    links.forEach((a, id) => (id === active ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
  };
  const schedule = () => {
    if (!queued) (queued = true), requestAnimationFrame(update);
  };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  update();
}
document.querySelectorAll<HTMLElement>("[data-scrollspy]").forEach(initScrollspy);

// Header: slides away while you're on the footer, and comes back as soon as you scroll up.
const header = document.querySelector<HTMLElement>("[data-autohide]");
const footer = document.querySelector("footer");
if (header && footer) {
  let lastY = scrollY;
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = scrollY;
    const onFooter = footer.getBoundingClientRect().top < innerHeight * 0.85;
    if (!onFooter || y < lastY) delete header.dataset.hidden;
    else if (y > lastY) header.dataset.hidden = "";
    lastY = y;
  };
  addEventListener("scroll", () => { if (!ticking) (ticking = true), requestAnimationFrame(update); }, { passive: true });
  // Keyboard users: never leave focus inside a hidden header.
  header.addEventListener("focusin", () => delete header.dataset.hidden);
}

// Scroll reveal: fade sections in once as they enter the viewport.
const revealables = document.querySelectorAll<HTMLElement>("[data-reveal]");
if ("IntersectionObserver" in window && revealables.length && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        (e.target as HTMLElement).dataset.shown = "";
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  // Anything already on screen (or scrolled past, e.g. a #hash link) shows right away.
  revealables.forEach((el) => (el.getBoundingClientRect().top < innerHeight ? (el.dataset.shown = "") : io.observe(el)));
  document.documentElement.classList.add("reveal-on");
}

// Pilot form on the home page: sends the email code right here, then /pilot/verify.
const form = document.getElementById("waitlist") as HTMLFormElement | null;
const statusEl = document.getElementById("waitlist-status");
if (form && statusEl) codeForm(form, statusEl);
export {};
