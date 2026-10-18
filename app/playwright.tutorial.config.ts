import { defineConfig } from "@playwright/test";
import { TUTORIAL_PORT } from "./tests/static.ts";

// The tutorial: the built site with the engine in the page and no server behind it, walked from start to end at a
// desktop's width on both grounds. (npx playwright test -c playwright.tutorial.config.ts)
export default defineConfig({
  testDir: "tests",
  testMatch: "*.walk.ts",
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
  use: { baseURL: `http://127.0.0.1:${TUTORIAL_PORT}/`, trace: "retain-on-failure", viewport: { width: 1440, height: 900 } },
  webServer: { command: "npm run build:tutorial && node tests/static.ts", url: `http://127.0.0.1:${TUTORIAL_PORT}/`, reuseExistingServer: false, timeout: 180_000 },
  projects: (["lapis", "quartz"] as const).map((ground) => ({ name: `tutorial-${ground}`, use: { colorScheme: ground === "lapis" ? "dark" as const : "light" as const } })),
});
