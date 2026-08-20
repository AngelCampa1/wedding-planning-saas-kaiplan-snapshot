import { expect, test } from "@playwright/test";
import { readLocalE2ERuntime } from "../../scripts/local-e2e-config";
import { installPageDiagnostics } from "../helpers/page-diagnostics";

const runtime = readLocalE2ERuntime();

test.describe("public interactions", () => {
  test("uses the active planner origin for homepage and mobile-nav planner ctas", async ({
    page,
  }) => {
    const diagnostics = installPageDiagnostics(page);

    const appUrl = new URL(runtime.urls.app);

    async function expectCta(
      locator: ReturnType<typeof page.getByRole>,
      expectedPath: string,
      expectedSearch: string,
    ): Promise<void> {
      const href = await locator.getAttribute("href");
      if (!href) throw new Error("CTA link has no href attribute");
      const actual = new URL(href);
      expect(actual.port).toBe(appUrl.port);
      expect(actual.pathname).toBe(expectedPath);
      expect(actual.search).toBe(expectedSearch);
    }

    await page.goto(runtime.urls.web);

    await expectCta(
      page.getByRole("link", { name: "Start free trial" }).nth(0),
      "/signup",
      "",
    );
    await expectCta(
      page.getByRole("link", { name: "Start free trial" }).nth(1),
      "/signup",
      "",
    );
    await expectCta(
      page.getByRole("link", { name: "Get Lifetime access" }),
      "/signup",
      "",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open navigation" }).click();

    await expectCta(
      page
        .getByRole("navigation", { name: "Mobile navigation" })
        .getByRole("link", {
          name: "Start planning",
        }),
      "/signup",
      "",
    );

    diagnostics.expectNoFailures();
  });

  test("lets the default feedback category submit once the message is filled", async ({
    page,
    request,
  }) => {
    const health = await request
      .get(`${runtime.urls.web}/api/health/`)
      .catch(() => null);
    expect(
      health?.ok(),
      "Marketing API should be reachable via the web proxy",
    ).toBe(true);

    const diagnostics = installPageDiagnostics(page);

    await page.goto(runtime.urls.web);
    await page.getByRole("button", { name: "Open feedback form" }).click();

    await page
      .getByLabel("Message")
      .fill("Exploratory feedback from the E2E sweep.");
    await page.getByLabel("Email (optional)").fill("feedback@example.com");

    const submit = page.getByRole("button", { name: "Submit Feedback" });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(
      page.getByText("Your feedback has been submitted."),
    ).toBeVisible();
    diagnostics.expectNoFailures();
  });
});
