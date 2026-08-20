/**
 * Wave 0 — editorial overhaul visual baseline.
 *
 * Captures a single "before" screenshot of the homepage so later waves can
 * compare against the legacy sage/gold design. Run BEFORE migrating any
 * pages to the editorial system.
 *
 * This spec is intentionally standalone — it lives outside the shared
 * `e2e/tests/` Playwright project so the workspace `pnpm verify` flow
 * does not block on it. Run it explicitly:
 *
 *   pnpm exec playwright test apps/web/e2e/audit/editorial-baseline.spec.ts
 *
 * Targets in priority order:
 *   1. `EDITORIAL_BASELINE_URL` env var (any explicit URL).
 *   2. The live production site at https://kaiplan.app/ — the canonical
 *      "before" reference, which is what we want to compare against.
 *   3. Local dev server on port 3030 as a fallback when offline.
 *
 * Output:
 *   apps/web/e2e/audit/__baselines__/before-overhaul-home-{viewport}.png
 *
 * Both desktop and mobile widths are captured because the editorial
 * waves intentionally rework mobile rhythm too.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { test, expect } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const baselineDir = join(here, "__baselines__");
mkdirSync(baselineDir, { recursive: true });

const targetUrl = process.env.EDITORIAL_BASELINE_URL ?? "https://kaiplan.app/";

const viewports = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile", width: 375, height: 812 },
] as const;

test.describe("editorial overhaul — before baseline", () => {
  test.describe.configure({ mode: "serial" });

  for (const viewport of viewports) {
    test(`captures the ${viewport.label} (${viewport.width}px) homepage as before-overhaul`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();

      const response = await page.goto(targetUrl, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });

      // The baseline is informational — fail loudly if the live URL is
      // unreachable so the human knows to switch to the local fallback,
      // but never silently produce an empty PNG.
      expect(
        response,
        `editorial baseline target ${targetUrl} produced no response`,
      ).not.toBeNull();
      expect(
        response!.ok(),
        `editorial baseline target ${targetUrl} returned ${response!.status()}`,
      ).toBe(true);

      // Give font swaps a moment to settle so the baseline matches what
      // a visitor actually sees, not the FOIT frame.
      await page.evaluate(() => document.fonts.ready);

      const screenshotPath = join(
        baselineDir,
        `before-overhaul-home-${viewport.label}.png`,
      );
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        animations: "disabled",
      });

      await context.close();
    });
  }
});
