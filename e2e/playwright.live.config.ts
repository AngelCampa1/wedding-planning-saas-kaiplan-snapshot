import { defineConfig, devices } from "@playwright/test";

const headless = process.env.KAIPLAN_LIVE_E2E_HEADLESS !== "false";

export default defineConfig({
  testDir: "./tests/live",
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "../test-results/live-playwright",
  use: {
    baseURL: "https://kaiplan.app",
    headless,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-live",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
