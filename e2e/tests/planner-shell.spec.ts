import { expect, test } from "@playwright/test";
import { readLocalE2ERuntime } from "../../scripts/local-e2e-config";
import { installPageDiagnostics } from "../helpers/page-diagnostics";

const runtime = readLocalE2ERuntime();

const shellRoutes = [
  { path: "/login", heading: /welcome back/i },
  { path: "/signup", heading: /start your planning trial/i },
  { path: "/forgot-password", heading: /^reset your password$/i },
] as const;

test.describe("planner shell", () => {
  for (const route of shellRoutes) {
    test(`renders ${route.path} without runtime failures`, async ({ page }) => {
      const diagnostics = installPageDiagnostics(page);

      await page.goto(`${runtime.urls.app}${route.path}`);

      await expect(
        page.getByRole("heading", { name: route.heading }),
      ).toBeVisible();
      diagnostics.expectNoFailures();
    });
  }
});
