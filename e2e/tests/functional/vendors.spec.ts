import { expect, test, type Page } from "@playwright/test";
import { bootstrapPlannerSession } from "../../helpers/planner-auth";
import { readLocalE2ERuntime } from "../../../scripts/local-e2e-config";

const runtime = readLocalE2ERuntime();

async function createBudgetCategoryViaApi(
  page: Page,
  weddingId: string,
  name: string,
) {
  const response = await page.request.post(
    `${runtime.urls.api}/api/weddings/${weddingId}/budget/categories`,
    {
      headers: { Origin: runtime.urls.app },
      data: { name, estimatedCents: 100000 },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as { id: string; name: string };
}

async function openAddVendorForm(page: Page) {
  await page
    .getByRole("button", { name: /add vendor/i })
    .first()
    .click();
  return page.getByRole("dialog", { name: /add vendor/i });
}

test.describe("functional/vendors", () => {
  test("empty state invites the user to add their first vendor", async ({
    page,
  }) => {
    const { wedding } = await bootstrapPlannerSession(page, { plan: "pro" });
    await createBudgetCategoryViaApi(page, wedding.id, "Photography");

    await page.goto(`${runtime.urls.app}/vendors`);
    await expect(
      page.getByText(/track every quote, every payment/i),
    ).toBeVisible();
  });

  test("create vendor with all core fields", async ({ page }) => {
    const { wedding } = await bootstrapPlannerSession(page, { plan: "pro" });
    await createBudgetCategoryViaApi(page, wedding.id, "Photography");

    await page.goto(`${runtime.urls.app}/vendors`);
    const dialog = await openAddVendorForm(page);
    await dialog.getByLabel(/primary contact/i).fill("Jordan Li");
    await dialog.getByLabel(/company/i).fill("Light Box Studio");
    await dialog.getByLabel(/email/i).fill("jordan@lightbox.example");
    await dialog.getByLabel(/phone/i).fill("555-0199");
    await dialog.getByLabel(/budget category/i).selectOption({
      label: "Photography",
    });
    await dialog.getByLabel(/contract url/i).fill("https://example.com/c.pdf");
    await dialog.getByRole("button", { name: /create/i }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText("Light Box Studio")).toBeVisible();
    await expect(page.getByText("Jordan Li")).toBeVisible();
  });

  test("edit vendor fields from the detail panel", async ({ page }) => {
    const { wedding } = await bootstrapPlannerSession(page, { plan: "pro" });
    await createBudgetCategoryViaApi(page, wedding.id, "Florals");

    await page.goto(`${runtime.urls.app}/vendors`);
    const dialog = await openAddVendorForm(page);
    await dialog.getByLabel(/primary contact/i).fill("Rosa Chen");
    await dialog.getByLabel(/company/i).fill("Bloom Co");
    await dialog.getByRole("button", { name: /create/i }).click();
    await expect(dialog).toBeHidden();

    await page.getByText("Bloom Co").click();
    await page.getByTestId("edit-vendor-button").click();
    const editDialog = page.getByRole("dialog", { name: /edit vendor/i });
    await editDialog.getByLabel(/company/i).fill("Bloom & Co");
    await editDialog.getByRole("button", { name: /update/i }).click();
    await expect(editDialog).toBeHidden();

    await expect(page.getByText("Bloom & Co").first()).toBeVisible();
  });

  test("delete vendor via detail panel confirm dialog", async ({ page }) => {
    const { wedding } = await bootstrapPlannerSession(page, { plan: "pro" });
    await createBudgetCategoryViaApi(page, wedding.id, "DJ");

    await page.goto(`${runtime.urls.app}/vendors`);
    const dialog = await openAddVendorForm(page);
    await dialog.getByLabel(/primary contact/i).fill("Doomed Contact");
    await dialog.getByLabel(/company/i).fill("Doomed Vendor");
    await dialog.getByRole("button", { name: /create/i }).click();
    await expect(dialog).toBeHidden();

    await page.getByText("Doomed Vendor").click();
    await page.getByRole("button", { name: /^Delete$/ }).click();
    const confirm = page.getByRole("dialog", { name: /delete doomed vendor/i });
    await confirm.getByRole("button", { name: /delete vendor/i }).click();
    await expect(confirm).toBeHidden();

    await expect(page.getByText("Doomed Vendor")).toBeHidden();
  });

  test("category filter narrows the vendor list", async ({ page }) => {
    const { wedding } = await bootstrapPlannerSession(page, { plan: "pro" });
    const photo = await createBudgetCategoryViaApi(
      page,
      wedding.id,
      "Photography",
    );
    const florals = await createBudgetCategoryViaApi(
      page,
      wedding.id,
      "Florals",
    );

    // Seed two vendors via API for speed.
    await page.request.post(
      `${runtime.urls.api}/api/weddings/${wedding.id}/vendors`,
      {
        headers: { Origin: runtime.urls.app },
        data: {
          primaryContactName: "Photo Contact",
          companyName: "Photo Co",
          email: null,
          phone: null,
          categoryId: photo.id,
          contractStatus: "none",
          contractUrl: null,
          contractSentAt: null,
          contractSignedAt: null,
          notes: null,
        },
      },
    );
    await page.request.post(
      `${runtime.urls.api}/api/weddings/${wedding.id}/vendors`,
      {
        headers: { Origin: runtime.urls.app },
        data: {
          primaryContactName: "Flower Contact",
          companyName: "Flower Co",
          email: null,
          phone: null,
          categoryId: florals.id,
          contractStatus: "none",
          contractUrl: null,
          contractSentAt: null,
          contractSignedAt: null,
          notes: null,
        },
      },
    );

    await page.goto(`${runtime.urls.app}/vendors`);
    await expect(page.getByText("Photo Co").first()).toBeVisible();
    await expect(page.getByText("Flower Co").first()).toBeVisible();

    await page.getByLabel(/filter vendors by category/i).selectOption({
      label: "Photography",
    });
    await expect(page.getByText("Photo Co").first()).toBeVisible();
    await expect(page.getByText("Flower Co")).toBeHidden();

    await page.getByLabel(/filter vendors by category/i).selectOption({
      label: "All categories",
    });
    await expect(page.getByText("Flower Co").first()).toBeVisible();
  });

  test("contract status can transition none → sent → signed via the toggle", async ({
    page,
  }) => {
    const { wedding } = await bootstrapPlannerSession(page, { plan: "pro" });
    await createBudgetCategoryViaApi(page, wedding.id, "Venue");

    await page.goto(`${runtime.urls.app}/vendors`);
    const dialog = await openAddVendorForm(page);
    await dialog.getByLabel(/primary contact/i).fill("Status Contact");
    await dialog.getByLabel(/company/i).fill("Status Vendor");
    await dialog
      .getByLabel(/^Contract status$/i)
      .selectOption({ label: "Sent" });
    await dialog.getByRole("button", { name: /create/i }).click();
    await expect(dialog).toBeHidden();

    await page.getByText("Status Vendor").click();
    // Select switches Sent -> Signed via the detail-panel contract status dropdown.
    await page
      .getByLabel(/^Contract status$/i)
      .selectOption({ label: "Signed" });
    await expect(
      page
        .locator("p")
        .filter({ hasText: /^signed$/i })
        .first(),
    ).toBeVisible();
  });

  test("invalid URL in contractUrl is rejected by the API", async ({
    page,
  }) => {
    const { wedding } = await bootstrapPlannerSession(page, { plan: "pro" });
    const category = await createBudgetCategoryViaApi(
      page,
      wedding.id,
      "Bakery",
    );

    const response = await page.request.post(
      `${runtime.urls.api}/api/weddings/${wedding.id}/vendors`,
      {
        headers: { Origin: runtime.urls.app },
        data: {
          primaryContactName: "Baker",
          companyName: "Bad URL Bakery",
          email: null,
          phone: null,
          categoryId: category.id,
          contractStatus: "none",
          contractUrl: "ftp://not-supported.test",
          contractSentAt: null,
          contractSignedAt: null,
          notes: null,
        },
      },
    );
    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});
