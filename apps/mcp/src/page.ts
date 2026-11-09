// The few HTML pages this Worker serves (home, consent, errors). No inline styles or scripts:
// the stylesheet is served from /page.css. Colors follow packages/ui/theme.css and the
// system light/dark setting.

export const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function page(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(title)} · launchwright</title>
<link rel="stylesheet" href="/page.css">
</head>
<body>
<header><a class="logo" href="https://launchwright.app">launchwright</a></header>
<main>${body}</main>
</body>
</html>`;
}

export const PAGE_CSS = `:root {
  color-scheme: light dark;
  --canvas: #f4f4f1; --surface: #ffffff; --ink: #0b0b0b; --on-ink: #ffffff; --muted: #62625e;
  --line: #e6e5e0; --warn: #b4410e; --warn-bg: #fdeae1; --logo: #2a17ff; --focus: #2a17ff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #050505; --surface: #0d0d0d; --ink: #f3f3f0; --on-ink: #0b0b0b; --muted: #a3a39d;
    --line: #2a2a27; --warn: #ff8a5c; --warn-bg: #2e1810; --logo: #9a90ff; --focus: #9a90ff;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; background: var(--canvas); color: var(--ink);
  font: 16px/1.55 "Inter Tight", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
header { padding: 20px 24px; border-bottom: 1px solid var(--line); }
.logo { color: var(--logo); font-weight: 700; font-size: 20px; letter-spacing: -0.02em; text-decoration: none; }
main { width: 100%; padding: 40px 24px; }
main > * { max-width: 680px; }
h1 { font-size: 28px; line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 16px; }
p { color: var(--muted); margin: 0 0 14px; }
strong, .name { color: var(--ink); }
code { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 2px 6px; font-size: 14px; }
pre { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; overflow-x: auto; font-size: 14px; }
.warn { color: var(--warn); background: var(--warn-bg); border-radius: 10px; padding: 12px 14px; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
button {
  font: inherit; font-weight: 600; cursor: pointer; border-radius: 999px; padding: 10px 20px;
  border: 1px solid var(--line); background: var(--surface); color: var(--ink);
}
button.primary { background: var(--ink); color: var(--on-ink); border-color: var(--ink); }
button:focus-visible, a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
`;

export const homePage = (origin: string) =>
  page(
    "MCP server",
    `<h1>launchwright MCP server</h1>
<p>Connect your AI tool (Claude Code, Codex, Cursor and others) to this address:</p>
<pre>${escape(origin)}/mcp</pre>
<p>For Claude Code: <code>claude mcp add --transport http launchwright ${escape(origin)}/mcp</code></p>
<p>Your tool opens a browser window to sign in with GitHub. Then ask it to check your project, for example “check the readiness of my repo owner/name”.</p>`,
  );
