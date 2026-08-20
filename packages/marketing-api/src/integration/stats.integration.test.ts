import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeApp, clearRateLimit } from "./setup";

vi.mock("../services/email", () => ({
  sendConfirmation: vi.fn().mockResolvedValue({ id: "test-email-id" }),
}));
vi.mock("../services/apollo", () => ({
  addToProductList: vi.fn().mockResolvedValue(undefined),
}));

describe("GET /api/stats", () => {
  let app: Awaited<ReturnType<typeof makeApp>>;

  beforeEach(async () => {
    clearRateLimit();
    app = await makeApp();
  });

  async function getStats(authHeader?: string) {
    return app.request("/api/stats", {
      headers: authHeader ? { Authorization: authHeader } : {},
    });
  }

  it("returns 401 with no Authorization header", async () => {
    const res = await getStats();
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong Bearer token", async () => {
    const res = await getStats("Bearer wrong-token");
    expect(res.status).toBe(401);
  });

  it("returns 401 with token missing the Bearer prefix", async () => {
    const res = await getStats("test-secret");
    expect(res.status).toBe(401);
  });

  it("returns 401 when STATS_SECRET is not configured", async () => {
    const unsecuredApp = await makeApp({ STATS_SECRET: undefined });
    const res = await unsecuredApp.request("/api/stats", {
      headers: { Authorization: "Bearer test-secret" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when STATS_SECRET is an empty string", async () => {
    const unsecuredApp = await makeApp({ STATS_SECRET: "" });
    const res = await unsecuredApp.request("/api/stats", {
      headers: { Authorization: "Bearer " },
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with correct counts on a fresh DB", async () => {
    const res = await getStats("Bearer test-secret");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toEqual({
      signups: 0,
      pricingClicks: 0,
      surveyResponses: 0,
      feedback: {
        total: 0,
        bug: 0,
        idea: 0,
        other: 0,
      },
      rollups: {
        signupSourcePages: {
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
        },
        pricingClickSourcePages: {
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
        },
        surveySegments: {
          longevity40Plus: 0,
          hormoneAware: 0,
          other: 0,
        },
      },
    });
  });

  it("counts correctly reflect DB state after signup and pricing-click inserts", async () => {
    // Insert a signup
    await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "count@example.com", sourcePage: "/" }),
    });

    // Insert a pricing click
    await app.request("/api/pricing-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier: "essential",
        sourcePage: "/",
        sessionId: "s1",
      }),
    });

    const res = await getStats("Bearer test-secret");
    const body = (await res.json()) as any;
    expect(body.signups).toBe(1);
    expect(body.pricingClicks).toBe(1);
    expect(body.surveyResponses).toBe(0);
  });

  it("duplicate signup (409) does not increment signup count", async () => {
    await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "once@example.com", sourcePage: "/" }),
    });
    // Duplicate
    await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "once@example.com", sourcePage: "/" }),
    });

    const res = await getStats("Bearer test-secret");
    const body = (await res.json()) as any;
    expect(body.signups).toBe(1);
  });
});
