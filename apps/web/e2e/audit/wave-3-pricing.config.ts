/**
 * Standalone Playwright config for the Wave 3 pricing capture spec.
 * Avoids the workspace-wide e2e config (which boots a full local stack)
 * because this spec only needs the existing Astro dev server.
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /wave-3-pricing\.spec\.ts$/,
  timeout: 60_000,
  retries: 0,
  fullyParallel: false,
  reporter: [["list"]],
});
