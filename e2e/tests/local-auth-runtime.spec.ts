import { expect, test } from "@playwright/test";
import { readLocalE2ERuntime } from "../../scripts/local-e2e-config";

const runtime = readLocalE2ERuntime();

test.describe("local auth runtime", () => {
  test("signs up in the browser and lands on onboarding", async ({ page }) => {
    const email = `browser-auth-${Date.now()}@example.com`;

    await page.goto(`${runtime.urls.app}/signup`);
    await page.getByLabel("Name").fill("Browser Auth");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("supersecret123");
    await page
      .getByRole("button", { name: "Create my planning workspace" })
      .click();

    await expect(
      page.getByRole("heading", {
        name: /let's set up your wedding/i,
      }),
    ).toBeVisible();
  });

  test("accepts direct auth requests through the local api runtime", async ({
    request,
  }) => {
    const email = `api-auth-${Date.now()}@example.com`;

    const signup = await request.post(
      `${runtime.urls.api}/api/auth/sign-up/email`,
      {
        headers: {
          Origin: runtime.urls.app,
        },
        data: {
          name: "API Auth",
          email,
          password: "supersecret123",
          callbackURL: "/onboarding",
        },
      },
    );
    expect(signup.ok(), await signup.text()).toBeTruthy();

    const signIn = await request.post(
      `${runtime.urls.api}/api/auth/sign-in/email`,
      {
        headers: {
          Origin: runtime.urls.app,
        },
        data: {
          email,
          password: "supersecret123",
          callbackURL: "/dashboard",
        },
      },
    );

    expect(signIn.ok(), await signIn.text()).toBeTruthy();
    await expect(signIn.json()).resolves.toMatchObject({
      redirect: true,
      url: "/dashboard",
    });
  });
});
