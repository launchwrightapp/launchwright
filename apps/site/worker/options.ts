// Pilot questionnaire choices: [stored value, label]. The page (src/pages/pilot.astro)
// renders these, and the worker only stores values found here.
export const OPTIONS = {
  role: [
    ["student", "Student"],
    ["shifter", "Career shifter"],
    ["working", "Working, new to coding"],
    ["developer", "Developer"],
    ["other", "Other"],
  ],
  experience: [
    ["new", "Brand new"],
    ["ai", "I build with AI (vibe coding)"],
    ["courses", "Took some courses"],
    ["work", "I code for work"],
  ],
  tools: [
    ["claude-code", "Claude Code"],
    ["cursor", "Cursor"],
    ["codex", "Codex"],
    ["chatgpt", "ChatGPT"],
    ["copilot", "GitHub Copilot"],
    ["other", "Other"],
    ["none", "None yet"],
  ],
  stage: [
    ["idea", "Just an idea"],
    ["building", "Building it"],
    ["local", "Works on my computer"],
    ["live", "Already live"],
  ],
  learn: [
    ["deploy", "Deploying"],
    ["database", "Databases"],
    ["secrets", "Env and secrets"],
    ["testing", "Testing"],
    ["cicd", "CI/CD"],
    ["security", "Security"],
    ["monitoring", "Monitoring"],
  ],
  hours: [
    ["lt2", "Under 2"],
    ["2-5", "2–5"],
    ["5-10", "5–10"],
    ["10plus", "10+"],
  ],
} as const satisfies Record<string, readonly (readonly [string, string])[]>;

export type Answers = {
  role?: string;
  city?: string;
  experience?: string;
  tools?: string[];
  stage?: string;
  github?: string;
  learn?: string[];
  hours?: string;
  heard?: string;
};

const allowed = (key: keyof typeof OPTIONS) => new Set<string>(OPTIONS[key].map(([v]) => v));
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []);

// Keep only known choices and short free text. Empty answers are left out.
export function cleanAnswers(data: Record<string, unknown>): Answers | null {
  const one = (key: keyof typeof OPTIONS) => {
    const v = text(data[key], 40);
    return allowed(key).has(v) ? v : undefined;
  };
  const many = (key: keyof typeof OPTIONS) => {
    const ok = allowed(key);
    const vs = [...new Set(list(data[key]).map((v) => text(v, 40)).filter((v) => ok.has(v)))];
    return vs.length ? vs : undefined;
  };
  const github = text(data.github, 39).replace(/^@/, "");
  const a: Answers = {
    role: one("role"),
    city: text(data.city, 100) || undefined,
    experience: one("experience"),
    tools: many("tools"),
    stage: one("stage"),
    github: /^[a-z\d](?:[a-z\d-]{0,38})$/i.test(github) ? github : undefined,
    learn: many("learn"),
    hours: one("hours"),
    heard: text(data.heard, 200) || undefined,
  };
  const kept = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined));
  return Object.keys(kept).length ? (kept as Answers) : null;
}
