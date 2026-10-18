import { defineConfig } from "@playwright/test";
import { LOCAL_PORT } from "./tests/local.ts";

// The browser's half of the tutorial as isorite --tutorial serves it: the app built, on a real server over the
// example base, Iso scripted. The parts are walked once, in order, on the one base, at a desktop's width.
// (npx playwright test -c playwright.local.config.ts)
export default defineConfig({
  testDir: "tests",
  testMatch: "tutorial.walk.ts",
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
  use: { baseURL: `http://127.0.0.1:${LOCAL_PORT}/`, trace: "retain-on-failure" },
  webServer: { command: "npm run build && node tests/local.ts", url: `http://127.0.0.1:${LOCAL_PORT}/api/session`, reuseExistingServer: false, timeout: 180_000 },
  projects: [{ name: "local-desktop-lapis", use: { viewport: { width: 1440, height: 900 }, colorScheme: "dark" } }],
});
