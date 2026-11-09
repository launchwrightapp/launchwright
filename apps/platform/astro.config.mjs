// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { mockApi } from "./dev/mock-api.mjs";

// Static build into dist/, served as Worker assets. Nothing is inlined:
// our CSP (public/_headers) allows only same-origin scripts and styles.
export default defineConfig({
  site: "https://platform.launchwright.app",
  build: { inlineStylesheets: "never", format: "file" },
  vite: {
    plugins: [tailwindcss(), mockApi()], // mockApi: dummy /api/* for `astro dev` only
    build: { assetsInlineLimit: 0 },
  },
});
