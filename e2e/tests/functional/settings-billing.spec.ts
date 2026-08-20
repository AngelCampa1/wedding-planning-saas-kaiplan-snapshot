import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readLocalE2ERuntime } from "../../../scripts/local-e2e-config";
import { completeLocalCheckoutForEmail } from "../../helpers/local-billing";

const runtime = readLocalE2ERuntime();

// The settings page (apps/app/src/routes/_authenticated/settings.tsx)
// currently renders:
//   - account panel (read-only name + email)
//   - email preferences toggles
//   - billing section (checkout, upgrade, manage via Stripe portal)
// There is no profile-edit form, password-change form, or
// delete-account flow shipped in the SPA today. Coverage here focuses
// on what exists; password rotation is exercised via Better Auth's
// reset-password flow in auth.spec.ts, and sign-out is covered in
// auth-guards.spec.ts.

async function signUpEmailPassword(
  request: APIRequestContext,
  email: string,
  password: string,
  name: string,
) {
  const response = await request.post(
    `${runtime.urls.api}/api/auth/sign-up/email`,
    {
      headers: { Origin: runtime.urls.app },
      data: { email, password, name, callbackURL: "/onboarding" },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function signInEmailPassword(
  request: APIRequestContext,
  email: string,
  password: string,
) {
  return request.post(`${runtime.urls.api}/api/auth/sign-in/email`, {
    headers: { Origin: runtime.urls.app },
    data: { email, password, callbackURL: "/dashboard" },
  });
}

test.describe("functional/settings-billing", () => {
  test("fresh user sees checkout CTA but not Manage billing before subscribing", async ({
    page,
  }) => {
    const email = `billing-gate-${randomUUID()}@example.com`;
    const password = "supersecret123";

    await signUpEmailPassword(page.request, email, password, "Billing Gate");
    const signIn = await signInEmailPassword(page.request, email, password);
    expect(signIn.ok(), await signIn.text()).toBeTruthy();

    await page.goto(`${runtime.urls.app}/settings`);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page
      .getByRole("button", {
        name: /^Choose Starter\b/i,
      })
      .click();
    await expect(page.getByRole("heading", { name: "Starter" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /continue to checkout/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /manage billing/i }),
    ).toHaveCount(0);
  });

  test("starter checkout activates subscription and exposes Manage billing", async ({
    page,
  }) => {
    const email = `billing-starter-${randomUUID()}@example.com`;
    const password = "supersecret123";

    await signUpEmailPassword(page.request, email, password, "Billing Starter");
    const signIn = await signInEmailPassword(page.request, email, password);
    expect(signIn.ok(), await signIn.text()).toBeTruthy();

    const summary = await completeLocalCheckoutForEmail(
      page.request,
      email,
      "starter",
    );

    expect(summary).toMatchObject({
      plan: "starter",
      status: "trialing",
      canManageBilling: true,
    });

    await page.goto(`${runtime.urls.app}/settings`);
    await expect(
      page.getByRole("button", { name: /manage billing/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /choose pro/i }),
    ).toBeVisible();
  });

  test("Starter → Pro upgrade updates summary", async ({ page }) => {
    const email = `billing-upgrade-${randomUUID()}@example.com`;
    const password = "supersecret123";

    await signUpEmailPassword(page.request, email, password, "Billing Upgrade");
    const signIn = await signInEmailPassword(page.request, email, password);
    expect(signIn.ok(), await signIn.text()).toBeTruthy();

    const starter = await completeLocalCheckoutForEmail(
      page.request,
      email,
      "starter",
    );
    expect(starter.plan).toBe("starter");

    const pro = await completeLocalCheckoutForEmail(page.request, email, "pro");
    expect(pro).toMatchObject({
      plan: "pro",
      status: "trialing",
      canManageBilling: true,
    });

    await page.goto(`${runtime.urls.app}/settings`);
    await expect(
      page.getByRole("button", { name: /choose lifetime/i }),
    ).toBeVisible();
  });

  test("lifetime checkout reaches top plan (no further upgrade CTA)", async ({
    page,
  }) => {
    const email = `billing-lifetime-${randomUUID()}@example.com`;
    const password = "supersecret123";

    await signUpEmailPassword(
      page.request,
      email,
      password,
      "Billing Lifetime",
    );
    const signIn = await signInEmailPassword(page.request, email, password);
    expect(signIn.ok(), await signIn.text()).toBeTruthy();

    const lifetime = await completeLocalCheckoutForEmail(
      page.request,
      email,
      "lifetime",
    );
    expect(lifetime.plan).toBe("lifetime");
    expect(lifetime.canManageBilling).toBe(true);

    await page.goto(`${runtime.urls.app}/settings`);
    // No further upgrade options — top of the ladder.
    await expect(page.getByRole("button", { name: /upgrade to/i })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: /manage billing/i }),
    ).toBeVisible();
  });

  test("settings page exposes read-only account panel reflecting the signed-in user", async ({
    page,
  }) => {
    const email = `settings-account-${randomUUID()}@example.com`;
    const password = "supersecret123";
    const name = "Settings Account";

    await signUpEmailPassword(page.request, email, password, name);
    const signIn = await signInEmailPassword(page.request, email, password);
    expect(signIn.ok(), await signIn.text()).toBeTruthy();

    await completeLocalCheckoutForEmail(page.request, email, "starter");

    await page.goto(`${runtime.urls.app}/settings`);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText(name).first()).toBeVisible();
    await expect(page.getByText(email).first()).toBeVisible();
  });
});
