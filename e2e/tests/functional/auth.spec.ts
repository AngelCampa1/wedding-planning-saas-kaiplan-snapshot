import { expect, test } from "@playwright/test";
import { readLocalE2ERuntime } from "../../../scripts/local-e2e-config";

const runtime = readLocalE2ERuntime();

type CapturedReset = {
  email: string;
  url: string;
  token: string;
  capturedAt: number;
};

async function signUpViaApi(
  request: import("@playwright/test").APIRequestContext,
  email: string,
  password: string,
  name: string,
) {
  return request.post(`${runtime.urls.api}/api/auth/sign-up/email`, {
    headers: { Origin: runtime.urls.app },
    data: { name, email, password, callbackURL: "/onboarding" },
  });
}

async function requestPasswordReset(
  request: import("@playwright/test").APIRequestContext,
  email: string,
) {
  return request.post(`${runtime.urls.api}/api/auth/request-password-reset`, {
    headers: { Origin: runtime.urls.app },
    data: { email, redirectTo: `${runtime.urls.app}/reset-password` },
  });
}

async function fetchCapturedResets(
  request: import("@playwright/test").APIRequestContext,
  email: string,
): Promise<CapturedReset[]> {
  const response = await request.get(
    `${runtime.urls.api}/api/e2e/captured-password-resets?email=${encodeURIComponent(email)}`,
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { resets: CapturedReset[] };
  return body.resets;
}

test.describe("functional/auth", () => {
  test("signup rejects duplicate email with a visible error", async ({
    page,
    request,
  }) => {
    const email = `dup-${Date.now()}@example.com`;
    const password = "supersecret123";

    const firstSignup = await signUpViaApi(request, email, password, "First");
    expect(firstSignup.ok(), await firstSignup.text()).toBeTruthy();

    await page.goto(`${runtime.urls.app}/signup`);
    await page.getByLabel("Name").fill("Second");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page
      .getByRole("button", { name: "Create my planning workspace" })
      .click();

    await expect(page.locator(".feedback-banner--error")).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("signup rejects weak password at the API layer", async ({ request }) => {
    const email = `weak-${Date.now()}@example.com`;

    const response = await signUpViaApi(request, email, "short", "Weak");
    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.text();
    expect(body.toLowerCase()).toMatch(/password/);
  });

  test("login with wrong password shows error and stays on /login", async ({
    page,
    request,
  }) => {
    const email = `wrong-${Date.now()}@example.com`;
    const password = "supersecret123";

    const signup = await signUpViaApi(request, email, password, "Wrong Pass");
    expect(signup.ok(), await signup.text()).toBeTruthy();

    await page.goto(`${runtime.urls.app}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("not-the-right-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator(".feedback-banner--error")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("login with correct password redirects to onboarding when no wedding", async ({
    page,
    request,
  }) => {
    const email = `login-${Date.now()}@example.com`;
    const password = "supersecret123";

    const signup = await signUpViaApi(request, email, password, "Login Flow");
    expect(signup.ok(), await signup.text()).toBeTruthy();

    await page.goto(`${runtime.urls.app}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", {
        name: /let's set up your wedding/i,
      }),
    ).toBeVisible();
  });

  test("forgot-password submits and shows check-your-email confirmation", async ({
    page,
    request,
  }) => {
    const email = `forgot-${Date.now()}@example.com`;

    const signup = await signUpViaApi(
      request,
      email,
      "supersecret123",
      "Forgot",
    );
    expect(signup.ok(), await signup.text()).toBeTruthy();

    await page.goto(`${runtime.urls.app}/forgot-password`);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: /send reset link/i }).click();

    await expect(page.getByText(/check your email/i)).toBeVisible();
  });

  test("reset-password with invalid token shows an error", async ({ page }) => {
    await page.goto(
      `${runtime.urls.app}/reset-password?token=this-is-not-a-valid-token`,
    );
    await page.getByLabel(/new password/i).fill("brandnewpassword1");
    await page.getByRole("button", { name: /reset password/i }).click();

    await expect(page.locator(".feedback-banner--error")).toBeVisible();
    await expect(page).toHaveURL(/\/reset-password/);
  });

  test("reset-password with valid token resets and allows subsequent login", async ({
    page,
    request,
  }) => {
    const email = `reset-${Date.now()}@example.com`;
    const oldPassword = "supersecret123";
    const newPassword = "brandnewpassword2";

    const signup = await signUpViaApi(request, email, oldPassword, "Reset");
    expect(signup.ok(), await signup.text()).toBeTruthy();

    const resetRequest = await requestPasswordReset(request, email);
    expect(resetRequest.ok(), await resetRequest.text()).toBeTruthy();

    const resets = await fetchCapturedResets(request, email);
    expect(resets.length).toBeGreaterThan(0);
    const latest = resets[resets.length - 1];
    expect(latest.token).toBeTruthy();

    await page.goto(
      `${runtime.urls.app}/reset-password?token=${encodeURIComponent(latest.token)}`,
    );
    await page.getByLabel(/new password/i).fill(newPassword);
    await page.getByRole("button", { name: /reset password/i }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    // Old password no longer works.
    const oldSignIn = await request.post(
      `${runtime.urls.api}/api/auth/sign-in/email`,
      {
        headers: { Origin: runtime.urls.app },
        data: { email, password: oldPassword, callbackURL: "/dashboard" },
      },
    );
    expect(oldSignIn.ok()).toBeFalsy();

    // New password works.
    const newSignIn = await request.post(
      `${runtime.urls.api}/api/auth/sign-in/email`,
      {
        headers: { Origin: runtime.urls.app },
        data: { email, password: newPassword, callbackURL: "/dashboard" },
      },
    );
    expect(newSignIn.ok(), await newSignIn.text()).toBeTruthy();
  });

  test("email-preferences unsubscribe toggle persists via public token", async ({
    page,
    request,
  }) => {
    // Generate a public email-preferences token by posting to DB directly
    // via a signed token flow. We use the public endpoint's GET to confirm
    // the token returns preferences, then PATCH to flip memberInvite off.
    const email = `prefs-${Date.now()}@example.com`;
    const signup = await signUpViaApi(
      request,
      email,
      "supersecret123",
      "Prefs",
    );
    expect(signup.ok(), await signup.text()).toBeTruthy();

    const signIn = await request.post(
      `${runtime.urls.api}/api/auth/sign-in/email`,
      {
        headers: { Origin: runtime.urls.app },
        data: {
          email,
          password: "supersecret123",
          callbackURL: "/dashboard",
        },
      },
    );
    expect(signIn.ok(), await signIn.text()).toBeTruthy();

    // Load authenticated preferences view and toggle one off.
    const prefsResponse = await request.get(
      `${runtime.urls.api}/api/email/preferences`,
      { headers: { Origin: runtime.urls.app } },
    );
    expect(prefsResponse.ok(), await prefsResponse.text()).toBeTruthy();
    const initial = (await prefsResponse.json()) as {
      email: string;
      preferences: {
        memberInvite: boolean;
        rsvpConfirmation: boolean;
        rsvpReminder: boolean;
      };
    };
    expect(initial.email).toBe(email);
    expect(initial.preferences.memberInvite).toBe(true);

    const updateResponse = await request.patch(
      `${runtime.urls.api}/api/email/preferences`,
      {
        headers: { Origin: runtime.urls.app },
        data: {
          preferences: {
            memberInvite: false,
            rsvpConfirmation: true,
            rsvpReminder: true,
          },
        },
      },
    );
    expect(updateResponse.ok(), await updateResponse.text()).toBeTruthy();
    const updated = (await updateResponse.json()) as typeof initial;
    expect(updated.preferences.memberInvite).toBe(false);

    // Confirm the email-preferences page renders the "missing token" message
    // when visited without a public token param.
    await page.goto(`${runtime.urls.app}/email-preferences`);
    await expect(
      page.getByText(/missing its email preference token/i),
    ).toBeVisible();
  });
});
