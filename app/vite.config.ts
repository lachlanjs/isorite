import { fileURLToPath } from "node:url";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

// In development (npm run dev), /api comes from a running `isorite serve`
// (ISORITE_SERVE, default http://127.0.0.1:4767).
const serve = process.env.ISORITE_SERVE ?? "http://127.0.0.1:4767";

export default defineConfig({
  plugins: [sveltekit()],
  // The editor does without HTML highlighting (see src/lib/editor/no-html.ts).
  resolve: { alias: { "@codemirror/lang-html": fileURLToPath(new URL("./src/lib/editor/no-html.ts", import.meta.url)) } },
  server: { host: "127.0.0.1", proxy: { "/api": { target: serve, changeOrigin: false } } },
  test: { include: ["src/**/*.test.ts"] },
});
