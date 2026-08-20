import { expect, test, type Page } from "@playwright/test";
import { bootstrapPlannerSession } from "../../helpers/planner-auth";
import { readLocalE2ERuntime } from "../../../scripts/local-e2e-config";

const runtime = readLocalE2ERuntime();

async function openCategory(page: Page, name: string) {
  await page
    .locator('[data-testid="budget-category-card"]')
    .filter({ hasText: name })
    .first()
    .click();
}

test.describe("functional/budget", () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapPlannerSession(page, { plan: "pro" });
    await page.goto(`${runtime.urls.app}/budget`);
  });

  test("empty state when there are no categories", async ({ page }) => {
    await expect(page.getByText(/build your budget/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /add a custom category manually/i }),
    ).toBeVisible();
  });

  test("create a category", async ({ page }) => {
    await page
      .getByRole("button", { name: /add a custom category manually/i })
      .click();
    const dialog = page.getByRole("dialog", { name: /add category/i });
    await dialog.getByLabel("Name").fill("Photography");
    await dialog.getByLabel(/estimated budget/i).fill("4000");
    await dialog.getByRole("button", { name: /create/i }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText("Photography")).toBeVisible();
  });

  test("rename a category from the panel", async ({ page }) => {
    await page
      .getByRole("button", { name: /add a custom category manually/i })
      .click();
    let dialog = page.getByRole("dialog", { name: /add category/i });
    await dialog.getByLabel("Name").fill("Venue");
    await dialog.getByLabel(/estimated budget/i).fill("10000");
    await dialog.getByRole("button", { name: /create/i }).click();
    await expect(dialog).toBeHidden();

    await openCategory(page, "Venue");
    await page.getByTestId("rename-category-button").click();
    dialog = page.getByRole("dialog", { name: /edit category/i });
    await dialog.getByLabel("Name").fill("Reception Venue");
    await dialog.getByRole("button", { name: /update/i }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText("Reception Venue").first()).toBeVisible();
  });

  test("delete a category from the panel", async ({ page }) => {
    await page
      .getByRole("button", { name: /add a custom category manually/i })
      .click();
    const createDialog = page.getByRole("dialog", { name: /add category/i });
    await createDialog.getByLabel("Name").fill("Obsolete");
    await createDialog.getByRole("button", { name: /create/i }).click();
    await expect(createDialog).toBeHidden();

    await openCategory(page, "Obsolete");
    await page.getByTestId("delete-category-button").click();
    const confirm = page.getByRole("dialog", { name: /delete obsolete/i });
    await confirm.getByRole("button", { name: /delete category/i }).click();
    await expect(confirm).toBeHidden();

    await expect(page.getByText("Obsolete")).toBeHidden();
    // Empty state returns.
    await expect(page.getByText(/build your budget/i)).toBeVisible();
  });

  test("add an item and totals recompute; edit and delete the item", async ({
    page,
  }) => {
    await page
      .getByRole("button", { name: /add a custom category manually/i })
      .click();
    const cd = page.getByRole("dialog", { name: /add category/i });
    await cd.getByLabel("Name").fill("Catering");
    await cd.getByLabel(/estimated budget/i).fill("5000");
    await cd.getByRole("button", { name: /create/i }).click();
    await expect(cd).toBeHidden();

    await openCategory(page, "Catering");
    await page.getByTestId("add-item-button").click();
    const itemName = page.getByLabel("Name");
    await itemName.fill("Main course");
    await page.getByRole("spinbutton", { name: "Estimated ($)" }).fill("1500");
    await page.getByRole("spinbutton", { name: "Quoted ($)" }).fill("1400");
    await page.getByRole("spinbutton", { name: "Paid ($)" }).fill("500");
    await page.getByRole("button", { name: "Save" }).click();

    const row = page.locator("tbody tr").filter({ hasText: "Main course" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("$1,500.00");
    await expect(row).toContainText("$1,400.00");
    await expect(row).toContainText("$500.00");

    // Budget summary reflects totals with currency formatting. The wedding
    // has a $25,000.00 budget so the total Quoted line should update to
    // "$1,400.00".
    await expect(
      page.getByTestId("budget-summary-bar").getByText(/\$1,400\.00/),
    ).toBeVisible();

    // Edit the item amount.
    await page
      .getByRole("button", { name: /actions for main course/i })
      .click();
    await page.getByRole("menuitem", { name: /edit/i }).click();
    await page.getByRole("spinbutton", { name: "Paid ($)" }).fill("800");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(row).toContainText("$800.00");

    // Delete the item.
    await page
      .getByRole("button", { name: /actions for main course/i })
      .click();
    await page.getByRole("menuitem", { name: /delete/i }).click();
    const confirm = page.getByRole("dialog", { name: /delete main course/i });
    await confirm.getByRole("button", { name: /delete item/i }).click();
    await expect(confirm).toBeHidden();
    await expect(row).toBeHidden();
  });

  test("negative amount is rejected at the API layer", async ({ page }) => {
    // Create a category first so we can target its items endpoint.
    await page
      .getByRole("button", { name: /add a custom category manually/i })
      .click();
    const dialog = page.getByRole("dialog", { name: /add category/i });
    await dialog.getByLabel("Name").fill("Flowers");
    await dialog.getByRole("button", { name: /create/i }).click();
    await expect(dialog).toBeHidden();

    const weddingsResponse = await page.request.get(
      `${runtime.urls.api}/api/weddings`,
      { headers: { Origin: runtime.urls.app } },
    );
    const weddings = (await weddingsResponse.json()) as Array<{ id: string }>;
    const weddingId = weddings[0].id;
    const categoriesResponse = await page.request.get(
      `${runtime.urls.api}/api/weddings/${weddingId}/budget/categories`,
      { headers: { Origin: runtime.urls.app } },
    );
    const categories = (await categoriesResponse.json()) as Array<{
      id: string;
      name: string;
    }>;
    const flowers = categories.find((c) => c.name === "Flowers");
    expect(flowers).toBeDefined();

    const badItem = await page.request.post(
      `${runtime.urls.api}/api/weddings/${weddingId}/budget/categories/${flowers!.id}/items`,
      {
        headers: { Origin: runtime.urls.app },
        data: {
          name: "Bad",
          estimatedCents: -100,
          quotedCents: 0,
          paidCents: 0,
          notes: null,
        },
      },
    );
    expect(badItem.ok()).toBeFalsy();
    expect(badItem.status()).toBeGreaterThanOrEqual(400);
  });

  test("currency formatting uses $ with two decimals and thousands separator", async ({
    page,
  }) => {
    await page
      .getByRole("button", { name: /add a custom category manually/i })
      .click();
    const dialog = page.getByRole("dialog", { name: /add category/i });
    await dialog.getByLabel("Name").fill("Large");
    await dialog.getByLabel(/estimated budget/i).fill("12345.67");
    await dialog.getByRole("button", { name: /create/i }).click();
    await expect(dialog).toBeHidden();

    // Category card renders category totals using `$` and thousands
    // separators with two decimals.
    await expect(
      page
        .getByTestId("budget-category-card")
        .filter({ hasText: "Large" })
        .getByText(/\$12,345\.67/),
    ).toBeVisible();
  });

  test("budget-vs-quoted bar reflects data when both exist", async ({
    page,
  }) => {
    await page
      .getByRole("button", { name: /add a custom category manually/i })
      .click();
    const dialog = page.getByRole("dialog", { name: /add category/i });
    await dialog.getByLabel("Name").fill("Music");
    await dialog.getByLabel(/estimated budget/i).fill("2000");
    await dialog.getByRole("button", { name: /create/i }).click();
    await expect(dialog).toBeHidden();

    await openCategory(page, "Music");
    await page.getByTestId("add-item-button").click();
    await page.getByLabel("Name").fill("DJ");
    await page.getByRole("spinbutton", { name: "Estimated ($)" }).fill("1000");
    await page.getByRole("spinbutton", { name: "Quoted ($)" }).fill("1000");
    await page.getByRole("button", { name: "Save" }).click();

    // Close panel by clicking outside — use Escape key.
    await page.keyboard.press("Escape");

    // Category-level progress on the card reflects 1000 quoted / 2000
    // estimated = 50%.
    await expect(
      page
        .getByTestId("budget-category-card")
        .filter({ hasText: "Music" })
        .getByRole("progressbar"),
    ).toHaveAttribute("aria-label", "50% quoted");
  });
});
