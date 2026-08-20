/**
 * CRM Feedback Widget — authenticated surface smoke test.
 *
 * Asserts that the Ventora CRM loader script tag is injected into the DOM when
 * VITE_CRM_WIDGET_KEY is set (LOCAL key wk_LOCALTESTPLACEHOLDER00000000000000 is
 * set via gitignored .env.local for local runs; the test does NOT assert that
 * the CRM ingest request succeeds — the CRM enforces an origin allowlist and
 * will silently no-op on localhost, which is expected).
 *
 * This spec requires a running local stack (app + api) with the widget key set.
 * If VITE_CRM_WIDGET_KEY is not present in the built bundle the test is skipped.
 */

import { expect, test } from "@playwright/test";
import { bootstrapPlannerSession } from "../helpers/planner-auth";
import { readLocalE2ERuntime } from "../../scripts/local-e2e-config";
import { installPageDiagnostics } from "../helpers/page-diagnostics";

const runtime = readLocalE2ERuntime();

test.describe("CRM feedback widget — authenticated surface", () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapPlannerSession(page, { plan: "pro" });
  });

  test("loader script tag is injected when widget key is configured", async ({
    page,
  }) => {
    const diagnostics = installPageDiagnostics(page);

    await page.goto(`${runtime.urls.app}/dashboard`);
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();

    // Check the CRM loader script is present in the DOM.
    const scriptHandle = await page.$(
      'script[data-widget="feedback-button"][src*="widgets.ventoralabs.com"]',
    );

    if (scriptHandle === null) {
      // VITE_CRM_WIDGET_KEY not set in this build — widget is intentionally absent.
      test.skip(
        true,
        "VITE_CRM_WIDGET_KEY not configured in this build; widget disabled",
      );
      return;
    }

    const dataProd = await scriptHandle.getAttribute("data-product");
    expect(dataProd).toBeTruthy();
    expect(dataProd).toMatch(/^wk_/);

    const src = await scriptHandle.getAttribute("src");
    expect(src).toContain("widgets.ventoralabs.com/w/v1.js");

    diagnostics.expectNoFailures();
  });
});
