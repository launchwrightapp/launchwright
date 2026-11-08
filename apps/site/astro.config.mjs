// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Static build into dist/. The Worker in worker/index.ts serves it and handles /api/*.
// Nothing is inlined: our CSP (public/_headers) allows only same-origin scripts and styles.
export default defineConfig({
  site: "https://launchwright.app",
  build: { inlineStylesheets: "never", format: "file" },
  vite: {
    plugins: [tailwindcss()],
    build: { assetsInlineLimit: 0 },
  },
});
