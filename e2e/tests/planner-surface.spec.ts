import { expect, test } from "@playwright/test";
import { bootstrapPlannerSession } from "../helpers/planner-auth";
import { readLocalE2ERuntime } from "../../scripts/local-e2e-config";
import { installPageDiagnostics } from "../helpers/page-diagnostics";

const runtime = readLocalE2ERuntime();

const plannerRoutes = [
  { path: "/dashboard", heading: /welcome back/i },
  { path: "/guests", heading: /guest list/i },
  { path: "/budget", heading: /^budget$/i },
  { path: "/vendors", heading: /^vendors$/i },
  { path: "/seating", heading: /set up your guest list first|seating chart/i },
  { path: "/settings", heading: /^settings$/i },
  { path: "/website", heading: /wedding website/i },
] as const;

test.describe("planner surface", () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapPlannerSession(page, { plan: "pro" });
  });

  for (const route of plannerRoutes) {
    test(`renders ${route.path} for an authenticated planner`, async ({
      page,
    }) => {
      const diagnostics = installPageDiagnostics(page);

      await page.goto(`${runtime.urls.app}${route.path}`);

      await expect(
        page.getByRole("heading", { name: route.heading }),
      ).toBeVisible();
      diagnostics.expectNoFailures();
    });
  }
});
