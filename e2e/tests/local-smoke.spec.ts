import { expect, test } from "@playwright/test";
import { readLocalE2ERuntime } from "../../scripts/local-e2e-config";

const runtime = readLocalE2ERuntime();
const projectClientIpOctets = new Map([
  ["chromium", 10],
  ["iphone-12", 11],
  ["pixel-7", 12],
]);

test.describe("local smoke", () => {
  test("renders the public marketing homepage", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: /plan the wedding in one connected workspace\./i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^start planning$/i }).first(),
    ).toBeVisible();
  });

  test("serves the local marketing api signup, referral, survey, stats, and feedback flows", async ({
    request,
  }, testInfo) => {
    const projectIndex = projectClientIpOctets.get(testInfo.project.name);
    if (projectIndex === undefined) {
      throw new Error(
        `Missing local marketing API client IP for project ${testInfo.project.name}`,
      );
    }
    const marketingHeaders = {
      "X-Kaiplan-E2E-IP": `203.0.113.${projectIndex}`,
    };
    const health = await request
      .get(`${runtime.urls.web}/api/health/`)
      .catch(() => null);
    expect(
      health?.ok(),
      "Marketing API should be reachable via the web proxy",
    ).toBe(true);

    const email = `phase9-${Date.now()}@example.com`;

    const signupResponse = await request.post(
      `${runtime.urls.web}/api/signup/`,
      {
        headers: marketingHeaders,
        data: {
          email,
          sourcePage: "/",
        },
      },
    );

    const signupPayload = await signupResponse.text();
    expect(
      signupResponse.ok(),
      `signup failed with ${signupResponse.status()}: ${signupPayload}`,
    ).toBeTruthy();
    const signupBody = JSON.parse(signupPayload) as {
      success: boolean;
      referralCode: string;
      position: number;
      surveyToken: string;
    };
    expect(signupBody).toMatchObject({
      success: true,
      referralCode: expect.any(String),
      position: expect.any(Number),
      surveyToken: expect.any(String),
    });
    expect(signupBody.position).toBeGreaterThan(0);

    const referredSignupResponse = await request.post(
      `${runtime.urls.web}/api/signup/`,
      {
        headers: marketingHeaders,
        data: {
          email: `phase9-referred-${Date.now()}@example.com`,
          sourcePage: "/",
          referredBy: signupBody.referralCode,
        },
      },
    );
    const referredSignupPayload = await referredSignupResponse.text();
    expect(
      referredSignupResponse.ok(),
      `referred signup failed with ${referredSignupResponse.status()}: ${referredSignupPayload}`,
    ).toBeTruthy();

    const referralResponse = await request.get(
      `${runtime.urls.web}/api/referral/${signupBody.referralCode}`,
      { headers: marketingHeaders },
    );
    const referralPayload = await referralResponse.text();
    expect(
      referralResponse.ok(),
      `referral failed with ${referralResponse.status()}: ${referralPayload}`,
    ).toBeTruthy();
    const referralBody = JSON.parse(referralPayload) as {
      referralCount: number;
      position: number;
    };
    expect(referralBody).toMatchObject({
      referralCount: 1,
      position: expect.any(Number),
    });
    expect(referralBody.position).toBe(signupBody.position);

    const surveyResponse = await request.post(
      `${runtime.urls.web}/api/survey/`,
      {
        headers: marketingHeaders,
        data: {
          surveyToken: signupBody.surveyToken,
          answers: [
            {
              questionId: "segment",
              answer: "I'm 40+ and focused on strength and longevity",
            },
          ],
        },
      },
    );
    const surveyPayload = await surveyResponse.text();
    expect(
      surveyResponse.ok(),
      `survey failed with ${surveyResponse.status()}: ${surveyPayload}`,
    ).toBeTruthy();
    expect(JSON.parse(surveyPayload)).toEqual({ success: true });

    const feedbackResponse = await request.post(
      `${runtime.urls.web}/api/feedback/`,
      {
        headers: marketingHeaders,
        data: {
          category: "idea",
          message: "Local smoke feedback",
          pageUrl: `${runtime.urls.web}/`,
          email,
        },
      },
    );

    const feedbackPayload = await feedbackResponse.text();
    expect(
      feedbackResponse.status(),
      `feedback failed with ${feedbackResponse.status()}: ${feedbackPayload}`,
    ).toBe(201);
    await expect(Promise.resolve(JSON.parse(feedbackPayload))).resolves.toEqual(
      {
        ok: true,
      },
    );

    const statsResponse = await request.get(`${runtime.urls.web}/api/stats/`, {
      headers: { ...marketingHeaders, Authorization: "Bearer test-secret" },
    });
    const statsPayload = await statsResponse.text();
    expect(
      statsResponse.ok(),
      `stats failed with ${statsResponse.status()}: ${statsPayload}`,
    ).toBeTruthy();
    const statsBody = JSON.parse(statsPayload) as {
      signups: number;
      surveyResponses: number;
      feedback: { total: number };
    };
    expect(statsBody).toMatchObject({
      signups: expect.any(Number),
      surveyResponses: expect.any(Number),
      feedback: { total: expect.any(Number) },
    });
    expect(statsBody.signups).toBeGreaterThanOrEqual(2);
    expect(statsBody.surveyResponses).toBeGreaterThanOrEqual(1);
    expect(statsBody.feedback.total).toBeGreaterThanOrEqual(1);
  });

  test("renders the app auth shell on the expected local routes", async ({
    page,
  }) => {
    await page.goto(`${runtime.urls.app}/login`);
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();

    await page.goto(`${runtime.urls.app}/signup`);
    await expect(
      page.getByRole("heading", { name: /start your planning trial/i }),
    ).toBeVisible();
  });
});
