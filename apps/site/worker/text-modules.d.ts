// Wrangler bundles .txt imports as strings (its default Text module rule).
// (.html is declared by Astro's types; see worker/emails.ts.)
declare module "*.txt" { const text: string; export default text; }
