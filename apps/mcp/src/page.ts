// The few HTML pages this Worker serves (home, consent, errors). No inline styles or scripts:
// the stylesheet is /page.css and the theme switch is /page.js. Colors follow
// packages/ui/theme.css; the look follows the platform sign-in page.

import type { ConsentDescription } from "@cloudflare/workers-oauth-provider";

export const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Same strings for every page and route.
export const PAGE_CSP =
  "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'";

const MARK = `<svg class="mark" viewBox="17 23 126 102" fill="currentColor" aria-hidden="true"><polygon points="119.1 97.69 119.12 36.98 142.56 23.54 142.6 110.3 118.76 124.96 69.08 95.2 68.97 122.74 17.4 93.37 17.43 23.53 40.95 37.04 40.95 80.4 68.94 94.96 68.95 65.87 92.53 52.33 92.52 81.82 119.1 97.69"/></svg>`;
const MOON = `<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;
const SUN = `<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const GITHUB_ICON = `<svg class="icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;

/** A page with the platform's top bar, one centered card (tab label + body) and the footer. */
export function page(title: string, body: string, tab = "connect") {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(title)} · launchwright</title>
<link rel="stylesheet" href="/page.css">
<script src="/page.js"></script>
</head>
<body>
<header class="bar">
  <a class="logo" href="https://launchwright.app" aria-label="launchwright home">${MARK}launchwright</a>
  <button type="button" class="theme" data-theme-toggle aria-label="Switch to dark mode" aria-pressed="false">${MOON}${SUN}</button>
</header>
<main>
  <div class="card">
    <div class="tabbar"><span class="tab">${escape(tab)}</span></div>
    <div class="body">${body}</div>
  </div>
</main>
<footer>
  <a href="https://launchwright.app/privacy">Privacy</a>
  <a href="https://launchwright.app/terms">Terms</a>
  <a href="https://github.com/launchwrightapp/launchwright">Source (AGPL-3.0)</a>
</footer>
</body>
</html>`;
}

// Theme switch, same behavior and storage key as packages/ui/theme.js.
export const PAGE_JS = `(() => {
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
`;

const DARK = `--canvas: #050505; --surface: #0d0d0d; --surface-2: #141414; --ink: #f3f3f0; --on-ink: #0b0b0b;
  --muted: #a3a39d; --line: #2a2a27; --warn: #ff8a5c; --warn-bg: #2e1810; --ok: #4ade80; --focus: #d6ff3d;`;

export const PAGE_CSS = `:root {
  color-scheme: light; --canvas: #f3f4f6; --surface: #ffffff; --surface-2: #f8f8f6; --ink: #0b0b0b; --on-ink: #ffffff;
  --muted: #62625e; --line: #e6e5e0; --warn: #b4410e; --warn-bg: #fdeae1; --ok: #15803d; --blue: #2a17ff;
  --night: #0b0b0b; --focus: #2a17ff;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; ${DARK} } }
:root[data-theme="dark"] { color-scheme: dark; ${DARK} }
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; display: flex; flex-direction: column; background: var(--canvas); color: var(--ink);
  font: 16px/1.55 "Inter Tight", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
a { color: inherit; }
.bar { display: flex; height: 56px; align-items: center; justify-content: space-between; padding: 0 16px; background: var(--night); color: #fff; }
.logo { display: inline-flex; align-items: center; gap: 0.3em; font-size: 20px; font-weight: 700; letter-spacing: -0.03em; text-decoration: none; color: #fff; }
.logo .mark { height: 0.95em; width: auto; }
.theme {
  display: inline-grid; place-items: center; width: 36px; height: 36px; padding: 0; cursor: pointer; border-radius: 999px;
  border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.05); color: #fff;
}
.theme:hover { background: rgba(255,255,255,.1); }
.theme svg { width: 16px; height: 16px; }
.theme .sun { display: none; }
:root[data-theme="dark"] .theme .moon { display: none; }
:root[data-theme="dark"] .theme .sun { display: block; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .theme .moon { display: none; }
  :root:not([data-theme="light"]) .theme .sun { display: block; }
}
main { flex: 1; display: grid; place-items: center; width: 100%; padding: 48px 16px; }
.card {
  width: 100%; max-width: 460px; overflow: hidden; border: 1px solid var(--line); border-radius: 12px;
  background: var(--surface); box-shadow: 0 25px 50px -12px rgba(0,0,0,.1);
}
.tabbar { display: flex; height: 40px; border-bottom: 1px solid var(--line); background: var(--canvas); }
.tab {
  display: flex; align-items: center; padding: 0 16px; font-size: 13px; font-weight: 600;
  border-right: 1px solid var(--line); border-top: 2px solid var(--blue); background: var(--surface);
}
.body { display: flex; flex-direction: column; gap: 20px; padding: 28px; }
h1 { font-size: 28px; line-height: 1.15; letter-spacing: -0.03em; margin: 0; }
p { color: var(--muted); margin: 0; }
.lead { margin-top: 8px; }
strong { color: var(--ink); font-weight: 600; }
code { background: var(--surface-2); border: 1px solid var(--line); border-radius: 6px; padding: 2px 6px; font-size: 14px; }
pre { margin: 0; background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; overflow-x: auto; font-size: 14px; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; color: var(--muted); font-size: 15px; }
.list li { display: flex; gap: 10px; }
.list li::before { content: ""; flex: none; width: 6px; height: 6px; margin-top: 9px; border-radius: 999px; background: var(--ok); }
.note { border-top: 1px solid var(--line); padding-top: 18px; font-size: 14px; }
.actions { display: flex; flex-direction: column; gap: 10px; }
button.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 12px; width: 100%; min-height: 48px;
  font: inherit; font-weight: 600; cursor: pointer; border-radius: 999px; padding: 10px 20px;
  border: 1px solid var(--line); background: var(--surface); color: var(--ink);
}
button.btn:hover { background: var(--surface-2); }
button.primary { background: var(--ink); color: var(--on-ink); border-color: var(--ink); }
button.primary:hover { background: var(--ink); opacity: .9; }
.icon { width: 20px; height: 20px; }
footer { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 16px; padding: 0 16px 24px; font-size: 13px; }
footer a { color: var(--muted); text-decoration: none; }
footer a:hover { color: var(--ink); }
button:focus-visible, a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
`;

export const homePage = (origin: string) =>
  page(
    "MCP server",
    `<div><h1>launchwright MCP server</h1>
<p class="lead">Connect your AI tool (Claude Code, Codex, Cursor and others) to this address:</p></div>
<pre>${escape(origin)}/mcp</pre>
<p>For Claude Code, run <code>claude mcp add --transport http launchwright ${escape(origin)}/mcp</code></p>
<p>Your tool opens this browser to sign in with GitHub. Then ask it something like “check the readiness of my repo owner/name”.</p>`,
    "mcp",
  );

export function consentPage(d: ConsentDescription, handle: string) {
  const name = escape(d.clientName);
  // Where the sign-in ends up. For CLI tools that's this computer (localhost), which is normal;
  // the note tells people to cancel if they didn't start this, so a stranger's link can't use it.
  const where = d.redirectIsLoopback
    ? `<p class="note">You'll finish in ${name} on this computer. Didn't start this from your AI tool? Click Cancel.</p>`
    : `<p class="note">You'll finish at <strong>${escape(d.redirectHost)}</strong>. Didn't start this from your AI tool? Click Cancel.</p>`;
  const from = d.clientDomain ? ` <span class="from">(from ${escape(d.clientDomain)})</span>` : "";
  return page(
    `Connect ${d.clientName}`,
    `<div><h1>Connect ${name} to launchwright</h1>
<p class="lead"><strong>${name}</strong>${from} wants to work on your projects with launchwright. Next, you sign in with GitHub.</p></div>
<ul class="list">
  <li>It can read your GitHub repos through launchwright.</li>
  <li>Each step comes with a short lesson on what it did.</li>
  <li>It never sees your GitHub password or token.</li>
</ul>
<form method="post" action="/authorize" class="actions">
  <input type="hidden" name="handle" value="${escape(handle)}">
  <button name="decision" value="approve" class="btn primary">${GITHUB_ICON}Continue with GitHub</button>
  <button name="decision" value="deny" class="btn">Cancel</button>
</form>
${where}`,
  );
}
