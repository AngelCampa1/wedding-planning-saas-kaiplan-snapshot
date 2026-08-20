import { expect, test, type Page } from "@playwright/test";
import { bootstrapPlannerSession } from "../../helpers/planner-auth";
import { readLocalE2ERuntime } from "../../../scripts/local-e2e-config";

const runtime = readLocalE2ERuntime();

async function addGuestMinimal(
  page: Page,
  firstName: string,
  lastName: string,
) {
  await page.getByRole("button", { name: "Add Guest" }).first().click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("First Name").fill(firstName);
  await sheet.getByLabel("Last Name").fill(lastName);
  await sheet.getByRole("button", { name: "Add Guest" }).click();
  await expect(sheet).toBeHidden();
}

test.describe("functional/guests", () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapPlannerSession(page, { plan: "starter" });
  });

  test("empty state renders when there are no guests", async ({ page }) => {
    await page.goto(`${runtime.urls.app}/guests`);
    await expect(
      page.getByRole("heading", { name: /how would you like to start/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /enter guests manually/i }),
    ).toBeVisible();
  });

  test("add guest with minimum required fields", async ({ page }) => {
    await page.goto(`${runtime.urls.app}/guests`);
    await addGuestMinimal(page, "Rosa", "Quinn");
    await expect(page.getByText("Rosa Quinn")).toBeVisible();
  });

  test("add guest with all optional fields populated", async ({ page }) => {
    await page.goto(`${runtime.urls.app}/guests`);
    await page.getByRole("button", { name: "Add Guest" }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("First Name").fill("Ana");
    await sheet.getByLabel("Last Name").fill("Ruiz");
    await sheet.getByLabel("Email").fill("ana@example.com");
    await sheet.getByLabel("Phone").fill("555-9000");
    await sheet.getByLabel("Group").fill("Family");
    await sheet.getByRole("button", { name: "Partner 1" }).click();
    await sheet.getByLabel(/rsvp status/i).selectOption("invited");
    await sheet.getByRole("button", { name: "Add Guest" }).click();
    await expect(sheet).toBeHidden();

    const row = page.locator("tbody tr").filter({ hasText: "Ana Ruiz" });
    await expect(row).toBeVisible();
    await expect(row.getByText("Invited")).toBeVisible();
  });

  test("edit guest name, email, and contact", async ({ page }) => {
    await page.goto(`${runtime.urls.app}/guests`);
    await addGuestMinimal(page, "Orig", "Name");

    await page.getByRole("button", { name: /edit orig name/i }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("First Name").fill("Renamed");
    await sheet.getByLabel("Last Name").fill("Person");
    await sheet.getByLabel("Email").fill("renamed@example.com");
    await sheet.getByLabel("Phone").fill("555-0101");
    await sheet.getByRole("button", { name: /save changes/i }).click();
    await expect(sheet).toBeHidden();

    await expect(page.getByText("Renamed Person")).toBeVisible();
    await expect(page.getByText("renamed@example.com")).toBeVisible();
    await expect(page.getByText("Orig Name")).toBeHidden();
  });

  test("delete guest — cancel keeps the guest, confirm removes them", async ({
    page,
  }) => {
    await page.goto(`${runtime.urls.app}/guests`);
    await addGuestMinimal(page, "Keep", "Me");

    await page.getByRole("button", { name: /delete keep me/i }).click();
    const confirmDialog = page.getByRole("dialog", {
      name: /delete keep me/i,
    });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: /cancel/i }).click();
    await expect(confirmDialog).toBeHidden();
    await expect(page.getByText("Keep Me")).toBeVisible();

    await page.getByRole("button", { name: /delete keep me/i }).click();
    const confirmAgain = page.getByRole("dialog", {
      name: /delete keep me/i,
    });
    await confirmAgain.getByRole("button", { name: /delete guest/i }).click();
    await expect(confirmAgain).toBeHidden();
    await expect(page.getByText("Keep Me")).toBeHidden();
  });

  test("add plus-one, expand/collapse household row, delete plus-one", async ({
    page,
  }) => {
    await page.goto(`${runtime.urls.app}/guests`);
    await addGuestMinimal(page, "Primary", "Host");

    await page
      .getByRole("button", { name: /add plus-one to primary host/i })
      .click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("First Name").fill("Plus");
    await sheet.getByLabel("Last Name").fill("One");
    await sheet.getByRole("button", { name: /add plus-one/i }).click();
    await expect(sheet).toBeHidden();

    await expect(page.getByText("+1")).toBeVisible();

    const expandButton = page.getByRole("button", {
      name: /expand primary host plus-ones/i,
    });
    await expandButton.click();
    await expect(page.getByText("Plus One")).toBeVisible();

    // Collapse again
    await expandButton.click();
    await expect(page.getByText("Plus One")).toBeHidden();

    // Re-expand and delete the plus-one
    await expandButton.click();
    await page.getByRole("button", { name: /delete plus one/i }).click();
    const confirm = page.getByRole("dialog", { name: /delete plus one/i });
    await confirm.getByRole("button", { name: /delete guest/i }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByText("Plus One")).toBeHidden();
  });

  test("RSVP filter narrows the visible rows", async ({ page }) => {
    await page.goto(`${runtime.urls.app}/guests`);
    await addGuestMinimal(page, "Pending", "Guest");

    await page.getByRole("button", { name: "Add Guest" }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("First Name").fill("Accepted");
    await sheet.getByLabel("Last Name").fill("Guest");
    await sheet.getByLabel(/rsvp status/i).selectOption("accepted");
    await sheet.getByRole("button", { name: "Add Guest" }).click();
    await expect(sheet).toBeHidden();

    await page.getByLabel("Filter by RSVP status").selectOption("accepted");
    await expect(page.getByText("Accepted Guest")).toBeVisible();
    await expect(page.getByText("Pending Guest")).toBeHidden();

    await page.getByLabel("Filter by RSVP status").selectOption("");
    await expect(page.getByText("Pending Guest")).toBeVisible();
    await expect(page.getByText("Accepted Guest")).toBeVisible();
  });

  test("invalid email is rejected by the API without creating the guest", async ({
    page,
  }) => {
    await page.goto(`${runtime.urls.app}/guests`);

    // Drive the API directly to lock in the server-side validation contract.
    // The browser `type=email` input also blocks submission for bad values.
    const request = page.request;
    const weddingsResponse = await request.get(
      `${runtime.urls.api}/api/weddings`,
      { headers: { Origin: runtime.urls.app } },
    );
    expect(weddingsResponse.ok()).toBeTruthy();
    const weddings = (await weddingsResponse.json()) as Array<{ id: string }>;
    expect(weddings.length).toBeGreaterThan(0);
    const weddingId = weddings[0].id;

    const badEmailResponse = await request.post(
      `${runtime.urls.api}/api/weddings/${weddingId}/guests`,
      {
        headers: { Origin: runtime.urls.app },
        data: {
          firstName: "Bad",
          lastName: "Email",
          email: "not-a-valid-email",
          phone: null,
          side: "mutual",
          groupName: null,
          dietaryTags: [],
          dietaryNotes: null,
          rsvpStatus: "pending",
          primaryGuestId: null,
        },
      },
    );
    expect(badEmailResponse.ok()).toBeFalsy();
    expect(badEmailResponse.status()).toBeGreaterThanOrEqual(400);
  });

  test("duplicate guest (same first+last) is rejected — unique-name constraint", async ({
    page,
  }) => {
    // Primary guests are unique by (weddingId, firstName, lastName).
    // Adding a second primary guest with the same name must fail and keep
    // the form open so the user can correct the entry.
    await page.goto(`${runtime.urls.app}/guests`);

    await page.getByRole("button", { name: "Add Guest" }).first().click();
    let sheet = page.getByRole("dialog");
    await sheet.getByLabel("First Name").fill("Dup");
    await sheet.getByLabel("Last Name").fill("Licate");
    await sheet.getByLabel("Email").fill("dup@example.com");
    await sheet.getByRole("button", { name: "Add Guest" }).click();
    await expect(sheet).toBeHidden();

    // Attempt to add the same name again — API should reject it.
    await page.getByRole("button", { name: "Add Guest" }).first().click();
    sheet = page.getByRole("dialog");
    await sheet.getByLabel("First Name").fill("Dup");
    await sheet.getByLabel("Last Name").fill("Licate");
    await sheet.getByLabel("Email").fill("dup@example.com");
    await sheet.getByRole("button", { name: "Add Guest" }).click();
    // Form stays open because the mutation failed.
    await expect(sheet).toBeVisible();

    // Only one row exists — no duplicate was created.
    const rows = page.locator("tbody tr").filter({ hasText: "Dup Licate" });
    await expect(rows).toHaveCount(1);
  });
});
