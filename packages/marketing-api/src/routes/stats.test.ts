import { describe, it, expect } from "vitest";
import { statsRoute } from "./stats";
import { Hono } from "hono";
import type { DrizzleD1Database } from "../app";

type SourcePageRollup = {
  home: number;
  cycle: number;
  goals: number;
  guides: number;
  bestOf: number;
  alternatives: number;
  comparisons: number;
  pricing: number;
  leadMagnets: number;
  other: number;
};

type StatsResponse = {
  signups: number;
  pricingClicks: number;
  surveyResponses: number;
  feedback: { total: number; bug: number; idea: number; other: number };
  rollups: {
    signupSourcePages: SourcePageRollup;
    pricingClickSourcePages: SourcePageRollup;
    surveySegments: {
      longevity40Plus: number;
      hormoneAware: number;
      other: number;
    };
  };
};

function buildApp(secret: string | null, db: Partial<DrizzleD1Database>) {
  const app = new Hono<{ Variables: { db: DrizzleD1Database } }>();
  app.use("*", async (c, next) => {
    c.set("db", db as DrizzleD1Database);
    await next();
  });
  app.route("/", statsRoute(secret));
  return app;
}

function createEmptySourcePageRollup(): SourcePageRollup {
  return {
    home: 0,
    cycle: 0,
    goals: 0,
    guides: 0,
    bestOf: 0,
    alternatives: 0,
    comparisons: 0,
    pricing: 0,
    leadMagnets: 0,
    other: 0,
  };
}

function mockDb({
  signupCount = 0,
  clickCount = 0,
  surveyCount = 0,
  feedbackTotal = 0,
  feedbackBug = 0,
  feedbackIdea = 0,
  feedbackOther = 0,
  signupSourcePages = [],
  pricingClickSourcePages = [],
  surveySegmentAnswers = [],
}: {
  signupCount?: number;
  clickCount?: number;
  surveyCount?: number;
  feedbackTotal?: number;
  feedbackBug?: number;
  feedbackIdea?: number;
  feedbackOther?: number;
  signupSourcePages?: Array<{ sourcePage: string }>;
  pricingClickSourcePages?: Array<{ sourcePage: string }>;
  surveySegmentAnswers?: Array<{ answer: string }>;
} = {}): Partial<DrizzleD1Database> {
  // Calls are ordered to match stats.ts:
  // signups count -> pricingClicks count -> surveyResponses count ->
  // feedback total -> feedback bug -> feedback idea -> feedback other ->
  // signup source pages -> pricing click source pages -> survey segment answers.
  let callIndex = 0;
  const responses = [
    [{ count: signupCount }],
    [{ count: clickCount }],
    [{ count: surveyCount }],
    [{ count: feedbackTotal }],
    [{ count: feedbackBug }],
    [{ count: feedbackIdea }],
    [{ count: feedbackOther }],
    signupSourcePages,
    pricingClickSourcePages,
    surveySegmentAnswers,
  ];

  return {
    select: () => ({
      from: () => {
        const response = responses[callIndex++] ?? [];
        const promise = Promise.resolve(response);
        return Object.assign(promise, {
          where: () => Promise.resolve(response),
        }) as unknown as ReturnType<
          ReturnType<DrizzleD1Database["select"]>["from"]
        >;
      },
    }),
  } as unknown as Partial<DrizzleD1Database>;
}

describe("statsRoute", () => {
  it("returns 401 when no secret is configured (authSecret is null)", async () => {
    const app = buildApp(null, mockDb());
    const res = await app.request("/", {
      headers: { Authorization: "Bearer anything" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header is missing", async () => {
    const app = buildApp("mysecret", mockDb());
    const res = await app.request("/");
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header has wrong value", async () => {
    const app = buildApp("mysecret", mockDb());
    const res = await app.request("/", {
      headers: { Authorization: "Bearer wrongsecret" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with counts when correct secret is supplied", async () => {
    const db = mockDb({
      signupCount: 10,
      clickCount: 5,
      surveyCount: 3,
      feedbackTotal: 8,
      feedbackBug: 4,
      feedbackIdea: 3,
      feedbackOther: 1,
    });
    const app = buildApp("correctsecret", db);
    const res = await app.request("/", {
      headers: { Authorization: "Bearer correctsecret" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as StatsResponse;
    expect(body.signups).toBe(10);
    expect(body.pricingClicks).toBe(5);
    expect(body.surveyResponses).toBe(3);
    expect(body.feedback).toEqual({ total: 8, bug: 4, idea: 3, other: 1 });
    expect(body.rollups).toEqual({
      signupSourcePages: createEmptySourcePageRollup(),
      pricingClickSourcePages: createEmptySourcePageRollup(),
      surveySegments: {
        longevity40Plus: 0,
        hormoneAware: 0,
        other: 0,
      },
    });
  });

  it("returns zero feedback counts when no feedback exists", async () => {
    const db = mockDb({
      signupCount: 1,
      clickCount: 2,
      surveyCount: 0,
      feedbackTotal: 0,
      feedbackBug: 0,
      feedbackIdea: 0,
      feedbackOther: 0,
    });
    const app = buildApp("secret", db);
    const res = await app.request("/", {
      headers: { Authorization: "Bearer secret" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as StatsResponse;
    expect(body.signups).toBe(1);
    expect(body.pricingClicks).toBe(2);
    expect(body.surveyResponses).toBe(0);
    expect(body.feedback).toEqual({ total: 0, bug: 0, idea: 0, other: 0 });
  });

  it("uses timing-safe comparison and rejects a prefix of the correct secret", async () => {
    const app = buildApp("longsecretvalue", mockDb());
    const res = await app.request("/", {
      headers: { Authorization: "Bearer longsecret" },
    });
    expect(res.status).toBe(401);
  });

  it("uses timing-safe comparison and rejects a secret that is a superset of the correct secret", async () => {
    const app = buildApp("shortsecret", mockDb());
    const res = await app.request("/", {
      headers: { Authorization: "Bearer shortsecretEXTRA" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header is an empty string", async () => {
    const app = buildApp("mysecret", mockDb());
    const res = await app.request("/", {
      headers: { Authorization: "" },
    });
    expect(res.status).toBe(401);
  });

  it("uses constant-time comparison and rejects secrets differing only in case", async () => {
    const app = buildApp("CaseSensitiveSecret", mockDb());
    const res = await app.request("/", {
      headers: { Authorization: "Bearer casesensitivesecret" },
    });
    expect(res.status).toBe(401);
  });

  it("does not leak expected token length through comparison behavior", async () => {
    const app = buildApp("x", mockDb());
    const res = await app.request("/", {
      headers: { Authorization: "Bearer " + "y".repeat(1000) },
    });
    expect(res.status).toBe(401);
  });

  it("returns 500 with a generic error message when a DB query throws", async () => {
    const throwingDb: Partial<DrizzleD1Database> = {
      select: () => {
        throw new Error("D1_ERROR: connection refused - do not expose this");
      },
    } as unknown as Partial<DrizzleD1Database>;

    const app = buildApp("mysecret", throwingDb);
    const res = await app.request("/", {
      headers: { Authorization: "Bearer mysecret" },
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toContain("D1_ERROR");
    expect(JSON.stringify(body)).not.toContain("connection refused");
  });

  it("returns deterministic source-page and survey segment rollups for CRO reporting", async () => {
    const db = mockDb({
      signupCount: 13,
      clickCount: 9,
      surveyCount: 5,
      feedbackTotal: 1,
      feedbackBug: 1,
      feedbackIdea: 0,
      feedbackOther: 0,
      signupSourcePages: [
        { sourcePage: "/" },
        { sourcePage: "/cycle/luteal-phase-workout-plan" },
        { sourcePage: "/for/perimenopause-workout-plan" },
        { sourcePage: "/resources/guides/perimenopause-exercise-guide" },
        { sourcePage: "/resources/best/best-apps-perimenopause-menopause" },
        { sourcePage: "/compare/alternatives/wild-ai-alternative-over-40" },
        { sourcePage: "/compare/versus/wild-ai-vs-sweat-perimenopause" },
        {
          sourcePage: "/compare/pricing/wild-ai-pricing-after-zepp-acquisition",
        },
        { sourcePage: "/free/cycle-syncing-plan" },
        { sourcePage: "/unknown-path" },
        {
          sourcePage:
            "https://ondara.app/cycle/workout-for-hormone-balance?utm_source=seo#cta",
        },
        { sourcePage: "https://[invalid" },
        { sourcePage: "?utm_source=direct" },
      ],
      pricingClickSourcePages: [
        { sourcePage: "/" },
        { sourcePage: "/cycle/hormone-balancing-exercises" },
        { sourcePage: "/cycle/ovulation-phase-workout" },
        { sourcePage: "/for/menopause-workout-app" },
        { sourcePage: "/resources/guides/menopause-strength-training-guide" },
        {
          sourcePage:
            "/compare/alternatives/sweat-app-alternative-hormone-aware",
        },
        { sourcePage: "/compare/versus/evolveyou-vs-sweat" },
        { sourcePage: "/compare/pricing/sweat-app-pricing-vs-hormone-aware" },
        { sourcePage: "   " },
      ],
      surveySegmentAnswers: [
        { answer: "I'm 40+ and focused on strength and longevity" },
        { answer: "I want to start syncing workouts to my cycle" },
        { answer: "I'm already cycle syncing and want better programming" },
        { answer: "Something else" },
        { answer: "  I'M 40+ AND FOCUSED ON STRENGTH AND LONGEVITY  " },
      ],
    });

    const app = buildApp("rollupsecret", db);
    const res = await app.request("/", {
      headers: { Authorization: "Bearer rollupsecret" },
    });

    expect(res.status).toBe(200);

    const body = (await res.json()) as StatsResponse;
    expect(body.rollups).toEqual({
      signupSourcePages: {
        home: 2,
        cycle: 2,
        goals: 1,
        guides: 1,
        bestOf: 1,
        alternatives: 1,
        comparisons: 1,
        pricing: 1,
        leadMagnets: 1,
        other: 2,
      },
      pricingClickSourcePages: {
        home: 1,
        cycle: 2,
        goals: 1,
        guides: 1,
        bestOf: 0,
        alternatives: 1,
        comparisons: 1,
        pricing: 1,
        leadMagnets: 0,
        other: 1,
      },
      surveySegments: {
        longevity40Plus: 2,
        hormoneAware: 2,
        other: 1,
      },
    });
  });

  it("treats missing sourcePage values as other instead of failing the route", async () => {
    const db = mockDb({
      signupSourcePages: [
        { sourcePage: undefined as unknown as string },
        { sourcePage: null as unknown as string },
        { sourcePage: "   " },
      ],
      pricingClickSourcePages: [{ sourcePage: undefined as unknown as string }],
    });

    const app = buildApp("backfillsecret", db);
    const res = await app.request("/", {
      headers: { Authorization: "Bearer backfillsecret" },
    });

    expect(res.status).toBe(200);

    const body = (await res.json()) as StatsResponse;
    expect(body.rollups.signupSourcePages.other).toBe(3);
    expect(body.rollups.pricingClickSourcePages.other).toBe(1);
  });

  it("treats missing survey answers as other instead of failing the route", async () => {
    const db = mockDb({
      surveySegmentAnswers: [
        { answer: undefined as unknown as string },
        { answer: null as unknown as string },
        { answer: "   " },
      ],
    });

    const app = buildApp("surveybackfillsecret", db);
    const res = await app.request("/", {
      headers: { Authorization: "Bearer surveybackfillsecret" },
    });

    expect(res.status).toBe(200);

    const body = (await res.json()) as StatsResponse;
    expect(body.rollups.surveySegments.other).toBe(3);
  });

  it("normalizes smart apostrophe survey answers into existing segments", async () => {
    const db = mockDb({
      surveySegmentAnswers: [
        { answer: "I’m 40+ and focused on strength and longevity" },
        {
          answer: "I’m already cycle syncing and want better programming",
        },
      ],
    });

    const app = buildApp("smartapostrophesecret", db);
    const res = await app.request("/", {
      headers: { Authorization: "Bearer smartapostrophesecret" },
    });

    expect(res.status).toBe(200);

    const body = (await res.json()) as StatsResponse;
    expect(body.rollups.surveySegments).toEqual({
      longevity40Plus: 1,
      hormoneAware: 1,
      other: 0,
    });
  });
});
