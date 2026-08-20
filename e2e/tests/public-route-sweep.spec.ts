import { expect, test } from "@playwright/test";
import { PUBLIC_SWEEP_ROUTES } from "../helpers/public-route-manifest";
import { installPageDiagnostics } from "../helpers/page-diagnostics";

test.describe("public route sweep", () => {
  for (const route of PUBLIC_SWEEP_ROUTES) {
    test(`renders ${route}`, async ({ page }) => {
      const diagnostics = installPageDiagnostics(page);

      await page.goto(route);

      await expect(
        page.locator("h1:visible, h2:visible").first(),
      ).toBeVisible();
      diagnostics.expectNoFailures();
    });
  }

  test("renders lead magnet statistic citations with source links", async ({
    page,
  }) => {
    const diagnostics = installPageDiagnostics(page);

    await page.goto("/free/budget-template/");

    const citation = page.locator('[aria-label="Sources and citations"]');
    await expect(citation).toBeVisible();
    await expect(citation).toContainText("Zola First Look Report 2025");
    await expect(
      citation.getByRole("link", { name: "Zola First Look Report 2025" }),
    ).toHaveAttribute(
      "href",
      "https://www.zola.com/expert-advice/the-first-look-report-2025",
    );
    diagnostics.expectNoFailures();
  });
});
