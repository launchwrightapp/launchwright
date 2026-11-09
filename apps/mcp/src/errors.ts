// explain_error: match an error message against errors beginners hit most when shipping
// Next.js, Vite, Astro and Hono apps to Cloudflare with Neon or Supabase. Pure function.
// The error text is untrusted: we only ever echo it back redacted and inside a data block.
import type { Concept } from "../../../packages/core/curriculum";

export interface Explanation {
  id: string;
  title: string;
  meaning: string; // what the error means, plain words
  causes: string[]; // most likely first
  fix: string[]; // steps, smallest first
  concepts: Concept[];
  tool?: string; // a Launchwright tool that helps
}

interface Pattern extends Explanation {
  re: RegExp;
}

const PATTERNS: Pattern[] = [
  {
    id: "module_not_found",
    re: /Cannot find module ['"]([^'"]+)['"]|Module not found: (?:Error: )?Can't resolve ['"]([^'"]+)['"]|ERR_MODULE_NOT_FOUND|Could not resolve ["']([^"']+)["']/i,
    title: "A package or file can't be found",
    meaning: "The code imports something that isn't installed, or a file path that doesn't exist (often a typo or wrong letter case).",
    causes: ["The package isn't in package.json, so CI never installs it (it only worked on your laptop).", "The import path's letter case doesn't match the file (Linux in CI is case-sensitive, macOS and Windows aren't).", "A path alias (@/...) isn't configured for this tool."],
    fix: ["Install it as a dependency (npm install <name>) and commit package.json and the lock file.", "Check the exact file name and case in the import.", "Run a clean install locally (delete node_modules, then npm ci) to reproduce what CI sees."],
    concepts: ["ci", "reading_errors"],
  },
  {
    id: "env_undefined",
    re: /(process\.env|import\.meta\.env|env)\.[A-Z_]+ is undefined|Missing (required )?env(ironment)? var|environment variable .* (is )?(not set|missing|required)|Invalid environment variables|DATABASE_URL.*(not set|undefined|missing)/i,
    title: "A setting (environment variable) is missing",
    meaning: "The app reads a setting that has no value where it's running now. It's usually set on your laptop but not in CI or production.",
    causes: ["The variable exists in your local .env but was never set in production (Cloudflare) or CI (GitHub).", "The name differs by one letter between the code and where it's set.", "A browser-side variable is missing its public prefix (NEXT_PUBLIC_, VITE_, PUBLIC_)."],
    fix: ["Run check_env to see what's missing where.", "Set it with set_secret (the value goes in a secure form, never in chat).", "Add it to .env.example so nobody forgets it again."],
    concepts: ["env_drift", "env_config"],
    tool: "check_env",
  },
  {
    id: "db_connection",
    re: /ECONNREFUSED.*(5432|6543)|connect ECONNREFUSED|getaddrinfo ENOTFOUND|password authentication failed|no pg_hba\.conf entry|Connection terminated unexpectedly|too many (connections|clients)|remaining connection slots|NeonDbError|SASL|self[- ]signed certificate|database .* does not exist/i,
    title: "The app can't reach the database",
    meaning: "The app tried to open a database connection and the database refused or couldn't be found.",
    causes: ["DATABASE_URL is missing, points at localhost, or has an old password.", "Serverless code is using a direct connection instead of the pooled one, and ran out of connections.", "SSL isn't enabled (managed Postgres requires sslmode=require)."],
    fix: ["Use connect_database to put the right pooled connection string into production and CI.", "Make sure the URL ends with ?sslmode=require.", "On Workers, use @neondatabase/serverless or the Supabase client, not a long-lived TCP pool."],
    concepts: ["database", "secret_storage"],
    tool: "connect_database",
  },
  {
    id: "relation_missing",
    re: /relation ["']?[\w.]+["']? does not exist|no such table|column ["']?\w+["']? (of relation .* )?does not exist|Unknown column/i,
    title: "The database is missing a table or column",
    meaning: "The code expects a table or column that this database doesn't have. Your local database and production have drifted apart.",
    causes: ["A migration ran locally but never on production.", "The table was created by hand on one database only."],
    fix: ["Keep every schema change as a migration file in the repo.", "Run the migrations against production as part of the deploy (in CI), not by hand."],
    concepts: ["migrations"],
  },
  {
    id: "unauthorized",
    re: /\b401\b.*(Unauthorized)?|\bUnauthorized\b|invalid[_ ]token|jwt (expired|malformed)|token (has )?expired/i,
    title: "Not signed in (401)",
    meaning: "The server didn't accept the request's login: no session, an expired token, or the wrong key.",
    causes: ["The session cookie isn't sent (different domain, or missing credentials: 'include').", "An API key or token expired or was rotated.", "The server's secret differs between environments, so tokens from one don't verify on another."],
    fix: ["Check the request in the browser's Network tab: is the cookie or Authorization header there?", "Re-set the key with set_secret if it was rotated.", "Make sure the same SESSION_SECRET is set wherever tokens are checked."],
    concepts: ["api_auth"],
  },
  {
    id: "forbidden",
    re: /\b403\b|\bForbidden\b|permission denied|Resource not accessible by integration|insufficient (scope|permission)/i,
    title: "Not allowed (403)",
    meaning: "The request was understood and the caller is known, but it doesn't have permission for this action.",
    causes: ["A token is missing a scope (for example a GitHub or Cloudflare token without write access).", "Row Level Security (Supabase) blocked the query.", "The GitHub App isn't installed on that repo."],
    fix: ["Check which permission the action needs and add only that one (least privilege).", "For Supabase, add an RLS policy for this case instead of turning RLS off."],
    concepts: ["least_privilege"],
  },
  {
    id: "cors",
    re: /CORS|Access-Control-Allow-Origin|blocked by CORS policy|preflight/i,
    title: "The browser blocked a request to another site (CORS)",
    meaning: "Your page called an API on a different domain, and that API didn't say it allows your site. The browser blocks it to protect users.",
    causes: ["The API doesn't send Access-Control-Allow-Origin for your domain.", "The preview or production domain isn't in the API's allowed list.", "A credentialed request (cookies) with Access-Control-Allow-Origin: *, which browsers refuse."],
    fix: ["Add your exact site origin to the API's allowed origins (not *).", "If you own both, serve the API from the same domain (/api) and CORS goes away.", "Never 'fix' CORS with a browser extension: real users don't have it."],
    concepts: ["security_headers"],
  },
  {
    id: "hydration",
    re: /Hydration failed|hydration mismatch|Text content does not match server-rendered HTML|did not match\. Server:/i,
    title: "Server and browser rendered different HTML (hydration)",
    meaning: "The page was rendered on the server, then React (or Vue) rendered it again in the browser and got something different.",
    causes: ["Using Date.now(), Math.random() or the user's time zone while rendering.", "Reading window or localStorage during render.", "Invalid HTML nesting, like a <div> inside a <p>."],
    fix: ["Move browser-only values into an effect (useEffect) or render them only on the client.", "Fix the nesting the browser warns about."],
    concepts: ["reading_errors"],
  },
  {
    id: "wrangler_auth",
    re: /Authentication error \[code: 10000\]|CLOUDFLARE_API_TOKEN|not logged in.*wrangler|wrangler login|Invalid request headers \[code: 6003\]|code: 10001/i,
    title: "Cloudflare didn't accept the deploy credentials",
    meaning: "The deploy step couldn't sign in to Cloudflare.",
    causes: ["The CLOUDFLARE_API_TOKEN secret isn't set in GitHub Actions.", "The token is missing the Workers Scripts: Edit permission, or was revoked.", "CLOUDFLARE_ACCOUNT_ID is missing or for another account."],
    fix: ["Run deploy again: Launchwright checks the Actions secrets and asks for what's missing.", "Create the token from the Launchwright template link on the dashboard so it has exactly the right permissions."],
    concepts: ["secret_storage", "least_privilege"],
    tool: "deploy",
  },
  {
    id: "worker_limits",
    re: /exceeded (the )?(CPU|memory) limit|Worker exceeded|script startup exceeded|Script too large|exceeds the size limit|error code: 1102/i,
    title: "The Worker hit a Cloudflare limit",
    meaning: "Your code used too much CPU time, memory or bundle size for the Workers plan.",
    causes: ["Heavy work at startup (top-level code that runs on every cold start).", "A large dependency bundled into the Worker.", "An infinite loop or a very large JSON parse."],
    fix: ["Move setup work inside the request handler or cache it.", "Check the bundle size (wrangler deploy --dry-run --outdir dist) and drop or lazy-load big packages."],
    concepts: ["deploy", "logs"],
  },
  {
    id: "node_api_in_worker",
    re: /No such module ["']node:|The package ["']?(fs|net|tls|child_process|crypto)["']? wasn't found|nodejs_compat|Could not resolve ["'](fs|path|net|tls|os)["']/i,
    title: "Node.js-only code is running on Workers",
    meaning: "Cloudflare Workers aren't Node.js. Some Node built-ins (fs, net, child_process) don't exist there.",
    causes: ["A package that expects Node (for example the pg driver over TCP, or one that reads files).", "The nodejs_compat flag isn't turned on in wrangler config."],
    fix: ["Add \"compatibility_flags\": [\"nodejs_compat\"] to wrangler.jsonc.", "Swap Node-only packages for Worker-friendly ones (@neondatabase/serverless instead of pg)."],
    concepts: ["deploy"],
  },
  {
    id: "typescript",
    re: /error TS\d{4}|Type ['"].*['"] is not assignable|Property ['"]\w+['"] does not exist on type/i,
    title: "TypeScript found a type error",
    meaning: "The code uses a value in a way its type doesn't allow. CI fails so the bug doesn't reach production.",
    causes: ["A value might be undefined or null and isn't checked.", "A function's arguments changed but a caller wasn't updated."],
    fix: ["Read the file and line in the error (path(line,col)), fix that spot first: later type errors often follow from the first.", "Run the typecheck locally (npx tsc --noEmit) before pushing."],
    concepts: ["ci", "reading_errors"],
  },
  {
    id: "playwright_timeout",
    re: /Timeout \d+ms exceeded|page\.goto: net::ERR_|locator\.\w+: Timeout|waiting for (locator|selector)|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED/i,
    title: "The browser test timed out or couldn't open the page",
    meaning: "Playwright waited for a page or an element that never showed up.",
    causes: ["The test ran before the preview deploy finished, or used the wrong BASE_URL.", "The page shows something different in production (a login wall, an error, a cookie banner).", "The selector matches text that changed."],
    fix: ["Print the URL the test used and open it yourself.", "Look at the Playwright trace or screenshot CI uploaded.", "Prefer role-based locators (getByRole) that survive design changes."],
    concepts: ["e2e", "preview_deploys"],
  },
  {
    id: "out_of_memory",
    re: /JavaScript heap out of memory|ENOMEM|Killed\s*$|exit code 137/im,
    title: "The build ran out of memory",
    meaning: "The build used more memory than the machine has.",
    causes: ["A very large build (many pages or big images).", "A memory leak in a build plugin."],
    fix: ["Set NODE_OPTIONS=--max-old-space-size=4096 for the build step.", "Check what changed since the last build that worked."],
    concepts: ["ci"],
  },
  {
    id: "lockfile",
    re: /npm ci can only install packages when your package\.json and package-lock\.json|lockfile.*(out of date|not up to date)|ERR_PNPM_OUTDATED_LOCKFILE|frozen-lockfile/i,
    title: "package.json and the lock file disagree",
    meaning: "CI installs exactly what the lock file says. Someone changed package.json without updating the lock file.",
    causes: ["A dependency was added by editing package.json by hand.", "The lock file wasn't committed."],
    fix: ["Run npm install (or pnpm install) locally and commit the updated lock file.", "Use one package manager per project; delete other lock files."],
    concepts: ["ci"],
  },
  {
    id: "port_in_use",
    re: /EADDRINUSE|address already in use/i,
    title: "The port is already taken",
    meaning: "Another program (often an old dev server) is already listening on that port.",
    causes: ["A previous dev server is still running in another terminal."],
    fix: ["Stop the other process, or start this one on another port."],
    concepts: ["reading_errors"],
  },
  {
    id: "rate_limited",
    re: /\b429\b|Too Many Requests|rate limit/i,
    title: "Too many requests (429)",
    meaning: "A service is slowing you down because you called it too often.",
    causes: ["A loop or a re-render calling an API repeatedly.", "A free-tier quota was used up."],
    fix: ["Find what's calling the API in a loop (check the Network tab).", "Cache results, and back off and retry after the time the service gives."],
    concepts: ["logs"],
  },
  {
    id: "server_error",
    re: /\b500\b|Internal Server Error|Unhandled (Promise )?Rejection|Uncaught (Type|Reference)Error/i,
    title: "The server crashed on this request (500)",
    meaning: "Your server code threw an error it didn't handle. The real reason is in the server logs, not the browser.",
    causes: ["A missing setting or a database error, thrown inside the request handler.", "Code that assumes a value exists (x.y where x is undefined)."],
    fix: ["Run get_logs with source runtime to see the error on the server.", "Find the first stack-trace line that points at your own code."],
    concepts: ["logs", "reading_errors"],
    tool: "get_logs",
  },
];

// The first line that looks like an error, for the summary.
export function keyLine(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => /error|exception|failed|cannot|refused|denied|not found|undefined|timeout/i.test(l)) ?? lines[0] ?? "";
}

export function explainError(text: string, max = 3): Explanation[] {
  const hits: Explanation[] = [];
  for (const { re, ...e } of PATTERNS) {
    if (re.test(text)) hits.push(e);
    if (hits.length >= max) break;
  }
  return hits;
}
