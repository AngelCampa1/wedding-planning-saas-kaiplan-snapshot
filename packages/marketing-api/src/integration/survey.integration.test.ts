import { beforeEach, describe, expect, it, vi } from "vitest";
import { count, eq } from "drizzle-orm";
import { createApi } from "../app";
import { signups, surveyResponses } from "../db/schema";
import { makeApp, clearRateLimit, makeDb, makeLocalEnv } from "./setup";

vi.mock("../services/email", () => ({
  sendConfirmation: vi.fn().mockResolvedValue({ id: "test-email-id" }),
}));
vi.mock("../services/apollo", () => ({
  addToProductList: vi.fn().mockResolvedValue(undefined),
}));

const ANSWERS = [
  { questionId: "journey_stage", answer: "actively tracking" },
  { questionId: "current_tools", answer: "paper journal" },
  { questionId: "pain_points", answer: "privacy concerns" },
];

describe("POST /api/survey", () => {
  let app: Awaited<ReturnType<typeof makeApp>>;
  const EMAIL = "survey@example.com";
  let surveyToken: string;

  beforeEach(async () => {
    clearRateLimit();
    app = await makeApp();
    // Pre-create a signup and capture the surveyToken — the route authenticates by token
    const signupRes = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, sourcePage: "/" }),
    });
    const signupBody = (await signupRes.json()) as { surveyToken: string };
    surveyToken = signupBody.surveyToken;
    clearRateLimit(); // reset after signup so survey tests aren't blocked
  });

  async function postSurvey(body: unknown) {
    return app.request("/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 200 and stores answers for a valid surveyToken", async () => {
    const res = await postSurvey({ surveyToken, answers: ANSWERS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it("returns 404 for an unknown surveyToken", async () => {
    const res = await postSurvey({
      surveyToken:
        "0000000000000000000000000000000000000000000000000000000000000000",
      answers: ANSWERS,
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing surveyToken", async () => {
    const res = await postSurvey({ answers: ANSWERS });
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty answers array", async () => {
    const res = await postSurvey({ surveyToken, answers: [] });
    expect(res.status).toBe(400);
  });

  it("returns 400 when an answer is missing questionId", async () => {
    const res = await postSurvey({
      surveyToken,
      answers: [{ answer: "something" }],
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when an answer is missing the answer field", async () => {
    const res = await postSurvey({
      surveyToken,
      answers: [{ questionId: "q1" }],
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("marks surveyCompleted=1 after a successful submission", async () => {
    await postSurvey({ surveyToken, answers: ANSWERS });

    // surveyCompleted flag is consumed by the cron job — verify indirectly:
    // the stats endpoint should show survey responses were recorded
    const statsRes = await app.request("/api/stats", {
      headers: { Authorization: "Bearer test-secret" },
    });
    const stats = (await statsRes.json()) as { surveyResponses: number };
    // surveyResponses counts distinct emails (1 user completed), not total rows
    expect(stats.surveyResponses).toBe(1);
  });

  it("submitting survey twice returns 409 — already completed", async () => {
    await postSurvey({ surveyToken, answers: ANSWERS });
    const res2 = await postSurvey({ surveyToken, answers: ANSWERS });
    expect(res2.status).toBe(409);

    // Still 1 distinct email — second submission was rejected
    const statsRes = await app.request("/api/stats", {
      headers: { Authorization: "Bearer test-secret" },
    });
    const stats = (await statsRes.json()) as { surveyResponses: number };
    expect(stats.surveyResponses).toBe(1);
  });

  it("atomically accepts only one concurrent submission for the same token", async () => {
    const db = await makeDb();
    const concurrentApp = createApi({
      ...makeLocalEnv(),
      _db: db as never,
    });

    const signupRes = await concurrentApp.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "concurrent-survey@example.com",
        sourcePage: "/",
      }),
    });
    const signupBody = (await signupRes.json()) as { surveyToken: string };
    clearRateLimit();

    const [first, second] = await Promise.all([
      concurrentApp.request("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surveyToken: signupBody.surveyToken,
          answers: [{ questionId: "first_batch", answer: "one" }],
        }),
      }),
      concurrentApp.request("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surveyToken: signupBody.surveyToken,
          answers: [{ questionId: "second_batch", answer: "two" }],
        }),
      }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);

    const [responseCount] = await db
      .select({ count: count() })
      .from(surveyResponses)
      .where(eq(surveyResponses.signupEmail, "concurrent-survey@example.com"));
    expect(responseCount!.count).toBe(1);

    const [signup] = await db
      .select({ surveyCompleted: signups.surveyCompleted })
      .from(signups)
      .where(eq(signups.email, "concurrent-survey@example.com"));
    expect(signup!.surveyCompleted).toBe(1);
  });
});
