import { expect, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { completeLocalCheckoutForEmail } from "./local-billing";
import { readLocalE2ERuntime } from "../../scripts/local-e2e-config";

const runtime = readLocalE2ERuntime();

type PlannerBootstrapOptions = {
  plan?: "starter" | "pro" | "lifetime";
  weddingName?: string;
};

function readSessionCookie(setCookieHeader: string | undefined) {
  if (!setCookieHeader) {
    throw new Error("Auth response did not include a session cookie.");
  }

  const [cookiePair] = setCookieHeader.split(";");
  const [name, value] = cookiePair.split("=");

  if (!name || !value) {
    throw new Error(`Could not parse auth cookie from: ${setCookieHeader}`);
  }

  return { name, value };
}

async function createPlannerUser(
  page: Page,
  options: PlannerBootstrapOptions = {},
) {
  const email = `planner-surface-${randomUUID()}@example.com`;
  const password = "supersecret123";
  const name = "Planner Surface";

  const signup = await page.request.post(
    `${runtime.urls.api}/api/auth/sign-up/email`,
    {
      headers: {
        Origin: runtime.urls.app,
      },
      data: {
        name,
        email,
        password,
        callbackURL: "/onboarding",
      },
    },
  );

  expect(signup.ok(), await signup.text()).toBeTruthy();

  const signIn = await page.request.post(
    `${runtime.urls.api}/api/auth/sign-in/email`,
    {
      headers: {
        Origin: runtime.urls.app,
      },
      data: {
        email,
        password,
        callbackURL: "/dashboard",
      },
    },
  );

  expect(signIn.ok(), await signIn.text()).toBeTruthy();

  const sessionCookie = readSessionCookie(signIn.headers()["set-cookie"]);

  return {
    email,
    password,
    name,
    sessionCookie,
    plan: options.plan ?? "pro",
    weddingName: options.weddingName ?? "Planner Surface Wedding",
  };
}

async function attachPlannerCookie(
  context: BrowserContext,
  cookie: { name: string; value: string },
) {
  const cookieDomain = new URL(runtime.urls.app).hostname;
  await context.addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      domain: cookieDomain,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

export async function bootstrapPlannerSession(
  page: Page,
  options: PlannerBootstrapOptions = {},
) {
  const user = await createPlannerUser(page, options);

  await attachPlannerCookie(page.context(), user.sessionCookie);

  const billing = await completeLocalCheckoutForEmail(
    page.request,
    user.email,
    user.plan,
  );

  const weddingResponse = await page.request.post(
    `${runtime.urls.api}/api/weddings`,
    {
      headers: {
        Origin: runtime.urls.app,
      },
      data: {
        name: user.weddingName,
        date: "2027-06-20",
        budgetCents: 2500000,
        currency: "USD",
        timezone: "America/Mexico_City",
      },
    },
  );

  expect(weddingResponse.ok(), await weddingResponse.text()).toBeTruthy();
  const wedding = await weddingResponse.json();

  return {
    user,
    billing,
    wedding: wedding as { id: string; name: string },
  };
}
