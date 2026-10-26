import { defineConfig } from "@playwright/test";
import { SITE_PORT } from "./tests/static.ts";

// The guide's site (M16), as GitHub Pages serves it: the app with its engine in the page and the finder as Iso. On a
// desktop and a phone, one ground each.
export default defineConfig({
  testDir: "tests",
  testMatch: "*.site.ts",
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "test-results",
  use: { baseURL: `http://localhost:${SITE_PORT}/`, trace: "retain-on-failure" },
  webServer: { command: "npm run build:guide && node tests/static.ts", url: `http://localhost:${SITE_PORT}/`, reuseExistingServer: false, timeout: 180_000 },
  projects: [
    { name: "desktop-lapis", use: { viewport: { width: 1280, height: 800 }, colorScheme: "dark" } },
    { name: "phone-quartz", use: { viewport: { width: 390, height: 844 }, colorScheme: "light", hasTouch: true } },
  ],
});
