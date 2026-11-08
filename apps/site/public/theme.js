// Theme switch: follows the system until the user picks, then remembers it.
// Loaded in <head> (not deferred) so the saved theme applies before first paint.
(() => {
  const KEY = "lw-theme";
  const root = document.documentElement;
  const media = matchMedia("(prefers-color-scheme: dark)");
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch {}
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;

  const current = () => root.dataset.theme || (media.matches ? "dark" : "light");
  const sync = () => {
    const dark = current() === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
      b.setAttribute("aria-pressed", String(dark));
      b.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    });
  };

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme-toggle]");
    if (!btn) return;
    const next = current() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch {}
    sync();
  });
  document.addEventListener("DOMContentLoaded", sync);
  media.addEventListener("change", sync);
})();
