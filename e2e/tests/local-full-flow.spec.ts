import { expect, test } from "@playwright/test";
import { completeLocalCheckoutForEmail } from "../helpers/local-billing";
import { readLocalE2ERuntime } from "../../scripts/local-e2e-config";

const runtime = readLocalE2ERuntime();

test.describe("local full flow", () => {
  test("signs up, publishes a site, submits RSVP, and reflects it in the app", async ({
    page,
    context,
  }) => {
    test.slow();

    const timestamp = Date.now();
    const signupEmail = `e2e-local-${timestamp}@example.com`;
    const password = "supersecret123";

    await page.goto(`${runtime.urls.app}/signup`);
    await page.getByLabel("Name").fill("Local E2E");
    await page.getByLabel("Email").fill(signupEmail);
    await page.getByLabel("Password").fill(password);
    await page
      .getByRole("button", { name: "Create my planning workspace" })
      .click();

    await expect(
      page.getByRole("heading", {
        name: /let's set up your wedding/i,
      }),
    ).toBeVisible();

    const billingSummary = await completeLocalCheckoutForEmail(
      page.request,
      signupEmail,
      "pro",
    );

    expect(billingSummary).toMatchObject({
      plan: "pro",
      status: "trialing",
      canManageBilling: true,
    });

    await page.goto(`${runtime.urls.app}/onboarding`);
    await expect(
      page.getByRole("heading", { name: /let's set up your wedding/i }),
    ).toBeVisible();

    await page
      .getByLabel(/what do you want to call this workspace/i)
      .fill("Local E2E Wedding");
    await page.getByLabel(/Wedding date/i).fill("2027-06-20");
    await page.getByLabel(/^Budget/i).fill("25000");
    await page.getByRole("button", { name: /start planning/i }).click();

    await expect(
      page.getByRole("heading", { name: /welcome back, local/i }),
    ).toBeVisible();

    await page.goto(`${runtime.urls.app}/guests`);
    await page.getByRole("button", { name: "Add Guest" }).click();
    const guestDialog = page.getByRole("dialog", { name: "Add Guest" });
    await page.getByLabel("First Name").fill("Ava");
    await page.getByLabel("Last Name").fill("Rivera");
    await page.getByLabel("Email").fill("ava.rivera@example.com");
    await guestDialog.getByRole("button", { name: "Add Guest" }).click();
    await expect(guestDialog).toBeHidden();

    await expect(page.getByText("Ava Rivera")).toBeVisible();

    await page
      .getByRole("button", { name: /add plus-one to ava rivera/i })
      .click();
    const plusOneDialog = page.getByRole("dialog", {
      name: /add plus-one for ava rivera/i,
    });
    await page.getByLabel("First Name").fill("Sam");
    await page.getByLabel("Last Name").fill("Rivera");
    await plusOneDialog.getByRole("button", { name: "Add Plus-One" }).click();
    await expect(plusOneDialog).toBeHidden();

    await expect(page.getByText("+1")).toBeVisible();

    await page.goto(`${runtime.urls.app}/website`);
    await expect(
      page.getByRole("heading", { name: "Wedding Website" }),
    ).toBeVisible();

    await page.getByLabel("Slug").fill(`local-e2e-${timestamp}`);
    await page.getByLabel(/^Title$/).fill("Ava & Sam");
    await page.getByLabel("Venue name").fill("The Palm House");
    const saveDraftResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/weddings/") &&
        response.url().includes("/website") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save draft" }).last().click();
    const saveDraft = await saveDraftResponse;
    expect(saveDraft.ok()).toBe(true);
    await expect(
      page.getByRole("button", { name: /generate invite link/i }),
    ).toBeDisabled();

    const publishResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/weddings/") &&
        response.url().includes("/website/publish") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Publish live" }).click();
    const publish = await publishResponse;
    expect(publish.ok()).toBe(true);
    await expect(
      page.getByRole("button", { name: /generate invite link/i }),
    ).toBeEnabled();

    await page.getByRole("button", { name: /generate invite link/i }).click();
    const openRsvpLink = page.getByRole("link", { name: "Open RSVP" });
    await expect(openRsvpLink).toBeVisible();
    const inviteLink = await openRsvpLink.getAttribute("href");
    if (!inviteLink || !inviteLink.includes("?token=")) {
      throw new Error("Invite link was not rendered.");
    }

    const publicPage = await context.newPage();

    await publicPage.goto(inviteLink);
    await expect(
      publicPage.getByRole("heading", { name: /please rsvp/i }),
    ).toBeVisible();
    await expect(publicPage.getByText("Ava Rivera")).toBeVisible();
    await expect(publicPage.getByText("Sam Rivera")).toBeVisible();
    await publicPage
      .locator("label", { hasText: "Joyfully attending" })
      .first()
      .click();
    await publicPage
      .locator("label", { hasText: "Joyfully attending" })
      .nth(1)
      .click();
    const submitRsvpResponse = publicPage.waitForResponse(
      (response) =>
        response.url().includes("/api/public/rsvp/") &&
        response.request().method() === "POST",
    );
    await publicPage.getByRole("button", { name: "Send RSVP" }).click();
    const submitRsvp = await submitRsvpResponse;
    expect(new URL(submitRsvp.url()).origin).toBe(runtime.urls.api);
    expect(submitRsvp.ok()).toBe(true);
    await expect(publicPage.locator("[data-rsvp-status]")).toHaveText(
      "Your RSVP has been saved. We can't wait to celebrate with you.",
    );

    await page.goto(`${runtime.urls.app}/guests`);
    await page
      .getByRole("button", { name: /expand ava rivera plus-ones/i })
      .click();
    await expect(
      page
        .locator("tbody tr")
        .filter({ hasText: "Ava Rivera" })
        .getByText("Accepted"),
    ).toBeVisible();
    await expect(
      page
        .locator("tbody tr")
        .filter({ hasText: "Sam Rivera" })
        .getByText("Accepted"),
    ).toBeVisible();
  });
});
