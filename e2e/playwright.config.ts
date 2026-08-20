import { defineConfig, devices } from "@playwright/test";
import {
  buildLocalPlaywrightWebServers,
  ensureLocalE2ERuntime,
} from "../scripts/local-e2e-config";

const runtime = await ensureLocalE2ERuntime();

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/live/**"],
  timeout: 30_000,
  fullyParallel: true,
  workers: process.env.CI ? undefined : 1,
  retries: 1,
  use: {
    baseURL: runtime.urls.web,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "iphone-12",
      use: { ...devices["iPhone 12"] },
    },
    {
      name: "pixel-7",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: buildLocalPlaywrightWebServers(runtime),
});
