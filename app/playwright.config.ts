import { defineConfig } from "@playwright/test";
import { PORT } from "./tests/serve.ts";

// Every test runs at a desktop's width and a phone's, on both grounds. They share one server and one base, so
// they run one at a time and each makes notes under its own project's name.
const sizes = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } };

export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.ts",
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "test-results",
  use: { baseURL: `http://localhost:${PORT}/`, trace: "retain-on-failure" },
  webServer: { command: "npm run build && node tests/serve.ts", url: `http://localhost:${PORT}/api/session`, reuseExistingServer: false, timeout: 120_000 },
  projects: Object.entries(sizes).flatMap(([size, viewport]) => (["lapis", "quartz"] as const).map((ground) => ({
    name: `${size}-${ground}`,
    use: { viewport, colorScheme: ground === "lapis" ? "dark" as const : "light" as const, hasTouch: size === "phone" },
  }))),
});
