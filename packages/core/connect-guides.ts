// How a learner connects each account: one source for the dashboard's Accounts tab and the
// MCP server's "not connected yet" coaching. The learner always creates and pastes the key
// themselves; their AI tool explains and waits, but never sees it.
import { CLOUDFLARE_TOKEN_TEMPLATE } from "./verify";

export type ProviderId = "cloudflare" | "neon" | "supabase";

export interface ConnectGuide {
  id: ProviderId;
  name: string;
  tagline: string; // what it is, in plain words
  forWhat: string; // why launchwright needs it
  tools: string[]; // launchwright tools that use it
  free: string;
  method: "token" | "oauth";
  action: { label: string; href: string }; // where the learner goes first
  steps: { title: string; detail: string }[];
  permissions: { name: string; why: string }[];
  permissionsNote?: string;
  pitfalls: string[];
  limits: string[]; // honest: what the key can't do, or what launchwright never does with it
  revoke: string; // how to take access back at the provider
  minutes: number;
}

export const GUIDES: Record<ProviderId, ConnectGuide> = {
  cloudflare: {
    id: "cloudflare",
    name: "Cloudflare",
    tagline: "Where your app runs.",
    forWhat: "Deploys your app (previews and production), stores its secrets, and shows its logs. All on your own account's free plan.",
    tools: ["deploy", "set_secret", "check_env", "get_logs", "connect_database"],
    free: "Workers free plan: 100,000 requests a day, no card needed.",
    method: "token",
    action: { label: "Open Cloudflare's token page", href: CLOUDFLARE_TOKEN_TEMPLATE },
    steps: [
      { title: "Open Cloudflare's token page", detail: "The button opens it with launchwright's permissions already filled in. Log in if asked. No account yet? Sign up free, then click the button again." },
      { title: "Check the four permissions", detail: "You should see exactly the four in the table below, all under Account. If the page is empty, click Create Custom Token and add them yourself." },
      { title: "Pick your account", detail: "Under Account Resources choose Include and your account. Leave Zone Resources, IP filtering and TTL as they are." },
      { title: "Create the token", detail: "Click Continue to summary, then Create Token." },
      { title: "Copy it and paste it here", detail: "Cloudflare shows the token only once. Paste it in the field below and click Connect. launchwright checks it with Cloudflare, then stores it encrypted." },
    ],
    permissions: [
      { name: "Workers Scripts: Edit", why: "Upload your app and set its secrets." },
      { name: "Workers Observability: Read", why: "Read your app's logs for get_logs." },
      { name: "Account Settings: Read", why: "Find your account ID and workers.dev address." },
      { name: "Cloudflare Pages: Edit", why: "Deploy static sites (Astro, Vite) hosted on Pages." },
    ],
    pitfalls: [
      "Create it under My Profile → API Tokens, not Manage Account → Account API Tokens. launchwright checks it as a personal token.",
      "Don't use the Global API Key. It can do everything on your account, including deleting your domains.",
      "Never paste the token into your AI chat. It goes only in the field on this page.",
    ],
    limits: ["The token can't touch your domains or DNS", "It can't see billing or change your plan", "It only reaches Workers and Pages on the one account you pick"],
    revoke: "Cloudflare → My Profile → API Tokens → launchwright → ⋯ → Delete. Then click Disconnect here.",
    minutes: 3,
  },
  neon: {
    id: "neon",
    name: "Neon",
    tagline: "A Postgres database, serverless.",
    forWhat: "Lists or creates your database projects, and puts the connection string straight into your app's secrets. Pick Neon or Supabase, not both.",
    tools: ["connect_database"],
    free: "Free plan: 0.5 GB storage per project, no card needed. Choose the Singapore region, closest to the Philippines.",
    method: "token",
    action: { label: "Open Neon's API keys page", href: "https://console.neon.tech/app/settings/api-keys" },
    steps: [
      { title: "Open Neon's API keys page", detail: "Log in or sign up free (GitHub sign-in works)." },
      { title: "Create a key named launchwright", detail: "Click Create new API key and name it launchwright, so you know what to revoke later." },
      { title: "Copy it and paste it here", detail: "Neon shows the key only once. Paste it below and click Connect. launchwright checks it with Neon, then stores it encrypted." },
    ],
    permissions: [
      { name: "List and create projects", why: "So connect_database can show your projects or make one." },
      { name: "Read connection strings", why: "To save DATABASE_URL into your app's secrets without showing it to anyone." },
    ],
    permissionsNote: "Neon API keys can't be limited to fewer permissions yet, so launchwright only ever uses the two above. That's also why it's worth revoking the key if you stop using launchwright.",
    pitfalls: [
      "Never paste the key into your AI chat. It goes only in the field on this page.",
      "Your database password is part of the connection string. launchwright puts it in your secrets for you; for local development, copy it from Neon into your own .env (never commit it).",
    ],
    limits: ["launchwright never deletes projects or branches (the key could, which is why it's encrypted and you can revoke it)", "launchwright never reads the data in your database", "launchwright never touches billing"],
    revoke: "Neon → Account settings → API keys → launchwright → Revoke. Then click Disconnect here.",
    minutes: 2,
  },
  supabase: {
    id: "supabase",
    name: "Supabase",
    tagline: "Postgres with auth and storage built in.",
    forWhat: "Lists or creates your Supabase projects and saves the connection string into your app's secrets. Pick Neon or Supabase, not both.",
    tools: ["connect_database"],
    free: "Free plan: 2 projects, 500 MB database each, no card needed. Choose Southeast Asia (Singapore).",
    method: "oauth",
    action: { label: "Connect Supabase", href: "/auth/supabase" },
    steps: [
      { title: "Click Connect Supabase", detail: "You go to Supabase to sign in. No key to copy: Supabase asks you to approve launchwright instead." },
      { title: "Pick your organization", detail: "Choose the Supabase organization your project is in (or will be in)." },
      { title: "Review and authorize", detail: "Supabase lists exactly what launchwright may do. Click Authorize and you come back here, connected." },
    ],
    permissions: [
      { name: "Projects: read and create", why: "So connect_database can show your projects or make one." },
      { name: "Database pooler settings: read", why: "To build the connection string for serverless apps." },
    ],
    pitfalls: [
      "For an existing project, Supabase never shares the database password. Your AI tool will send you a secure link to paste the connection string yourself.",
    ],
    limits: ["You approve the exact access on Supabase's screen, and can revoke it there", "launchwright never deletes projects", "launchwright never reads the data in your database"],
    revoke: "Supabase → Organization settings → OAuth Apps → launchwright → Revoke. Then click Disconnect here.",
    minutes: 1,
  },
};

// What the MCP server tells the AI when a tool needs an account that isn't connected.
// The AI should coach the learner through it, not do it for them.
export function connectCoaching(id: ProviderId, why: string, dashboardUrl: string): string {
  const g = GUIDES[id];
  const steps = g.steps.map((s, i) => `${i + 1}. **${s.title}.** ${s.detail}`).join("\n");
  const perms = g.permissions.map((p) => `- ${p.name}: ${p.why}`).join("\n");
  return [
    `${g.name} isn't connected yet. ${why}`,
    "",
    `Coach the learner through connecting it. They do it themselves on the dashboard; you never see the ${g.method === "token" ? "token" : "access"}, and you must not ask them to paste it here. Explain in your own words, one step at a time:`,
    "",
    `**Why ${g.name}:** ${g.forWhat} ${g.free}`,
    "",
    `**Where:** ${dashboardUrl} (takes about ${g.minutes} minute${g.minutes > 1 ? "s" : ""})`,
    "",
    steps,
    "",
    `**What launchwright can do with it** (least privilege: only what it needs):`,
    perms,
    g.permissionsNote ? `\n${g.permissionsNote}` : "",
    "",
    `**Watch out:**\n${g.pitfalls.map((p) => `- ${p}`).join("\n")}`,
    "",
    "When the learner says it's done, run project_status to confirm the account shows as connected, then retry what you were doing.",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}
