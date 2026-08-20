import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createApi } from "../app";
import { signups } from "../db/schema";
import { makeApp, clearRateLimit, makeDb, makeLocalEnv } from "./setup";
import type { ApiEnv } from "../app";

vi.mock("../services/email", () => ({
  sendConfirmation: vi.fn().mockResolvedValue({ id: "test-email-id" }),
  sendLeadMagnetDelivery: vi.fn().mockResolvedValue({ id: "test-email-id" }),
}));
vi.mock("../services/apollo", () => ({
  addToProductList: vi.fn().mockResolvedValue(undefined),
}));

describe("GET /api/referral/:code", () => {
  let app: Awaited<ReturnType<typeof makeApp>>;
  let referralCode: string;
  const REFERRER_EMAIL = "referrer@example.com";

  beforeEach(async () => {
    clearRateLimit();
    app = await makeApp();
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: REFERRER_EMAIL, sourcePage: "/" }),
    });
    const body = (await res.json()) as any;
    referralCode = body.referralCode;
    clearRateLimit();
  });

  it("returns 404 for a completely unknown referral code", async () => {
    const res = await app.request("/api/referral/INVALID00");
    expect(res.status).toBe(404);
  });

  it("returns referralCount=0 and position=1 for a fresh code with no referrals yet", async () => {
    const res = await app.request(`/api/referral/${referralCode}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.referralCount).toBe(0);
    expect(body.position).toBe(1);
  });

  it("increments referralCount by 1 after one referred signup", async () => {
    await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "referred1@example.com",
        sourcePage: "/",
        referredBy: referralCode,
      }),
    });

    const res = await app.request(`/api/referral/${referralCode}`);
    const body = (await res.json()) as any;
    expect(body.referralCount).toBe(1);
  });

  it("counts multiple referrals correctly", async () => {
    for (let i = 0; i < 3; i++) {
      clearRateLimit();
      await app.request("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `ref${i}@example.com`,
          sourcePage: "/",
          referredBy: referralCode,
        }),
      });
    }

    const res = await app.request(`/api/referral/${referralCode}`);
    const body = (await res.json()) as any;
    expect(body.referralCount).toBe(3);
  });

  it("returns correct position when referrer is the 2nd signup overall", async () => {
    const res2 = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "second@example.com", sourcePage: "/" }),
    });
    const { referralCode: secondCode } = (await res2.json()) as any;

    const posRes = await app.request(`/api/referral/${secondCode}`);
    const posBody = (await posRes.json()) as any;
    expect(posBody.position).toBe(2);
  });

  it("referralCount does not count the referrer's own signup as a referral", async () => {
    const res = await app.request(`/api/referral/${referralCode}`);
    const body = (await res.json()) as any;
    expect(body.referralCount).toBe(0);
  });

  it("referred duplicate email does not increment referralCount", async () => {
    await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "once-referred@example.com",
        sourcePage: "/",
        referredBy: referralCode,
      }),
    });

    clearRateLimit();
    await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "once-referred@example.com",
        sourcePage: "/retry",
        referredBy: referralCode,
      }),
    });

    const res = await app.request(`/api/referral/${referralCode}`);
    const body = (await res.json()) as any;
    expect(body.referralCount).toBe(1);
  });

  it("repairs legacy zero queue positions with distinct stored positions", async () => {
    const db = await makeDb();
    const repairApp = createApi({
      ...makeLocalEnv(),
      _db: db as ApiEnv["_db"],
    });

    await db.insert(signups).values([
      {
        email: "stored@example.com",
        sourcePage: "/",
        referralCode: "STORED01",
        surveyToken: "stored-token-0000000000000000000000000000000000000001",
        queuePosition: 5,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        email: "legacy-one@example.com",
        sourcePage: "/",
        referralCode: "LEGACY01",
        surveyToken: "legacy-token-0000000000000000000000000000000000000001",
        queuePosition: 0,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        email: "legacy-two@example.com",
        sourcePage: "/",
        referralCode: "LEGACY02",
        surveyToken: "legacy-token-0000000000000000000000000000000000000002",
        queuePosition: 0,
        createdAt: "2026-01-03T00:00:00.000Z",
      },
    ]);

    const res = await repairApp.request("/api/referral/LEGACY02", {
      headers: { "CF-Connecting-IP": "10.0.2.1" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { position: number };
    expect(body.position).toBe(6);

    const secondRes = await repairApp.request("/api/referral/LEGACY01", {
      headers: { "CF-Connecting-IP": "10.0.2.2" },
    });
    expect(secondRes.status).toBe(200);

    const legacyOne = await db
      .select({ queuePosition: signups.queuePosition })
      .from(signups)
      .where(eq(signups.referralCode, "LEGACY01"));
    const legacyTwo = await db
      .select({ queuePosition: signups.queuePosition })
      .from(signups)
      .where(eq(signups.referralCode, "LEGACY02"));
    expect(legacyOne[0]?.queuePosition).toBeGreaterThan(5);
    expect(legacyTwo[0]?.queuePosition).toBe(6);
    expect(legacyOne[0]?.queuePosition).toBe(7);
    expect(legacyOne[0]?.queuePosition).not.toBe(legacyTwo[0]?.queuePosition);
  });
});
