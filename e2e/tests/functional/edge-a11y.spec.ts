import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { bootstrapPlannerSession } from "../../helpers/planner-auth";
import { installPageDiagnostics } from "../../helpers/page-diagnostics";
import { readLocalE2ERuntime } from "../../../scripts/local-e2e-config";

const runtime = readLocalE2ERuntime();

const PLANNER_ROUTES = [
  "/dashboard",
  "/guests",
  "/seating",
  "/budget",
  "/checklist",
  "/vendors",
  "/website",
  "/help",
  "/settings",
] as const;

const VIEWPORTS = [
  { label: "mobile", width: 375, height: 720 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "desktop", width: 1440, height: 900 },
] as const;

// Color-contrast is tracked as known design debt in docs/audit — this
// spec only fails on NEW serious/critical violations. The existing
// brand sage (#7c9a82) on white/warm surfaces is a per-token issue
// being worked on holistically; the seating chart's drag-and-drop
// canvas is an intentionally non-focusable scroll region that will
// need a parallel keyboard affordance before the rule can be lifted.
// Allowlist below keeps the guardrail useful without blocking merges
// on pre-existing debt.
const ALLOWED_VIOLATION_IDS = new Set([
  "color-contrast",
  "scrollable-region-focusable",
]);

type ViolationSummary = {
  id: string;
  impact: string | null;
  nodes: number;
};

async function runAxe(page: Page): Promise<ViolationSummary[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? null,
    nodes: violation.nodes.length,
  }));
}

test.describe("functional/edge-a11y", () => {
  test("planner routes have no horizontal scrollbar across viewports", async ({
    page,
  }) => {
    test.slow();
    await bootstrapPlannerSession(page, { plan: "pro" });

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      for (const route of PLANNER_ROUTES) {
        await page.goto(`${runtime.urls.app}${route}`);
        // Allow layout to settle.
        await page.waitForLoadState("networkidle");
        const overflowed = await page.evaluate(
          () =>
            document.documentElement.scrollWidth > window.innerWidth + 1 ||
            document.body.scrollWidth > window.innerWidth + 1,
        );
        expect(
          overflowed,
          `horizontal scrollbar on ${route} @ ${viewport.label}`,
        ).toBe(false);
      }
    }
  });

  test("primary navigation is reachable on every planner route at desktop", async ({
    page,
  }) => {
    await bootstrapPlannerSession(page, { plan: "pro" });
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const route of PLANNER_ROUTES) {
      await page.goto(`${runtime.urls.app}${route}`);
      // The desktop sidebar renders a link to /dashboard; on mobile
      // the hamburger button is the primary nav affordance.
      const navLink = page.getByRole("link", { name: "Dashboard" }).first();
      await expect(navLink).toBeVisible();
    }
  });

  test("planner routes have no NEW serious or critical axe violations at desktop", async ({
    page,
  }) => {
    test.slow();
    await bootstrapPlannerSession(page, { plan: "pro" });
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const route of PLANNER_ROUTES) {
      await page.goto(`${runtime.urls.app}${route}`);
      await page.waitForLoadState("networkidle");

      const violations = await runAxe(page);
      const blocking = violations.filter(
        (violation) =>
          (violation.impact === "serious" || violation.impact === "critical") &&
          !ALLOWED_VIOLATION_IDS.has(violation.id),
      );

      expect(
        blocking,
        `unexpected blocking axe violations on ${route}: ${blocking
          .map((violation) => `${violation.impact}:${violation.id}`)
          .join(", ")}`,
      ).toEqual([]);
    }
  });

  test("SPA renders a user-facing not-found state for unknown routes", async ({
    page,
  }) => {
    await page.goto(`${runtime.urls.app}/definitely-not-a-route`);
    // Wait for the router to settle on the custom not-found component.
    // The heading is set by __root.tsx's NotFoundComponent.
    await expect(
      page.getByRole("heading", { name: /page not found/i }),
    ).toBeVisible({ timeout: 10_000 });

    const bodyText = await page.locator("body").innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
    expect(bodyText.toLowerCase()).toContain("not found");
  });

  test("deleting the session cookie redirects /dashboard to /login", async ({
    page,
    context,
  }) => {
    await bootstrapPlannerSession(page, { plan: "pro" });
    await page.goto(`${runtime.urls.app}/dashboard`);
    await expect(page).toHaveURL(/\/dashboard/);

    // Wipe every cookie in the context — the Better Auth session
    // cookie is the gate for `_authenticated/*` routes.
    await context.clearCookies();

    await page.goto(`${runtime.urls.app}/dashboard`);
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("deleted guests do not reappear after a reload (stale-cache guard)", async ({
    page,
  }) => {
    await bootstrapPlannerSession(page, { plan: "pro" });
    const diagnostics = installPageDiagnostics(page);

    await page.goto(`${runtime.urls.app}/guests`);
    await page.getByRole("button", { name: "Add Guest" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Guest" });
    const uniqueFirst = `Cache${Date.now()}`;
    await page.getByLabel("First Name").fill(uniqueFirst);
    await page.getByLabel("Last Name").fill("Guard");
    await dialog.getByRole("button", { name: "Add Guest" }).click();
    await expect(dialog).toBeHidden();

    const row = page
      .locator("tbody tr")
      .filter({ hasText: `${uniqueFirst} Guard` });
    await expect(row).toBeVisible();

    await row
      .getByRole("button", { name: `Delete ${uniqueFirst} Guard` })
      .click();
    const confirmDialog = page.getByRole("dialog", {
      name: new RegExp(`delete ${uniqueFirst} guard\\?`, "i"),
    });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete guest" }).click();

    await expect(
      page.locator("tbody tr").filter({ hasText: `${uniqueFirst} Guard` }),
    ).toHaveCount(0);

    await page.reload();
    await expect(
      page.locator("tbody tr").filter({ hasText: `${uniqueFirst} Guard` }),
    ).toHaveCount(0);

    diagnostics.expectNoFailures();
  });
});
