import app from "../apps/api/src/index";
import { resolveAuthBaseUrl } from "../apps/app/src/lib/auth-base-url";
import { buildLocalApiEnv, ensureLocalE2ERuntime } from "./local-e2e-config";
import { createStandaloneLocalMarketingApiRuntime } from "./serve-local-marketing-api";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createLocalExecutionContext(): ExecutionContext {
  return {
    waitUntil(promise: Promise<unknown>) {
      promise.catch((error: unknown) => console.error(error));
    },
    passThroughOnException() {},
  } as unknown as ExecutionContext;
}

async function run() {
  const runtime = await ensureLocalE2ERuntime();
  const marketingRuntime = await createStandaloneLocalMarketingApiRuntime({
    allowedOrigin: runtime.urls.web,
    productDomain: new URL(runtime.urls.web).host,
  });

  const signupEmail = `phase9-${Date.now()}@example.com`;
  const signupRequest = new Request(`${runtime.urls.web}/api/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: signupEmail,
      sourcePage: "/",
    }),
  });

  const signupResponse = await marketingRuntime.api.fetch(
    signupRequest,
    marketingRuntime.env,
  );

  assert(signupResponse.status === 200, "Marketing signup smoke failed.");
  const signupBody = (await signupResponse.json()) as {
    success: boolean;
    referralCode: string;
    position: number;
    surveyToken: string;
  };
  assert(signupBody.success, "Marketing signup did not report success.");
  assert(
    signupBody.referralCode.length === 8,
    "Marketing signup did not return a referral code.",
  );
  assert(
    signupBody.surveyToken.length > 0,
    "Marketing signup did not return a survey token.",
  );
  assert(
    signupBody.position > 0,
    "Marketing signup did not return a valid position.",
  );

  const referredEmail = `phase9-referred-${Date.now()}@example.com`;
  const referredSignupResponse = await marketingRuntime.api.fetch(
    new Request(`${runtime.urls.web}/api/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: referredEmail,
        sourcePage: "/",
        referredBy: signupBody.referralCode,
      }),
    }),
    marketingRuntime.env,
  );

  assert(
    referredSignupResponse.status === 200,
    "Marketing referred signup smoke failed.",
  );

  const referralResponse = await marketingRuntime.api.fetch(
    new Request(`${runtime.urls.web}/api/referral/${signupBody.referralCode}`),
    marketingRuntime.env,
  );
  assert(referralResponse.status === 200, "Marketing referral smoke failed.");
  const referralBody = (await referralResponse.json()) as {
    referralCount: number;
    position: number;
  };
  assert(
    referralBody.referralCount === 1,
    "Marketing referral count smoke failed.",
  );
  assert(
    referralBody.position === signupBody.position,
    "Marketing referral position did not match signup position.",
  );

  const surveyResponse = await marketingRuntime.api.fetch(
    new Request(`${runtime.urls.web}/api/survey`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        surveyToken: signupBody.surveyToken,
        answers: [
          {
            questionId: "segment",
            answer: "I'm 40+ and focused on strength and longevity",
          },
        ],
      }),
    }),
    marketingRuntime.env,
  );
  assert(surveyResponse.status === 200, "Marketing survey smoke failed.");

  const feedbackResponse = await marketingRuntime.api.fetch(
    new Request(`${runtime.urls.web}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "idea",
        message: "Phase 9 local smoke feedback",
        pageUrl: `${runtime.urls.web}/`,
        email: signupEmail,
      }),
    }),
    marketingRuntime.env,
  );

  assert(feedbackResponse.status === 201, "Marketing feedback smoke failed.");

  const statsResponse = await marketingRuntime.api.fetch(
    new Request(`${runtime.urls.web}/api/stats`, {
      headers: { Authorization: "Bearer test-secret" },
    }),
    marketingRuntime.env,
  );
  assert(statsResponse.status === 200, "Marketing stats smoke failed.");
  const statsBody = (await statsResponse.json()) as {
    signups: number;
    surveyResponses: number;
    feedback: { total: number };
  };
  assert(statsBody.signups >= 2, "Marketing stats signup count was invalid.");
  assert(
    statsBody.surveyResponses >= 1,
    "Marketing stats survey count was invalid.",
  );
  assert(
    statsBody.feedback.total >= 1,
    "Marketing stats feedback count was invalid.",
  );

  const outbox = marketingRuntime.env.LOCAL_OUTBOX;
  assert(outbox, "Marketing outbox was not initialized.");
  assert(
    outbox.emails.length >= 3,
    "Expected signup, referred signup, and feedback emails in outbox.",
  );
  assert(
    outbox.apollo.length >= 2,
    "Expected signup and referred signup Apollo payloads in outbox.",
  );
  assert(
    outbox.emails.some((entry) => entry.subject.includes("signup confirmed")),
    "Confirmation email subject was not captured.",
  );
  assert(
    outbox.emails.some((entry) => entry.subject.includes("Feedback")),
    "Feedback notification subject was not captured.",
  );
  assert(
    outbox.apollo[0]?.payload.email === signupEmail,
    "Apollo payload did not contain the signup email.",
  );
  assert(
    outbox.apollo.some((entry) => entry.payload.email === referredEmail),
    "Apollo payload did not contain the referred signup email.",
  );

  const authBaseUrl = resolveAuthBaseUrl(undefined, runtime.urls.app);
  assert(
    authBaseUrl === `${runtime.urls.app}/api/auth`,
    "App auth base URL smoke failed.",
  );

  assert(app.fetch, "API fetch handler is not available.");
  const healthResponse = await app.fetch(
    new Request(`${runtime.urls.api}/api/health`) as never,
    buildLocalApiEnv(undefined, runtime) as never,
    createLocalExecutionContext(),
  );
  assert(healthResponse.status === 200, "API health smoke failed.");

  console.log("Local smoke checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
