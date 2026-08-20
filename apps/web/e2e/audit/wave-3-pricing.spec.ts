/**
 * Wave 3 - pricing page editorial overhaul capture.
 *
 * Captures fullpage screenshots of `/pricing/` at 1280px desktop and
 * 375px mobile widths and runs an Axe scan. Mirrors the homepage Wave 2
 * baseline pattern.
 *
 * Run explicitly:
 *   pnpm exec playwright test apps/web/e2e/audit/wave-3-pricing.spec.ts
 *
 * Defaults to a local Astro dev server on port 4324 (the dev server
 * fell back to 4324 when the canonical 3030 was occupied during this
 * wave). Override with `PRICING_URL` env var to target a different
 * origin (e.g. preview deploy).
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { PLAN_PRICING } from "@kaiplan/shared";

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(here, { recursive: true });

const targetUrl = process.env.PRICING_URL ?? "http://localhost:4324/pricing/";
const starterAnnualPrice = PLAN_PRICING.starter.annualPrice;
if (!starterAnnualPrice) {
  throw new Error("Starter annual price is required for pricing E2E.");
}
const starterAnnualMonthlyPrice =
  formatAnnualMonthlyEquivalent(starterAnnualPrice);

function formatAnnualMonthlyEquivalent(annualPrice: string) {
  const amount = Number(annualPrice.replace("$", "").replace("/yr", ""));
  return `$${(amount / 12).toFixed(2)}/mo`;
}

const viewports = [
  { label: "desktop", width: 1280, height: 900 },
  { label: "mobile", width: 375, height: 812 },
] as const;

test.describe("wave 3 - pricing capture", () => {
  test.describe.configure({ mode: "serial" });

  for (const viewport of viewports) {
    test(`captures the ${viewport.label} (${viewport.width}px) pricing page`, async ({
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
      expect(response).not.toBeNull();
      expect(response!.ok()).toBe(true);

      await page.evaluate(() => document.fonts.ready);

      const screenshotPath = join(here, `wave-3-pricing-${viewport.label}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        animations: "disabled",
      });

      const axeResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      // Surface the violation report for the run log.
      console.log(
        `axe-${viewport.label}: ${axeResults.violations.length} violations`,
      );
      for (const v of axeResults.violations) {
        console.log(`  - ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
      }

      expect(axeResults.violations).toEqual([]);

      await context.close();
    });
  }

  test("toggling the annual tab updates URL and prices live", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();

    await page.goto(targetUrl, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    const monthlyButton = page.locator("[data-pricing-tab-monthly]");
    const annualButton = page.locator("[data-pricing-tab-annual]");
    await expect(annualButton).toHaveAttribute("aria-pressed", "true");
    await expect(monthlyButton).toHaveAttribute("aria-pressed", "false");

    const starterPrice = page.locator("[data-monthly-price]").first();
    const starterCurrentPrice = starterPrice.locator("[data-price-current]");
    const starterBillingDetail = starterPrice.locator("[data-price-detail]");
    await expect(starterCurrentPrice).toHaveText(starterAnnualMonthlyPrice);
    await expect(starterBillingDetail).toContainText(starterAnnualPrice);
    await expect(page).not.toHaveURL(/interval=year/);

    await monthlyButton.click();

    await expect(monthlyButton).toHaveAttribute("aria-pressed", "true");
    await expect(annualButton).toHaveAttribute("aria-pressed", "false");
    await expect(starterCurrentPrice).toHaveText(PLAN_PRICING.starter.price);
    await expect(page).not.toHaveURL(/interval=year/);

    await annualButton.click();
    await expect(annualButton).toHaveAttribute("aria-pressed", "true");
    await expect(monthlyButton).toHaveAttribute("aria-pressed", "false");
    await expect(starterCurrentPrice).toHaveText(starterAnnualMonthlyPrice);
    await expect(starterBillingDetail).toContainText(starterAnnualPrice);
    await expect(page).toHaveURL(/interval=year/);

    await context.close();
  });
});
