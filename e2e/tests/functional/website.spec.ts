import { expect, test, type Page } from "@playwright/test";
import { bootstrapPlannerSession } from "../../helpers/planner-auth";
import { readLocalE2ERuntime } from "../../../scripts/local-e2e-config";

const runtime = readLocalE2ERuntime();

type BootstrappedPlanner = Awaited<ReturnType<typeof bootstrapPlannerSession>>;

async function fillRequiredHero(page: Page, title: string) {
  await page.getByLabel(/^Title$/).fill(title);
}

async function setSlug(page: Page, slug: string) {
  const slugInput = page.getByLabel("Slug");
  await slugInput.fill(slug);
}

async function saveDraftAndExpectResponse(page: Page) {
  const responsePromise = page.waitForResponse((response) => {
    const url = response.url();
    const method = response.request().method();
    return (
      url.includes("/api/weddings/") &&
      url.endsWith("/website") &&
      (method === "POST" || method === "PATCH")
    );
  });
  await page.getByRole("button", { name: "Save draft" }).last().click();
  return responsePromise;
}

async function publishLive(page: Page) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/weddings/") &&
      response.url().includes("/website/publish") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Publish live" }).click();
  return responsePromise;
}

async function addPrimaryGuestViaApi(
  page: Page,
  bootstrap: BootstrappedPlanner,
  firstName: string,
  lastName: string,
) {
  const response = await page.request.post(
    `${runtime.urls.api}/api/weddings/${bootstrap.wedding.id}/guests`,
    {
      headers: { Origin: runtime.urls.app },
      data: {
        firstName,
        lastName,
        email: null,
        phone: null,
        groupName: null,
        side: "mutual",
        rsvpStatus: "pending",
        dietaryTags: [],
        notes: null,
        primaryGuestId: null,
      },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as { id: string };
}

test.describe("functional/website", () => {
  test("slug validation rejects empty, too short, uppercase, spaces, reserved values", async ({
    page,
  }) => {
    await bootstrapPlannerSession(page, { plan: "pro" });

    await page.goto(`${runtime.urls.app}/website`);
    await expect(
      page.getByRole("heading", { name: "Wedding Website" }),
    ).toBeVisible();

    await fillRequiredHero(page, "Test Wedding");

    // Case 1: empty slug -> Save draft -> API 400 -> error banner visible.
    await setSlug(page, "");
    const emptySaveResponse = await saveDraftAndExpectResponse(page);
    expect(emptySaveResponse.status()).toBe(400);
    await expect(page.locator(".feedback-banner--error")).toBeVisible();

    // Case 2: too short (min 3).
    await setSlug(page, "ab");
    const shortSaveResponse = await saveDraftAndExpectResponse(page);
    expect(shortSaveResponse.status()).toBe(400);

    // Case 3: uppercase.
    await setSlug(page, "INVALID-Slug");
    const upperSaveResponse = await saveDraftAndExpectResponse(page);
    expect(upperSaveResponse.status()).toBe(400);

    // Case 4: spaces.
    await setSlug(page, "has spaces");
    const spacesSaveResponse = await saveDraftAndExpectResponse(page);
    expect(spacesSaveResponse.status()).toBe(400);

    // Case 5: special chars.
    await setSlug(page, "bad_slug!");
    const specialSaveResponse = await saveDraftAndExpectResponse(page);
    expect(specialSaveResponse.status()).toBe(400);

    // Case 6: reserved slug ("admin" in WEDDING_WEBSITE_RESERVED_SLUGS).
    await setSlug(page, "admin");
    const reservedSaveResponse = await saveDraftAndExpectResponse(page);
    expect(reservedSaveResponse.status()).toBe(400);

    // Error banner stays visible after the final rejection.
    await expect(page.locator(".feedback-banner--error")).toBeVisible();
  });

  test("slug uniqueness: second planner cannot publish an already-published slug", async ({
    browser,
  }) => {
    // Two browser contexts contending for the shared Astro preview server
    // under full-suite parallelism can blow the 30s default timeout.
    test.slow();
    const timestamp = Date.now();
    const sharedSlug = `shared-${timestamp}`;

    // Planner A — publish the slug.
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await bootstrapPlannerSession(pageA, { plan: "pro" });
    await pageA.goto(`${runtime.urls.app}/website`);
    await fillRequiredHero(pageA, "Planner A Wedding");
    await setSlug(pageA, sharedSlug);
    const saveAResponse = await saveDraftAndExpectResponse(pageA);
    expect(saveAResponse.ok()).toBe(true);
    const publishAResponse = await publishLive(pageA);
    expect(publishAResponse.ok()).toBe(true);
    await contextA.close();

    // Planner B — attempt the same slug, API should 409 on save.
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await bootstrapPlannerSession(pageB, { plan: "pro" });
    await pageB.goto(`${runtime.urls.app}/website`);
    await fillRequiredHero(pageB, "Planner B Wedding");
    await setSlug(pageB, sharedSlug);
    const saveBResponse = await saveDraftAndExpectResponse(pageB);
    expect(saveBResponse.status()).toBe(409);
    await expect(pageB.locator(".feedback-banner--error")).toBeVisible();
    await contextB.close();
  });

  test("save draft persists after reload", async ({ page }) => {
    const bootstrap = await bootstrapPlannerSession(page, { plan: "pro" });
    const slug = `persist-${bootstrap.wedding.id.slice(0, 8)}`;

    await page.goto(`${runtime.urls.app}/website`);
    await fillRequiredHero(page, "Persist Wedding");
    await setSlug(page, slug);
    await page.getByLabel("Venue name").fill("Persist Hall");
    const saveResponse = await saveDraftAndExpectResponse(page);
    expect(saveResponse.ok()).toBe(true);

    await page.reload();
    await expect(page.getByLabel("Slug")).toHaveValue(slug);
    await expect(page.getByLabel(/^Title$/)).toHaveValue("Persist Wedding");
    await expect(page.getByLabel("Venue name")).toHaveValue("Persist Hall");
  });

  test("publishing enables the invite link generator, and the generated link is copyable", async ({
    page,
  }) => {
    test.slow();
    const bootstrap = await bootstrapPlannerSession(page, { plan: "pro" });
    await addPrimaryGuestViaApi(page, bootstrap, "Ivy", "Nguyen");
    const slug = `publish-${bootstrap.wedding.id.slice(0, 8)}`;

    await page.addInitScript(() => {
      let clipboardValue = "";
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          readText: async () => clipboardValue,
          writeText: async (value: string) => {
            clipboardValue = value;
          },
        },
      });
    });

    await page.goto(`${runtime.urls.app}/website`);
    await fillRequiredHero(page, "Ivy & Sage");
    await setSlug(page, slug);

    // Before publish, the generate-invite-link button is disabled.
    await expect(
      page.getByRole("button", { name: /generate invite link/i }),
    ).toBeDisabled();

    const saveResponse = await saveDraftAndExpectResponse(page);
    expect(saveResponse.ok()).toBe(true);
    const publishResponse = await publishLive(page);
    expect(publishResponse.ok()).toBe(true);

    await expect(
      page.getByRole("button", { name: /generate invite link/i }),
    ).toBeEnabled();
    await page.getByRole("button", { name: /generate invite link/i }).click();

    const rsvpLink = page.getByRole("link", { name: "Open RSVP" });
    await expect(rsvpLink).toBeVisible();
    const href = await rsvpLink.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toContain(`/w/${slug}`);
    expect(href).toContain("?token=");

    // Copy-link button writes the same URL to the clipboard.
    await page.getByRole("button", { name: /copy link/i }).click();
    await expect(page.getByRole("button", { name: /copied/i })).toBeVisible();
    const clipboardValue = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardValue).toBe(href);
  });

  test("unpublish hides the live snapshot and the public page stops rendering the site", async ({
    page,
    context,
  }) => {
    // Publish + public-page fetch + unpublish + re-fetch all hit the shared
    // Astro preview server; under parallel load the 30s default runs out.
    test.slow();
    const bootstrap = await bootstrapPlannerSession(page, { plan: "pro" });
    const slug = `unpub-${bootstrap.wedding.id.slice(0, 8)}`;

    await page.goto(`${runtime.urls.app}/website`);
    await fillRequiredHero(page, "Unpub Wedding");
    await setSlug(page, slug);
    const saveResponse = await saveDraftAndExpectResponse(page);
    expect(saveResponse.ok()).toBe(true);
    const publishResponse = await publishLive(page);
    expect(publishResponse.ok()).toBe(true);

    // Public page is live now.
    const publicPage = await context.newPage();
    await publicPage.goto(`${runtime.urls.web}/w/${slug}/`);
    await expect(
      publicPage.getByRole("heading", { name: "Unpub Wedding" }),
    ).toBeVisible();
    await publicPage.close();

    // Confirm the window.confirm, then unpublish.
    page.once("dialog", (dialog) => {
      void dialog.accept();
    });
    const unpublishResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/website/publish") &&
        response.request().method() === "DELETE",
    );
    await page.getByRole("button", { name: "Unpublish" }).click();
    const unpublishResponse = await unpublishResponsePromise;
    expect(unpublishResponse.ok()).toBe(true);

    // Public page returns "not available" state (404 from API -> Astro fallback).
    const afterPage = await context.newPage();
    const publicResponse = await afterPage.goto(
      `${runtime.urls.web}/w/${slug}/`,
    );
    expect(publicResponse?.status()).toBe(404);
    await expect(
      afterPage.getByRole("heading", {
        name: /that wedding site is not available/i,
      }),
    ).toBeVisible();
  });

  test("editing hero title after publish is not reflected on public page until republish", async ({
    page,
    context,
  }) => {
    test.slow();
    const bootstrap = await bootstrapPlannerSession(page, { plan: "pro" });
    const slug = `edit-${bootstrap.wedding.id.slice(0, 8)}`;

    await page.goto(`${runtime.urls.app}/website`);
    await fillRequiredHero(page, "Original Title");
    await setSlug(page, slug);
    await page.getByLabel("Venue name").fill("Original Venue");
    const saveResponse = await saveDraftAndExpectResponse(page);
    expect(saveResponse.ok()).toBe(true);
    const publishResponse = await publishLive(page);
    expect(publishResponse.ok()).toBe(true);

    // Public page shows the published snapshot.
    const publicPage = await context.newPage();
    await publicPage.goto(`${runtime.urls.web}/w/${slug}/`);
    await expect(
      publicPage.getByRole("heading", { name: "Original Title" }),
    ).toBeVisible();
    await expect(publicPage.getByText("Original Venue")).toBeVisible();

    // Edit the draft and publish again.
    await fillRequiredHero(page, "Updated Title");
    await page.getByLabel("Venue name").fill("Updated Venue");
    const republishResponse = await publishLive(page);
    expect(republishResponse.ok()).toBe(true);

    // Public page, after reload, reflects the new snapshot.
    await publicPage.reload();
    await expect(
      publicPage.getByRole("heading", { name: "Updated Title" }),
    ).toBeVisible();
    await expect(publicPage.getByText("Updated Venue")).toBeVisible();
  });
});
