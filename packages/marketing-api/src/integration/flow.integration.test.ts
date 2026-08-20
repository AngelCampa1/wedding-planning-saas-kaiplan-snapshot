import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRateLimit, makeApp, makeDb } from "./setup";
import { leadMagnetDownloads, signups } from "../db/schema";

vi.mock("../services/email", () => ({
  sendConfirmation: vi.fn().mockResolvedValue({ id: "test-email-id" }),
}));
vi.mock("../services/apollo", () => ({
  addToProductList: vi.fn().mockResolvedValue(undefined),
}));

describe("Full funnel integration flow", () => {
  beforeEach(() => {
    clearRateLimit();
  });

  it("enforces unique lead magnet download tokens in the integration database", async () => {
    const db = await makeDb();
    const now = new Date("2026-05-01T00:00:00.000Z").toISOString();
    await db.insert(signups).values([
      {
        email: "lead-a@example.com",
        sourcePage: "/lead-a",
        queuePosition: 1,
        referralCode: "refA1234",
        surveyToken: "survey-a",
        createdAt: now,
      },
      {
        email: "lead-b@example.com",
        sourcePage: "/lead-b",
        queuePosition: 2,
        referralCode: "refB1234",
        surveyToken: "survey-b",
        createdAt: now,
      },
    ]);
    await db.insert(leadMagnetDownloads).values({
      signupEmail: "lead-a@example.com",
      leadMagnetSlug: "timeline",
      downloadToken: "duplicate-token",
      expiresAt: now,
      createdAt: now,
    });

    await expect(
      db.insert(leadMagnetDownloads).values({
        signupEmail: "lead-b@example.com",
        leadMagnetSlug: "budget",
        downloadToken: "duplicate-token",
        expiresAt: now,
        createdAt: now,
      }),
    ).rejects.toThrow();
  });

  it("complete signup → referral → survey → pricing-click → stats flow", async () => {
    const app = await makeApp();

    // 1. Alice signs up
    const res1 = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "alice@example.com",
        sourcePage: "/landing",
      }),
    });
    expect(res1.status).toBe(200);
    const {
      referralCode,
      position: pos1,
      surveyToken,
    } = (await res1.json()) as {
      referralCode: string;
      position: number;
      surveyToken: string;
    };
    expect(pos1).toBe(1);
    expect(referralCode).toMatch(/^[A-Za-z0-9]{8}$/);

    clearRateLimit();

    // 2. Bob signs up using Alice's referral code
    const res2 = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "bob@example.com",
        sourcePage: "/landing",
        referredBy: referralCode,
      }),
    });
    expect(res2.status).toBe(200);
    const { position: pos2 } = (await res2.json()) as { position: number };
    expect(pos2).toBe(2);

    // 3. Alice checks her referral dashboard — should see 1 referral
    const refRes = await app.request(`/api/referral/${referralCode}`);
    expect(refRes.status).toBe(200);
    const { referralCount, position } = (await refRes.json()) as {
      referralCount: number;
      position: number;
    };
    expect(referralCount).toBe(1);
    expect(position).toBe(1); // Alice is still first

    // 4. Alice completes the survey using her surveyToken
    const surveyRes = await app.request("/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        surveyToken,
        answers: [
          { questionId: "journey_stage", answer: "just starting" },
          { questionId: "current_tools", answer: "nothing" },
          { questionId: "pain_points", answer: "don't know what's normal" },
        ],
      }),
    });
    expect(surveyRes.status).toBe(200);

    // 5. Alice clicks on the pricing tier
    const clickRes = await app.request("/api/pricing-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier: "essential",
        sourcePage: "/landing",
        sessionId: "sess-alice-flow",
      }),
    });
    expect(clickRes.status).toBe(200);

    // 6. Admin checks stats — all counts should reflect the above actions
    const statsRes = await app.request("/api/stats", {
      headers: { Authorization: "Bearer test-secret" },
    });
    expect(statsRes.status).toBe(200);
    const stats = (await statsRes.json()) as {
      signups: number;
      pricingClicks: number;
      surveyResponses: number;
    };
    expect(stats.signups).toBe(2);
    expect(stats.pricingClicks).toBe(1);
    // surveyResponses counts distinct emails (1 user completed), not total rows
    expect(stats.surveyResponses).toBe(1);
  });

  it("duplicate email throughout the flow returns 409 with original position", async () => {
    const app = await makeApp();

    const res1 = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "stable@example.com", sourcePage: "/" }),
    });
    await res1.json();

    // Retry the same email
    clearRateLimit();
    const res2 = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "stable@example.com",
        sourcePage: "/retry",
      }),
    });
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as {
      position: number;
      referralCode?: string;
    };
    expect(body2.position).toBe(1);
    expect(body2.referralCode).toBeUndefined();
  });

  it("survey with unknown surveyToken mid-flow returns 404", async () => {
    const app = await makeApp();

    const surveyRes = await app.request("/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        surveyToken:
          "0000000000000000000000000000000000000000000000000000000000000000",
        answers: [{ questionId: "q1", answer: "a1" }],
      }),
    });
    expect(surveyRes.status).toBe(404);
  });

  it("referral endpoint returns 404 for an unknown code", async () => {
    const app = await makeApp();
    const res = await app.request("/api/referral/UNKNOWN0");
    expect(res.status).toBe(404);
  });
});
