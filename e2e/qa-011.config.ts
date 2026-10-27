import { defineConfig, devices } from "@playwright/test";

// Task 011 QA scratch config. Runs against an already-started production build on
// :3100 (never :3000, where a next dev from the real repo may be running).
// Start it with `npx next start -p 3100` from a build of the same tree.
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 2,
  reporter: "list",
  use: { baseURL: "http://localhost:3100", trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
