import { defineConfig, devices } from "@playwright/test";

// QA scratch run (tasks 012/013 pass). Fixed port 3100, never the real repo's :3000.
// One production build (`npm run build`, output: export -> out/) is served by
// e2e/helpers/serve-out.mjs, so every run in a pass is served by the same tree.
// Next allows one dev server per project directory, so `next dev` is not used here.
// Use: npx playwright test -c e2e/scratch-3100.config.ts <spec> [-g "<name>"]
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node e2e/helpers/serve-out.mjs 3100",
    cwd: process.cwd(),
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
