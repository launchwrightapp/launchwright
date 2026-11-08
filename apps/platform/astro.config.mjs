// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Static build into dist/, served as Worker assets. Nothing is inlined:
// our CSP (public/_headers) allows only same-origin scripts and styles.
export default defineConfig({
  site: "https://platform.launchwright.app",
  build: { inlineStylesheets: "never", format: "file" },
  vite: {
    plugins: [tailwindcss()],
    build: { assetsInlineLimit: 0 },
  },
});
