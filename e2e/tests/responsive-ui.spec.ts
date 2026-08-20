import { expect, test } from "@playwright/test";
import { bootstrapPlannerSession } from "../helpers/planner-auth";
import { readLocalE2ERuntime } from "../../scripts/local-e2e-config";
import { installPageDiagnostics } from "../helpers/page-diagnostics";

const runtime = readLocalE2ERuntime();

test.describe("responsive ui", () => {
  test("keeps homepage mobile navigation without the public feedback widget", async ({
    page,
  }) => {
    const diagnostics = installPageDiagnostics(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(runtime.urls.web);

    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page.getByRole("navigation", { name: "Mobile navigation" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Close navigation" }).click();
    await expect(
      page.locator('script[src="https://widgets.ventoralabs.com/w/v1.js"]'),
    ).toHaveCount(0);

    diagnostics.expectNoFailures();
  });

  test("keeps the authenticated guest list visible on mobile", async ({
    page,
  }) => {
    await bootstrapPlannerSession(page, { plan: "pro" });
    const diagnostics = installPageDiagnostics(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${runtime.urls.app}/guests`);

    await expect(
      page.getByRole("heading", { name: /guest list/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page.getByRole("navigation", { name: "Mobile navigation" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();

    await expect(
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).resolves.toBe(true);

    diagnostics.expectNoFailures();
  });
});

const marketingRoutes: Array<{ path: string; label: string }> = [
  { path: "/", label: "homepage" },
  { path: "/pricing", label: "pricing" },
  { path: "/features", label: "features" },
  { path: "/about", label: "about" },
  { path: "/resources/", label: "resources hub" },
  { path: "/compare/", label: "compare hub" },
];

test.describe("marketing route sweep", () => {
  for (const route of marketingRoutes) {
    test(`renders ${route.label} (${route.path}) without horizontal overflow or console failures`, async ({
      page,
    }) => {
      const diagnostics = installPageDiagnostics(page);
      const url = new URL(route.path, runtime.urls.web).toString();

      await page.setViewportSize({ width: 390, height: 844 });
      const response = await page.goto(url);
      expect(
        response?.ok(),
        `route ${route.path} should resolve successfully (status ${response?.status() ?? "none"})`,
      ).toBe(true);

      const overflowOk = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      );
      expect(
        overflowOk,
        `expected no horizontal overflow on ${route.path}`,
      ).toBe(true);

      const openButton = page.getByRole("button", { name: "Open navigation" });
      await expect(openButton).toBeVisible();
      await openButton.click();
      await expect(
        page.getByRole("navigation", { name: "Mobile navigation" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Close navigation" }).click();
      await expect(
        page.getByRole("navigation", { name: "Mobile navigation" }),
      ).toBeHidden();

      diagnostics.expectNoFailures();
    });
  }
});
