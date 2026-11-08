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

// Explanation level (platform): "simple" for beginners, "tech" for developers.
// Same pattern as the theme: applied before first paint, remembered per browser.
// The control is a Dropdown (name="level"); it reports picks with lw:dropdown-change.
(() => {
  const KEY = "lw-level";
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch {}
  root.dataset.level = saved === "tech" ? "tech" : "simple";

  // Show the saved level in every level dropdown (the HTML ships with "simple").
  const sync = () => {
    document.querySelectorAll('[data-dropdown][data-name="level"]').forEach((dd) => {
      const opt = dd.querySelector(`[role="option"][data-value="${root.dataset.level}"]`);
      if (!opt) return;
      dd.querySelectorAll('[role="option"]').forEach((o) => o.setAttribute("aria-selected", String(o === opt)));
      const text = opt.querySelector("[data-dropdown-label]").textContent;
      dd.querySelector("[data-dropdown-value]").textContent = text;
      const t = dd.querySelector("[data-dropdown-trigger]");
      t.setAttribute("aria-label", t.getAttribute("aria-label").split(":")[0] + ": " + text);
    });
  };
  document.addEventListener("lw:dropdown-change", (e) => {
    if (e.detail.name !== "level") return;
    root.dataset.level = e.detail.value === "tech" ? "tech" : "simple";
    try { localStorage.setItem(KEY, root.dataset.level); } catch {}
  });
  document.addEventListener("DOMContentLoaded", sync);
})();
