// The Level 1 curriculum: modules, the concepts inside them, and practice exercises.
// Tool calls teach concepts (the MCP server records them in lesson_progress); the platform
// shows the same modules with each learner's progress. One source for both.
//
// Level 1 teaches production fundamentals. It doesn't make an app "production-ready": that word is
// for a specific app that passed checks fit for its users, data and failure risks. The exercises
// are the hands-on part no tool call can do for you (restore drills, access tests, a runbook).

export const LEVEL_1 = {
  name: "Level 1",
  promise: "Ship your first web app with production fundamentals.",
};

export type ModuleId = "git" | "env" | "database" | "cicd" | "testing" | "deploy" | "monitoring" | "security";

export type Concept =
  | "project_status"
  | "pull_requests"
  | "code_review"
  | "env_config"
  | "secrets"
  | "secret_storage"
  | "env_drift"
  | "database"
  | "migrations"
  | "ci"
  | "secret_scanning"
  | "e2e"
  | "preview_deploys"
  | "deploy"
  | "production_approval"
  | "rollback"
  | "logs"
  | "reading_errors"
  | "uptime"
  | "readiness"
  | "api_auth"
  | "security_headers"
  | "least_privilege"
  | "data_privacy";

export interface Lesson {
  module: ModuleId;
  title: string;
  full: string; // first time
  short: string; // every time after
}

export interface Module {
  id: ModuleId;
  n: string;
  name: string;
  blurb: string;
  prompt: string | null; // the guided MCP prompt for this module
}

export const MODULES: Module[] = [
  { id: "git", n: "01", name: "Git and GitHub", blurb: "Know your stack, work in pull requests, review before merging.", prompt: "lesson-review" },
  { id: "env", n: "02", name: "Env and secrets", blurb: "Settings outside the code, secrets entered securely.", prompt: "lesson-secrets" },
  { id: "database", n: "03", name: "Database", blurb: "Neon or Supabase, connection strings, migrations.", prompt: "lesson-database" },
  { id: "cicd", n: "04", name: "CI/CD", blurb: "Checks on PRs and pushes to main, secret scanning.", prompt: "lesson-ci" },
  { id: "testing", n: "05", name: "Testing", blurb: "Playwright on a preview deploy.", prompt: "lesson-ci" },
  { id: "deploy", n: "06", name: "Deploy", blurb: "Previews, production with approval, rollback.", prompt: "lesson-deploy" },
  { id: "monitoring", n: "07", name: "Monitoring", blurb: "Logs, reading errors, uptime.", prompt: "lesson-debug" },
  { id: "security", n: "08", name: "Security", blurb: "Auth, headers, least privilege, the Data Privacy Act.", prompt: "lesson-security" },
];

export const LESSONS: Record<Concept, Lesson> = {
  project_status: {
    module: "git",
    title: "Knowing your stack",
    full: "Bago ka magbago ng kahit ano, tinitingnan muna ng production engineer kung ano ang laman ng app: ang framework, ang package manager, ang database, at kung saan ito naka-host. Bawat isa diyan ang magdedecide kung paano ka mag-i-install, magbi-build, magte-test at magde-deploy. Karamihan ng sagot nasa package.json, sa lockfile at sa mga config file sa root ng repo.",
    short: "Stack muna: framework, package manager, database at hosting ang magdedecide ng bawat susunod na step.",
  },
  pull_requests: {
    module: "git",
    title: "Working in pull requests",
    full: "Ang pull request (PR) ay proposal na i-merge ang changes mula sa isang branch papunta sa iba, kadalasan sa main. Dito mo binabasa ang change at nakikita ang resulta ng CI bago ka magdesisyon. Pero ang PR mismo hindi pumipigil sa direktang push sa main. I-on ang branch protection para i-require ang PR at passing checks (pati approval ng reviewer kung may kasama ka sa team), at tingnan kung sino ang puwedeng mag-bypass nito. Hindi kailanman nagpu-push ang Launchwright sa main branch mo: nag-o-open ito ng PR at ikaw ang magdedecide.",
    short: "PRs: gamitin ang branch protection para i-require ang PR at passing checks.",
  },
  code_review: {
    module: "git",
    title: "Code review",
    full: "Ang code review ay pagbasa ng change bago ito i-merge: ano ang ginagawa nito, tama ba, at may masisira ba. Mas mahalaga ito kapag AI ang sumulat, kasi mabilis itong gumawa ng maraming lines na mukhang tama. Unahin ang delikado: secrets, auth at access sa data, database changes, bagong dependencies, changes sa CI, at tests na na-skip o na-delete. Tapos tingnan kung may tests na sumasakop sa change. Kung mag-isa ka lang, hindi mo puwedeng i-approve ang sarili mong PR sa GitHub, kaya huwag i-require ang approvals; i-require ang PR at passing checks, at i-review ang change kasama ang AI tool mo gamit ang review_pr. Ikaw pa rin ang magdedesisyon kung ime-merge.",
    short: "Code review: basahin ang change bago i-merge, simula sa secrets, access sa data, database at dependencies.",
  },
  env_config: {
    module: "env",
    title: "Documenting env config",
    full: "Nagbabasa ang app mo ng settings mula sa environment: database URL, API key, site URL. Ang .env.example file ang naglilista ng bawat isa, may safe na placeholder value at note kung alin ang required, para kahit sino (pati ikaw in the future) ma-set up ang app nang hindi nanghuhula. Documentation lang ito: hiwalay na kino-configure ang totoong values sa CI at production. Ang local .env mo na may totoong values, hindi dapat mapunta sa git.",
    short: "Env config: nasa .env.example ang bawat setting na may placeholder; nasa ibang lugar ang totoong values.",
  },
  secrets: {
    module: "env",
    title: "Secrets stay out of git",
    full: "Hindi kailanman dapat nasa code ang passwords at API keys. Tinatago ng git ang bawat version, at puwedeng may kopya ng repo sa ibang lugar, kaya exposed na ang key na na-commit kahit i-delete mo pa ang file. Una, i-revoke o i-rotate ito (gumawa ng bagong key, i-cancel ang luma), saka mo tanggalin sa code. Ang .gitignore ay pumipigil lang sa pagdagdag ng bagong files; hindi nito tinatanggal sa git ang file na naka-commit na. Ingat din sa frontend env vars: public ang lahat ng napupunta sa browser code, kaya bawal itong maglaman ng secret.",
    short: "Secrets: bawal sa git at frontend code; ang leaked key, i-rotate muna bago tanggalin.",
  },
  secret_storage: {
    module: "env",
    title: "Where production secrets live",
    full: "Sa production, nasa secret storage ng platform ang secrets: Cloudflare Worker secrets, GitHub Actions secrets. Isang beses mo lang ilalagay ang value sa secure form, at hindi na ito ipapakita ulit ng dashboard. Pero nababasa pa rin ito ng code ng app mo at ng CI jobs kapag tumatakbo sila (iyon ang point), kaya dapat trusted ang mga iyon. Ang set_secret ng Launchwright ay nagbibigay ng secure link kung saan mo ita-type ang value, kaya hindi ito dumadaan sa AI chat.",
    short: "Secret storage: ilagay sa secure form, hindi sa chat; nababasa pa rin ito ng tumatakbong code mo.",
  },
  env_drift: {
    module: "env",
    title: "Env drift",
    full: "Ang env drift ay kapag hindi na nagtutugma ang settings na kailangan ng code mo, ang mga na-document mo, at ang talagang meron sa isang environment. Ito ang classic na \"works on my machine\" bug: may variable sa laptop mo pero wala sa production, kaya nag-crash ang app pagka-deploy. Puwedeng magkaiba ang environments on purpose (ibang database, optional settings), pero dapat kumpleto ang bawat isa sa settings na kailangan nito. I-check bago ka mag-ship.",
    short: "Env drift: kumpleto ang bawat environment sa required settings, at naka-explain sa docs ang pagkakaiba.",
  },
  database: {
    module: "database",
    title: "Connecting a database",
    full: "Ang managed Postgres database (Neon o Supabase) ay tumatakbo sa servers ng iba. Naaabot ito ng app mo gamit ang connection string: URL na may kasamang password, kaya secret ito at hindi dapat nasa code. Depende sa driver mo kung paano ka magko-connect: ang serverless apps na gumagamit ng normal na Postgres client ay dapat gumamit ng pooled connection ng provider, at may ilang HTTP-based drivers na sila na ang bahala sa pooling. Sundin ang guide ng driver at provider mo. Minsan kailangan ng migration tools ang direct connection.",
    short: "Database: secret ang connection string; piliin ang connection mode na kailangan ng driver mo.",
  },
  migrations: {
    module: "database",
    title: "Database migrations",
    full: "Ang migration ay file na nagbabago ng database schema: gumawa ng table, magdagdag ng column. Kapag nasa repo ang mga ito, nakaayos, pare-pareho ang structure ng bawat database (sa iyo, sa CI, sa production), at nare-review ang bawat change gaya ng code. I-apply ang mga ito gamit ang migration tool mo at subukan muna sa dev database. Structure ang nire-rebuild ng migrations, hindi ang data: para doon, kailangan mo ng backups.",
    short: "Migrations: nakaayos na files sa repo ang schema changes; backups ang para sa data.",
  },
  ci: {
    module: "cicd",
    title: "Continuous integration",
    full: "Ang CI ay computer na kusang nagra-run ng checks mo sa events na pinili mo, kadalasan sa bawat pull request at bawat push sa main. Sa GitHub Actions, YAML file ito sa .github/workflows. Kapag may failed check, naka-flag ang change, pero haharangin lang nito ang merge kung required ito ng branch protection. I-on iyon para hindi ma-merge ang changes na may failing checks. Puwede pa ring makalusot ang bugs sa tests.",
    short: "CI: mag-run ng checks sa PRs at pushes sa main, at i-require bago mag-merge.",
  },
  secret_scanning: {
    module: "cicd",
    title: "Secret scanning",
    full: "Ang secret scanner (gaya ng gitleaks) ay nagbabasa ng files at commit history mo para maghanap ng mukhang keys: cloud keys, tokens, private keys, database URLs na may password. Ang CI na sine-set up ng Launchwright ay nag-i-scan ng buong history sa bawat pull request at push sa main, kaya kadalasan maaga mahuhuli ang leaked key, hindi ilang buwan pa bago may ibang makakita. Puwedeng makalusot ang kakaibang secrets sa scanner, kaya huwag umasa sa iisa lang.",
    short: "Secret scanning: chine-check ng gitleaks ang history sa bawat PR at push sa main.",
  },
  e2e: {
    module: "testing",
    title: "End-to-end smoke tests",
    full: "Ang unit tests ay nagche-check ng maliliit na parte. Ang end-to-end (E2E) test ay nagbubukas ng totoong app sa browser at ginagamit ito gaya ng isang tao. Playwright ang gumagawa nito. Ang maliit na smoke test (naglo-load ba ang home page, tama ba ang resulta ng main action) ay nakakahuli ng bugs na lumalabas lang kapag magkakakabit na ang lahat. Laging i-check ang resulta, hindi lang kung na-click ang button.",
    short: "E2E: binubuksan ng Playwright ang totoong app at chine-check kung tama ang resulta ng main flow.",
  },
  preview_deploys: {
    module: "testing",
    title: "Preview deploys",
    full: "Ang preview deploy ay nagbibigay ng sariling URL sa change ng isang pull request, para masubukan mo (at ng E2E tests mo) bago mag-production. Kapag sira ang preview, aayusin mo bago mag-merge. Pero ang hiwalay na URL ay hindi nangangahulugang hiwalay ang data. Bago mag-test, siguraduhing test database at storage ang gamit ng preview, at test keys para sa kahit anong nagse-send ng email o tumatanggap ng bayad. Kadalasan public ang preview URLs, kaya i-protect ang mga ito kung dapat private ang laman.",
    short: "Previews: mag-test sa hiwalay na URL gamit ang hiwalay na test database at storage; i-protect ang access kung kailangan.",
  },
  deploy: {
    module: "deploy",
    title: "Deploying",
    full: "Ang pag-deploy ay pag-build ng app mo at paglagay ng build na iyon kung saan maaabot ito ng users. Kapag sa CI ka nagde-deploy (hindi sa laptop mo), pareho ang steps sa bawat deploy, galing sa commit na nakikita ng lahat, at puwede itong i-set na hintayin munang pumasa ang checks. Mas consistent ang builds kapag may lockfile at naka-pin ang versions ng runtime at tools. Nasa deploy log kung ano ang nangyari.",
    short: "Deploy from CI: isang kilalang commit, pagkatapos pumasa ang required checks nito.",
  },
  production_approval: {
    module: "deploy",
    title: "Approving production changes",
    full: "Nagtatanong muna ang Launchwright sa isang tao bago ang production deploys, rollbacks, at pagpapalit ng secret na naka-save na (kasama ang database connection mo). Kayang ihanda ng AI tool mo ang change, pero ikaw ang mag-a-approve sa dashboard. Isang beses lang gumagana ang bawat approval, para sa isang action lang (ang production deploy ay para sa isang eksaktong commit), at nag-e-expire pagkalipas ng isang araw. Pagkakataon mo ito para tingnan kung ano ang mangyayari bago ito tumakbo. Change gate ang tawag dito ng mga team.",
    short: "Naghihintay ng approval mo sa dashboard ang gated changes; isang action lang ang sakop ng bawat approval.",
  },
  rollback: {
    module: "deploy",
    title: "Rollback",
    full: "Ang rollback ay pag-deploy ulit ng dating Worker version, kasama ang code at configuration nito. Mabilis ito kasi tinatago ng Cloudflare ang mga na-upload mong versions. Pero hindi nito ibinabalik ang dating data o state ng nakakabit na database at storage. I-check muna kung available pa ang resources na kailangan ng lumang version at kung compatible pa ito sa current schema at data; may resource changes na puwedeng humarang sa rollback. Kung compatible pa ang lumang version, mag-rollback muna at mag-debug nang kalmado; kung hindi na, mag-ship na lang ng maingat na fix forward.",
    short: "Rollback: ibalik ang compatible na dating version; hindi nito nire-restore ang data.",
  },
  logs: {
    module: "monitoring",
    title: "Reading logs",
    full: "Ang logs ay ang mga isinulat ng app at CI mo habang tumatakbo. Hanapin ang failing run o request, saka magsimula sa unang error nito, hindi sa huling linya: kadalasan ang mga sumunod na error ay dahil sa una. Puwedeng may user data at secrets pa sa logs, kaya huwag i-log ang mga iyon. Sinusubukan ng Launchwright na itago ang mga kilalang secret pattern bago ipakita ang logs, pero safety net lang iyon, hindi garantiya.",
    short: "Logs: hanapin ang failing run, saka basahin mula sa unang error pababa.",
  },
  reading_errors: {
    module: "monitoring",
    title: "Reading an error message",
    full: "Kadalasan, may tatlong useful na parte ang error message: ang type (anong klaseng failure), ang message (ano ang nagkamali), at ang stack trace (saan). Hanapin ang unang linya ng stack na tumuturo sa sarili mong code; kadalasan doon ka dapat tumingin. Basahin muna ang message bago i-search, at tanggalin ang keys, emails at IDs bago mo ito i-paste kahit saan.",
    short: "Errors: type, message, tapos ang unang stack line sa sarili mong code.",
  },
  uptime: {
    module: "monitoring",
    title: "Uptime checks",
    full: "Ang uptime check ay bumibisita sa site mo mula sa labas every few minutes at nag-a-alert kapag hindi na ito sumasagot. Kung wala nito, mauuna pang makapansin ng outage ang users mo kaysa sa iyo. Ang dinadagdag ng Launchwright ay naka-schedule every 15 minutes sa GitHub Actions, na puwedeng ma-late o lumaktaw ng run kapag busy. I-on ang failure notifications ng GitHub para sa Actions at i-test kung nakakarating sa iyo ang alert. Ang page na sumasagot ay hindi patunay na gumagana ang bawat feature, kaya ituloy din ang smoke tests mo.",
    short: "Uptime: mag-schedule ng checks mula sa labas at siguraduhing nakakarating sa iyo ang failure alerts.",
  },
  readiness: {
    module: "security",
    title: "Production readiness",
    full: "Ang readiness checks ay naghahanap ng karaniwang risks bago dumating ang totoong users: secrets sa code, settings na walang documentation, walang tests sa bawat PR, walang browser test ng totoong app, walang migrations, deployed site na walang HTTPS, security headers o uptime check. Magandang baseline ang pumasa sa mga ito, pero hindi pa ito patunay na production-ready ang app: depende iyon sa users, data at risks nito. Kailangan mo pa rin ng access tests, backups na nasubukan mong i-restore, rate limits, runbook at malinaw na data retention; nasa practice exercises ang mga iyon. Isa-isahin ang pag-fix, simula sa failures.",
    short: "Readiness: baseline lang; unahin ang failures, tapos warnings, isa-isa.",
  },
  api_auth: {
    module: "security",
    title: "Auth on API routes",
    full: "Bawat API route na nagbabasa o nagbabago ng private data ay dapat mag-check ng dalawang bagay sa server: sino ang nagtatanong (authentication), at kung allowed ba siyang gawin ito sa eksaktong record na ito (authorization). Kung login lang ang chine-check ng route, baka mapalitan ng user ang ID sa request at makuha ang data ng iba. Ang pagtago ng button sa frontend ay hindi access control.",
    short: "API auth: sa server, i-check kung sino ang humihiling at kung allowed ang hinihinging access o action.",
  },
  security_headers: {
    module: "security",
    title: "HTTPS and security headers",
    full: "Ine-encrypt ng HTTPS ang traffic sa pagitan ng browser at ng app mo. Ang security headers ang nagsasabi sa browser kung paano protektahan ang users mo: HSTS (laging HTTPS), Content-Security-Policy (aling scripts, styles at iba pang resources ang puwedeng mag-load, at gamit ang frame-ancestors, kung sino ang puwedeng mag-embed ng pages mo) at X-Content-Type-Options (huwag hulaan ang file types). I-test ang mga ito sa totoong app mo, kasi puwedeng makasira ng features ang sobrang higpit na policy. Hindi pamalit sa access checks ang headers.",
    short: "Headers: HSTS, CSP (may frame-ancestors) at nosniff, naka-test sa app mo.",
  },
  least_privilege: {
    module: "security",
    title: "Least privilege",
    full: "Ibigay sa bawat key at bawat app ang access na kailangan lang nito, wala nang iba. Ang Cloudflare token na pang-edit lang ng Workers ay hindi kayang mag-delete ng DNS mo, kaya kapag na-leak ito, mas kaunti ang puwedeng masira. Ang hinihingi lang ng Launchwright ay ang permissions na ginagamit ng tools nito. Kapag nag-disconnect ka ng account sa Launchwright, dine-delete namin ang naka-store naming kopya (keys at OAuth tokens); para tuluyang ma-cancel ang key, i-revoke mo rin ito sa provider.",
    short: "Least privilege: pinakamaliit na scopes; i-revoke ang keys sa provider kapag tapos na.",
  },
  data_privacy: {
    module: "security",
    title: "The Data Privacy Act (RA 10173)",
    full: "Kung nagpo-process ang app mo ng personal data (names, emails, phone numbers) na sakop ng Data Privacy Act, kailangan mo ng applicable na lawful basis para dito. Isa ang consent, at mas mahigpit ang rules para sa sensitive personal information. Kailangan mo rin ng privacy notice na nag-e-explain nito, data na kailangan lang, proteksyon, at respeto sa rights ng tao ayon sa batas, gaya ng access at correction. May breaches na kailangang i-report: karaniwan, kapag sensitive data o data na puwedeng gamitin sa identity fraud ang makatwirang pinaniniwalaang nakuha ng hindi awtorisado, at may totoong risk ng seryosong pinsala. Sa ganoon, sabihan ang NPC at ang mga apektadong tao within 72 hours mula nang malaman mo o makatwiran mong paniwalaang nangyari ito. Kasama rito ang database, logs at third-party services mo.",
    short: "RA 10173: lawful basis, malinaw na notice, data na kailangan lang, proteksyon, at report within 72 hours para sa notifiable breaches.",
  },
};

// Practice exercises: real work on the learner's own app, guided by the lesson-practice prompt.
// `why` is shown on the dashboard (Taglish); `task` is the instruction to the learner's AI tool.
export type ExerciseId = "backup_restore" | "launch_quality" | "incident_runbook" | "access_tests" | "abuse_and_deps" | "data_lifecycle";

export interface Exercise {
  id: ExerciseId;
  module: ModuleId;
  title: string;
  why: string;
  task: string;
}

export const EXERCISES: Exercise[] = [
  {
    id: "backup_restore",
    module: "database",
    title: "Backup and restore drill",
    why: "Hindi mo pa alam kung may backup ka hangga't hindi mo pa nasusubukang mag-restore. Alamin kung anong backups o point-in-time restore ang kasama sa plan mo sa Neon o Supabase, mag-restore sa hiwalay na branch o database, at i-check kung kumpleto ang data. Sa schema changes, gawin muna ang compatible na hakbang (magdagdag bago magtanggal) para gumagana pa rin ang dating version kung kailangan mong mag-rollback.",
    task: "Recovery drill. 1) Find out what backups or point-in-time restore my database plan (Neon or Supabase) actually includes and how far back it goes; check the provider's current docs, don't guess. If it isn't enough for my data, help me set up my own regular dump stored outside the database provider. 2) Restore to a separate branch or database (never over production), then check the restored data: row counts on the main tables and one record I know. 3) Write down how long it took and the steps, in a RECOVERY.md in the repo. 4) Look at my pending or recent migrations: would the previous app version still work against the new schema? If not, show me how to split it into expand-then-contract steps (add first, switch the code, remove later).",
  },
  {
    id: "launch_quality",
    module: "testing",
    title: "Launch quality check",
    why: "Puwedeng pumasa ang tests pero mahirap pa ring gamitin ang app. Bago mag-launch, i-test ang mga pinakamahalagang ginagawa ng users (sign up, ang main action, pagbayad kung meron), sa mobile din, gamit ang keyboard at screen reader basics, at tingnan kung mabilis mag-load. Alamin din kung ilang users ang inaasahan mo at kung kaya iyon ng free tier limits mo.",
    task: "Launch quality check. 1) Ask me for the two or three journeys that matter most to my users and make sure each has a Playwright test that checks the result, not just the clicks. 2) Run those tests on a mobile viewport too (a Playwright device profile) and fix what breaks. 3) Add an automated accessibility scan with @axe-core/playwright on the main pages, then explain each violation and fix the serious ones; tell me what automated scans can't catch (keyboard flow, focus, meaningful labels) and check those by hand with me. 4) Measure load performance on the deployed preview (Lighthouse or the browser's performance panel) and fix the biggest problem. 5) Ask how many users I expect at launch, then compare that to the free-tier limits of my hosting and database (check current docs) and tell me what happens when a limit is hit.",
  },
  {
    id: "incident_runbook",
    module: "monitoring",
    title: "Alerts, owner and runbook",
    why: "Kapag may outage, dapat alam na kung sino ang aasikaso at kung ano ang gagawin, hindi pa lang iisipin. Siguraduhing nakakarating ang alert sa taong kikilos, at gumawa ng maikling runbook: paano i-check, paano mag-rollback, paano mag-restore, at sino ang sasabihan.",
    task: "Incident readiness. 1) List the alerts I have (uptime, failed deploys, failed CI) and where each one goes; send a test failure and confirm it reaches me. Remove or fix any alert I'd ignore. 2) Ask who owns incidents for this app (usually me) and a backup person if there is one. 3) Write a short RUNBOOK.md in the repo: how to tell what's broken (logs, get_logs, the uptime check), how to roll back with launchwright deploy, how to restore data (link RECOVERY.md if it exists), how to rotate a leaked secret, and who to tell, including users and, for a notifiable personal data breach, the NPC within 72 hours. 4) Walk through one pretend outage with me using only the runbook, and fix the steps that didn't work.",
  },
  {
    id: "access_tests",
    module: "security",
    title: "Prove your access control",
    why: "Ang tanong ay hindi lang kung naka-login ang user, kundi kung kanya ba talaga ang record na hinihingi niya. I-validate ang input sa server, i-check ang may-ari ng bawat record (o ang team o tenant nito), at sumulat ng test na sinusubukang kunin o baguhin ang data ng ibang user. Dapat itong ma-reject.",
    task: "Access control exercise. 1) List my API routes and server actions that read or change data, and for each one show me where it checks who the user is and whether they may touch that specific record (owner, team or tenant). 2) Add server-side input validation (a schema such as zod) where it's missing, and make invalid input return a clear 400, not a crash. 3) Write automated tests that sign in as user A and try to read, change and delete user B's records by changing IDs in the request, plus the same calls with no session. They must get 401, 403 or 404 and B's data must be unchanged. 4) Fix every route that fails, and run the tests in CI.",
  },
  {
    id: "abuse_and_deps",
    module: "security",
    title: "Abuse and dependency checks",
    why: "Kapag public na ang app, may magtatangkang abusuhin ito: paulit-ulit na login attempts, spam sa forms, sobrang daming requests na nagpapataas ng bill mo. Lagyan ng rate limits ang login, sign-up at forms, ng spam protection ang public forms kung kailangan, at i-check ang dependencies mo para sa kilalang vulnerabilities.",
    task: "Abuse and dependency exercise. 1) Find my endpoints that can be abused: login, sign-up, password reset, contact or comment forms, anything that sends email or costs money per call. Add rate limits to them (for example a Cloudflare rate limiting rule or the Workers rate limit binding; check what my plan includes) and test that the limit triggers. 2) For public forms that get spam, add a proportionate check such as Cloudflare Turnstile, and explain why I shouldn't add a CAPTCHA where it isn't needed. 3) Run npm audit (or my package manager's equivalent), explain each high or critical finding and whether it affects my app, and fix or upgrade what does. 4) Turn on Dependabot alerts and security updates for the repo, and explain how I'd review those pull requests with review_pr.",
  },
  {
    id: "data_lifecycle",
    module: "security",
    title: "Personal data map and deletion",
    why: "Dapat alam mo kung saan napupunta ang personal data ng users mo: database, logs, backups, email at analytics services. Magtakda kung gaano katagal ito itatago, at gumawa ng paraan para totoong ma-delete ang data ng isang user kapag hiniling niya, pati sa third-party services.",
    task: "Data lifecycle exercise. 1) Build a data map with me in DATA.md: every kind of personal data the app collects, why, where it's stored (database tables, logs, backups, and each third-party service such as email, analytics, payments or AI APIs), and who can access it. 2) Agree on a retention period for each and add a scheduled cleanup for data past it. 3) Implement deleting one user's data on request across the database and each third-party service that supports it; note what stays in backups and for how long, and what we must keep by law. 4) Test it with a throwaway user and confirm the data is gone. 5) Check that my privacy notice matches the data map, under the Data Privacy Act (RA 10173).",
  },
];

export const isExerciseId = (s: string): s is ExerciseId => EXERCISES.some((e) => e.id === s);
export const exercisesIn = (m: ModuleId) => EXERCISES.filter((e) => e.module === m);

export const CONCEPTS = Object.keys(LESSONS) as Concept[];
export const isConcept = (s: string): s is Concept => s in LESSONS;
export const conceptsIn = (m: ModuleId) => CONCEPTS.filter((c) => LESSONS[c].module === m);

export interface ModuleProgress extends Module {
  concepts: { id: Concept; title: string; full: string; done: boolean }[];
  exercises: Exercise[]; // practice; not counted in done/total
  done: number;
  total: number;
  status: "done" | "current" | "next";
}

// Progress per module from the concepts a learner has seen (exercises are listed, not tracked yet). The first unfinished module is "current".
export function progress(seen: Iterable<string>): ModuleProgress[] {
  const s = new Set(seen);
  let current = false;
  return MODULES.map((m) => {
    const concepts = conceptsIn(m.id).map((id) => ({ id, title: LESSONS[id].title, full: LESSONS[id].full, done: s.has(id) }));
    const done = concepts.filter((c) => c.done).length;
    let status: ModuleProgress["status"] = "next";
    if (done === concepts.length) status = "done";
    else if (!current) {
      status = "current";
      current = true;
    }
    return { ...m, concepts, exercises: exercisesIn(m.id), done, total: concepts.length, status };
  });
}
