import { expect, test } from "@playwright/test";
import { readLocalE2ERuntime } from "../../../scripts/local-e2e-config";
import { completeLocalCheckoutForEmail } from "../../helpers/local-billing";

const runtime = readLocalE2ERuntime();

const GUARDED_PATHS = [
  "/dashboard",
  "/guests",
  "/seating",
  "/budget",
  "/vendors",
  "/website",
  "/settings",
  "/onboarding",
] as const;

async function signUpViaBrowser(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
  name: string,
) {
  await page.goto(`${runtime.urls.app}/signup`);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("button", { name: "Create my planning workspace" })
    .click();
  await expect(
    page.getByRole("heading", { name: /let's set up your wedding/i }),
  ).toBeVisible();
}

async function completeOnboarding(
  page: import("@playwright/test").Page,
  email: string,
  weddingName: string,
) {
  await completeLocalCheckoutForEmail(page.request, email, "pro");
  await page.goto(`${runtime.urls.app}/onboarding`);
  await expect(
    page.getByRole("heading", { name: /let's set up your wedding/i }),
  ).toBeVisible();
  await page
    .getByLabel(/what do you want to call this workspace/i)
    .fill(weddingName);
  await page.getByLabel(/Wedding date/i).fill("2028-06-20");
  await page.getByLabel(/^Budget/i).fill("25000");
  await page.getByRole("button", { name: /start planning/i }).click();
  await expect(
    page.getByRole("heading", { name: /welcome back/i }),
  ).toBeVisible();
}

test.describe("functional/auth-guards", () => {
  for (const path of GUARDED_PATHS) {
    test(`guarded route ${path} redirects to /login when logged out`, async ({
      page,
    }) => {
      await page.goto(`${runtime.urls.app}${path}`);
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    });
  }

  test("signup lands on onboarding, not /dashboard", async ({ page }) => {
    const email = `onboard-signup-${Date.now()}@example.com`;
    await signUpViaBrowser(page, email, "supersecret123", "Onboard Signup");
    expect(page.url()).toContain("/onboarding");
  });

  test("onboarding refresh preserves setup state", async ({ page }) => {
    const email = `refresh-${Date.now()}@example.com`;
    await signUpViaBrowser(page, email, "supersecret123", "Refresh Flow");

    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: /let's set up your wedding/i,
      }),
    ).toBeVisible();
    expect(page.url()).toContain("/onboarding");
  });

  test("completing onboarding redirects to /dashboard", async ({ page }) => {
    const email = `complete-${Date.now()}@example.com`;
    await signUpViaBrowser(page, email, "supersecret123", "Complete Flow");
    await completeOnboarding(page, email, "Complete Onboarding Wedding");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("direct nav to /onboarding after completion redirects to /dashboard", async ({
    page,
  }) => {
    const email = `reonboard-${Date.now()}@example.com`;
    await signUpViaBrowser(page, email, "supersecret123", "Reonboard");
    await completeOnboarding(page, email, "Reonboard Wedding");

    await page.goto(`${runtime.urls.app}/onboarding`);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test("sign-out clears the session and guarded routes redirect to /login", async ({
    page,
  }) => {
    const email = `signout-${Date.now()}@example.com`;
    await signUpViaBrowser(page, email, "supersecret123", "Sign Out");
    await completeOnboarding(page, email, "Sign Out Wedding");

    await page
      .getByRole("button", { name: /user menu/i })
      .first()
      .click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await page.goto(`${runtime.urls.app}/dashboard`);
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("guarded route redirect preserves destination via ?next= and login restores it", async ({
    page,
  }) => {
    await page.goto(`${runtime.urls.app}/budget`);
    await expect(page).toHaveURL(/\/login\?next=%2Fbudget/, {
      timeout: 10_000,
    });

    const email = `next-redirect-${Date.now()}@example.com`;
    await signUpViaBrowser(page, email, "supersecret123", "Next Redirect");
    // sign up lands on onboarding, not budget, but login should honour next.
    // Sign out to test login path
    await completeOnboarding(page, email, "Next Redirect Wedding");
    await page
      .getByRole("button", { name: /user menu/i })
      .first()
      .click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await page.goto(`${runtime.urls.app}/budget`);
    await expect(page).toHaveURL(/\/login\?next=%2Fbudget/, {
      timeout: 10_000,
    });

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("supersecret123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/budget/, { timeout: 10_000 });
  });
});
