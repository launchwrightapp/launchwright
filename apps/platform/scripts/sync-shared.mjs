// The UI system lives in apps/site/public. Copy it in so both apps share one source.
import { copyFileSync } from "node:fs";
for (const f of ["grid.css", "favicon.svg", "theme.js"]) {
  copyFileSync(new URL(`../../site/public/${f}`, import.meta.url), new URL(`../public/${f}`, import.meta.url));
}
console.log("synced grid.css, favicon.svg, theme.js from apps/site");
